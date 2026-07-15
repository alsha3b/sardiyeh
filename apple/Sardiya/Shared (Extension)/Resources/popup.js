// Single popup controller. Rendering + i18n helpers live in src/popup-core.js
// (loaded before this file, attaches to window.Sardiya). This file owns storage,
// the toggle lifecycle, the add-word dialog, and language loading.
(() => {
  const { buildRow, applyTranslations } = window.Sardiya;

  // Suggestion submission endpoint (crowdsourced; does not create a local
  // replacement). Suggestions land in the Firestore `suggestions` collection
  // via the unauthenticated REST createDocument endpoint — the same public REST
  // surface background.js reads the dictionary from. Firestore rules
  // (firestore.rules) let anyone create a suggestion but only admins read/triage
  // it; the admin page promotes accepted ones into `words`.
  const PROJECT_ID = "sardiyeh-elmokhtbr";
  const SUGGEST_URL =
    "https://firestore.googleapis.com/v1/projects/" +
    PROJECT_ID +
    "/databases/(default)/documents/suggestions";

  const translations = {}; // { en: {...}, ar: {...} }

  document.addEventListener("DOMContentLoaded", async () => {
    await loadTranslations();
    initLanguage();
    renderReplacedWords();
    initToggle();
    initAddButton();
    initForm();
    initSafariHint();
  });

  // ---------- Safari host-permission onboarding ----------
  // Safari (unlike Chrome) does not silently honor host_permissions: content
  // scripts never run until the user opens the toolbar button and picks "Allow
  // on Every Website". Show a one-time hint explaining that — Safari only, and
  // dismissible (persisted in storage.sync). Chrome grants <all_urls> at install
  // so the banner would be noise there.
  const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  function initSafariHint() {
    if (!IS_SAFARI) return;
    const banner = document.getElementById("safari-onboarding");
    if (!banner) return;
    chrome.storage.sync.get(["safariHintDismissed"], ({ safariHintDismissed }) => {
      if (safariHintDismissed) return;
      banner.style.display = "block";
    });
    document
      .getElementById("safari-onboarding-dismiss")
      ?.addEventListener("click", () => {
        banner.style.display = "none";
        chrome.storage.sync.set({ safariHintDismissed: true });
      });
  }

  // ---------- i18n ----------
  async function loadTranslations() {
    for (const lang of ["en", "ar"]) {
      try {
        const res = await fetch(chrome.runtime.getURL(`translations/${lang}.json`));
        translations[lang] = await res.json();
      } catch (e) {
        translations[lang] = {};
      }
    }
  }

  function initLanguage() {
    const select = document.getElementById("language-select");
    chrome.storage.sync.get(["selectedLanguage"], ({ selectedLanguage }) => {
      const lang = selectedLanguage || "en";
      if (select) select.value = lang;
      applyLanguage(lang);
    });
    select?.addEventListener("change", () => {
      const lang = select.value;
      applyLanguage(lang);
      chrome.storage.sync.set({ selectedLanguage: lang });
    });
  }

  function applyLanguage(lang) {
    applyTranslations(document, translations[lang]);
    const rtl = lang === "ar";
    document.body.setAttribute("dir", rtl ? "rtl" : "ltr");
    document.querySelector(".header")?.setAttribute("dir", rtl ? "rtl" : "ltr");
    // Use the fonts index.html actually loads (IBM Plex Sans Arabic).
    document.body.style.fontFamily = "'IBM Plex Sans Arabic', sans-serif";
  }

  function t(key) {
    const lang = document.getElementById("language-select")?.value || "en";
    return (translations[lang] || {})[key] || "";
  }

  // ---------- replaced-words table ----------
  // Ask the active tab's top frame for the words it replaced. Scoping the query
  // to a single tab (not a shared storage key) is what makes the list correct
  // when several tabs have matches. No content script (chrome://, store pages,
  // etc.) → lastError → empty table.
  function renderReplacedWords() {
    const tbody = document.getElementById("table-body");
    if (!tbody) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs && tabs[0] && tabs[0].id;
      if (tabId == null) return;
      chrome.tabs.sendMessage(
        tabId,
        { type: "sardiya:getReplacedWords" },
        { frameId: 0 },
        (resp) => {
          if (chrome.runtime.lastError || !resp) return;
          (resp.replacedWords || []).forEach(({ word, replacement }) =>
            tbody.appendChild(buildRow(document, word, replacement))
          );
        }
      );
    });
  }

  // ---------- on/off toggle ----------
  // No reload: the content script applies (on) or reverts in place (off) live
  // through chrome.storage.onChanged. This is the D1 in-place revert path.
  function initToggle() {
    const toggle = document.getElementById("toggleSwitch");
    if (!toggle) return;
    chrome.storage.sync.get(["ext_on"], ({ ext_on }) => {
      toggle.checked = ext_on !== false; // default on
    });
    toggle.addEventListener("change", () => {
      chrome.storage.sync.set({ ext_on: toggle.checked });
    });
  }

  // ---------- add-word dialog ----------
  function initAddButton() {
    document.getElementById("edit-button")?.addEventListener("click", openDialog);
  }

  function openDialog() {
    const dialog = document.getElementById("input-dialog");
    const content = document.getElementById("content");
    if (dialog) dialog.style.display = "block";
    if (content) content.style.display = "none";
  }

  function closeDialog() {
    const dialog = document.getElementById("input-dialog");
    const content = document.getElementById("content");
    if (dialog) dialog.style.display = "none";
    if (content) content.style.display = "block";
    document.getElementById("input-form")?.reset();
  }

  function initForm() {
    const form = document.getElementById("input-form");
    if (!form) return;
    const wordInput = document.getElementById("word-input");
    const replacementInput = document.getElementById("replacement-input");
    const errorText = document.getElementById("error-text");
    const errorMessage = document.getElementById("error-message");
    const loading = document.getElementById("loading-indicator");
    const submit = document.getElementById("dialog-submit");

    const showError = (msg) => {
      if (errorMessage) errorMessage.style.display = "flex";
      if (errorText) errorText.textContent = msg;
    };
    const clearError = () => {
      wordInput?.classList.remove("input-error");
      replacementInput?.classList.remove("input-error");
      if (errorMessage) errorMessage.style.display = "none";
      if (errorText) errorText.textContent = "";
    };

    if (submit) submit.disabled = true;
    [wordInput, replacementInput].forEach((input) =>
      input?.addEventListener("input", () => {
        const filled = wordInput.value.trim() && replacementInput.value.trim();
        if (submit) submit.disabled = !filled;
        clearError();
      })
    );

    document.getElementById("dialog-close")?.addEventListener("click", closeDialog);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const word = wordInput.value.trim();
      const replacement = replacementInput.value.trim();

      if (!word || !replacement) return showError(t("errorEmptyFields") || "Both fields are required.");
      if (word.toLowerCase() === replacement.toLowerCase()) {
        wordInput.classList.add("input-error");
        replacementInput.classList.add("input-error");
        return showError(
          t("errorSameWord") || "The word and its replacement cannot be the same."
        );
      }

      if (loading) loading.style.display = "block";
      clearError();
      try {
        // Firestore REST expects typed field values, not raw JSON.
        const res = await fetch(SUGGEST_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              word: { stringValue: word },
              replacement: { stringValue: replacement },
              createdAt: { timestampValue: new Date().toISOString() },
            },
          }),
        });
        if (res.ok) {
          document
            .getElementById("table-body")
            ?.appendChild(buildRow(document, word, replacement));
          closeDialog();
        } else {
          showError(t("errorSubmissionFailed") || "Submission failed. Please try again.");
        }
      } catch (e) {
        showError(t("errorSubmissionFailed") || "Submission failed. Please try again.");
      } finally {
        if (loading) loading.style.display = "none";
      }
    });
  }
})();
