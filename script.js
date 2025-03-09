// script.js (after edit)

// Utility function to get the current active tab
async function getCurrentTab() {
  let queryOptions = { active: true, currentWindow: true };
  try {
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
  } catch (error) {
    console.error("Error getting current tab:", error);
    return null;
  }
}


// Utility function to run content.js or revert.js on the current tab
const getDomElements = async (tab, shouldReplace) => {
  if (!tab && !tab.id) {
    return;
  }
  try {
    let fileName = shouldReplace === true ? "content.js" : "revert.js";

    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: [fileName],
    });
  } catch (error) {
    console.log(error);
  }
};

// Attach the function to the global object (window in a browser, global in Node.js)
if (typeof window !== "undefined") {
  window.getCurrentTab = getCurrentTab;
} else if (typeof global !== "undefined") {
  global.getDomElements = getDomElements;
}

document.getElementById("dialog-submit").addEventListener("click", function () {
  const wordToReplace = document.getElementById("word-input").value.trim();
  const replacementWord = document
    .getElementById("replacement-input")
    .value.trim();
  const errorMessage = document.getElementById("error-text");

  if (wordToReplace === replacementWord && wordToReplace !== "") {
    if (errorMessage) {
      errorMessage.style.display = "block"; // Show the error message
    }
  } else {
    if (errorMessage) {
      errorMessage.style.display = "none"; // Hide the error message
    }
  }
});

// Load translations (if still needed here, though likely moved to popup.js)
let en, ar;

async function loadJSON(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to load ${filePath}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error loading JSON:", error);
    return null;
  }
}

async function loadTranslations() {
  try {
    en = await loadJSON("../translations/en.json");
    ar = await loadJSON("../translations/ar.json");
    // Note: setLanguage likely moved to popup.js; this is just loading data
  } catch (error) {
    console.error("Error loading translations:", error);
  }
}

function setLanguage(language) {
  const translation = language === "ar" ? ar : en;

  if (!translation) {
    return;
  }

  // Update text content for various elements
  document.getElementById("header-text").textContent = translation.pluginName; // review with basel why this exist (it hide the logo)
  document.getElementById("replaced-words-title").textContent =
    translation.replacedWords;
  document.getElementById("word-header").textContent = translation.word;
  document.getElementById("replacement-header").textContent =
    translation.replacement;
  document.getElementById("word-label").textContent = translation.wordLabel;
  document.getElementById("replacement-label").textContent =
    translation.replacementLabel;
  document.getElementById("dialog-submit").textContent =
    translation.submitButton;
  document.getElementById("dialog-close").textContent =
    translation.cancelButton;
  const errorElement = document.getElementById("error-text");

  if (errorElement) {
    errorElement.textContent = translation.errorEmptyFields;
  }
}

// Event listener for language selection
document
  .getElementById("language-select")
  .addEventListener("change", function (event) {
    setLanguage(event.target.value);
  });

// Minimal DOMContentLoaded to keep script functional if still included
document.addEventListener("DOMContentLoaded", () => {
  // Only load translations if this script is still responsible for it
  loadTranslations();
});
