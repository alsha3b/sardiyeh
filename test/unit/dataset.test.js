/**
 * The gating in here is what stands between a 3,800-row OCR'd workbook and a
 * regex that rewrites every page the user visits, so it gets covered directly.
 */
const {
  detectColumns,
  cleanName,
  extractRecords,
  riskOf,
  CATEGORIES,
  DEFAULT_STOPWORDS,
  isSameName,
  normalizeArabic,
  latinLooksCorrupt,
} = require("../../tools/lib/dataset.js");

describe("isSameName", () => {
  it("treats a pair that is one name written twice as no rename", () => {
    expect(isSameName("تركيا", "تركيا")).toBe(true);
  });

  it("folds spelling variation the scanner introduced", () => {
    // چ/پ/ڤ are Persian letters the scan substituted for Arabic ones.
    expect(isSameName("هعوچن", "هعوجن")).toBe(true);
    expect(isSameName("مكة", "مكه")).toBe(true);
  });

  it("keeps a Hebraised name and its original apart", () => {
    // These share a consonant skeleton, but restoring the original spelling is
    // exactly what the extension exists to do.
    expect(isSameName("بلعام", "بلعمة")).toBe(false);
    expect(isSameName("جلوما", "جلمة")).toBe(false);
    expect(isSameName("كيسون", "كيسان")).toBe(false);
  });

  it("is false when either side is empty", () => {
    expect(isSameName("", "")).toBe(false);
    expect(isSameName("عكا", "")).toBe(false);
  });
});

describe("normalizeArabic", () => {
  it("unifies hamza carriers and ta marbuta", () => {
    expect(normalizeArabic("أحمد")).toBe(normalizeArabic("احمد"));
    expect(normalizeArabic("قرية")).toBe(normalizeArabic("قريه"));
  });
});

describe("latinLooksCorrupt", () => {
  it("catches the i-read-as-l damage", () => {
    expect(latinLooksCorrupt("زكريا", "Zakarlya")).toBeTruthy();
    expect(latinLooksCorrupt("أم الريحية", "Umm er-Rihlya")).toBeTruthy();
  });

  it("catches stray scanner artefacts", () => {
    expect(latinLooksCorrupt("معصوب", "Ma‘silb 7")).toMatchObject({ artefact: true });
    expect(latinLooksCorrupt("أرسوف", "Arsuf {el-Haram")).toMatchObject({ artefact: true });
  });

  it("passes rows where the two columns agree", () => {
    expect(latinLooksCorrupt("وادي حنين", "Wadi el-Hanin")).toBeNull();
    expect(latinLooksCorrupt("أم الفحم", "Umm el-Fahm")).toBeNull();
    expect(latinLooksCorrupt("دير ياسين", "Deir Yasin")).toBeNull();
  });

  it("is not fooled by the article assimilating in Latin", () => {
    // Arabic writes الشرقية; Latin writes "esh-Sharqiya".
    expect(latinLooksCorrupt("الشرقية", "esh-Sharqiya")).toBeNull();
  });

  it("returns null when either column is missing", () => {
    expect(latinLooksCorrupt("", "Zakarlya")).toBeNull();
    expect(latinLooksCorrupt("زكريا", "")).toBeNull();
  });
});

const HEADER = [
  "page",
  "arabic_name",
  "english_translit",
  "hebrew_name",
  "hebrew_translit_ar",
  "coordinates",
  "notes",
];

describe("detectColumns", () => {
  it("uses the header row when there is one", () => {
    const { map, dataStart, inferred } = detectColumns([HEADER, ["20", "إبراهيم", "Ibrahim", "אברהם", "افرهام", "1065.11", "…"]]);
    expect(inferred).toBe(false);
    expect(dataStart).toBe(1);
    expect(map.arabic_name).toBe(1);
    expect(map.hebrew_translit_ar).toBe(4);
  });

  it("tolerates a sheet missing optional columns", () => {
    const { map } = detectColumns([
      ["page", "arabic_name", "english_translit", "coordinates", "notes"],
      ["210", "أم بابين", "Umm Babein", "1581.27", "…"],
    ]);
    expect(map.hebrew_name).toBeUndefined();
    expect(map.coordinates).toBe(3);
  });

  it("infers a header-less sheet whose columns run right-to-left", () => {
    // This is the العيون (springs) sheet: no header, reversed column order.
    const rows = [
      ["شمالي غربي كفر برعم، تنبع في مجرى وادي ديشوم.", "1917.29", "عرڤوت", "ערבות", "Ibrāhīm", "ابراهيم", "374"],
      ["على الضفة الشمالية لوادي أبو جيلة، مياهها مرة لكنها تتحسن.", "1448.00", "أردون", "ארדון", "Abū Jīla", "أبو حيلة", "375"],
      ["وهي ثلاث آبار على بعد خمسة كيلومترات من مقطع الطريق.", "1408.97", "عادا", "עדה", "Ibn ‘Oda", "ابن عودة", "376"],
    ];
    const { map, dataStart, inferred } = detectColumns(rows);
    expect(inferred).toBe(true);
    expect(dataStart).toBe(0);
    expect(map).toMatchObject({
      notes: 0,
      coordinates: 1,
      hebrew_translit_ar: 2,
      hebrew_name: 3,
      english_translit: 4,
      arabic_name: 5,
    });
  });
});

