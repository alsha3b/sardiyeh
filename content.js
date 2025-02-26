(() => {
  let shouldChangeText = true;
  const replacedWords = [];
  const replacedSet = new Set();

  // takes in the array of obj and returns it as a dict.
  const parseTranslationData = (data) => {
    const res = {};

    for (let item of data) {
      res[item.translation] = item.value;
    }
    return res;
  };

  const fetchDictionary = async () => {
    const url =
      "https://z4kly0zbd9.execute-api.us-east-1.amazonaws.com/test/translation";

    try {
      const response = await fetch(url);

      const res = await response.json();

      const data = res.data;

      if (!data) {
        shouldChangeText = false;
        return;
      }
      const dictionary = parseTranslationData(data);
console.log(dictionary);      if (chrome.runtime?.id) {
        await chrome.storage.sync.set({ dictionary: dictionary }, () => {});
        await chrome.storage.local.set({ dictionary: dictionary });
      }
      saveDictionaryToLocalStorage(dictionary);
      return dictionary;
    } catch (error) {
      console.error("Error fetching dictionary:", error);
    }
  };

  // Function to save dictionary to local storage
  const saveDictionaryToLocalStorage = (dictionary) => {
    const timestamp = new Date();
    localStorage.setItem("dictionary", JSON.stringify(dictionary));
    localStorage.setItem("dictionaryTimestamp", timestamp.toISOString());
  };

  // Function to check if a week has passed since the last update
  const isWeekPassed = (timestamp) => {
    const now = new Date();
    const weekInMilliseconds = 7 * 24 * 60 * 60 * 1000;
    let x = 0;
    if (now - timestamp > weekInMilliseconds) {
      return true;
    } else {
      return false;
    }
  };

  // Function to get dictionary from local storage
  const getDictionaryFromLocalStorage = () => {
    const dictionary = localStorage.getItem("dictionary");
    const timestamp = localStorage.getItem("dictionaryTimestamp");
    if (dictionary && timestamp) {
      return {
        data: JSON.parse(dictionary),
        timestamp: new Date(timestamp),
      };
    }
    return null;
  };

  // Main function to get dictionary
  const getDictionary = async () => {
    let dictionaryData = getDictionaryFromLocalStorage();
    console.log(dictionaryData);
    if (dictionaryData && !isWeekPassed(dictionaryData.timestamp)) {
      return dictionaryData.data;
    }
    const newDictionary = await fetchDictionary();
    if (newDictionary) {
      saveDictionaryToLocalStorage(newDictionary);
    }
    return newDictionary;
  };

  // replacing images function
  const replaceImages = () => {
    // Locate the container of the flag by its class or other attributes
    const flagContainer = document.querySelector("div.MRI68d");
    if (!flagContainer) return;

    const flagImage = flagContainer.querySelector("img");
    if (!flagImage) return;

    const newImageUrl =
      chrome.runtime.getURL("images/Palestine_Flag.png") + `?t=${Date.now()}`;
    flagImage.src = newImageUrl;

    flagImage.alt = "Replaced Flag";
  };

  const escapeRegExp = (str) => {
    // Commonly used snippet to escape special regex chars
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  class BloomFilter {
    constructor(size, numHashFunctions) {
      if (size <= 0 || numHashFunctions <= 0) {
        throw new Error(
          "Size and number of hash functions must be positive integers."
        );
      }
      this.size = size;
      this.numHashFunctions = numHashFunctions;
      this.bitArray = new Array(size).fill(false);
    }
    //dwdwe

    // Improved hash function with better distribution
    hash(value, i) {
      const hash1 = this.simpleHash(value, i);
      const hash2 = this.simpleHash(value.split("").reverse().join(""), i + 1);
      return (hash1 + i * hash2) % this.size;
    }

    // Simple hash function for demonstration
    simpleHash(value, salt) {
      let hash = 0;
      for (let char of value) {
        hash = (hash * salt + char.charCodeAt(0)) % this.size;
      }
      return hash;
    }

    // Add an item to the Bloom filter
    add(value) {
      for (let i = 0; i < this.numHashFunctions; i++) {
        const index = this.hash(value, i);
        this.bitArray[index] = true;
      }
    }

    // Check if an item might be in the Bloom filter
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

  const replaceWordsInDOM = (dictionary) => {
    if (!dictionary || Object.keys(dictionary).length === 0) return;

    // Build a single RegExp from all keys in the dictionary
    //   - Escapes special characters so they won't break the RegExp.
    //   - Joins them in a capturing group, e.g. "\b(word1|word2|...)\b"
    const pattern =
      "\\b(" + Object.keys(dictionary).map(escapeRegExp).join("|") + ")\\b";
    const regex = new RegExp(pattern, "gi");

    const bloom= new BloomFilter(1440,1)      // Adjust size and number of hash functions
    Object.keys(dictionary || {}).forEach((word) => bloom.add(word));


    replaceTextNodes(document.body, dictionary, regex, bloom);
    chrome.storage.local.set({
      replacedWords,
      replacedSet,
    });
  };

  const shouldSkipNode = (node) => {
    // Only element nodes can be input/textarea/contenteditable
    if (node.nodeType === Node.ELEMENT_NODE) {
      // 1) Matches any literal input or textarea elements
      // 2) Checks isContentEditable (true if this or an ancestor has contenteditable attribute)
      // 3) Matches role="textbox" (used by some WYSIWYG editors, messaging apps, etc.)
      if (
        node.matches("input, textarea, [role='textbox']") ||
        node.isContentEditable
      ) {
        return true;
      }
    }
    return false;
  };

  const replaceTextNodes = (node, dictionary, regex, bloom) => {
    if (shouldSkipNode(node)) {
      return;
    }
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.matches("input, textarea")
    ) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const words = node.textContent.split(regex);
      const updatedNodes = words.map((word) => {
        const key = word.toLowerCase();

        if (!bloom.contains(key) && dictionary[key]) {
          const replacement = dictionary[key];
          if (!replacedSet.has(word)) {
            replacedSet.add(word);
            replacedWords.push({ word, replacement });
          }

          const span = document.createElement("span");
          span.textContent = replacement;
          span.style.textDecoration = "underline";
          span.style.textDecorationColor = "green";
          span.style.textDecorationThickness = "3px";

          return span;
        }

        return document.createTextNode(word);
      });

      const parent = node.parentNode;
      if (parent) {
        updatedNodes.forEach((n) => parent.insertBefore(n, node));
        parent.removeChild(node);
      }

      // node.textContent = node.textContent.replace(regex, (matchedWord) => {
      //   const lower = matchedWord.toLowerCase();

      //   if (!dictionary[lower]) return matchedWord;

      //   if (!replacedSet.has(lower)) {
      //     replacedWords.push({
      //       original: matchedWord,
      //       replacement: dictionary[lower],
      //     });
      //   }
      //   replacedSet.add(lower);
      //   // createTooltip(node, matchedWord)

      //   return dictionary[lower];
      // });
    } else {
      node.childNodes.forEach((child) => {
        replaceTextNodes(child, dictionary, regex, bloom);
      });
    }
  };

  const replaceTextAndImages = (dictData) => {
    replaceWordsInDOM(dictData);
    replaceImages();
  };

  chrome.storage.sync.get(["ext_on"], async function (items) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }
    const dictData = await getDictionary();

    if (!items.ext_on) return;

    if (!shouldChangeText) return;

    if (replacedWords.length > 0 && chrome.runtime?.id) {
      chrome.storage.local.set({
        replacedWords: replacedWords,
        replacedSet: replacedSet,
      });
    }

    // Fixed MutationObserver implementation
    let timeout;
    let lastRun = performance.now();

    const observer = new MutationObserver((mutations) => {
      const shouldUpdate = mutations.some((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          return Array.from(mutation.addedNodes).some((node) => {
            const insideInputLike =
              node.closest?.("input, textarea, [role='textbox']") ||
              node.isContentEditable ||
              node.parentNode?.isContentEditable;
            return !insideInputLike;
          });
        }
        return false;
      });

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
      replaceTextAndImages(dictData); // Initial run to match original behavior
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

    window.addEventListener("pagehide", stopObserving); // Cleanup on page unload
  });
})();
