var textToChange;
var getReplacementText;
var replaceTextInNodes;

function fillText() {
  if (!textToChange) {
     textToChange = {
      "Netanya": "Im Khaled",
      "Petach Tikva": "Mlabas",
      "Petah Tikva": "Mlabas",
      "Petah Tiqwa": "Mlabas",
      "Ashkelon": "Askalan",
      "Ashdod": "Asdood",
      "Shoresh": "Saris",
      "Lod": "Al-Lydd",
      "Nazareth": "An-Nasra",
      "Beer Sheva": "Bir As-Sabe'",
      "Beersheba": "Bir As-Sabe'",
      // "Be\'er Sheva" : "Bir As-Sabe\'",
      "Negev": "An-Naqab",
      "East Jerusalem": "Al-Quds",
      "Akko": "Akka",
      "Acre": "Akka",
      "Tiberias": "Tabariya",
       "Yafo": "Yafa",
       "Jaffa": "Yafa",
      "Hebron": "Al-Khalil",
      "Jerusalem": "Al-Quds",
      "Tel-Aviv": "Al-Sheikh Mowannes",
      "Tel Aviv": "Al-Sheikh Mowannes",
      "Ben Gurion Airport": "Al-Lydd Airport",
      "Ben Gurion Intl": "Al-Lydd Airport",
      "Eilat": "Im Rashrash",
      "Safed": "Safad",
      "Hadera": "Khadera",
      "Rishon LeTsiyon": "A'youn Qara",
      "Rishon Le Zion": "A'youn Qara",
      "Rishon LeZion": "A'youn Qara",
       "TLV": "LYD",
       "Explore Israel": "Explore Palestine",
       "Land of Israel": "Land of Palestine",
       "Israel, Middle East": "Palestine, Middle East",
      "@telaviv" : "@alsheikhmowannes",
       "city in Israel": "city in Palestine",
      "city on Israel": "city on Palestine"
     };
  }

  if (!getReplacementText) {
    getReplacementText = (text) => {
      let replacement = textToChange[text];
      if (!replacement) {
        // if the text matches what we wanted, but we don't have the right
        // case, the code will error out. So, we just return the original
        // text
        return text;
      }
      if (text.charAt(0) === text.charAt(0).toUpperCase()) {

        replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    };
  }

  if (!replaceTextInNodes) {
    replaceTextInNodes = (el) => {
      if (el.nodeType === Node.TEXT_NODE) {
        const regex = new RegExp(
          "\\b(" + Object.keys(textToChange).join("|") + ")\\b",
          "gi"
        );
        el.textContent = el.textContent.replace(regex, getReplacementText);
      } else {
        for (let child of el.childNodes) {
          replaceTextInNodes(child);
        }
      }
    };
  }
}

// const getReplacementText = (text) => {
//   let replacement = textToChange[text];
//   if (!replacement) {
//     // if the text matches what we wanted, but we don't have the right
//     // case, the code will error out. So, we just return the original
//     // text
//     return text;
//   }
//   if (text.charAt(0) === text.charAt(0).toUpperCase()) {

//     replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
//   }
//   return replacement;
// };





fillText();
replaceTextInNodes(document.querySelector("body"));
