const {
  parseTranslationData,
  parseFirestoreDocuments,
  isWeekPassed,
  buildMatcher,
} = require("../../src/matcher");

describe("parseTranslationData", () => {
  test("maps translation->value pairs into a dict", () => {
    const out = parseTranslationData([
      { translation: "Israel", value: "Palestine" },
      { translation: "Tel Aviv", value: "Yafa" },
    ]);
    expect(out).toEqual({ Israel: "Palestine", "Tel Aviv": "Yafa" });
  });
  test("empty / missing input yields an empty dict", () => {
    expect(parseTranslationData([])).toEqual({});
    expect(parseTranslationData(undefined)).toEqual({});
  });
});

describe("parseFirestoreDocuments", () => {
  test("flattens Firestore REST docs into {value, translation} rows", () => {
    const body = {
      documents: [
        {
          name: "projects/p/databases/(default)/documents/words/a",
          fields: {
            value: { stringValue: "Yafa" },
            translation: { stringValue: "Tel Aviv" },
          },
        },
      ],
    };
    expect(parseFirestoreDocuments(body)).toEqual([
      { value: "Yafa", translation: "Tel Aviv" },
    ]);
  });

  test("drops docs missing either field, and handles empty/missing bodies", () => {
    const body = {
      documents: [
        { fields: { value: { stringValue: "Yafa" } } }, // no translation
        { fields: { translation: { stringValue: "Tel Aviv" } } }, // no value
        {}, // no fields at all
      ],
    };
    expect(parseFirestoreDocuments(body)).toEqual([]);
    expect(parseFirestoreDocuments({})).toEqual([]);
    expect(parseFirestoreDocuments(undefined)).toEqual([]);
  });
});

describe("isWeekPassed", () => {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  test("true when more than a week has elapsed", () => {
    const now = 1_000_000_000_000;
    expect(isWeekPassed(now - WEEK - 1, now)).toBe(true);
  });
  test("false when within the week", () => {
    const now = 1_000_000_000_000;
    expect(isWeekPassed(now - 1000, now)).toBe(false);
  });
});

describe("buildMatcher", () => {
  test("returns null for an empty dictionary", () => {
    expect(buildMatcher({})).toBeNull();
    expect(buildMatcher(null)).toBeNull();
  });

  test("replaces case-insensitively", () => {
    const m = buildMatcher({ israel: "Palestine" });
    expect(m.apply("I live in Israel.")).toBe("I live in Palestine.");
    expect(m.apply("ISRAEL")).toBe("Palestine");
  });

  test("longest key wins (length-descending order)", () => {
    const m = buildMatcher({ tel: "SHORT", "tel aviv": "Yafa" });
    expect(m.apply("visiting tel aviv today")).toBe("visiting Yafa today");
  });

  test("escapes regex metacharacters in keys", () => {
    const m = buildMatcher({ "a.b": "X" });
    expect(m.apply("a.b")).toBe("X");
    expect(m.apply("axb")).toBe("axb");
  });

  test("Unicode-aware boundaries: matches a standalone Arabic word", () => {
    const m = buildMatcher({ "يافا": "Jaffa" });
    expect(m.apply("زرت يافا اليوم")).toBe("زرت Jaffa اليوم");
  });

  test("does not match inside a longer word", () => {
    const m = buildMatcher({ tel: "X" });
    expect(m.apply("telephone")).toBe("telephone");
  });

  test("matches() is a stateless guard", () => {
    const m = buildMatcher({ israel: "Palestine" });
    expect(m.matches("about Israel")).toBe(true);
    expect(m.matches("about Israel")).toBe(true); // no lastIndex drift
    expect(m.matches("nothing here")).toBe(false);
  });

  test("regex carries global, ignore-case, unicode flags", () => {
    const m = buildMatcher({ x: "y" });
    expect(m.regex.flags).toContain("g");
    expect(m.regex.flags).toContain("i");
    expect(m.regex.flags).toContain("u");
  });

  test("apply reports each replacement via the onMatch collector", () => {
    const m = buildMatcher({ israel: "Palestine", tel: "X" });
    const seen = [];
    m.apply("Israel and tel", (matched, replacement) =>
      seen.push([matched, replacement])
    );
    expect(seen).toEqual([
      ["Israel", "Palestine"],
      ["tel", "X"],
    ]);
  });
});
