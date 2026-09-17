// Rule-based transliteration between the three scripts the dictionary lives in.
//
// The workbook carries only 4 of the 6 name forms the extension wants:
//   have    arabic_name (ar)  english_translit (la)  hebrew_name (he)  hebrew_translit_ar (ar)
//   missing the Israeli name in Latin letters, and the native name in Hebrew letters
//
// These functions synthesise the two missing forms. They are BEST EFFORT and
// their output is never seeded live — `seed-from-xlsx.mjs` routes every derived
// pair into the review queue.
//
// Not all three directions are equally trustworthy, and the difference decides
// which column each derivation reads from:
//
//   arabicToHebrew  GOOD.  Both are abjads that leave short vowels unwritten,
//                   so the letter correspondence is ~1:1 and carries across
//                   exactly the information the source had. This is the
//                   standard mapping used on Israeli road signs.
//   latinToHebrew   WORSE. Only as good as the Latin it reads, and this
//                   workbook's english_translit column is OCR'd — "Zakariya"
//                   came through as "Zakarlya" (i read as l). Kept for input
//                   that does not come from the workbook.
//   hebToLatin      WEAK.  Hebrew writes no short vowels, so אברהם is equally
//                   "Avraham" or "Avraheim". A consonant skeleton at best.

// ---------------------------------------------------------------------------
// Arabic (used phonetically for a Hebrew name) -> Latin
// ---------------------------------------------------------------------------

const AR_LATIN = {
  ا: "a", أ: "a", إ: "i", آ: "a", ٱ: "a",
  ب: "b", پ: "p", ت: "t", ث: "th", ج: "j", چ: "ch", ح: "h", خ: "kh",
  د: "d", ذ: "z", ر: "r", ز: "z", ژ: "zh", س: "s", ش: "sh", ص: "s", ض: "d",
  ط: "t", ظ: "z", ع: "", غ: "gh", ف: "f", ڤ: "v", ق: "q", ک: "k", ك: "k",
  گ: "g", ل: "l", م: "m", ن: "n", ه: "h", ة: "a", و: "o", ۆ: "o", ي: "i",
  ی: "i", ى: "a", ئ: "i", ء: "", ؤ: "o",
};

// Harakat and tatweel carry no information we can use letter-by-letter.
const AR_DIACRITICS = /[ً-ْٰـ]/g;

