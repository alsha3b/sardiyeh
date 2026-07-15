const {
  startServer,
  launchExtension,
  seedStorage,
  waitFor,
} = require("./helpers");

// Loads the unpacked MV3 extension in headless Chromium and drives the real
// content script. The dictionary is seeded into storage.local (the same key the
// background worker writes) so tests are deterministic and offline.
const DICT = { Israel: "Palestine", "يافا": "Jaffa" };

let browser, extId, server;

beforeAll(async () => {
  server = await startServer();
  ({ browser, extId } = await launchExtension());
  await seedStorage(browser, extId, { local: { dictionary: DICT } });
}, 30000);

afterAll(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

async function open(fixture) {
  const page = await browser.newPage();
  await page.goto(server.url(fixture), { waitUntil: "load" });
  return page;
}

test("replaces place names on a plain page", async () => {
  const page = await open("basic.html");
  const ok = await waitFor(async () =>
    (await page.$eval("#t", (el) => el.textContent)).includes("Palestine")
  );
  expect(ok).toBe(true);
  await page.close();
});

test("matches native Arabic names (Unicode boundaries)", async () => {
  const page = await open("arabic.html");
  const ok = await waitFor(async () =>
    (await page.$eval("#t", (el) => el.textContent)).includes("Jaffa")
  );
  expect(ok).toBe(true);
  await page.close();
});

test("works under a strict Content-Security-Policy", async () => {
  const page = await open("csp.html");
  const ok = await waitFor(async () =>
    (await page.$eval("#t", (el) => el.textContent)).includes("Palestine")
  );
  expect(ok).toBe(true);
  await page.close();
});

test("never rewrites input, textarea, or contenteditable", async () => {
  const page = await open("input.html");
  await waitFor(async () =>
    (await page.$eval("#plain", (el) => el.textContent)).includes("Palestine")
  );
  expect(await page.$eval("#plain", (el) => el.textContent)).toBe("Palestine");
  expect(await page.$eval("#inp", (el) => el.value)).toBe("Israel");
  expect(await page.$eval("#ta", (el) => el.value)).toBe("Israel");
  expect(await page.$eval("#ce", (el) => el.textContent)).toBe("Israel");
  await page.close();
});

test("replaces text inside open shadow DOM", async () => {
  const page = await open("shadow.html");
  const ok = await waitFor(async () =>
    (await page.evaluate(
      () => document.getElementById("host").shadowRoot.querySelector("#sh").textContent
    )).includes("Palestine")
  );
  expect(ok).toBe(true);
  await page.close();
});

test("replaces nodes inserted dynamically after load (observer)", async () => {
  const page = await open("basic.html");
  await waitFor(async () =>
    (await page.$eval("#t", (el) => el.textContent)).includes("Palestine")
  );
  // insert new content the way an SPA would, after first paint
  await page.evaluate(() => {
    const p = document.createElement("p");
    p.id = "late";
    p.textContent = "Later mention of Israel here";
    document.body.appendChild(p);
  });
  const ok = await waitFor(async () =>
    (await page.$eval("#late", (el) => el.textContent)).includes("Palestine")
  );
  expect(ok).toBe(true);
  await page.close();
});

test("re-processes text a page rewrites in place (characterData)", async () => {
  const page = await open("basic.html");
  await waitFor(async () =>
    (await page.$eval("#t", (el) => el.textContent)).includes("Palestine")
  );
  // A live ticker/chat overwrites the text node's value directly (characterData
  // mutation, not a new node). Setting nodeValue avoids replacing the child.
  await page.evaluate(() => {
    document.getElementById("t").firstChild.nodeValue = "Breaking from Israel";
  });
  const ok = await waitFor(async () =>
    (await page.$eval("#t", (el) => el.textContent)) === "Breaking from Palestine"
  );
  expect(ok).toBe(true);
  await page.close();
});

test("replaces nodes injected into a shadow root after load", async () => {
  const page = await open("shadow.html");
  await waitFor(async () =>
    (await page.evaluate(
      () => document.getElementById("host").shadowRoot.querySelector("#sh").textContent
    )).includes("Palestine")
  );
  // Inject a brand-new node into the shadow root after first paint. The main
  // document observer can't see it; the per-shadow-root observer must.
  await page.evaluate(() => {
    const sr = document.getElementById("host").shadowRoot;
    const p = document.createElement("p");
    p.id = "late";
    p.textContent = "Later in Israel";
    sr.appendChild(p);
  });
  const ok = await waitFor(async () =>
    (await page.evaluate(
      () => document.getElementById("host").shadowRoot.querySelector("#late").textContent
    )).includes("Palestine")
  );
  expect(ok).toBe(true);
  await page.close();
});

test("each tab reports only its own replaced words (no cross-tab race)", async () => {
  // Two tabs, different matches. Historically both wrote one shared
  // storage.local key, so the popup showed whichever tab persisted last. The
  // popup now pulls the list per-tab over messaging, so they never merge.
  const tabA = await open("basic.html"); //  "Israel" -> "Palestine"
  const tabB = await open("arabic.html"); // "يافا"   -> "Jaffa"
  await waitFor(async () =>
    (await tabA.$eval("#t", (el) => el.textContent)).includes("Palestine")
  );
  await waitFor(async () =>
    (await tabB.$eval("#t", (el) => el.textContent)).includes("Jaffa")
  );

  // From an extension page, run the same query the popup runs (query tabs ->
  // message each top frame). Probing every tab — rather than just the active
  // one — lets us prove the two lists stay disjoint instead of merging.
  const probe = await browser.newPage();
  await probe.goto(`chrome-extension://${extId}/index.html`);
  let lists = [];
  const gotBoth = await waitFor(async () => {
    lists = await probe.evaluate(
      () =>
        new Promise((resolve) => {
          chrome.tabs.query({}, (tabs) => {
            Promise.all(
              tabs.map(
                (t) =>
                  new Promise((res) =>
                    chrome.tabs.sendMessage(
                      t.id,
                      { type: "sardiya:getReplacedWords" },
                      { frameId: 0 },
                      (resp) => {
                        void chrome.runtime.lastError; // no content script: ignore
                        res(resp && resp.replacedWords);
                      }
                    )
                  )
              )
            ).then((all) => resolve(all.filter((w) => w && w.length)));
          });
        })
    );
    return lists.length >= 2;
  });
  await probe.close();
  await tabA.close();
  await tabB.close();

  expect(gotBoth).toBe(true);
  // Two disjoint single-word lists — never a merged/last-writer-wins list.
  lists.forEach((l) => expect(l).toHaveLength(1));
  const words = lists.map((l) => l[0].word).sort();
  expect(words).toEqual(["Israel", "يافا"].sort());
});

test("toggling ext_on off reverts the page in place", async () => {
  const page = await open("basic.html");
  await waitFor(async () =>
    (await page.$eval("#t", (el) => el.textContent)).includes("Palestine")
  );
  // flip the master switch off from an extension page; content.js reacts via
  // storage.onChanged and reverts without a reload.
  await seedStorage(browser, extId, { sync: { ext_on: false } });
  const reverted = await waitFor(async () =>
    (await page.$eval("#t", (el) => el.textContent)).includes("Israel")
  );
  expect(reverted).toBe(true);
  // restore for any later runs
  await seedStorage(browser, extId, { sync: { ext_on: true } });
  await page.close();
});
