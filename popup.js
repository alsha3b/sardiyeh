// file responsible for the extension popup

document.addEventListener("DOMContentLoaded", function () {
  initLanguage();
  populateReplacedWords();
  initForm();
});

function initForm() {
  const form = document.getElementById("input-form");
  const wordInput = document.getElementById("word-input");
  const replacementInput = document.getElementById("replacement-input");
  const errorMessage = document.getElementById("error-message");
  const loadingIndicator = document.getElementById("loading-indicator");

  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // Prevent default form submission

    // Validate inputs
    if (!wordInput.value || !replacementInput.value) {
      errorMessage.textContent = getLocalizedString("errorEmptyFields");
      return;
    }

    // Show loading indicator and hide error message
    loadingIndicator.style.display = "block";
    errorMessage.textContent = "";

    try {
      const response = await fetch(
        "https://script.google.com/macros/s/AKfycbwqV-kCvRonl9MXdSOP7l7LsMh4ZA-Ro0eLsDvrruF228OI4UT1-AW5JFuijnNqsg5V/exec",
        {
          method: "POST",
          body: new FormData(form),
        }
      );

      if (response.ok) {
        addWord(wordInput.value, replacementInput.value);
        closeDialog();
      } else {
        errorMessage.textContent = getLocalizedString("errorSubmissionFailed");
      }
    } catch (error) {
      console.error("Error:", error);
      errorMessage.textContent = getLocalizedString("errorSubmissionFailed");
    } finally {
      // Hide loading indicator
      loadingIndicator.style.display = "none";
    }
  });

  document
    .querySelector(".dialog-close")
    .addEventListener("click", closeDialog);
}

function initLanguage() {
  const languageSelect = document.getElementById("language-select");
  languageSelect.addEventListener("change", changeLanguage);

  chrome.storage.sync.get(["selectedLanguage"], function (result) {
    const selectedLanguage = result.selectedLanguage || "en"; // Default to English if no language is saved
    languageSelect.value = selectedLanguage;
    setLanguage(selectedLanguage);
  });
}

function populateReplacedWords() {
  chrome.storage.local.get("replacedWords", function (data) {
    if (data.replacedWords && data.replacedWords.length > 0) {
      data.replacedWords.forEach((word) => {
        const tableBody = document.getElementById("table-body");
        const row = document.createElement("tr");

        const wordCell = document.createElement("td");
        const wordLink = document.createElement("a");
        wordLink.href = `https://www.palestineremembered.com/Search.html#gsc.tab=0&gsc.sort=&gsc.q=${encodeURIComponent(
          word.original
        )}`;
        wordLink.target = "_blank"; // Open link in new tab
        wordLink.textContent = word.original;
        wordLink.style.color = "#97700B";
        wordLink.style.textDecoration = "none";
        wordCell.appendChild(wordLink);
        // wordCell.innerHTML = wordLink;

        const replacementCell = document.createElement("td");
        const replacementLink = document.createElement("a");
        replacementLink.href = `https://www.palestineremembered.com/Search.html#gsc.tab=0&gsc.sort=&gsc.q=${encodeURIComponent(
          word.replacement
        )}`;
        replacementLink.target = "_blank";
        replacementLink.textContent = word.replacement;
        replacementLink.style.color = "#000000";
        replacementLink.style.textDecoration = "none";
        replacementCell.appendChild(replacementLink);
        // replacementCell.innerHTML = replacementLink;

        // const wordCell = document.createElement("td");
        // const replacementCell = document.createElement("td");
        // wordCell.textContent = word.original;
        // replacementCell.textContent = word.replacement;

        row.appendChild(wordCell);
        row.appendChild(replacementCell);
        tableBody.appendChild(row);
      });
    }
  });
}

