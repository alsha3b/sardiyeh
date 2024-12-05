// File responsible for the extension popup

document.addEventListener("DOMContentLoaded", function () {
  initLanguage();
  populateReplacedWords();
  initForm();
  initAddButton(); // Initialize the add-button functionality
});

function initAddButton() {
  const addButton = document.getElementById("edit-button");

  if (addButton) {
    addButton.addEventListener("click", function () {
      openDialog(); // Navigate to the word-replacement section
    });
  }
}

function initForm() {
  const form = document.getElementById("input-form");
  const wordInput = document.getElementById("word-input");
  const replacementInput = document.getElementById("replacement-input");
  const errorMessage = document.getElementById("error-message");
  const errorText = document.getElementById("error-text");
  const loadingIndicator = document.getElementById("loading-indicator");
  const submitButton = document.getElementById("dialog-submit");

  // Initially disable the Save button
  submitButton.disabled = true;

  const inputs = [wordInput, replacementInput];

  // Add event listeners for input fields
  inputs.forEach((input) => {
    input.addEventListener("input", validateInputs);
    input.addEventListener("focus", handleFocus);
    input.addEventListener("blur", handleBlur);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // Prevent default form submission

    const wordValue = wordInput.value.trim();
    const replacementValue = replacementInput.value.trim();

    // Check if the words are the same
    if (wordValue === replacementValue) {
      // Show error message but allow Save button to be clicked
      showErrorMessage("The word and its replacement cannot be the same.");
      wordInput.classList.add("input-error");
      replacementInput.classList.add("input-error");
      return;
    }

    // Check if either field is empty
    if (!wordValue || !replacementValue) {
      showErrorMessage("Both fields are required.");
      return;
    }

    // Show loading indicator and hide error message
    loadingIndicator.style.display = "block";
    clearErrorStyles();

    try {
      const response = await fetch(
        "https://script.google.com/macros/s/AKfycbwqV-kCvRonl9MXdSOP7l7LsMh4ZA-Ro0eLsDvrruF228OI4UT1-AW5JFuijnNqsg5V/exec",
        {
          method: "POST",
          body: new FormData(form),
        }
      );

      if (response.ok) {
        addWord(wordValue, replacementValue);
        closeDialog();
      } else {
        showErrorMessage("Submission failed. Please try again.");
      }
    } catch (error) {
      console.error("Error:", error);
      showErrorMessage("Submission failed. Please try again.");
    } finally {
      // Hide loading indicator
      loadingIndicator.style.display = "none";
    }
  });

  document
    .querySelector(".dialog-close")
    .addEventListener("click", closeDialog);

  // Validation logic for enabling/disabling Save button
  function validateInputs() {
    const wordValue = wordInput.value.trim();
    const replacementValue = replacementInput.value.trim();

    if (!wordValue || !replacementValue) {
      // Disable Save button if either input is empty
      submitButton.disabled = true;
      clearErrorStyles();
    } else {
      // Enable Save button if inputs are valid
      submitButton.disabled = false;
      clearErrorStyles();
    }
  }

  function showErrorMessage(message) {
    errorMessage.style.display = "flex";
    errorText.textContent = message;
  }

  function clearErrorStyles() {
    wordInput.classList.remove("input-error");
    replacementInput.classList.remove("input-error");
    errorMessage.style.display = "none";
    errorText.textContent = "";
  }

  // Handle focus and blur events to animate placeholder as a label
  function handleFocus(event) {
    const label = event.target.previousElementSibling;
    if (label) label.classList.add("label-focused");
  }

  function handleBlur(event) {
    const label = event.target.previousElementSibling;
    if (label && !event.target.value.trim()) label.classList.remove("label-focused");
  }
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
  document.getElementById("replaced-words-title").textContent = lang.replacedWords;
  document.getElementById("word-header").textContent = lang.word;
  document.getElementById("replacement-header").textContent = lang.replacement;
  document.getElementById("dialog-submit").textContent = lang.submitButton;
  document.getElementById("dialog-close").textContent = lang.cancelButton;
}

function getLocalizedString(key) {
  const language = document.getElementById("language-select").value;
  const lang = language === "en" ? en : ar;
  return lang[key];
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
    wordCell.appendChild(wordLink);

    const replacementCell = document.createElement("td");
    const replacementLink = document.createElement("a");
    replacementLink.href = `https://www.palestineremembered.com/Search.html#gsc.tab=0&gsc.sort=&gsc.q=${encodeURIComponent(
      replacement
    )}`;
    replacementLink.target = "_blank";
    replacementLink.textContent = replacement;
    replacementCell.appendChild(replacementLink);

    row.appendChild(wordCell);
    row.appendChild(replacementCell);
    tableBody.appendChild(row);
  }
}

function openDialog() {
  const inputDialog = document.getElementById("input-dialog");
  const content = document.getElementById("content");

  if (inputDialog && content) {
    inputDialog.style.display = "block"; // Show the input dialog
    content.style.display = "none"; // Hide the main content
  }
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
