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
  function buildRow(doc, word, replacement) {
    const tr = doc.createElement("tr");
    const wordCell = doc.createElement("td");
    wordCell.appendChild(searchLink(doc, word, "#97700B"));
    const replacementCell = doc.createElement("td");
    replacementCell.appendChild(searchLink(doc, replacement, "#000000"));
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
    setText(doc, "word-header", lang.word);
    setText(doc, "replacement-header", lang.replacement);
    setText(doc, "word-label", lang.wordLabel);
    setText(doc, "replacement-label", lang.replacementLabel);
    setText(doc, "dialog-submit", lang.submitButton);
    setText(doc, "dialog-close", lang.cancelButton);
    setText(doc, "safari-onboarding-title", lang.safariOnboardingTitle);
    setText(doc, "safari-onboarding-body", lang.safariOnboardingBody);
    setText(doc, "safari-onboarding-dismiss", lang.safariOnboardingDismiss);
    setPlaceholder(doc, "word-input", lang.wordInput);
    setPlaceholder(doc, "replacement-input", lang.replacementInput);
  }

  return { SEARCH_BASE, buildRow, applyTranslations };
});
