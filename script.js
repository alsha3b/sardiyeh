
const toggleSwitch = document.getElementById("toggleSwitch");

let checkInterval;

toggleSwitch.addEventListener("change", async () => {
  // Toggle the switch state
  if (toggleSwitch.checked) {
    // Handle the switch being turned on
    console.log("Switch is ON");

    var tab = await getCurrentTab();
    await getDomElements(tab);
  } else {
    // Handle the switch being turned off
    console.log("Switch is OFF");
    var tab = await getCurrentTab();

    await getDomElements(tab);
  }
});

// Check if the current tab is fully loaded.
// If it it is, we display the toggle button.
// This way all the data that is loaded via js, will be fully loaded
// and we would be able to manipulate the page data.
function checkTabStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const currentTab = tabs[0];
    if (currentTab.status === "loading") {
      document.getElementById("loadingBar").style.display = "block";
      document.querySelector(".container").style.display = "none";
    } else {
      document.getElementById("loadingBar").style.display = "none";
      document.querySelector(".container").style.display = "block";
      clearInterval(checkInterval);
    }
  });
}

checkInterval = setInterval(checkTabStatus, 500);

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
  if (!tab && !tab.id) {
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: {
        tabId: tab.id,
      },
      files: ["content.js"],
    });
  } catch (error) {
    console.log(error);
  }
};

// Attach the function to the global object (window in a browser, global in Node.js)
if (typeof window !== 'undefined') {
  window.getCurrentTab = getCurrentTab;
} else if (typeof global !== 'undefined') {
  global.getDomElements = getDomElements;
}