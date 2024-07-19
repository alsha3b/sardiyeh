async function fetchDictionary() {
  try {
    response = await fetch(
      "https://api.jsonbin.io/v3/b/6688160eacd3cb34a861bf3a"
    );
    data = await response.json();

    // Save it using the Chrome extension storage API.
    chrome.storage.sync.set({ dictionary: data["record"] }, function () {
      console.log("Settings saved");
    });

    // chrome.storage.local.set({ dictionary: data["record"] });
  } catch (error) {
    console.error("Error fetching dictionary:", error);
  }
}
