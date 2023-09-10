const toggleSwitch = document.getElementById("toggleSwitch");

toggleSwitch.addEventListener("change", async () => {
    // Toggle the switch state
    if (toggleSwitch.checked) {
        // Handle the switch being turned on
        console.log("Switch is ON");
        
      var tab = await getCurrentTab();

        console.log(tab);
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
  let queryOptions = { active: true, lastFocusedWindow: true };
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

// function replaceText() {

//             // Get the current page content
//             // const pageContent = document.body.innerHTML;

//             // Define the text to find and its replacement
//             const textToFind = "Tel Aviv"; // Replace with the text you want to find
//             const replacementText = "Al-Sheikh Mowannes"; // Replace with the alternative text

//             // replaceTextInPage(textToFind,replacementText);
//             // walker(textToFind, replacementText);
//             // replaceNodeText(document.body);
//             // crawlAndReplace(window.location.href);
//             // replaceTextInPage(textToFind,replacementText);
//             // walker(textToFind,replacementText);
//             // replaceInChrome();

//             // Use regular expression to replace all occurrences of the text
//             // const updatedContent = pageContent.replace(new RegExp(textToFind, 'g'), replacementText);

//             // Update the page content with the replaced text
//             // document.body.innerHTML = updatedContent;
// }

// function replaceTextInPage(targetText, replacementText) {
//     function replaceTextInElement(element) {
//         if (element.nodeType === Node.TEXT_NODE) {
//             // This is a text node, replace its content
//           window.alert('\nname:\n' + node.nodeName + '\ntype:\n' + node.nodeType + '\nvalue:\n' + node.nodeValue + '\ncontent:\n' + node.textContent);
//             element.textContent = element.textContent.replace(new RegExp(targetText, 'g'), replacementText);
//         } else if (element.nodeType === Node.ELEMENT_NODE) {
//             // This is an element node, recurse into its children
//             for (let i = 0; i < element.childNodes.length; i++) {
//                 replaceTextInElement(element.childNodes[i]);
//             }
//         }
//     }

//     // Start the replacement process from the root of the document
//     replaceTextInElement(document.body);
// }




// function walker(targetText, replacementText){
//           var html = document.querySelector('html');
//   var walker = document.createTreeWalker(html, NodeFilter.SHOW_TEXT);
//   var node;
//   while (node = walker.nextNode()) {
//     if(node.nodeValue){

//     window.alert(node.nodeValue);
//   }
//     node.nodeValue = node.nodeValue.replace(new RegExp(targetText, 'g'), replacementText);
//   }
// }

// // Define a translation dictionary
// const translations = {
//   'Tel Aviv': 'Al-Sheikh Mowannes',
//   'Tel Aviv-Yafo': 'Al-Sheikh Mowannes',
//   'Tel Aviv\'s': 'Al-Sheikh Mowannes\'',
//   'Israel': 'Palestine',
//   'TLV' : 'LYD'
//   // Add more translations as needed
// };

// // Function to replace text on the page
// function replaceNodeText(node) {
//   if (node.nodeType === Node.TEXT_NODE) {
//     window.alert('\nname:\n' + node.nodeName + '\ntype:\n' + node.nodeType + '\nvalue:\n' + node.nodeValue + '\ncontent:\n' + node.textContent);
//       let text = node.textContent.trim().toLowerCase(); // Convert to lowercase for case-insensitive matching
//       if (text in translations) {
//         const originalText = node.textContent.trim();
//         const newText = translations[text];
//         // Replace the text while preserving the original case
//         node.textContent = node.textContent.replace(new RegExp(originalText, 'g'), newText);
//       }
//   } else if (node.nodeType === Node.ELEMENT_NODE) {
//     window.alert('\nname:\n' + node.nodeName + '\ntype:\n' + node.nodeType + '\nvalue:\n' + node.nodeValue + '\ncontent:\n' + node.textContent);
//       for (let i = 0; i < node.childNodes.length; i++) {
//         replaceText(node.childNodes[i]);
//       }
//   } else {
//     window.alert('\nname:\n' + node.nodeName + '\ntype:\n' + node.nodeType + '\nvalue:\n' + node.nodeValue + '\ncontent:\n' + node.textContent);
//     }
// }

// // Function to fetch a web page and perform text replacement
// // async function fetchAndReplace(url) {
// //   try {
// //     const response = await fetch(url);
// //     if (!response.ok) {
// //       throw new Error(`Failed to fetch: ${url}`);
// //     }
// //     const html = await response.text();
// //     const parser = new DOMParser();
// //     const doc = parser.parseFromString(html, 'text/html');
// //
// //     // Replace text in the fetched content
// //     replaceText(doc.body);
// //
// //     // Inject the modified content into the current page
// //     document.body.innerHTML = doc.body.innerHTML;
// //   } catch (error) {
// //     console.error(error);
// //   }
// // }

// // Function to crawl and replace text on a webpage
// async function crawlAndReplace(url) {
//   try {
//     const response = await fetch(url);
//     console.log(response);
//     if (!response.ok) {
//       throw new Error(`Failed to fetch: ${url}`);
//     }
//     const html = await response.text();
//     const parser = new DOMParser();
//     const doc = parser.parseFromString(html, 'text/html');

//     console.log(doc);

//     // Replace text in the fetched content
//     replaceText(doc.body);

//     console.log('*** replacin text in body ***');

//     // Inject the modified content into the current page
//     document.body.innerHTML = doc.body.innerHTML;

//     // Find and crawl links on the page for further crawling
//     const links = doc.querySelectorAll('a[href]');
//     for (const link of links) {
//       const newURL = new URL(link.href, url).href;
//       console.log('*** crawling again ***');
//       crawlAndReplace(newURL);
//     }
//   } catch (error) {
//     console.error(error);
//   }
// }

// async function replaceInChrome() {
  
//   window.alert('trying');

//   const customDictionary = {
//     'Tel Aviv': 'AlSheikh Mowannes'  };

//   const textNodes = document.createTreeWalker(
//     document.body,
//     NodeFilter.SHOW_ALL
//   );

//   let node;

//   while ((node = textNodes.nextNode())) {
//     window.alert('\nname:\n' + node.nodeName + '\ntype:\n' + node.nodeType + '\nvalue:\n' + node.nodeValue + '\ncontent:\n' + node.textContent);
//     for (const key in customDictionary) {
//       if (node.nodeValue.includes(key)) {
//         window.alert('included');
//         node.nodeValue = node.nodeValue.replace(key, customDictionary[key]);
//       }
//     }
//   }
// }


// async function crawlInChrome() {
  
//   replaceInChrome();

//   // chrome.scripting.executeScript({
//   //   target: { tabId: tab.id },
//   //   function: replaceInChrome, // The function to execute in the content script
//   // });

//   // chrome.action.onClicked.addListener((tab) => {

//   //   window.alert('tab.id');;

//   //   chrome.scripting.executeScript({
//   //     target: { tabId: tab.id },
//   //     function: replaceInChrome, // The function to execute in the content script
//   //   });
//   // });

//   // chrome.browserAction.onClicked.addListener(function (tab) {
//   // getCurrentTab().executeScript(getCurrentTab().id, {
//   // chrome.tabs.executeScript(tab.id, {

// // });
// }

// Call the replaceText function on the entire document

// walker();
// replaceText();
