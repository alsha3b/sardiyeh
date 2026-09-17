// Turn the multi-sheet place-name workbook into dictionary rows the Firestore
// `words` collection can hold, plus the risk gating that decides which rows are
// safe to seed and which need a human first.
//
// Shape of the workbook (52 sheets, one per feature type):
//   page | arabic_name | english_translit | hebrew_name | hebrew_translit_ar | coordinates | notes
// with three variants: some sheets drop `page` or `coordinates`/`notes`, and the
// springs sheet (العيون) has no header row and its columns run right-to-left.

const HEBREW_RE = /[֐-׿]/;
const ARABIC_RE = /[؀-ۿݐ-ݿﭐ-﷿]/;
const LATIN_RE = /[A-Za-z]/;

const FIELDS = [
  "page",
  "arabic_name",
  "english_translit",
  "hebrew_name",
  "hebrew_translit_ar",
  "coordinates",
  "notes",
];

// Sheet name -> feature type. Surfaced on every doc as `category`, and printed
// next to each candidate in the conflict report so a reviewer can tell the well
// named אברהם from the hill and the village that share the name.
const CATEGORIES = {
  "الأبار": { ar: "بئر", en: "well" },
  "الأبراج": { ar: "برج", en: "tower" },
  "الأبواب": { ar: "باب", en: "gate" },
  "الأخوار": { ar: "خور", en: "inlet" },
  "الأغوار": { ar: "غور", en: "lowland" },
  "الأنبياء": { ar: "مقام نبي", en: "prophet-shrine" },
  "الأنقاب": { ar: "نقب", en: "mountain-pass" },
  "الأودية والأنهار": { ar: "وادٍ/نهر", en: "wadi-river" },
  "البحار والبحيرات": { ar: "بحر/بحيرة", en: "sea-lake" },
  "البرك": { ar: "بركة", en: "pool" },
  "البوايك": { ar: "بايكة", en: "vault" },
  "التلال": { ar: "تل", en: "hill" },
  "الجبال": { ar: "جبل", en: "mountain" },
  "الجزر": { ar: "جزيرة", en: "island" },
  "الجسور": { ar: "جسر", en: "bridge" },
  "الجور": { ar: "جورة", en: "hollow" },
  "الحارات والضواحي": { ar: "حارة/ضاحية", en: "quarter" },
  "الحجارة": { ar: "حجر", en: "rock" },
  "الخانات": { ar: "خان", en: "caravanserai" },
  "الخرب": { ar: "خربة", en: "ruin" },
  "الخشوم": { ar: "خشم", en: "spur" },
  "الرجوم": { ar: "رجم", en: "cairn" },
  "الرسوم": { ar: "رسم", en: "site" },
  "الرؤوس": { ar: "رأس", en: "cape" },
  "الساحات": { ar: "ساحة", en: "square" },
  "السبخات": { ar: "سبخة", en: "salt-flat" },
  "السكنات": { ar: "سكنة", en: "dwelling" },
  "السهول والمروج": { ar: "سهل/مرج", en: "plain-meadow" },
  "الشعاب": { ar: "شعب", en: "ravine" },
  "الشوارع": { ar: "شارع", en: "street" },
  "الشواطئ": { ar: "شاطئ", en: "beach" },
  "الصحاري والبوادي": { ar: "صحراء/بادية", en: "desert" },
  "الطرق": { ar: "طريق", en: "road" },
  "العيون": { ar: "عين", en: "spring" },
  "القرى والمدن": { ar: "قرية/مدينة", en: "village-town" },
  "القرون": { ar: "قرن", en: "horn" },
  "القصور": { ar: "قصر", en: "palace" },
  "القلاع": { ar: "قلعة", en: "castle" },
  "القيعان": { ar: "قاع", en: "basin" },
  "الكروم": { ar: "كرم", en: "vineyard" },
  "المخاضات": { ar: "مخاضة", en: "ford" },
  "المزارات": { ar: "مزار", en: "shrine" },
  "المستشفيات": { ar: "مستشفى", en: "hospital" },
  "المطاحن": { ar: "مطحنة", en: "mill" },
  "المطلّات": { ar: "مطل", en: "overlook" },
  "المغاور": { ar: "مغارة", en: "cave" },
  "المناظر": { ar: "منظر", en: "viewpoint" },
  "الموانئ": { ar: "ميناء", en: "port" },
  "الهرابات": { ar: "هرابة", en: "ruin-field" },
  "الهوَت": { ar: "هوّة", en: "chasm" },
  "الغابات": { ar: "غابة", en: "forest" },
  "الوهدات": { ar: "وهدة", en: "depression" },
};

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