function addWord(word, replacement) {
  if (word && replacement) {
    const tableBody = document.getElementById("table-body");

    const row = document.createElement("tr");

    const wordCell = document.createElement("td");
    const wordLink = document.createElement("a");
    wordLink.href = `https://www.palestineremembered.com/Search.html#gsc.tab=0&gsc.sort=&gsc.q=${encodeURIComponent(
      word
    )}`;
    wordLink.target = "_blank"; // Open link in new tab
    wordLink.textContent = word;
    // wordCell.appendChild(wordLink);
    wordCell.innerHTML = wordLink;

    const replacementCell = document.createElement("td");
    const replacementLink = document.createElement("a");
    replacementLink.href = `https://www.palestineremembered.com/Search.html#gsc.tab=0&gsc.sort=&gsc.q=${encodeURIComponent(
      replacement
    )}`;
    replacementLink.target = "_blank";
    replacementLink.textContent = replacement;
    // replacementCell.appendChild(replacementLink);
    replacementCell.innerHTML = replacementLink;

    row.appendChild(wordCell);
    row.appendChild(replacementCell);
    tableBody.appendChild(row);
  }
}

const sheetUrl =
  "https://script.google.com/macros/s/AKfycbwqV-kCvRonl9MXdSOP7l7LsMh4ZA-Ro0eLsDvrruF228OI4UT1-AW5JFuijnNqsg5V/exec";

function submitForm() {
  const wordInput = document.getElementById("word-input").value;
  const replacementInput = document.getElementById("replacement-input").value;
  const errorMessage = document.getElementById("error-message");

  if (!wordInput || !replacementInput) {
    errorMessage.textContent = getLocalizedString("errorEmptyFields");
    return;
  }

  errorMessage.textContent = "";

  fetch(sheetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      word: wordInput,
      replacement: replacementInput,
    }),
  })
    .then((response) => {
      if (response.ok) {
        closeDialog();
        addWord(wordInput, replacementInput);
      } else {
        errorMessage.textContent = getLocalizedString("errorSubmissionFailed");
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      errorMessage.textContent = getLocalizedString("errorSubmissionFailed");
    });
}

function openDialog() {
  const inputDialog = document.getElementById("input-dialog");
  const content = document.getElementById("content");

  inputDialog.style.display = "block";
  content.style.display = "none";
}

function closeDialog() {
  const inputDialog = document.getElementById("input-dialog");
  const content = document.getElementById("content");

  inputDialog.style.display = "none";
  content.style.display = "block";

  const form = document.getElementById("input-form");
  form.reset(); // Reset the form inputs
  document.getElementById("error-message").textContent = ""; // Clear error message
}

function changeLanguage() {
  const languageSelect = document.getElementById("language-select");
  const selectedLanguage = languageSelect.value;

  setLanguage(selectedLanguage);

  // Save the selected language
  chrome.storage.sync.set({ selectedLanguage: selectedLanguage });
}

function setLanguage(language) {
  if (language === "en") {
    loadLanguage(en);
    document.body.setAttribute("dir", "ltr");
    document.querySelector(".header").setAttribute("dir", "ltr");
    document.body.style.fontFamily = "'Montserrat', sans-serif";
  } else if (language === "ar") {
    loadLanguage(ar);
    document.body.setAttribute("dir", "rtl");
    document.querySelector(".header").setAttribute("dir", "rtl");
    document.body.style.fontFamily = "'Beiruti', sans-serif";
  }
}
function loadLanguage(lang) {
  // document.getElementById("header-text").textContent = lang.pluginName;
  document.getElementById("replaced-words-title").textContent =
    lang.replacedWords;
  document.getElementById("word-header").textContent = lang.word;
  document.getElementById("replacement-header").textContent = lang.replacement;
  document.getElementById("word-label").textContent = lang.wordLabel;
  document.getElementById("word-input").placeholder = lang.wordLabel;
  document.getElementById("replacement-input").placeholder =
    lang.replacementLabel;
  document.getElementById("replacement-label").textContent =
    lang.replacementLabel;
  document.getElementById("dialog-submit").textContent = lang.submitButton;
  document.getElementById("dialog-close").textContent = lang.cancelButton;
}

function getLocalizedString(key) {
  const language = document.getElementById("language-select").value;
  const lang = language === "en" ? en : ar;
  return lang[key];
}

document.getElementById("edit-button").addEventListener("click", openDialog);

document
  .getElementById("language-select")
  .addEventListener("click", changeLanguage);
