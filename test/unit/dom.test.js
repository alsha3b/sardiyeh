const { buildMatcher } = require("../../src/matcher");
const {
  shouldSkipNode,
  walk,
  replaceTextNodes,
  reprocessTextNode,
  revertAll,
  createStore,
  collectReplaceableNodes,
  collectCharacterDataTargets,
} = require("../../src/dom");

const M = () => buildMatcher({ israel: "Palestine" });

function frag(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("shouldSkipNode", () => {
  test.each(["input", "textarea", "script", "style", "noscript"])(
    "skips <%s>",
    (tag) => {
      expect(shouldSkipNode(document.createElement(tag))).toBe(true);
    }
  );
  test("skips role=textbox and contenteditable", () => {
    const tb = document.createElement("div");
    tb.setAttribute("role", "textbox");
    expect(shouldSkipNode(tb)).toBe(true);
    const ce = document.createElement("div");
    ce.setAttribute("contenteditable", "true");
    expect(shouldSkipNode(ce)).toBe(true);
  });
  test("does not skip ordinary elements", () => {
    expect(shouldSkipNode(document.createElement("div"))).toBe(false);
    expect(shouldSkipNode(document.createElement("p"))).toBe(false);
  });
});

describe("walk", () => {
  test("visits every text node in nested light DOM", () => {
    const root = frag("<p>a<span>b<em>c</em></span></p>");
    const seen = [];
    walk(root, (n) => seen.push(n.nodeValue));
    expect(seen).toEqual(["a", "b", "c"]);
  });
  test("does not descend into skipped containers", () => {
    const root = frag("<div>keep<script>drop</script><input></div>");
    const seen = [];
    walk(root, (n) => seen.push(n.nodeValue));
    expect(seen).toEqual(["keep"]);
  });
  test("descends into open shadow roots", () => {
    const root = document.createElement("div");
    const host = document.createElement("x-card");
    root.appendChild(host);
    const sr = host.attachShadow({ mode: "open" });
    sr.innerHTML = "<span>shadowtext</span>";
    const seen = [];
    walk(root, (n) => seen.push(n.nodeValue));
    expect(seen).toContain("shadowtext");
  });
});

describe("replaceTextNodes", () => {
  test("replaces matched text in place and records the original", () => {
    const root = frag("<p>Welcome to Israel today</p>");
    const store = createStore();
    replaceTextNodes(root, M(), store);
    expect(root.textContent).toBe("Welcome to Palestine today");
    const textNode = root.querySelector("p").firstChild;
    expect(store.originals.get(textNode)).toBe("Welcome to Israel today");
  });

  test("leaves non-matching text untouched (no store entry)", () => {
    const root = frag("<p>nothing to see</p>");
    const store = createStore();
    replaceTextNodes(root, M(), store);
    expect(root.textContent).toBe("nothing to see");
    expect(store.originals.has(root.querySelector("p").firstChild)).toBe(false);
  });

  // REGRESSION (mandatory): user-editable surfaces must never be rewritten.
  test("never rewrites input/textarea/contenteditable content", () => {
    const root = frag(
      "<div>Israel <span contenteditable='true'>Israel</span></div>"
    );
    const ta = document.createElement("textarea");
    ta.value = "Israel";
    root.appendChild(ta);
    replaceTextNodes(root, M(), createStore());
    // the plain div text is replaced...
    expect(root.firstChild.textContent.startsWith("Palestine")).toBe(true);
    // ...but the editable span and textarea are left alone
    expect(root.querySelector("[contenteditable]").textContent).toBe("Israel");
    expect(ta.value).toBe("Israel");
  });

  test("reports replaced pairs via the onReplace collector", () => {
    const root = frag("<p>Israel</p>");
    const seen = [];
    replaceTextNodes(root, M(), createStore(), (w, r) => seen.push([w, r]));
    expect(seen).toEqual([["Israel", "Palestine"]]);
  });

  test("replaces text inside open shadow DOM", () => {
    const root = document.createElement("div");
    const host = document.createElement("x-card");
    root.appendChild(host);
    host.attachShadow({ mode: "open" }).innerHTML = "<span>Israel</span>";
    replaceTextNodes(root, M(), createStore());
    expect(host.shadowRoot.querySelector("span").textContent).toBe("Palestine");
  });
});

describe("revertAll", () => {
  test("restores only the nodes we changed, never unrelated text", () => {
    const root = frag("<p id='a'>Israel</p><p id='b'>Palestine forever</p>");
    const store = createStore();
    replaceTextNodes(root, M(), store);
    expect(root.querySelector("#a").textContent).toBe("Palestine");

    revertAll(root, store);
    expect(root.querySelector("#a").textContent).toBe("Israel");
    // the pre-existing "Palestine forever" was never ours -> untouched
    expect(root.querySelector("#b").textContent).toBe("Palestine forever");
  });

  test("is a no-op when nothing was recorded", () => {
    const root = frag("<p>Palestine</p>");
    expect(() => revertAll(root, createStore())).not.toThrow();
    expect(root.textContent).toBe("Palestine");
  });
});

describe("collectReplaceableNodes", () => {
  const rec = (nodes, type = "childList") => ({ type, addedNodes: nodes });

  test("collects added childList nodes across multiple records", () => {
    const a = document.createElement("div");
    const b = document.createElement("span");
    const out = collectReplaceableNodes([rec([a]), rec([b])]);
    expect(out).toEqual([a, b]);
  });

  test("ignores non-childList records", () => {
    const a = document.createElement("div");
    expect(collectReplaceableNodes([rec([a], "attributes")])).toEqual([]);
  });

  test("skips nodes inserted into editable containers", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editable.appendChild(child);
    // child.parentNode is contenteditable -> excluded
    expect(collectReplaceableNodes([rec([child])])).toEqual([]);
  });

  test("keeps ordinary added nodes", () => {
    const parent = document.createElement("div");
    const child = document.createElement("p");
    parent.appendChild(child);
    expect(collectReplaceableNodes([rec([child])])).toEqual([child]);
  });
});

