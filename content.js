var textToChange = {
  "Tel Aviv": "Al-Sheikh Mowannes",
  "Tel Aviv-Yafo": "Al-Sheikh Mowannes",
  "Tel Aviv's": "Al-Sheikh Mowannes'",
  Israel: "Palestine",
  TLV: "LYD",
};

const getReplacementText = (text) => {
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

const replaceTextInNodes = (el) => {
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

replaceTextInNodes(document.querySelector("body"));
