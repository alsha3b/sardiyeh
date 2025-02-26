// File responsible for the extension popup

  document.addEventListener("DOMContentLoaded", function () {
    initLanguage();
    populateReplacedWords();
    initForm();
    initAddButton(); // Initialize the add-button functionality
    initToggle();
  });

  function initToggle() {
    const toggle = document.getElementById("toggleSwitch");

    chrome.storage.sync.get(["ext_on"], function (data) {
      toggle.checked = data.ext_on !== false; // Default to true if not set
    });

    toggle.addEventListener("change", function () {
      const isChecked = this.checked;

      if (!isChecked) {
        // Show the custom alert if toggling off
        showAlert(false, () => {
          // Callback function to execute if user clicks "refresh" (reload and revert)
          chrome.storage.sync.set({ ext_on: isChecked }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
              if (tabs[0] && tabs[0].id) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id, allFrames: true },
                    files: ["revert.js"],
                  });
                chrome.tabs.reload(tabs[0].id);
              }
            });
          });
        }, () => {
          // Callback function to execute if user clicks "Cancel" (revert the toggle)
          toggle.checked = true; //Revert the toggle switch
          chrome.storage.sync.set({ ext_on: true }, () => {
            chrome.runtime.sendMessage({ action: 'updateToggle', isChecked: true });
          });
        });

      } else {

        showAlert(true, () => {
          // Callback function to execute if user clicks "refresh" (reload and replace)
          chrome.storage.sync.set({ ext_on: isChecked }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
              if (tabs[0] && tabs[0].id) {
                chrome.scripting.executeScript({
                  target: { tabId: tabs[0].id, allFrames: true },
                  files: ["content.js"],
                });
                chrome.tabs.reload(tabs[0].id);
              }
            });
          });
        }, () => {
          // Callback function to execute if user clicks "Cancel" (revert the toggle)
          toggle.checked = false; //Revert the toggle switch
          chrome.storage.sync.set({ ext_on: false }, () => {
            chrome.runtime.sendMessage({ action: 'updateToggle', isChecked: false });
          });
        });
      }
    });
  }

  function showAlert(isTurningOn, onOk, onCancel) {
    // Create the alert overlay elements
    const alertOverlay = document.createElement('div');
    alertOverlay.id = 'customAlertOverlay';
  
    const alertBox = document.createElement('div');
    alertBox.id = 'customAlertBox';
  
    const alertTitle = document.createElement('h1');
    alertTitle.textContent = isTurningOn ? "Turning on ..." : "Turning off...";
  
    const alertMessage = document.createElement('p');
    alertMessage.textContent = "In order to see your changes, the page will need to be reloaded.";
  
    // Create the button container
    const alertButtons = document.createElement('div');
    alertButtons.classList.add('alert-buttons');
  
    const okButton = document.createElement('button');
    okButton.textContent = "Refresh";
    okButton.classList.add('refresh-button');
    okButton.addEventListener('click', () => {
      alertOverlay.remove();
      onOk(); // Callback for refresh button
      window.location.reload();
    });
  
    const cancelButton = document.createElement('button');
    cancelButton.textContent = "Cancel";
    cancelButton.classList.add('cancel-button');
    cancelButton.addEventListener('click', () => {
      alertOverlay.remove();
      alertBox.remove();  
      onCancel(); // Callback for Cancel button
    });
  
    // Assemble the alert box
    alertBox.appendChild(alertTitle);
    alertBox.appendChild(alertMessage);
  
    alertButtons.appendChild(okButton);
    alertButtons.appendChild(cancelButton);
  
    alertBox.appendChild(alertButtons);
  
    // Add the alert to the overlay and then to the document
    alertOverlay.appendChild(alertBox);
    document.body.appendChild(alertOverlay);
  }

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
      if (wordValue === replacementValue || wordValue.toLowerCase() === replacementValue.toLowerCase()) {
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
      updateLanguage(selectedLanguage);
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
            word.word
          )}`;
          wordLink.target = "_blank"; // Open link in new tab
          wordLink.textContent = word.word;
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

  function addWordToTable(word, replacement) {
      const tableBody = document.getElementById("table-body");
      const row = document.createElement("tr");

      const wordCell = document.createElement("td");
      const wordLink = document.createElement("a");
      wordLink.href = `https://www.palestineremembered.com/Search.html#gsc.tab=0&gsc.sort=&gsc.q=${encodeURIComponent(
          word
      )}`;
      wordLink.target = "_blank"; // Open link in new tab
      wordLink.textContent = word;
      wordLink.style.color = "#97700B";
      wordLink.style.textDecoration = "none";
      wordCell.appendChild(wordLink);

      const replacementCell = document.createElement("td");
      const replacementLink = document.createElement("a");
      replacementLink.href = `https://www.palestineremembered.com/Search.html#gsc.tab=0&gsc.sort=&gsc.q=${encodeURIComponent(
          replacement
      )}`;
      replacementLink.target = "_blank";
      replacementLink.textContent = replacement;
      replacementLink.style.color = "#000000";
      replacementLink.style.textDecoration = "none";
      replacementCell.appendChild(replacementLink);

      row.appendChild(wordCell);
      row.appendChild(replacementCell);
      tableBody.appendChild(row);
  }

  async function getReplacedWordsFromStorage() {
      return new Promise((resolve) => {
          chrome.storage.local.get(["replacedWords"], (data) => {
              resolve(data.replacedWords || []);
          });
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

  const sheetUrl =
    "https://script.google.com/macros/s/AKfycbwqV-kCvRonl9MXdSOP7l7LsMh4ZA-Ro0eLsDvrruF228OI4UT1-AW5JFuijnNqsg5V/exec";

  async function postSuggestion(params) {
    const url =
      "https://z4kly0zbd9.execute-api.us-east-1.amazonaws.com/prod/suggestion";

    try {
      const response = await fetch(url, {
        method: "POST", // HTTP method
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();

      console.log("Success:", data);
      return data;
    } catch (error) {
      console.error("Error:", error);
    }
    
  }

  async function submitForm() {
    const wordInput = document.getElementById("word-input").value;
    const replacementInput = document.getElementById("replacement-input").value;
    const errorMessage = document.getElementById("error-message");

    if (!wordInput || !replacementInput) {
      errorMessage.textContent = getLocalizedString("errorEmptyFields");
      return;
    }

    errorMessage.textContent = "";


    try {
      const response = await fetch(sheetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          word: wordInput,
          replacement: replacementInput,
        }),
      });

      if (response.ok) {
          await closeDialog();
        addWord(wordInput, replacementInput);
      } else {
        errorMessage.textContent = getLocalizedString("errorSubmissionFailed");
      }
    } catch (error) {
      console.error("Error:", error);
      errorMessage.textContent = getLocalizedString("errorSubmissionFailed");
    }
  }


  function changeLanguage() {
    const languageSelect = document.getElementById("language-select");
    const selectedLanguage = languageSelect.value;

    updateLanguage(selectedLanguage);

    // Save the selected language
    chrome.storage.sync.set({ selectedLanguage: selectedLanguage });
  }

  function updateLanguage(language) {
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

    // Update titles and headers
    document.getElementById("replaced-words-title").textContent = lang.replacedWords;
    document.getElementById("word-header").textContent = lang.word;
    document.getElementById("replacement-header").textContent = lang.replacement;

    // Update buttons
    document.getElementById("dialog-submit").textContent = lang.submitButton;
    document.getElementById("dialog-close").textContent = lang.cancelButton;

    // Update form labels
    document.getElementById("word-label").textContent = lang.wordLabel;
    document.getElementById("replacement-label").textContent = lang.replacementLabel;

    // Update error messages
    document.getElementById("error-message").textContent = lang.errorSubmissionFailed;


    // Update input placeholders
    document.getElementById("word-input").placeholder = lang.wordInput;
    document.getElementById("replacement-input").placeholder = lang.replacementInput;

  }

  function getLocalizedString(key) {
    const language = document.getElementById("language-select").value;
    const lang = language === "en" ? en : ar;
    return lang[key];
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
  //  document.getElementById("error-message").textContent = ""; // Clear error message
  } 

