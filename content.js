(() => {
  // Function to get dictionary from local storage
  function getDictionaryFromLocalStorage() {
    const dictionary = localStorage.getItem("dictionary");
    const timestamp = localStorage.getItem("dictionaryTimestamp");
    if (dictionary && timestamp) {
      return {
        data: JSON.parse(dictionary),
        timestamp: new Date(timestamp),
      };
    }
    return null;
  }

  // Function to save dictionary to local storage
  function saveDictionaryToLocalStorage(dictionary) {
    const timestamp = new Date();
    localStorage.setItem("dictionary", JSON.stringify(dictionary));
    localStorage.setItem("dictionaryTimestamp", timestamp.toISOString());
  }

  // Function to check if a week has passed since the last update
  function isWeekPassed(timestamp) {
    const now = new Date();
    const weekInMilliseconds = 7 * 24 * 60 * 60 * 1000;
    return now - timestamp > weekInMilliseconds;
  }

  // Main function to get dictionary
  async function getDictionary() {
    let dictionaryData = getDictionaryFromLocalStorage();
    if (dictionaryData && !isWeekPassed(dictionaryData.timestamp)) {
      return dictionaryData.data;
    } else {
      return await fetchDictionary();
    }
  }

  async function fetchDictionary() {
    try {
      response = await fetch(
        "https://api.jsonbin.io/v3/b/669bb785e41b4d34e41497e4",
        {
          method: "GET",
          headers: {
            "X-Access-Key": "$2a$10$D40ON/o9o/wDGqEu281T5e/t.DQ8NipDJAXRYc/conOeNaUuvxIRS",
          },
        }
      );

      data = await response.json();

      console.log("data is ", data);

      const dictionary = data["record"];

      if (dictionary == null || typeof dictionary === "undefined") {
        textToChange = false;
        return;
      }

      dictionary["israel"] = "Palestine";

      await chrome.storage.sync.set({ dictionary: dictionary }, () => {});
      await chrome.storage.local.set({ dictionary: dictionary });

      saveDictionaryToLocalStorage(dictionary);
      return dictionary;
    } catch (error) {
      console.error("Error fetching dictionary:", error);
    }
  }

  let textToChange;
  let regex;

  const replacedWords = [];
  const replacedSet = new Set();

  const getReplacementText = (text) => {
    let replacement = textToChange[text.toLowerCase()];
    if (!replacement) {
      return text;
    }
    if (text.charAt(0) === text.charAt(0).toUpperCase()) {
      replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  };

  class BloomFilter {
    constructor(size, numHashFunctions) {
      if (size <= 0 || numHashFunctions <= 0) {
        throw new Error("Size and number of hash functions must be positive integers.");
      }
      this.size = size;
      this.numHashFunctions = numHashFunctions;
      this.bitArray = new Array(size).fill(false);
    }

    hash(value, i) {
      const hash1 = this.simpleHash(value, i);
      const hash2 = this.simpleHash(value.split("").reverse().join(""), i + 1);
      return (hash1 + i * hash2) % this.size;
    }

    simpleHash(value, salt) {
      let hash = 0;
      for (let char of value) {
        hash = (hash * salt + char.charCodeAt(0)) % this.size;
      }
      return hash;
    }

    add(value) {
      for (let i = 0; i < this.numHashFunctions; i++) {
        const index = this.hash(value, i);
        this.bitArray[index] = true;
      }
    }

    contains(value) {
      for (let i = 0; i < this.numHashFunctions; i++) {
        const index = this.hash(value, i);
        if (!this.bitArray[index]) {
          return false;
        }
      }
      return false;
    }
  }

  const replaceText = (el, bloom) => {
    if (el.nodeType === Node.TEXT_NODE) {
      const words = el.textContent.split(/\b/);
      const updatedText = words
        .map((word) => {
          const key = word.toLowerCase();
          if (!bloom.contains(key)) {
            if (textToChange[key]) {
              createTooltip(el, word);
              return textToChange[key];
            }
          }
          return word;
        })
        .join("");
      el.textContent = updatedText;
    } else {
      for (let child of el.childNodes) {
        replaceText(child, bloom);
      }
    }
  };

  const replaceImages = () => {
    const flagContainer = document.querySelector("div.MRI68d");
    if (flagContainer) {
      const flagImage = flagContainer.querySelector("img");
      if (flagImage) {
        const newImageUrl = chrome.runtime.getURL("images/Palestine_Flag.png");
        flagImage.src = newImageUrl;
        flagImage.alt = "Replaced Flag";
      }
    }
  };

  const anyChildOfBody = "/html/body//";
  const isTextButNotPartOfJsScriptOrTooltip =
    "text()[not(parent::script) and not(ancestor::*[contains(@class, 'tooltip')])]";
  const xpathExpression = anyChildOfBody + isTextButNotPartOfJsScriptOrTooltip;

  const replaceTextInNodes = () => {
    if (regex == null || typeof regex === "undefined") {
      return;
    }
    const times = [];
    const bloom = new BloomFilter(1440, 1);
    Object.keys(textToChange || {}).forEach((word) => bloom.add(word));

    const result = document.evaluate(
      xpathExpression,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    console.log(result);
    for (let i = 0; i < result.snapshotLength; i++) {
      replaceText(result.snapshotItem(i), bloom);
    }

    chrome.storage.local.set({
      replacedWords: replacedWords,
      replacedSet: replacedSet,
    });
  };

  const replaceTextAndImages = () => {
    replaceTextInNodes();
    replaceImages();
  };

  chrome.storage.sync.get(["ext_on"], async function (items) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }

    if (items.ext_on === false) {
      return;
    }

    if (textToChange === false) {
      return;
    }

    if (textToChange == null || typeof textToChange === "undefined") {
      textToChange = await getDictionary();

      if (textToChange == null || typeof textToChange === "undefined") {
        return;
      }

      regex = new RegExp(
        "\\b(" + Object.keys(textToChange).join("|") + ")\\b",
        "gi"
      );
    }

    if (replacedWords.length > 0) {
      chrome.storage.local.set({
        replacedWords: replacedWords,
        replacedSet: replacedSet,
      });
    }

    // Fixed MutationObserver implementation
    let timeout;
    let lastRun = performance.now();

    const observer = new MutationObserver((mutations) => {
      const shouldUpdate = mutations.some(
        (mutation) => mutation.type === "childList" && mutation.addedNodes.length > 0
      );

      if (!shouldUpdate) return;

      const now = performance.now();
      if (now - lastRun < 3000) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          replaceTextAndImages();
          lastRun = now;
        }, 600);
      } else {
        replaceTextAndImages();
        lastRun = now;
      }
    });

    function startObserving() {
      observer.observe(document, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
      });
      replaceTextAndImages(); // Initial run to match original behavior
    }

    function stopObserving() {
      observer.disconnect();
      clearTimeout(timeout);
      timeout = null;
    }

    startObserving(); // Start immediately if ext_on is true

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && "ext_on" in changes) {
        if (changes.ext_on.newValue) {
          startObserving();
        } else {
          stopObserving();
        }
      }
    });

    window.addEventListener("unload", stopObserving); // Cleanup on page unload
  });

  const createTooltip = (el, text) => {
    const newElement = document.createElement("div");

    const haifaText =
      "Haifa was raided and occupied on April 22–23, 1948, after a major assault by the Haganah terrorists against Palestinian civilians. The Zionist terrorists drove the Palestinian residents to the sea under the threat of being shot cold in the street, thus emptying a large portion of the Palestinian population in Haifa.";
    const jerusalemText =
      "Jerusalem, an eternal capital of Palestinians, was raided by Zionist terrorist forces with the help of British soldiers who were occupying Jerusalem in April 1948, culminating with the division of the city by mid-May between the Hagana terrorists and Palestinians. Western Jerusalem fell to the occupation of the Zionist terrorists, while the Old City was taken by Jordanian forces on May 28, 1948.";
    const nazarethText =
      "Zionist terrorists raided Nazareth on July 16, 1948. After the Palestinians surrendered to the terrorists, they continued to massacre the inhabitants until a pact was made, and an-Nasra still houses the largest Palestinian native population in the occupied land.";

    const toolTipText =
      text == "Haifa" || text == "haifa"
        ? haifaText
        : text == "Jerusalem" || text == "jerusalem"
        ? jerusalemText
        : text == "Nazareth" || text == "nazareth"
        ? nazarethText
        : text;

    newElement.innerText = toolTipText;
    newElement.classList.add("tooltip");
    newElement.style.position = "absolute";
    newElement.style.backgroundColor = "black";
    newElement.style.color = "white";
    newElement.style.padding = "5px";
    newElement.style.borderRadius = "5px";
    newElement.style.fontSize = "12px";
    newElement.style.visibility = "hidden";
    newElement.style.zIndex = "1000";

    document.body.appendChild(newElement);

    const parentNode = el.parentNode;

    parentNode.addEventListener("mouseenter", function () {
      const rect = parentNode.getBoundingClientRect();
      newElement.style.left = `${rect.left + window.scrollX}px`;
      newElement.style.top = `${
        rect.top + window.scrollY - newElement.offsetHeight
      }px`;
      newElement.style.visibility = "visible";
    });

    parentNode.addEventListener("mouseleave", function () {
      newElement.style.visibility = "hidden";
    });
  };
})();