const COORD_RE = /^\d{2,4}\.\d+$/;
const PAGE_RE = /^\d{1,4}$/;

const scriptShare = (cells, re) =>
  cells.length ? cells.filter((c) => re.test(c)).length / cells.length : 0;

/**
 * Work out which column holds which field.
 *
 * Prefers the header row when there is one. Otherwise infers from content: the
 * coordinate, page, Hebrew and Latin columns each have an unmistakable
 * signature, and the three remaining Arabic columns are told apart by position —
 * `arabic_name` always sits next to the Latin column (it is what the Latin
 * column transliterates) and `hebrew_translit_ar` next to the Hebrew one, while
 * `notes` is an order of magnitude longer than either.
 */
function detectColumns(rows) {
  const header = (rows[0] || []).map((c) => (c || "").trim());
  if (header.includes("arabic_name")) {
    const map = {};
    header.forEach((h, i) => {
      if (FIELDS.includes(h) && map[h] === undefined) map[h] = i;
    });
    return { map, dataStart: 1, inferred: false };
  }

  const width = Math.max(...rows.map((r) => r.length), 0);
  const cols = [];
  for (let i = 0; i < width; i++) {
    const cells = rows.map((r) => (r[i] || "").trim()).filter(Boolean);
    cols.push({
      i,
      cells,
      filled: cells.length,
      avgLen: cells.length ? cells.reduce((a, c) => a + c.length, 0) / cells.length : 0,
      heb: scriptShare(cells, HEBREW_RE),
      ara: scriptShare(cells, ARABIC_RE),
      lat: scriptShare(cells, LATIN_RE),
      coord: scriptShare(cells, COORD_RE),
      page: scriptShare(cells, PAGE_RE),
    });
  }

  const map = {};
  const taken = new Set();
  const claim = (field, col) => {
    if (!col || taken.has(col.i)) return;
    map[field] = col.i;
    taken.add(col.i);
  };
  const best = (pred, score) =>
    cols
      .filter((c) => !taken.has(c.i) && c.filled && pred(c))
      .sort((a, b) => score(b) - score(a))[0];

  claim("coordinates", best((c) => c.coord > 0.6, (c) => c.coord));
  claim("hebrew_name", best((c) => c.heb > 0.5, (c) => c.heb));
  claim("english_translit", best((c) => c.lat > 0.5, (c) => c.lat));
  claim("page", best((c) => c.page > 0.5, (c) => c.page));

  const arabic = cols.filter((c) => !taken.has(c.i) && c.filled && c.ara > 0.5);
  if (arabic.length) {
    // Notes are prose; names are a few words at most.
    const notes = arabic.slice().sort((a, b) => b.avgLen - a.avgLen)[0];
    if (notes.avgLen > 40) claim("notes", notes);
  }
  const names = cols.filter((c) => !taken.has(c.i) && c.filled && c.ara > 0.5);
  const distance = (col, field) =>
    map[field] === undefined ? Infinity : Math.abs(col.i - map[field]);
  names.sort((a, b) => distance(a, "english_translit") - distance(b, "english_translit"));
  claim("arabic_name", names[0]);
  const rest = names.filter((c) => !taken.has(c.i));
  rest.sort((a, b) => distance(a, "hebrew_name") - distance(b, "hebrew_name"));
  claim("hebrew_translit_ar", rest[0]);

  return { map, dataStart: 0, inferred: true };
}

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

// Single-letter abbreviations for settlement types that the source prefixes onto
// a name: מ. = מושב, ק. = קיבוץ, ח. = חורבת, נ. = נחל, and their Arabic echoes
// م. / خ. / ن. They are not part of the name and must not reach a dictionary key.
const HE_PREFIX_RE = /^([א-ת])\.\s*/;
const AR_PREFIX_RE = /^([ء-ي])\.\s*/;

/**
 * Normalise one name cell.
 *
 * Returns the primary spelling plus any bracketed or parenthesised alternates,
 * which the source uses for a second attested spelling of the same place. Each
 * alternate becomes its own dictionary key pointing at the same replacement.
 */
