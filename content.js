// Main script that works on chrome pages

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
      console.log(dictionary);
      await chrome.storage.sync.set({ dictionary: dictionary }, () => {});
      await chrome.storage.local.set({ dictionary: dictionary });

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

  const replaceWordsInDOM = (dictionary) => {
    if (!dictionary || Object.keys(dictionary).length === 0) return;

    // Build a single RegExp from all keys in the dictionary
    //   - Escapes special characters so they won't break the RegExp.
    //   - Joins them in a capturing group, e.g. "\b(word1|word2|...)\b"
    const pattern =
      "\\b(" + Object.keys(dictionary).map(escapeRegExp).join("|") + ")\\b";
    const regex = new RegExp(pattern, "gi");

    replaceTextNodes(document.body, dictionary, regex);
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

  const replaceTextNodes = (node, dictionary, regex) => {
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
      node.textContent = node.textContent.replace(regex, (matchedWord) => {
        const lower = matchedWord.toLowerCase();

        if (!dictionary[lower]) return matchedWord;

        if (!replacedSet.has(lower)) {
          replacedWords.push({
            original: matchedWord,
            replacement: dictionary[lower],
          });
        }
        replacedSet.add(lower);
        // createTooltip(node, matchedWord);
        return dictionary[lower];
      });
    } else {
      node.childNodes.forEach((child) => {
        replaceTextNodes(child, dictionary, regex);
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

    if (replacedWords.length > 0) {
      chrome.storage.local.set({
        replacedWords: replacedWords,
        replacedSet: replacedSet,
      });
    }

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

      if (performance.now() - lastRun < 3000) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          replaceTextAndImages(dictData);
          lastRun = performance.now();
        }, 600);
      } else {
        replaceTextAndImages(dictData);
        lastRun = performance.now();
      }
    });

    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
      characterDataOldValue: false,
    });

    chrome.storage.sync.get(["ext_on"], async function (items) {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        return;
      }

      if (items.ext_on === false) {
        return;
      }

      replaceTextAndImages(dictData);
    });
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

    // Create a link element and wrap the tooltip
    // const link = document.createElement("a");
    // link.href = `https://www.palestineremembered.com/Search.html#gsc.tab=0&gsc.sort=&gsc.q=${encodeURIComponent(
    //   text
    // )}`;
    // link.target = "_blank"; // Opens the link in a new tab
    // link.appendChild(newElement);

    document.body.appendChild(newElement);

    const parentNode = el.parentNode;

    parentNode.addEventListener("mouseenter", function () {
      const rect = parentNode.getBoundingClientRect(); // Get the element's position
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