describe("cleanName", () => {
  it("strips a settlement-type abbreviation off the front", () => {
    expect(cleanName("מ. כפר יובל", "he")).toMatchObject({ primary: "כפר יובל", prefix: "מ" });
    expect(cleanName("م. كفار يوفال", "ar")).toMatchObject({ primary: "كفار يوفال", prefix: "م" });
  });

  it("pulls a bracketed alternate spelling out as its own key", () => {
    expect(cleanName("מיכוור [מכויר]", "he")).toMatchObject({
      primary: "מיכוור",
      alternates: ["מכויר"],
    });
  });

  it("strips the abbreviation from alternates too", () => {
    expect(cleanName("ח. תתורה [ח. טנטורה]", "he")).toMatchObject({
      primary: "תתורה",
      alternates: ["טנטורה"],
    });
  });

  it("flags and cleans unmatched OCR bracket debris", () => {
    expect(cleanName(") זות", "he")).toMatchObject({ primary: "זות", dirty: true });
  });

  it("collapses newlines the workbook embeds in cells", () => {
    expect(cleanName("كفار\r\n شاؤول", "ar").primary).toBe("كفار شاؤول");
  });

  it("never reports an alternate identical to the primary", () => {
    expect(cleanName("البيضا (البيضا)", "ar").alternates).toEqual([]);
  });

  it("returns empty for a blank cell", () => {
    expect(cleanName("", "ar")).toMatchObject({ primary: "", alternates: [] });
  });
});

describe("extractRecords", () => {
  const workbook = [
    {
      name: "الأبار",
      rows: [
        HEADER,
        ["20", "إبراهيم", "Ibrahim", "אברהם", "افرهام", "1065.11", "بئر في عسقلان"],
        ["", "", "", "", "", "", ""],
        ["21", "ابن عودة", "Ibn ‘Oda", "עדה", "عادا", "1400.97", "قرب وادي الجرافي"],
      ],
    },
  ];

  it("keeps only rows carrying a name and tags them with the sheet category", () => {
    const { records, sheets } = extractRecords(workbook);
    expect(records).toHaveLength(2);
    expect(records[0].category).toEqual(CATEGORIES["الأبار"]);
    expect(records[0].arabicName.primary).toBe("إبراهيم");
    expect(records[0].hebrewAr.primary).toBe("افرهام");
    expect(sheets[0]).toMatchObject({ name: "الأبار", inferred: false, kept: 2 });
  });

  it("drops rows with no Arabic and no Hebrew name", () => {
    const { records } = extractRecords([
      { name: "الأبار", rows: [HEADER, ["20", "", "Ibrahim", "", "", "1065.11", "note"]] },
    ]);
    expect(records).toHaveLength(0);
  });
});

describe("riskOf", () => {
  const stopwords = new Set(DEFAULT_STOPWORDS.map((w) => w.toLowerCase()));

  it("passes a normal place name", () => {
    expect(riskOf("افرهام", "ar", stopwords)).toBeNull();
    expect(riskOf("כפר יובל", "he", stopwords)).toBeNull();
  });

  it("holds keys too short to be safe in running text", () => {
    expect(riskOf("עדה", "he", stopwords)).toBe("too-short");
    expect(riskOf("عادا", "ar", stopwords)).toBeNull();
    // Latin needs one letter more than the abjads.
    expect(riskOf("Ada", "la", stopwords)).toBe("too-short");
  });

  it("holds settlement names that are also everyday words", () => {
    expect(riskOf("ים", "he", stopwords)).toBe("common-word");
    expect(riskOf("بيت", "ar", stopwords)).toBe("common-word");
    expect(riskOf("Khirbet", "la", stopwords)).toBe("common-word");
  });

  it("rejects keys with no letters in the expected script", () => {
    expect(riskOf("Ibrahim", "he", stopwords)).toBe("no-letters-in-expected-script");
    expect(riskOf("---", "ar", stopwords)).toBe("no-letters-in-expected-script");
  });

  it("rejects keys carrying digits", () => {
    expect(riskOf("כפר יובל 2", "he", stopwords)).toBe("contains-digits");
  });
});