function cleanName(raw, script) {
  const text = String(raw || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[«»"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return { primary: "", alternates: [], prefix: "", dirty: false };

  const alternates = [];
  let body = text;
  let dirty = false;

  for (const re of [/\[([^\]]*)\]/g, /\(([^)]*)\)/g]) {
    body = body.replace(re, (_, inner) => {
      const alt = inner.trim();
      if (alt) alternates.push(alt);
      return " ";
    });
  }

  // Stray unmatched brackets / leading punctuation is OCR debris.
  if (/[[\]()]/.test(body)) {
    dirty = true;
    body = body.replace(/[[\]()]/g, " ");
  }
  body = body.replace(/^[^\p{L}\d]+/u, "").replace(/[^\p{L}\d'’‘\-.]+$/u, "");
  body = body.replace(/\s+/g, " ").trim();

  const prefixRe = script === "he" ? HE_PREFIX_RE : AR_PREFIX_RE;
  let prefix = "";
  const m = prefixRe.exec(body);
  if (m) {
    prefix = m[1];
    body = body.slice(m[0].length).trim();
  }

  const strip = (s) => {
    const c = String(s)
      .replace(/^[^\p{L}\d]+/u, "")
      .replace(/[^\p{L}\d'’‘\-.]+$/u, "")
      .replace(/\s+/g, " ")
      .trim();
    const pm = prefixRe.exec(c);
    return pm ? c.slice(pm[0].length).trim() : c;
  };

  return {
    primary: body,
    alternates: [...new Set(alternates.map(strip).filter(Boolean))].filter((a) => a !== body),
    prefix,
    dirty,
  };
}

// ---------------------------------------------------------------------------
// Row extraction
// ---------------------------------------------------------------------------

/**
 * Flatten every sheet into one list of place records. Rows with neither an
 * Arabic nor a Hebrew name carry nothing usable and are dropped.
 */
function extractRecords(workbook) {
  const records = [];
  const sheets = [];

  for (const sheet of workbook) {
    const rows = sheet.rows.filter((r) => r.some((c) => c && c.trim()));
    if (!rows.length) continue;
    const { map, dataStart, inferred } = detectColumns(rows);
    const category = CATEGORIES[sheet.name] || { ar: sheet.name, en: sheet.name };
    const get = (row, field) =>
      map[field] === undefined ? "" : String(row[map[field]] || "").trim();

    let kept = 0;
    for (const row of rows.slice(dataStart)) {
      const arabicName = cleanName(get(row, "arabic_name"), "ar");
      const hebrewName = cleanName(get(row, "hebrew_name"), "he");
      const hebrewAr = cleanName(get(row, "hebrew_translit_ar"), "ar");
      const latin = cleanName(get(row, "english_translit"), "la");
      if (!arabicName.primary && !hebrewName.primary) continue;
      kept++;
      records.push({
        sheet: sheet.name,
        category,
        arabicName,
        hebrewName,
        hebrewAr,
        latin,
        page: get(row, "page"),
        coordinates: get(row, "coordinates"),
        notes: cleanName(get(row, "notes"), "ar").primary,
      });
    }
    sheets.push({
      name: sheet.name,
      inferred,
      columns: map,
      rows: rows.length - dataStart,
      kept,
    });
  }
  return { records, sheets };
}

// ---------------------------------------------------------------------------
// Risk gating
// ---------------------------------------------------------------------------

// Israeli settlements are very often named with plain nouns, so a key like ים
// ("sea") or שדה ("field") would rewrite ordinary prose rather than a place
// name. The length rule below catches most; these are the common longer ones.
const DEFAULT_STOPWORDS = [
  "ים", "שדה", "אור", "רות", "שחר", "גן", "דרך", "בית", "עין", "הר", "נחל",
  "מעין", "יער", "שער", "מים", "אבן", "גבעה", "עמק", "כפר", "מגדל", "ברכה",
  "بول", "أورا", "بيت", "عين", "باب", "جبل", "واد", "دار", "نور", "بحر",
  "حجر", "شمس", "قمر", "ماء", "طريق", "سوق", "حقل", "نهر", "برج",
  "Beit", "Ein", "Tel", "Wadi", "Deir", "Khirbet", "Bir", "Ras", "Jabal",
];

const AR_DIACRITICS_RE = /[ً-ْٰـ]/g;

// ---------------------------------------------------------------------------
// Rejecting pairs that are not actually a rename
// ---------------------------------------------------------------------------

// الشوارع is not the same kind of sheet as the rest. It lists Israeli street
// names with two Arabic spellings of the SAME name (رزيئيل / رزيتيل, both
// "Raziel") — there is no Palestinian counterpart to restore, so every pair it
// yields is either an identity or a spelling variant. Seeding it would put
// hundreds of no-op alternatives into the page-wide regex.
const SHEETS_WITHOUT_NATIVE_NAME = new Set(["الشوارع"]);

// Sheets whose rows are inhabited places, and so are the only ones a Wikidata
// settlement entity can legitimately be matched against.
//
// Wikidata knows villages and towns; it does not know individual wells, wadis
// or towers. Match a well named בענה and you get back Bi'ina, the village
// standing next to it — close enough to pass a coordinate check, and completely
// the wrong feature. Worse, that village's English label is itself an Arabic
// name, so the "Israeli name" it yields is anything but.
const SETTLEMENT_SHEETS = new Set(["القرى والمدن", "الخرب"]);

/**
 * Fold the spelling variation that separates two renderings of one Arabic name:
 * hamza carriers, ta marbuta, alef maqsura, and the Persian letters the scan
 * substituted for Arabic ones (چ for ج, پ for ب, ڤ for ف).
 */
function normalizeArabic(text) {
  return String(text || "")
    .replace(AR_DIACRITICS_RE, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/چ/g, "ج")
    .replace(/پ/g, "ب")
    .replace(/ڤ/g, "ف")
    .replace(/گ/g, "ج")
    .replace(/ک/g, "ك")
    .replace(/ی/g, "ي")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Is this "rename" just the same name written twice?
 *
 * Deliberately strict: many Israeli names ARE Hebraisations of the Palestinian
 * one and share a consonant skeleton (بلعام for بلعمة, جلوما for جلمة). Those
 * are real renames and restoring the original spelling is the whole point, so
 * only normalised equality counts as identity.
 */
function isSameName(a, b) {
  const x = normalizeArabic(a);
  const y = normalizeArabic(b);
  return Boolean(x) && x === y;
}

// ---------------------------------------------------------------------------
// Detecting OCR damage in english_translit
// ---------------------------------------------------------------------------
//
// The Latin column was scanned, not typed, and it shows: "Zakariya" arrived as
// "Zakarlya", "Qisarya" as "Qlsarya", "Ma‘sub" as "Ma‘silb 7". The Arabic column
// is clean, so comparing the two consonant skeletons finds the damaged rows.
//
// Both sides reduce to the same coarse alphabet. Short vowels are dropped
// (neither script records them reliably), and so are و/ي and w/y, which serve as
// both consonants and long vowels — keeping them would flag every long vowel as
// a mismatch.

// ة is the feminine ending, pronounced -a and romanised as a vowel, so it is
// dropped here too — keeping it would flag every feminine name as a mismatch.
const AR_SKELETON = {
  ب: "b", ت: "t", ث: "t", ج: "j", ح: "h", خ: "k", د: "d", ذ: "d", ر: "r",
  ز: "z", س: "s", ش: "s", ص: "s", ض: "d", ط: "t", ظ: "z", غ: "g", ف: "f",
  ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", پ: "p", ڤ: "v",
  گ: "g", چ: "j", ک: "k",
};

const LA_SKELETON = [
  ["kh", "k"], ["sh", "s"], ["th", "t"], ["dh", "d"], ["gh", "g"],
  ["ch", "k"], ["ph", "f"], ["tz", "z"], ["ts", "s"],
  ["ḥ", "h"], ["ṣ", "s"], ["ḍ", "d"], ["ṭ", "t"], ["ẓ", "z"], ["ġ", "g"],
  ["b", "b"], ["c", "k"], ["d", "d"], ["f", "f"], ["g", "g"], ["h", "h"],
  ["j", "j"], ["k", "k"], ["l", "l"], ["m", "m"], ["n", "n"], ["p", "p"],
  ["q", "q"], ["r", "r"], ["s", "s"], ["t", "t"], ["v", "v"], ["x", "ks"],
  ["z", "z"],
];

// The article is written ال in Arabic but assimilates to the following sun
// letter in Latin ("er-Rihiyya"), so strip it from both sides rather than try
// to model the assimilation.
const LA_ARTICLE = /^(el|al|es|er|ed|en|ez|et|as|ash|az|at|ar|ad)-/i;

function arabicSkeleton(text) {
  return String(text || "")
    .replace(AR_DIACRITICS_RE, "")
    .split(/\s+/)
    .map((w) => [...w.replace(/^ال(?=.)/, "")].map((c) => AR_SKELETON[c] || "").join(""))
    .join("")
    .replace(/(.)\1+/g, "$1");
}

function latinSkeleton(text) {
  return String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      // Strip the article before the hyphen goes, or "el-Buweib" leaves behind
      // a stray "l" that looks like a missing letter on the Arabic side.
      const w = word.replace(LA_ARTICLE, "").replace(/-/g, "");
      let s = "";
      let i = 0;
      while (i < w.length) {
        const two = w.slice(i, i + 2);
        const pair = two.length === 2 && LA_SKELETON.find(([k]) => k.length === 2 && k === two);
        if (pair) { s += pair[1]; i += 2; continue; }
        const one = LA_SKELETON.find(([k]) => k.length === 1 && k === w[i]);
        if (one) { s += one[1]; }
        i += 1;
      }
      return s;
    })
    .join("")
    .replace(/(.)\1+/g, "$1");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Does `english_translit` disagree with `arabic_name` badly enough to suspect
 * the scan mangled it? Returns null when the two agree, otherwise the two
 * skeletons and their distance so the review file can show the evidence.
 */
function latinLooksCorrupt(arabicName, latin, threshold = 0.2) {
  const a = arabicSkeleton(arabicName);
  const l = latinSkeleton(latin);
  if (!a || !l) return null;
  // Stray scanner artefacts the comparison would otherwise miss, because they
  // leave the consonants intact: digits and punctuation the scanner invented
  // ("Ma‘silb 7", "Arsuf {el-Haram", "Tab‘on."), and a capital letter stranded
  // mid-word, which is how an O read as a lowercase o shows up ("JOlis").
  if (/[0-9{}[\]=|]/.test(latin) || /\.$/.test(latin.trim())) {
    return { arabic: a, latin: l, distance: -1, artefact: true };
  }
  // Any letter, not just a lowercase one: "JOlis" has its stray capital
  // directly after another capital.
  if (/(?<=[A-Za-z])[A-Z]/.test(latin)) {
    return { arabic: a, latin: l, distance: -1, artefact: true };
  }
  const distance = levenshtein(a, l);
  const ratio = distance / Math.max(a.length, l.length);
  return ratio > threshold ? { arabic: a, latin: l, distance, ratio: Number(ratio.toFixed(2)) } : null;
}

const letterCount = (s, re) => [...String(s)].filter((c) => re.test(c)).length;

const SCRIPT_RE = { he: HEBREW_RE, ar: ARABIC_RE, la: LATIN_RE };
// Latin keys need one more letter than the abjads: at 4 letters a Latin string
// is far more likely to be an English word than a 4-letter Hebrew one is.
const MIN_LETTERS = { he: 4, ar: 4, la: 5 };

/**
 * Decide whether a key is safe to compile into the page-wide replacement regex.
 * Returns null when the key is fine, or a reason string when it needs review.
 */
function riskOf(key, script, stopwords) {
  const re = SCRIPT_RE[script];
  const letters = letterCount(key, re);
  if (!letters) return "no-letters-in-expected-script";
  if (/\d/.test(key)) return "contains-digits";
  if (stopwords.has(key.toLowerCase())) return "common-word";
  if (letters < MIN_LETTERS[script]) return "too-short";
  return null;
}

module.exports = {
  HEBREW_RE,
  ARABIC_RE,
  LATIN_RE,
  CATEGORIES,
  detectColumns,
  cleanName,
  extractRecords,
  DEFAULT_STOPWORDS,
  riskOf,
  latinLooksCorrupt,
  normalizeArabic,
  isSameName,
  SHEETS_WITHOUT_NATIVE_NAME,
  SETTLEMENT_SHEETS,
  arabicSkeleton,
  latinSkeleton,
};