/** Arabic script -> Latin. Used to guess the Israeli name in Latin letters. */
function arToLatin(input) {
  const words = String(input || "").replace(AR_DIACRITICS, "").trim().split(/\s+/);
  const out = words.map((word) => {
    let s = "";
    [...word].forEach((ch, i) => {
      // ع stands in for ע. Mid-word it is silent, but a Hebrew name opening on
      // ע opens on a vowel — ערבות is "Arvot", not "Rvot".
      if (ch === "ع") return void (s += i === 0 ? "a" : "");
      const mapped = AR_LATIN[ch];
      s += mapped === undefined ? (/[-'’‘]/.test(ch) ? ch : "") : mapped;
    });
    // "aa"/"ii" come from a mater lectionis doubling an already-written vowel.
    s = s.replace(/([aeiou])\1+/g, "$1");
    if (!s) return "";
    return s[0].toUpperCase() + s.slice(1);
  });
  return out.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Arabic -> Hebrew
// ---------------------------------------------------------------------------

// The conventional Arabic-to-Hebrew letter correspondence. Sounds Hebrew has no
// letter for are written with a geresh, exactly as Israeli signage does:
// خ -> ח', غ -> ע', ج -> ג'.
const AR_HEB = {
  ا: "א", أ: "א", إ: "א", آ: "א", ٱ: "א", ء: "א", ى: "א",
  ب: "ב", ت: "ת", ث: "ת'", ج: "ג'", ح: "ח", خ: "ח'", د: "ד", ذ: "ד'",
  ر: "ר", ز: "ז", س: "ס", ش: "ש", ص: "צ", ض: "צ'", ط: "ט", ظ: "ט'",
  ع: "ע", غ: "ע'", ف: "פ", ق: "ק", ك: "כ", ل: "ל", م: "מ", ن: "נ",
  ه: "ה", ة: "ה", و: "ו", ي: "י", ئ: "י", ؤ: "ו",
  // Letters borrowed for non-Arabic sounds, which the workbook uses for Hebrew
  // and European names.
  پ: "פ", چ: "ג'", ژ: "ז'", ڤ: "ו", گ: "ג", ک: "כ", ی: "י",
};

/**
 * Arabic script -> Hebrew script, letter for letter.
 *
 * Both scripts leave short vowels unwritten, so this neither invents nor loses
 * information — which is why the seeder derives the native-name-in-Hebrew from
 * `arabic_name` rather than from the OCR-damaged Latin column.
 *
 * The definite article is split off with a hyphen (אל-קודס), matching how
 * Arabic place names are conventionally written in Hebrew.
 */
function arabicToHebrew(input) {
  const words = String(input || "").replace(AR_DIACRITICS, "").trim().split(/\s+/);
  const out = words.map((word) => {
    const article = /^ال(?=.)/.test(word);
    const body = article ? word.slice(2) : word;
    let s = "";
    for (const ch of body) {
      const mapped = AR_HEB[ch];
      s += mapped === undefined ? (/[-]/.test(ch) ? "-" : "") : mapped;
    }
    if (!s) return "";
    return (article ? "אל-" : "") + applyFinal(s);
  });
  return out.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Hebrew -> Latin
// ---------------------------------------------------------------------------

const HE_LATIN = {
  א: "a", ב: "v", ג: "g", ד: "d", ה: "h", ו: "o", ז: "z", ח: "ch", ט: "t",
  י: "i", כ: "kh", ך: "kh", ל: "l", מ: "m", ם: "m", נ: "n", ן: "n", ס: "s",
  ע: "a", פ: "f", ף: "f", צ: "tz", ץ: "tz", ק: "k", ר: "r", ש: "sh", ת: "t",
};

const HE_NIQQUD = /[֑-ׇ]/g;

/**
 * Hebrew script -> Latin. A consonant skeleton with matres lectionis read as
 * vowels — deliberately kept as a second opinion next to `arToLatin`, never as
 * the primary candidate, because unwritten vowels cannot be recovered.
 */
function hebToLatin(input) {
  const words = String(input || "").replace(HE_NIQQUD, "").trim().split(/\s+/);
  const out = words.map((word) => {
    const chars = [...word];
    let s = "";
    chars.forEach((ch, i) => {
      const mapped = HE_LATIN[ch];
      if (mapped === undefined) {
        if (/[-'’״׳]/.test(ch)) s += "-";
        return;
      }
      // ב/פ/כ are plosive word-initially in ordinary Israeli spelling.
      if (i === 0 && ch === "ב") s += "b";
      else if (i === 0 && ch === "פ") s += "p";
      else s += mapped;
    });
    s = s.replace(/([aeiou])\1+/g, "$1").replace(/^-+|-+$/g, "");
    if (!s) return "";
    return s[0].toUpperCase() + s.slice(1);
  });
  return out.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Latin (english_translit) -> Hebrew
// ---------------------------------------------------------------------------

// Consonants, longest-first so digraphs beat their leading letter.
const LA_HEB = [
  ["kh", "ח"], ["ch", "ח"], ["sh", "ש"], ["th", "ת'"], ["dh", "ד'"],
  ["gh", "ע'"], ["zh", "ז'"], ["ts", "צ"], ["tz", "צ"], ["ph", "פ"],
  ["ḥ", "ח"], ["ṣ", "צ"], ["ḍ", "צ"], ["ṭ", "ט"], ["ẓ", "ט"], ["ġ", "ע'"],
  ["ʿ", "ע"], ["ʾ", "א"], ["‘", "ע"], ["’", "א"], ["'", "ע"],
  ["b", "ב"], ["c", "ק"], ["d", "ד"], ["f", "פ"], ["g", "ג"], ["h", "ה"],
  ["j", "ג'"], ["k", "כ"], ["l", "ל"], ["m", "מ"], ["n", "נ"], ["p", "פ"],
  ["q", "ק"], ["r", "ר"], ["s", "ס"], ["t", "ת"], ["v", "ו"], ["w", "ו"],
  ["x", "קס"], ["y", "י"], ["z", "ז"],
];

// Vowels need position-sensitive handling, which Hebrew orthography decides:
//   `always` — written wherever it falls (long vowels, and i/u/o under the
//              "full spelling" convention Israeli Hebrew uses for foreign names)
//   `initial` — a word cannot open on a bare vowel point, so an aleph carries it
//   `final`   — a name ending in -a takes a he: ʿAkka -> עכה, not עך
// Short a/e are simply left out mid-word, which is why "Ibrahim" comes out
// איברהים rather than a letter-for-letter איבראהים.
const LA_HEB_VOWELS = {
  aa: { always: "א", initial: "א", final: "ה" },
  ee: { always: "י", initial: "אי" },
  ei: { always: "יי", initial: "איי" },
  ou: { always: "ו", initial: "או" },
  oo: { always: "ו", initial: "או" },
  "ā": { always: "א", initial: "א", final: "ה" },
  "ī": { always: "י", initial: "אי" },
  "ū": { always: "ו", initial: "או" },
  "ō": { always: "ו", initial: "או" },
  "ē": { always: "י", initial: "אי" },
  a: { always: "", initial: "א", final: "ה" },
  e: { always: "", initial: "א", final: "ה" },
  i: { always: "י", initial: "אי" },
  o: { always: "ו", initial: "או" },
  u: { always: "ו", initial: "או" },
};

const HE_FINALS = { מ: "ם", נ: "ן", צ: "ץ", פ: "ף", כ: "ך" };

/** Apply Hebrew final-letter forms to the last letter of a word. */
function applyFinal(word) {
  if (!word) return word;
  // A geresh belongs to the letter before it; don't final-form through it.
  const m = /^(.*?)([א-ת])('?)$/.exec(word);
  if (!m) return word;
  const final = HE_FINALS[m[2]];
  return final ? m[1] + final + m[3] : word;
}

/**
 * Latin -> Hebrew script. Used to guess the native Arabic name written in
 * Hebrew letters, e.g. "Ibrahim" -> "איבראהים", so a Hebrew reader still gets a
 * name they can pronounce.
 */
function latinToHebrew(input) {
  const words = String(input || "").trim().split(/\s+/);
  const out = words.map((word) => {
    // "el-Qamh" / "es-Simsim": the article is written as a separate ה-less unit
    // in Hebrew renderings of Arabic names, so keep the hyphen as a separator.
    const parts = word.split("-");
    const rendered = parts.map((part) => {
      // Arabic gemination ("Umm", "‘Attin") is written with one letter in
      // Hebrew, so collapse doubled consonants before mapping. Doubled vowels
      // are digraphs with their own entries and must survive.
      const lower = part.toLowerCase().replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, "$1");
      let s = "";
      let i = 0;
      while (i < lower.length) {
        const two = lower.slice(i, i + 2);
        const one = lower[i];
        // At the last character `two` is only one char long and would otherwise
        // match the single-letter table as if it were a digraph.
        const digraph = two.length === 2 ? LA_HEB_VOWELS[two] : undefined;
        const vowel = digraph || LA_HEB_VOWELS[one];
        if (vowel) {
          const width = digraph ? 2 : 1;
          const atEnd = i + width === lower.length;
          s += i === 0 ? vowel.initial : (atEnd && vowel.final) || vowel.always;
          i += width;
          continue;
        }
        const pair = LA_HEB.find(([k]) => k.length === 2 && k === two);
        if (pair) { s += pair[1]; i += 2; continue; }
        const single = LA_HEB.find(([k]) => k.length === 1 && k === one);
        if (single) { s += single[1]; i += 1; continue; }
        i += 1;
      }
      return applyFinal(s);
    });
    return rendered.filter(Boolean).join("-");
  });
  return out.filter(Boolean).join(" ");
}

module.exports = {
  arToLatin,
  arabicToHebrew,
  hebToLatin,
  latinToHebrew,
};
