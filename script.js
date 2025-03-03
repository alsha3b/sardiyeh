// script.js

// toggle switch to (de)activate extension
const toggleSwitch = document.getElementById("toggleSwitch");
const logo = document.getElementById("logo");

// getting the saved state of the toggle
chrome.storage.sync.get(["ext_on"], async function (items) {
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError);
    return;
  }

  toggleSwitch.checked = items.ext_on != false;

  // Initial UI setup based on stored state
  toggleContent(toggleSwitch.checked);
});

const toggleContent = (isChecked) => {
  const pluginWindow = document.getElementById("plugin-window");
  const content = document.getElementById("content");
  const welcome = document.getElementById("welcome");
  const footer = document.getElementById("footer");
  const inputDialog = document.getElementById("input-dialog");

  if (isChecked) {
    pluginWindow.style.backgroundColor = "#fafafa";
    content.style.display = "block";
    welcome.style.display = "none";
    footer.style.color = "#000000";
    inputDialog.style.display = "none";
  } else {
    pluginWindow.style.backgroundColor = "#004D23";
    content.style.display = "none";
    welcome.style.display = "flex";
    footer.style.color = "#ffffff";
    inputDialog.style.display = "none";
  }
};

// listening to changes to the toggle switch
toggleSwitch.addEventListener("change", async () => {
  const isChecked = toggleSwitch.checked;
  chrome.storage.sync.set({
    ext_on: isChecked,
    function() {},
  });
});

// get the current active tab to run script on it
async function getCurrentTab() {
  let queryOptions = { active: true, currentWindow: true };
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  try {
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
  } catch (error) {
    console.error(error);
  }
}

// runs the content.js or revert.js file on the current tab
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

// Load translations
let en, ar;

// Function to load JSON files
async function loadJSON(filePath) {
  const response = await fetch(filePath);
  if (!response.ok) {
    throw new Error("Failed to load ${filePath}: ${response.statusText}");
  }
  return await response.json();
}

async function loadTranslations() {
  try {
    en = await loadJSON("../translations/en.json");
    ar = await loadJSON("../translations/ar.json");
    // Initialize with the default language (English)
    setLanguage("en");
  } catch (error) {
    console.error("Error loading translations:", error);
  }
}

// Function to switch between English and Arabic
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

// Initialize with the default language (English)
loadTranslations();
