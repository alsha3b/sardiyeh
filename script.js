const toggleSwitch = document.getElementById("toggleSwitch");

var ext_on = true;

chrome.storage.sync.get(["ext_on"], function (items) {
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError);
    return;
  }

  ext_on = items.ext_on;

  // Check if 'ext_on' is false
  if (items.ext_on === false) {
    console.log("Extension is turned off. Reverting back.");
    // Code to revert back or stop execution
    toggleSwitch.checked = false;
  } else {
    toggleSwitch.checked = true;
  }
});

toggleSwitch.addEventListener("change", async () => {
  const isChecked = toggleSwitch.checked;

  ext_on = isChecked;

  // Retrieve the saved toggle switch value on page load
  chrome.storage.sync.set({
    ext_on: isChecked,
    async function() {
      console.log("Settings saved");
      if (isChecked) {
        // Handle the switch being turned on
        console.log("Switch is ON");

        var tab = await getCurrentTab();
        await getDomElements(tab);
      } else {
        // Handle the switch being turned off
        console.log("Switch is OFF");
        //TODO: undo changes
      }
    },
  });
});

// let checkInterval = setInterval(checkTabStatus, 500);

// Check if the current tab is fully loaded.
// If it it is, we display the toggle button.
// This way all the data that is loaded via js, will be fully loaded
// and we would be able to manipulate the page data.
// function checkTabStatus() {
// var savedToggleValue = localStorage.getItem("toggleSwitchValue");
// if (savedToggleValue != true || savedToggleValue != "true") {
//   return;
// }
// if(ext_on === false){
//   return;
// }
// chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
//   const currentTab = tabs[0];
//   if (currentTab.status === "loading") {
//     document.getElementById("loadingBar").style.display = "block";
// document.querySelector(".container").style.display = "none";
//   } else {
//     document.getElementById("loadingBar").style.display = "none";
// document.querySelector(".container").style.display = "block";
//     clearInterval(checkInterval);
//   }
// });
// }

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

const getDomElements = async (tab) => {
  // if (ext_on === false) {
  //   return;
  // }

  if (!tab && !tab.id) {
    return;
  }

  // var savedToggleValue = localStorage.getItem("toggleSwitchValue");

  // console.log("**** cache value FROM DOM ELEMENTS ****");
  // console.log(savedToggleValue);

  try {
    await chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
      },
      files: ["dictionary.js"],
    });

    // const textToChange = chrome.storage.local.get(["dictionary"]);

    // console.log("text to change is ", textToChange);

    await chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
      },
      files: ["content.js"],
      // args: [{}],
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