describe("reprocessTextNode", () => {
  test("replaces a text node the page rewrote in place", () => {
    const root = frag("<p>Israel news</p>");
    const node = root.querySelector("p").firstChild;
    const store = createStore();
    reprocessTextNode(node, M(), store, () => {});
    expect(node.nodeValue).toBe("Palestine news");
  });

  test("refreshes the revert baseline to the page's new text", () => {
    const root = frag("<p>Israel a</p>");
    const p = root.querySelector("p");
    const node = p.firstChild;
    const store = M() && createStore();
    // first tick
    reprocessTextNode(node, M(), store, () => {});
    expect(node.nodeValue).toBe("Palestine a");
    // page rewrites the same node with new content
    node.nodeValue = "Israel b";
    reprocessTextNode(node, M(), store, () => {});
    expect(node.nodeValue).toBe("Palestine b");
    // revert restores the *latest* page text, not the stale first one
    revertAll(root, store);
    expect(node.nodeValue).toBe("Israel b");
  });

  test("ignores non-text nodes and non-matching text", () => {
    const store = createStore();
    const el = document.createElement("div");
    expect(() => reprocessTextNode(el, M(), store, () => {})).not.toThrow();
    const node = frag("<p>nothing here</p>").querySelector("p").firstChild;
    reprocessTextNode(node, M(), store, () => {});
    expect(node.nodeValue).toBe("nothing here");
  });
});

describe("collectCharacterDataTargets", () => {
  const cdRec = (target, type = "characterData") => ({ type, target });

  test("collects rewritten text nodes, ignoring childList records", () => {
    const t = document.createTextNode("Israel");
    document.createElement("p").appendChild(t);
    expect(collectCharacterDataTargets([cdRec(t)])).toEqual([t]);
    expect(collectCharacterDataTargets([{ type: "childList", target: t }])).toEqual([]);
  });

  test("skips text nodes inside editable surfaces", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const t = document.createTextNode("Israel");
    editable.appendChild(t);
    expect(collectCharacterDataTargets([cdRec(t)])).toEqual([]);
  });
});
