// this is a background service that runs
// it listens to "new information" such as loading new content on page
// and runs the script


// Listen for tab updates
chrome.tabs.onUpdated.addListener(tabListener);

// listener
function tabListener(tabId, changeInfo, tab) {
    // Check if the tab has completed loading
    if (changeInfo.status === 'complete') {  
        // update the tab   
        update(tabId,tab);
    }
};

async function update(tabId, tab){
    try {
        await chrome.scripting.executeScript({
          target: {
            tabId: tabId,
          },
          files: ["content.js"],
        });

        // remove and add again
        chrome.tabs.onUpdated.removeListener(tabListener)
        chrome.tabs.onUpdated.addListener(tabListener);
      } catch (error) {
        console.log(error);
      }
    console.log('New content loaded in tab:', tab.url);
}