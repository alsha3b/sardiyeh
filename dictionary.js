async function fetchDictionary() {
  try {
    response = await fetch(
      "https://api.jsonbin.io/v3/b/6688160eacd3cb34a861bf3a"
    );
    data = await response.json();
    chrome.storage.local.set({ dictionary: data["record"] });
  } catch (error) {
    console.error("Error fetching dictionary:", error);
  }
}
