const { buildRow, applyTranslations, renderState, SEARCH_BASE } = require("../../src/popup-core");

describe("buildRow", () => {
  test("builds a <tr> with two linked cells", () => {
    const tr = buildRow(document, "Israel", "Palestine");
    expect(tr.tagName).toBe("TR");
    const cells = tr.querySelectorAll("td");
    expect(cells).toHaveLength(2);
    const links = tr.querySelectorAll("a");
    expect(links[0].textContent).toBe("Israel");
    expect(links[1].textContent).toBe("Palestine");
    links.forEach((a) => expect(a.target).toBe("_blank"));
  });

  test("links point at the palestineremembered search, URL-encoded", () => {
    const tr = buildRow(document, "Tel Aviv", "Yafa & more");
    const links = tr.querySelectorAll("a");
    expect(links[0].getAttribute("href")).toBe(
      SEARCH_BASE + encodeURIComponent("Tel Aviv")
    );
    expect(links[1].getAttribute("href")).toBe(
      SEARCH_BASE + encodeURIComponent("Yafa & more")
    );
  });

  test("uses textContent (no HTML injection from the word)", () => {
    const tr = buildRow(document, "<img src=x onerror=1>", "safe");
    expect(tr.querySelector("td a").querySelector("img")).toBeNull();
    expect(tr.querySelector("td a").textContent).toBe("<img src=x onerror=1>");
  });
});

describe("applyTranslations", () => {
  function popupDoc() {
    document.body.innerHTML = `
      <h1 id="replaced-words-title"></h1>
      <th id="word-header"></th>
      <th id="replacement-header"></th>
      <label id="word-label"></label>
      <label id="replacement-label"></label>
      <button id="dialog-submit"></button>
      <button id="dialog-close"></button>
      <input id="word-input" />
      <input id="replacement-input" />`;
    return document;
  }
  const EN = {
    replacedWords: "Replaced words",
    word: "Word",
    replacement: "Replacement",
    wordLabel: "Word",
    replacementLabel: "Replacement",
    submitButton: "Save",
    cancelButton: "Cancel",
    wordInput: "The word",
    replacementInput: "The replacement",
  };

  test("sets headings, buttons, labels, and placeholders", () => {
    const doc = popupDoc();
    applyTranslations(doc, EN);
    expect(doc.getElementById("replaced-words-title").textContent).toBe("Replaced words");
    expect(doc.getElementById("dialog-submit").textContent).toBe("Save");
    expect(doc.getElementById("dialog-close").textContent).toBe("Cancel");
    expect(doc.getElementById("word-input").placeholder).toBe("The word");
    expect(doc.getElementById("replacement-input").placeholder).toBe("The replacement");
  });

  test("does not throw when target elements are absent", () => {
    document.body.innerHTML = "<div></div>";
    expect(() => applyTranslations(document, EN)).not.toThrow();
  });
});

describe("renderState", () => {
  // renderState is the single source of truth for popup view visibility.
  // It routes the top-level view (main / dialog / welcome) and, within the
  // main view, the off-banner (extOn), empty-state, and table (hasRows).
  function popupDoc() {
    document.body.innerHTML = `
      <section id="content"></section>
      <section id="input-dialog"></section>
      <section id="welcome"></section>
      <div id="off-banner"></div>
      <div id="empty-state"></div>
      <p id="replaced-words-subtitle"></p>
      <div class="table-container" id="table-container"></div>`;
    return document;
  }
  const disp = (doc, id) => doc.getElementById(id).style.display;

  test("main view with rows: content + table shown, everything else hidden", () => {
    const doc = popupDoc();
    renderState(doc, { view: "main", extOn: true, hasRows: true });
    expect(disp(doc, "content")).not.toBe("none");
    expect(disp(doc, "input-dialog")).toBe("none");
    expect(disp(doc, "welcome")).toBe("none");
    expect(disp(doc, "off-banner")).toBe("none");
    expect(disp(doc, "empty-state")).toBe("none");
    expect(disp(doc, "table-container")).not.toBe("none");
  });

  test("main view with no rows: empty-state shown, table + subtitle hidden", () => {
    const doc = popupDoc();
    renderState(doc, { view: "main", extOn: true, hasRows: false });
    expect(disp(doc, "empty-state")).not.toBe("none");
    expect(disp(doc, "table-container")).toBe("none");
    // subtitle is redundant above the empty-state message
    expect(disp(doc, "replaced-words-subtitle")).toBe("none");
  });

  test("main view with rows: subtitle shown", () => {
    const doc = popupDoc();
    renderState(doc, { view: "main", extOn: true, hasRows: true });
    expect(disp(doc, "replaced-words-subtitle")).not.toBe("none");
  });

  test("off (extOn false): off-banner visible in main view", () => {
    const doc = popupDoc();
    renderState(doc, { view: "main", extOn: false, hasRows: true });
    expect(disp(doc, "off-banner")).not.toBe("none");
    // toggling back on hides it — proves live re-render works
    renderState(doc, { view: "main", extOn: true, hasRows: true });
    expect(disp(doc, "off-banner")).toBe("none");
  });

  test("dialog view: only the dialog is shown", () => {
    const doc = popupDoc();
    renderState(doc, { view: "dialog" });
    expect(disp(doc, "input-dialog")).not.toBe("none");
    expect(disp(doc, "content")).toBe("none");
    expect(disp(doc, "welcome")).toBe("none");
  });

  test("welcome view: only welcome is shown", () => {
    const doc = popupDoc();
    renderState(doc, { view: "welcome" });
    expect(disp(doc, "welcome")).not.toBe("none");
    expect(disp(doc, "content")).toBe("none");
    expect(disp(doc, "input-dialog")).toBe("none");
  });

  test("defaults to main view when view omitted", () => {
    const doc = popupDoc();
    renderState(doc, {});
    expect(disp(doc, "content")).not.toBe("none");
  });

  test("does not throw when elements are absent", () => {
    document.body.innerHTML = "<div></div>";
    expect(() => renderState(document, { view: "main" })).not.toThrow();
  });
});
