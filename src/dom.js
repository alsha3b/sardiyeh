// DOM walking, in-place replacement, and revert. No chrome, no network.
// Replacement writes textNode.nodeValue directly (no injected spans) so it
// never perturbs layout, CSS, or framework reconciliation. Originals are kept
// in a WeakMap keyed by the text node, so revert is exact and never touches
// text the extension did not change.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Sardiya = root.Sardiya || {};
    Object.assign(root.Sardiya, api);
  }
})(typeof self !== "undefined" ? self : this, function () {
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);

  function createStore() {
    return { originals: new WeakMap() };
  }

  // Elements whose text must never be rewritten: user-editable surfaces and
  // non-rendered content (scripts/styles).
  function shouldSkipNode(node) {
    if (!node || node.nodeType !== ELEMENT_NODE) return false;
    if (SKIP_TAGS.has(node.tagName)) return true;
    if (node.isContentEditable) return true;
    if (typeof node.matches === "function") {
      try {
        if (node.matches("input, textarea, [role='textbox'], [contenteditable]")) {
          return true;
        }
      } catch (_) {
        /* matches can throw on exotic selectors in old engines; ignore */
      }
    }
    return false;
  }

  // Depth-first walk over text nodes. Descends into open shadow roots. Skips
  // editable/non-rendered subtrees entirely.
  function walk(node, visitText) {
    if (!node) return;
    if (node.nodeType === TEXT_NODE) {
      visitText(node);
      return;
    }
    if (node.nodeType === ELEMENT_NODE) {
      if (shouldSkipNode(node)) return;
      if (node.shadowRoot) walk(node.shadowRoot, visitText); // open roots only
    }
    const children = node.childNodes;
    if (!children) return;
    // snapshot: replacement mutates nodeValue but not structure, still safe
    for (let i = 0; i < children.length; i++) walk(children[i], visitText);
  }

  function replaceTextNodes(root, matcher, store, onReplace) {
    if (!matcher) return;
    walk(root, (node) => {
      const value = node.nodeValue;
      if (!value || !matcher.matches(value)) return;
      const next = matcher.apply(value, onReplace);
      if (next === value) return;
      if (!store.originals.has(node)) store.originals.set(node, value);
      node.nodeValue = next;
    });
  }

  // Re-process a single text node whose value the page just rewrote in place
  // (a characterData mutation on a live ticker/chat). Unlike replaceTextNodes,
  // this *refreshes* the stored original: the current value is the page's new
  // intended text (we disconnect the observer while we write, so this is never
  // our own replacement), so it becomes the new revert baseline.
  function reprocessTextNode(node, matcher, store, onReplace) {
    if (!matcher || !node || node.nodeType !== TEXT_NODE) return;
    const value = node.nodeValue;
    if (!value || !matcher.matches(value)) return;
    const next = matcher.apply(value, onReplace);
    if (next === value) return;
    store.originals.set(node, value);
    node.nodeValue = next;
  }

  function revertAll(root, store) {
    walk(root, (node) => {
      if (store.originals.has(node)) {
        node.nodeValue = store.originals.get(node);
      }
    });
  }

  // True if a node lives inside an editable surface. Works for both element
  // targets (added nodes) and text-node targets (characterData) by resolving to
  // the nearest element and using closest().
  const EDITABLE_SELECTOR = "input, textarea, [role='textbox'], [contenteditable]";
  function isInEditableContext(node) {
    const el = node.nodeType === ELEMENT_NODE ? node : node.parentElement;
    if (!el) return false;
    if (el.isContentEditable) return true;
    return !!(el.closest && el.closest(EDITABLE_SELECTOR));
  }

  // Flatten added nodes from a batch of MutationRecords, dropping anything
  // inserted into an editable surface. The caller accumulates these across
  // bursts so no batch is ever lost (walk() handles editable descendants).
  function collectReplaceableNodes(mutations) {
    const out = [];
    for (const m of mutations) {
      if (m.type !== "childList") continue;
      for (const node of m.addedNodes) {
        if (!isInEditableContext(node)) out.push(node);
      }
    }
    return out;
  }

  // Text nodes whose value the page rewrote in place (characterData records),
  // excluding those inside editable surfaces. Fed to reprocessTextNode.
  function collectCharacterDataTargets(mutations) {
    const out = [];
    for (const m of mutations) {
      if (m.type !== "characterData") continue;
      const node = m.target;
      if (node && node.nodeType === TEXT_NODE && !isInEditableContext(node)) {
        out.push(node);
      }
    }
    return out;
  }

  return {
    createStore,
    shouldSkipNode,
    walk,
    replaceTextNodes,
    reprocessTextNode,
    revertAll,
    collectReplaceableNodes,
    collectCharacterDataTargets,
  };
});
