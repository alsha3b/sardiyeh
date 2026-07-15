// Content-script orchestration. Pure logic lives in src/matcher.js and
// src/dom.js (loaded before this file via manifest content_scripts). This file
// only wires storage, the mutation observer, and the on/off lifecycle.
//
//   storage.local.dictionary  (written by the background worker)
//        │
//        ▼
//   buildMatcher ──► replaceTextNodes(document.body) ──► in-place nodeValue
//        ▲                                                   │
//   storage.onChanged                              WeakMap originals (for revert)
//   (ext_on / dictionary)                          MutationObserver(addedNodes)
(() => {
  const S = self.Sardiya;
  if (!S || !chrome?.storage) return;

  const store = S.createStore();
  const FLAG_SELECTOR = "div.MRI68d";
  // The "Replaced words" popup table reflects the top document only. Recording
  // from the main frame alone avoids double-counting across the many frames a
  // page can have; iframe text is still replaced. The popup pulls this list on
  // demand (see the onMessage responder below), scoped to the tab it targets,
  // so there is no shared storage key to race between tabs/frames.
  const isTopFrame = window === window.top;

  let matcher = null;
  let observer = null;
  let running = false;

  const replacedWords = [];
  const replacedSeen = new Set();

  function recordReplacement(word, replacement) {
    if (!isTopFrame || replacedSeen.has(word)) return;
    replacedSeen.add(word);
    replacedWords.push({ word, replacement });
  }

  // The popup asks the active tab's top frame for its current list. Answering
  // from live in-memory state (rather than a shared storage key) means each tab
  // reports only its own replacements — no cross-tab last-writer-wins. Non-top
  // frames stay silent; the popup targets frameId 0 anyway.
  if (isTopFrame && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === "sardiya:getReplacedWords") {
        sendResponse({ replacedWords });
      }
    });
  }

  // Best-effort flag swap. Google-only selector; runs once per matched image.
  function replaceFlagOnce() {
    const container = document.querySelector(FLAG_SELECTOR);
    if (!container) return;
    const img = container.querySelector("img");
    if (!img || img.dataset.sardiyaFlag) return;
    img.src = chrome.runtime.getURL("images/Palestine_Flag.png");
    img.alt = "Palestine Flag";
    img.dataset.sardiyaFlag = "1";
  }

  function replaceIn(root) {
    if (matcher) S.replaceTextNodes(root, matcher, store, recordReplacement);
  }

  // ---- mutation observer: accumulate mutations across bursts, drain on a
  //      trailing debounce so nothing is dropped on continuously-mutating SPAs;
  //      disconnect while mutating so our own writes don't retrigger it.
  //      added nodes -> full walk; characterData -> re-process that text node
  //      (live tickers/chat rewriting text without adding nodes). ----
  const OBSERVE_OPTS = { childList: true, subtree: true, characterData: true };
  const pending = new Set(); // added subtrees to walk
  const pendingChar = new Set(); // text nodes rewritten in place
  let flushTimer = null;

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (pending.size === 0 && pendingChar.size === 0) return;
      const nodes = [...pending];
      const charNodes = [...pendingChar];
      pending.clear();
      pendingChar.clear();
      stopObserving();
      for (const node of nodes) {
        replaceIn(node);
        discoverShadowRoots(node); // new subtree may bring open shadow roots
      }
      for (const node of charNodes) {
        S.reprocessTextNode(node, matcher, store, recordReplacement);
      }
      replaceFlagOnce();
      if (running) startObserving();
    }, 300);
  }

  // MutationObserver callbacks don't cross shadow boundaries, so one observer
  // per open shadow root is needed for content injected into a root after load.
  // The initial pass (walk) already replaces existing shadow content.
  function handleMutations(mutations) {
    for (const node of S.collectReplaceableNodes(mutations)) pending.add(node);
    for (const node of S.collectCharacterDataTargets(mutations)) pendingChar.add(node);
    if (pending.size > 0 || pendingChar.size > 0) scheduleFlush();
  }

  let shadowObservers = [];
  const knownRoots = new Set(); // open shadow roots discovered so far
  let seenRoots = new WeakSet(); // dedupe guard for discovery

  // Record every open shadow root under `root` (recursively). Only scans the
  // given subtree — added nodes carry their own new roots — so we never re-walk
  // the whole document on each flush.
  function discoverShadowRoots(root) {
    if (!root || !root.querySelectorAll) return;
    for (const el of root.querySelectorAll("*")) {
      const sr = el.shadowRoot;
      if (!sr || seenRoots.has(sr)) continue;
      seenRoots.add(sr);
      knownRoots.add(sr);
      discoverShadowRoots(sr); // nested shadow roots
    }
  }

  // (Re)attach an observer to each known open shadow root. Cheap: no DOM scan.
  function connectShadowObservers() {
    for (const sr of knownRoots) {
      const so = new MutationObserver(handleMutations);
      so.observe(sr, OBSERVE_OPTS);
      shadowObservers.push(so);
    }
  }

  function startObserving() {
    stopObserving(); // idempotent: never stack duplicate observers on restart
    if (!observer) observer = new MutationObserver(handleMutations);
    observer.observe(document, OBSERVE_OPTS);
    discoverShadowRoots(document);
    connectShadowObservers();
  }
  function stopObserving() {
    if (observer) observer.disconnect();
    for (const so of shadowObservers) so.disconnect();
    shadowObservers = [];
  }

  function cancelPending() {
    clearTimeout(flushTimer);
    flushTimer = null;
    pending.clear();
    pendingChar.clear();
  }

  function start() {
    if (running || !matcher) return;
    running = true;
    replaceIn(document.body);
    replaceFlagOnce();
    startObserving();
  }

  function stop() {
    if (!running) return;
    running = false;
    stopObserving();
    cancelPending();
    S.revertAll(document.body, store);
  }

  function setDictionary(dict) {
    matcher = dict ? S.buildMatcher(dict) : null;
  }

  async function init() {
    const [{ ext_on }, { dictionary }] = await Promise.all([
      chrome.storage.sync.get(["ext_on"]),
      chrome.storage.local.get(["dictionary"]),
    ]);
    setDictionary(dictionary);
    if (ext_on !== false) start(); // default on unless explicitly disabled

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && "ext_on" in changes) {
        if (changes.ext_on.newValue === false) stop();
        else start();
      }
      if (area === "local" && "dictionary" in changes) {
        // dictionary arrived (first install) or was refreshed
        setDictionary(changes.dictionary.newValue);
        if (running) {
          running = false; // let start() re-run the initial pass with new keys
          start();
        }
      }
    });

    window.addEventListener("pagehide", () => {
      stopObserving();
      cancelPending();
    });
  }

  init();
})();
