//TODO: remove replaced words and reinsert original words from DOM

  // revert.js
(() => {
    chrome.storage.local.get(["replacedWords", "replacedSet"], function (result) {
      const replacedWords = result.replacedWords || [];
      const replacedSet = new Set(result.replacedSet || []);
  
      if (replacedWords.length === 0) {
        return;
      }
  
      function revertText(el) {
        if (el.nodeType === Node.TEXT_NODE) {
          const parent = el.parentNode;
          if (!parent) {
            return;
          }
          const originalText = el.textContent;
          let newText = originalText;
          replacedWords.forEach(({ word, replacement }) => {
            const regex = new RegExp(replacement, "gi");
             newText = newText.replace(regex, word);
          });
  
            if(originalText !== newText){
              parent.insertBefore(document.createTextNode(newText), el);
               parent.removeChild(el);
  
            }
  
  
        } else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          let originalValue = el.value;
          replacedWords.forEach(({ word, replacement }) => {
            const regex = new RegExp(replacement, "gi");
            originalValue = originalValue.replace(regex, word);
          });
          el.value = originalValue;
        } else {
          for (let child of el.childNodes) {
            revertText(child);
          }
        }
      }
      const anyChildOfBody = "/html/body//";
      const isTextButNotPartOfJsScriptOrTooltip = "text()[not(parent::script) and not(ancestor::*[contains(@class, 'tooltip')])]";
        const xpathExpression = `
      ${anyChildOfBody}
      ${isTextButNotPartOfJsScriptOrTooltip}
      | //input | //textarea
      `;
         const result = document.evaluate(
          xpathExpression,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
  
         for (let i = 0; i < result.snapshotLength; i++) {
            revertText(result.snapshotItem(i));
         }
    });
  })();