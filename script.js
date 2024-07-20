const toggleSwitch = document.getElementById("toggleSwitch");

chrome.storage.sync.get(["ext_on"], async function (items) {
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError);
    return;
  }

  toggleSwitch.checked = items.ext_on != false;

  var tab = await getCurrentTab();
  await getDomElements(tab, toggleSwitch.checked);
});

toggleSwitch.addEventListener("change", async () => {
  const isChecked = toggleSwitch.checked;
  var tab = await getCurrentTab();
  await getDomElements(tab, isChecked);

  chrome.storage.sync.set({
    ext_on: isChecked,
    function() {},
  });
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
