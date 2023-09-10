const toggleSwitch = document.getElementById("toggleSwitch");

toggleSwitch.addEventListener("change", async () => {
  // Toggle the switch state
  if (toggleSwitch.checked) {
    // Handle the switch being turned on
    console.log("Switch is ON");

    var tab = await getCurrentTab();
    await getDomElements(tab);
    // walker();
    // replaceText();
    // crawlInChrome();
    // replaceText();
  } else {
    // Handle the switch being turned off
    console.log("Switch is OFF");
  }
});

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

