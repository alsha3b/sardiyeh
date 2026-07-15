const path = require("path");
const http = require("http");
const fs = require("fs");
const puppeteer = require("puppeteer");

const EXT_ROOT = path.resolve(__dirname, "../../");
const FIXTURES = path.join(__dirname, "fixtures");

// Serves the fixture HTML over http (content scripts don't run on file://).
// The csp.html response carries a strict CSP so we can prove replacement still
// works on locked-down pages (the content script never fetches, so page CSP
// can't break it).
function startServer() {
  const server = http.createServer((req, res) => {
    const name = req.url.split("?")[0].replace(/^\//, "") || "basic.html";
    const file = path.join(FIXTURES, path.basename(name));
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const headers = { "Content-Type": "text/html; charset=utf-8" };
      if (name.includes("csp")) {
        headers["Content-Security-Policy"] =
          "default-src 'self'; connect-src 'none'; img-src 'self' data:";
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: (p) => `http://127.0.0.1:${port}/${p}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

async function launchExtension() {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: puppeteer.executablePath(),
    args: [
      `--disable-extensions-except=${EXT_ROOT}`,
      `--load-extension=${EXT_ROOT}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });
  const sw = await browser.waitForTarget(
    (t) => t.type() === "service_worker" && t.url().includes("background.js"),
    { timeout: 10000 }
  );
  const extId = new URL(sw.url()).host;
  return { browser, extId };
}

// Seed storage from an extension page (has chrome.* access). Persists in
// storage.local so subsequently-navigated fixture pages read it at document_end.
async function seedStorage(browser, extId, { local = {}, sync = {} }) {
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extId}/index.html`);
  await page.evaluate(
    (l, s) =>
      Promise.all([
        new Promise((r) => chrome.storage.local.set(l, r)),
        new Promise((r) => chrome.storage.sync.set(s, r)),
      ]),
    local,
    sync
  );
  await page.close();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Poll until fn() returns truthy or timeout.
async function waitFor(fn, { timeout = 4000, interval = 50 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return true;
    await sleep(interval);
  }
  return false;
}

module.exports = { startServer, launchExtension, seedStorage, sleep, waitFor };
