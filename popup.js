document.addEventListener("DOMContentLoaded", function () {
  const languageSelect = document.getElementById("language-select");
  languageSelect.addEventListener("change", changeLanguage);

  chrome.storage.sync.get(["selectedLanguage"], function (result) {
    const selectedLanguage = result.selectedLanguage || "en"; // Default to English if no language is saved
    languageSelect.value = selectedLanguage;
    setLanguage(selectedLanguage);
  });

  chrome.storage.local.get("replacedWords", function (data) {
    // const replacedWordsList = document.getElementById("replaced-words-list");
    if (data.replacedWords && data.replacedWords.length > 0) {
      data.replacedWords.forEach((word) => {
        const tableBody = document.getElementById("table-body");
        const row = document.createElement("tr");
        const wordCell = document.createElement("td");
        const replacementCell = document.createElement("td");
        wordCell.textContent = word.original;
        replacementCell.textContent = word.replacement;
        row.appendChild(wordCell);
        row.appendChild(replacementCell);
        tableBody.appendChild(row);

        // const listItem = document.createElement("li");
        // listItem.textContent = `${word.original} -> ${word.replacement}`;
        // replacedWordsList.appendChild(listItem);
      });
    } else {
      // replacedWordsList.textContent = "No words replaced.";
    }
  });
});

function addWord() {
  const wordInput = document.getElementById("word-input").value;
  const replacementInput = document.getElementById("replacement-input").value;
  if (wordInput && replacementInput) {
    const tableBody = document.getElementById("table-body");
    const row = document.createElement("tr");
    const wordCell = document.createElement("td");
    const replacementCell = document.createElement("td");
    wordCell.textContent = wordInput;
    replacementCell.textContent = replacementInput;
    row.appendChild(wordCell);
    row.appendChild(replacementCell);
    tableBody.appendChild(row);
    closeDialog();
  }
}

function openDialog() {
  document.getElementById("input-dialog").style.display = "flex";
}

function closeDialog() {
  document.getElementById("input-dialog").style.display = "none";
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
    document.body.style.fontFamily = "'Montserrat', sans-serif";
  } else if (language === "ar") {
    loadLanguage(ar);
    document.body.setAttribute("dir", "rtl");
    document.body.style.fontFamily = "'Beiruti', sans-serif";
  }
}

function loadLanguage(lang) {
  document.getElementById("header-text").textContent = lang.pluginName;
  document.getElementById("replaced-words-title").textContent =
    lang.replacedWords;
  document.getElementById("word-header").textContent = lang.word;
  document.getElementById("replacement-header").textContent = lang.replacement;
}

document.getElementById("edit-button").addEventListener("click", openDialog);

document
  .getElementById("form-close-button")
  .addEventListener("click", closeDialog);

document
  .getElementById("form-submit-button")
  .addEventListener("click", addWord);

document
  .getElementById("language-select")
  .addEventListener("click", changeLanguage);
