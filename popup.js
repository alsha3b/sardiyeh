document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get('replacedWords', function(data) {
      const replacedWordsList = document.getElementById('replaced-words-list');
      if (data.replacedWords && data.replacedWords.length > 0) {
        data.replacedWords.forEach(word => {
          const listItem = document.createElement('li');
          listItem.textContent = `${word.original} -> ${word.replacement}`;
          replacedWordsList.appendChild(listItem);
        });
      } else {
        replacedWordsList.textContent = 'No words replaced.';
      }
    });
  });