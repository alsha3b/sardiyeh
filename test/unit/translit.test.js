/**
 * The seeder never ships these guesses straight to users, but they are the
 * starting point a reviewer edits, so the obvious cases need to come out right.
 */
const {
  arToLatin,
  hebToLatin,
  latinToHebrew,
  arabicToHebrew,
} = require("../../tools/lib/translit.js");

describe("arabicToHebrew", () => {
  it("maps letter for letter, since both scripts skip short vowels", () => {
    expect(arabicToHebrew("وادي حنين")).toBe("ואדי חנין");
    expect(arabicToHebrew("دير ياسين")).toBe("דיר יאסין");
  });

  it("splits the definite article off with a hyphen", () => {
    expect(arabicToHebrew("أم الفحم")).toBe("אם אל-פחם");
    expect(arabicToHebrew("الخليل")).toBe("אל-ח'ליל");
  });

  it("writes sounds Hebrew lacks with a geresh", () => {
    expect(arabicToHebrew("خربة")).toBe("ח'רבה");
    expect(arabicToHebrew("غزة")).toBe("ע'זה");
    expect(arabicToHebrew("البريج")).toBe("אל-בריג'");
  });

  it("uses final letter forms", () => {
    expect(arabicToHebrew("أم")).toBe("אם");
    expect(arabicToHebrew("حنين")).toBe("חנין");
  });

  it("does not inherit the OCR damage in english_translit", () => {
    // The workbook's Latin for أم الريحية reads "Umm er-Rihlya" — an i scanned
    // as an l. Going via the Arabic never sees it.
    expect(arabicToHebrew("أم الريحية")).toBe("אם אל-ריחיה");
    expect(latinToHebrew("Umm er-Rihlya")).toContain("ל");
  });

  it("returns empty for empty input", () => {
    expect(arabicToHebrew("")).toBe("");
    expect(arabicToHebrew(null)).toBe("");
  });
});

describe("latinToHebrew", () => {
  it("carries a word-initial vowel on an aleph", () => {
    expect(latinToHebrew("Ibrahim")).toBe("איברהים");
    expect(latinToHebrew("Umm")).toBe("אום");
  });

  it("drops short medial a/e but keeps i/u/o", () => {
    // "Salim": the a goes unwritten, the i is a yod.
    expect(latinToHebrew("Salim")).toBe("סלים");
  });

  it("uses final letter forms", () => {
    expect(latinToHebrew("Simsim").endsWith("ם")).toBe(true);
    expect(latinToHebrew("Hasan").endsWith("ן")).toBe(true);
  });

  it("collapses geminated consonants", () => {
    expect(latinToHebrew("‘Attin")).toBe("עתין");
  });

  it("keeps the Arabic article as its own hyphenated unit", () => {
    expect(latinToHebrew("el-Bureij")).toBe("אל-בורייג'");
  });

  it("closes a name ending in -a with a he rather than a final form", () => {
    expect(latinToHebrew("Zanna")).toBe("זנה");
  });

  it("maps emphatics and ayin to their conventional Hebrew letters", () => {
    expect(latinToHebrew("ʿAkka")).toBe("עכה");
    expect(latinToHebrew("Khalil")).toBe("חליל");
  });

  it("returns empty for empty input", () => {
    expect(latinToHebrew("")).toBe("");
    expect(latinToHebrew(null)).toBe("");
  });
});

describe("arToLatin", () => {
  it("romanises an Arabic rendering of a Hebrew name", () => {
    expect(arToLatin("عرڤوت")).toBe("Arvot");
    expect(arToLatin("روجيل")).toBe("Rojil");
  });

  it("collapses a mater lectionis doubling a written vowel", () => {
    expect(arToLatin("عادا")).toBe("Ada");
  });

  it("keeps multi-word names as separate capitalised words", () => {
    expect(arToLatin("كفار شاؤول").split(" ")).toHaveLength(2);
  });

  it("strips harakat", () => {
    expect(arToLatin("بَعَنا")).toBe(arToLatin("بعنا"));
  });
});

describe("hebToLatin", () => {
  it("reads matres lectionis as vowels", () => {
    expect(hebToLatin("שלומי")).toBe("Shlomi");
  });

  it("makes ב and פ plosive word-initially", () => {
    expect(hebToLatin("בית")).toBe("Bit");
    expect(hebToLatin("פארן")).toBe("Parn");
  });

  it("leaves a bare consonant skeleton when no vowels are written", () => {
    // "Parn" above and "Avrhm" here are the honest output: Hebrew simply does
    // not record the missing vowels. This is exactly why `la` keys are
    // quarantined for review instead of seeded.
    expect(hebToLatin("אברהם")).toBe("Avrhm");
  });
});
