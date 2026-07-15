// Pure-ish popup helpers, DOM-testable in jsdom. No chrome here — popup.js
// owns storage/messaging and delegates rendering + i18n to these.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Sardiya = root.Sardiya || {};
    Object.assign(root.Sardiya, api);
  }
})(typeof self !== "undefined" ? self : this, function () {
  const SEARCH_BASE =
    "https://www.palestineremembered.com/Search.html#gsc.tab=0&gsc.sort=&gsc.q=";

  function searchLink(doc, text, color) {
    const a = doc.createElement("a");
    a.href = SEARCH_BASE + encodeURIComponent(text);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = text; // textContent, never innerHTML
    a.style.textDecoration = "none";
    if (color) a.style.color = color;
    return a;
  }

  // One row builder used everywhere a (word, replacement) row is rendered.
  // Link colors are owned by styles.css (.replaced-words-table td a), not set
  // inline here — one source of truth for the palette.
  function buildRow(doc, word, replacement) {
    const tr = doc.createElement("tr");
    const wordCell = doc.createElement("td");
    wordCell.appendChild(searchLink(doc, word));
    const replacementCell = doc.createElement("td");
    replacementCell.appendChild(searchLink(doc, replacement));
    tr.appendChild(wordCell);
    tr.appendChild(replacementCell);
    return tr;
  }

  const setText = (doc, id, value) => {
    const el = doc.getElementById(id);
    if (el && value != null) el.textContent = value;
  };
  const setPlaceholder = (doc, id, value) => {
    const el = doc.getElementById(id);
    if (el && value != null) el.placeholder = value;
  };

  function applyTranslations(doc, lang) {
    if (!lang) return;
    setText(doc, "replaced-words-title", lang.replacedWords);
    setText(doc, "replaced-words-subtitle", lang.replacedWordsSubtitle);
    setText(doc, "word-label", lang.wordLabel);
    setText(doc, "replacement-label", lang.replacementLabel);
    setText(doc, "dialog-title", lang.suggestDialogTitle);
    setText(doc, "dialog-submit", lang.submitButton);
    setText(doc, "dialog-close", lang.cancelButton);
    setText(doc, "safari-onboarding-title", lang.safariOnboardingTitle);
    setText(doc, "safari-onboarding-body", lang.safariOnboardingBody);
    setText(doc, "safari-onboarding-dismiss", lang.safariOnboardingDismiss);
    // off-state banner
    setText(doc, "off-banner-text", lang.offBanner);
    // empty state
    setText(doc, "empty-title", lang.emptyTitle);
    setText(doc, "empty-body", lang.emptyBody);
    setText(doc, "empty-suggest", lang.emptySuggest);
    // suggest confirmation
    setText(doc, "suggest-confirm-text", lang.suggestConfirm);
    setText(doc, "suggest-confirm-close", lang.suggestConfirmClose);
    // welcome onboarding
    setText(doc, "welcome-continue", lang.welcomeContinue);
    // toggle: fixed aria description (the visible ON/OFF label is set per-state
    // by popup.js since it depends on the current checked value).
    const toggle = doc.getElementById("toggleSwitch");
    if (toggle && lang.toggleAria != null) toggle.setAttribute("aria-label", lang.toggleAria);
    setPlaceholder(doc, "word-input", lang.wordInput);
    setPlaceholder(doc, "replacement-input", lang.replacementInput);
  }

  // Single source of truth for popup view visibility. popup.js calls this on
  // load, on the on/off toggle (so the off-banner updates live), when opening/
  // closing the suggest dialog, and after the welcome onboarding is dismissed.
  // Pure DOM — no chrome — so it is unit-testable in jsdom.
  //   view:    'main' | 'dialog' | 'welcome'   (default 'main')
  //   extOn:   false  → show the "replacement paused" banner (main view)
  //   hasRows: false  → show the empty state instead of the table (main view)
  function renderState(doc, { view = "main", extOn = true, hasRows = false } = {}) {
    const show = (id, mode) => {
      const el = doc.getElementById(id);
      if (el) el.style.display = mode;
    };
    show("content", view === "main" ? "block" : "none");
    show("input-dialog", view === "dialog" ? "block" : "none");
    show("welcome", view === "welcome" ? "flex" : "none");
    if (view === "main") {
      show("off-banner", extOn ? "none" : "flex");
      show("empty-state", hasRows ? "none" : "block");
      show("table-container", hasRows ? "block" : "none");
      // The subtitle describes the list; hide it in the empty state so it does
      // not sit redundantly above the empty-state message. The title row (with
      // the language select + suggest button) stays.
      show("replaced-words-subtitle", hasRows ? "block" : "none");
    }
  }

  return { SEARCH_BASE, buildRow, applyTranslations, renderState };
});
