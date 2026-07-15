// Pure matching logic. No DOM, no chrome. Shared between the content script,
// the background worker, and the test suite via a small UMD wrapper:
//   - as a content/worker script it attaches to self.Sardiya
//   - under jest/node it exports via module.exports
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Sardiya = root.Sardiya || {};
    Object.assign(root.Sardiya, api);
  }
})(typeof self !== "undefined" ? self : this, function () {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // Escape everything the RegExp engine treats as special so dictionary keys
  // like "a.b" or "Wadi (X)" match literally.
  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // [{translation, value}, ...] -> { translation: value, ... }
  function parseTranslationData(data) {
    const out = {};
    if (!Array.isArray(data)) return out;
    for (const item of data) {
      if (item && item.translation != null) out[item.translation] = item.value;
    }
    return out;
  }

  // Firestore REST (documents.list) returns each row as
  //   { fields: { value: {stringValue}, translation: {stringValue} }, ... }
  // Flatten a response body (already merged across pages by the caller) into the
  // same [{value, translation}] shape parseTranslationData consumes, dropping any
  // doc missing either field.
  function parseFirestoreDocuments(body) {
    const docs = body && Array.isArray(body.documents) ? body.documents : [];
    const out = [];
    for (const doc of docs) {
      const f = (doc && doc.fields) || {};
      const value = f.value && f.value.stringValue;
      const translation = f.translation && f.translation.stringValue;
      if (value != null && translation != null) out.push({ value, translation });
    }
    return out;
  }

  function isWeekPassed(timestamp, now) {
    const ref = typeof now === "number" ? now : Date.now();
    return ref - timestamp > WEEK_MS;
  }

  // Build a single compiled matcher from the dictionary.
  //   - keys are lowercased so lookup is case-insensitive
  //   - keys are sorted longest-first so "tel aviv" wins over "tel"
  //   - keys are escaped
  //   - Unicode letter lookarounds replace \b so Arabic/Hebrew names anchor
  function buildMatcher(rawDict) {
    if (!rawDict) return null;
    const dict = {};
    for (const key of Object.keys(rawDict)) {
      dict[key.toLowerCase()] = rawDict[key];
    }
    const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
    if (keys.length === 0) return null;

    const alternation = keys.map(escapeRegExp).join("|");
    const regex = new RegExp(`(?<!\\p{L})(${alternation})(?!\\p{L})`, "giu");

    const replacementFor = (matched) => dict[matched.toLowerCase()];

    return {
      regex,
      dict,
      replacementFor,
      // Stateless guard: does any key appear in this text?
      matches(text) {
        regex.lastIndex = 0;
        return regex.test(text);
      },
      // Full string transform. Returns the same string when nothing matches.
      // onMatch(matched, replacement) is called for each replacement (used to
      // collect the replaced-words list for the popup table).
      apply(text, onMatch) {
        regex.lastIndex = 0;
        return text.replace(regex, (matched) => {
          const replacement = replacementFor(matched);
          if (replacement == null) return matched;
          if (onMatch) onMatch(matched, replacement);
          return replacement;
        });
      },
    };
  }

  return {
    escapeRegExp,
    parseTranslationData,
    parseFirestoreDocuments,
    isWeekPassed,
    buildMatcher,
  };
});
