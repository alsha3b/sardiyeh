// Single popup controller. Rendering + i18n helpers live in src/popup-core.js
// (loaded before this file, attaches to window.Sardiya). Analytics relay
// (sendTrack) lives in src/track-client.js (also on window.Sardiya). This file
// owns storage, the toggle lifecycle, the suggest-a-name dialog, view-state
// wiring, and language loading.
//
// View state is a single source of truth (S.renderState). Three top-level views:
//   welcome  — first-run onboarding, shown until welcomeSeen is set
//   main     — the names list; within it, the off-banner (ext_on) and the
//              empty-state (no rows) are driven by renderState too
//   dialog   — the suggest-a-name form
// Anything that used to poke element.style.display directly now goes through
// render() so the states never fight each other (and so toggling on/off updates
// the off-banner live, while the popup is open).
(() => {
  const { buildRow, applyTranslations, renderState, sendTrack } = window.Sardiya;

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
  const state = { view: "main", extOn: true, hasRows: false };

  document.addEventListener("DOMContentLoaded", async () => {
    sendTrack("popup_opened"); // engagement / DAU-WAU signal
    await loadTranslations();
    initLanguage();
    setFooterYear();
    await initState(); // reads ext_on + welcomeSeen, picks the first view
    renderReplacedWords();
    initToggle();
    initDialog();
    initWelcome();
    initSafariHint();
  });

  // ---------- view rendering ----------
  function render() {
    renderState(document, state);
    updateToggleLabel();
  }

  function updateToggleLabel() {
    const label = document.getElementById("toggle-label");
    if (label) label.textContent = state.extOn ? t("toggleOn") : t("toggleOff");
  }

  function setFooterYear() {
    const el = document.getElementById("footer-year");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  async function initState() {
    const { ext_on, welcomeSeen } = await chrome.storage.sync.get([
      "ext_on",
      "welcomeSeen",
    ]);
    state.extOn = ext_on !== false; // default on
    state.view = welcomeSeen ? "main" : "welcome";
    render();
  }

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
      sendTrack("language_changed", { language: lang });
    });
  }

  function applyLanguage(lang) {
    applyTranslations(document, translations[lang]);
    const rtl = lang === "ar";
    document.body.setAttribute("dir", rtl ? "rtl" : "ltr");
    document.querySelector(".header")?.setAttribute("dir", rtl ? "rtl" : "ltr");
    // Font follows language via CSS (body / body[dir="rtl"] in styles.css):
    // Space Mono for LTR, Thmanyah Sans for RTL. No inline override here — the
    // old unconditional override forced one font for both languages.
    updateToggleLabel();
  }

  function t(key) {
    const lang = document.getElementById("language-select")?.value || "en";
    return (translations[lang] || {})[key] || "";
  }

  // ---------- replaced-words table ----------
  // Ask the active tab's top frame for the words it replaced. Scoping the query
  // to a single tab (not a shared storage key) is what makes the list correct
  // when several tabs have matches. No content script (chrome://, store pages,
  // etc.) → lastError → empty table → empty state.
  function renderReplacedWords() {
    const tbody = document.getElementById("table-body");
    if (!tbody) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs && tabs[0] && tabs[0].id;
      if (tabId == null) {
        state.hasRows = false;
        if (state.view === "main") render();
        return;
      }
      chrome.tabs.sendMessage(
        tabId,
        { type: "sardiya:getReplacedWords" },
        { frameId: 0 },
        (resp) => {
          const words =
            chrome.runtime.lastError || !resp ? [] : resp.replacedWords || [];
          tbody.replaceChildren();
          words.forEach(({ word, replacement }) =>
            tbody.appendChild(buildRow(document, word, replacement))
          );
          state.hasRows = words.length > 0;
          if (state.view === "main") render();
        }
      );
    });
  }

  // ---------- on/off toggle ----------
  // No reload: the content script applies (on) or reverts in place (off) live
  // through chrome.storage.onChanged. Toggling here updates the off-banner live
  // via render() — the popup is its own view, so it must re-render, not wait.
  function initToggle() {
    const toggle = document.getElementById("toggleSwitch");
    if (!toggle) return;
    toggle.checked = state.extOn;
    toggle.addEventListener("change", () => {
      state.extOn = toggle.checked;
      chrome.storage.sync.set({ ext_on: toggle.checked });
      sendTrack("extension_toggled", { enabled: toggle.checked });
      if (state.view === "main") render();
      else updateToggleLabel();
    });
  }

  // ---------- welcome onboarding (first run only) ----------
  function initWelcome() {
    document.getElementById("welcome-continue")?.addEventListener("click", () => {
      chrome.storage.sync.set({ welcomeSeen: true });
      state.view = "main";
      render();
    });
  }

  // ---------- suggest-a-name dialog ----------
  function initDialog() {
    document.getElementById("edit-button")?.addEventListener("click", openDialog);
    document.getElementById("empty-suggest")?.addEventListener("click", openDialog);
    document.getElementById("dialog-close")?.addEventListener("click", closeDialog);
    document
      .getElementById("suggest-confirm-close")
      ?.addEventListener("click", closeDialog);
    initForm();
  }

  function openDialog() {
    resetDialog();
    state.view = "dialog";
    render();
  }

  function closeDialog() {
    state.view = "main";
    render();
    resetDialog();
  }

  // Reset the dialog back to the form (hide the confirmation, clear inputs).
  function resetDialog() {
    document.getElementById("input-form")?.reset();
    const form = document.getElementById("input-form");
    const confirm = document.getElementById("suggest-confirm");
    if (form) form.style.display = "";
    if (confirm) confirm.style.display = "none";
    const submit = document.getElementById("dialog-submit");
    if (submit) submit.disabled = true;
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

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const word = wordInput.value.trim();
      const replacement = replacementInput.value.trim();

      if (!word || !replacement) return showError(t("errorEmptyFields") || "Both fields are required.");
      if (word.toLowerCase() === replacement.toLowerCase()) {
        wordInput.classList.add("input-error");
        replacementInput.classList.add("input-error");
        return showError(
          t("errorSameWord") || "The two names cannot be the same."
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
          sendTrack("suggestion_submitted", { status: "success" });
          // Honest confirmation: this was a community suggestion, not a local
          // replacement, so we do NOT fake a row in the table.
          showConfirmation();
        } else {
          sendTrack("suggestion_submitted", { status: "error" });
          showError(t("errorSubmissionFailed") || "Submission failed. Please try again.");
        }
      } catch (e) {
        sendTrack("suggestion_submitted", { status: "error" });
        showError(t("errorSubmissionFailed") || "Submission failed. Please try again.");
      } finally {
        if (loading) loading.style.display = "none";
      }
    });
  }

  function showConfirmation() {
    const form = document.getElementById("input-form");
    const confirm = document.getElementById("suggest-confirm");
    if (form) form.style.display = "none";
    if (confirm) confirm.style.display = "block";
  }
})();
