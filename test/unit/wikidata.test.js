const {
  parsePoint,
  inRegion,
  parseTsv,
  buildLabelQuery,
  chunk,
  runQuery,
} = require("../../tools/lib/wikidata.js");

describe("parsePoint", () => {
  it("reads WKT in Wikidata's lon-then-lat order", () => {
    expect(parsePoint("Point(35.075 32.928)")).toEqual({ lon: 35.075, lat: 32.928 });
  });

  it("returns null for anything else", () => {
    expect(parsePoint("")).toBeNull();
    expect(parsePoint("somewhere")).toBeNull();
  });
});

describe("inRegion", () => {
  it("accepts a point in historic Palestine", () => {
    expect(inRegion({ lat: 32.928, lon: 35.075 })).toBe(true); // Acre
  });

  it("rejects a same-named place elsewhere", () => {
    expect(inRegion({ lat: 31.63, lon: -7.99 })).toBe(false); // Marrakesh
    expect(inRegion(null)).toBe(false);
  });
});

describe("parseTsv", () => {
  it("strips angle brackets, quotes and language tags", () => {
    const rows = parseTsv(
      "?item\t?he\t?en\n" +
        '<http://www.wikidata.org/entity/Q430776>\t"נצרת"@he\t"Nazareth"@en'
    );
    expect(rows).toEqual([
      { item: "http://www.wikidata.org/entity/Q430776", he: "נצרת", en: "Nazareth" },
    ]);
  });

  it("strips a datatype suffix", () => {
    const rows = parseTsv("?coord\n\"Point(35.0 32.0)\"^^<http://www.opengis.net/ont/geosparql#wktLiteral>");
    expect(rows[0].coord).toBe("Point(35.0 32.0)");
  });

  it("returns nothing for a header-only result", () => {
    expect(parseTsv("?item\n")).toEqual([]);
    expect(parseTsv("")).toEqual([]);
  });
});

describe("buildLabelQuery", () => {
  it("asks for the other two scripts alongside the matched label", () => {
    const q = buildLabelQuery(["נצרת"], "he");
    expect(q).toContain('"נצרת"@he');
    expect(q).toContain('lang(?ar)="ar"');
    expect(q).toContain('lang(?en)="en"');
    expect(q).not.toContain('lang(?he)="he"');
  });

  it("escapes quotes so a name cannot break out of the literal", () => {
    expect(buildLabelQuery(['a"b'], "en")).toContain('"a\\"b"@en');
  });
});

describe("chunk", () => {
  it("splits into batches without losing anything", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 10)).toEqual([]);
  });
});

describe("runQuery", () => {
  const ok = (body) => ({ ok: true, status: 200, text: async () => body, headers: new Map() });

  it("sends the query as a POST and parses the result", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(init);
      return ok('?item\n"x"');
    };
    const rows = await runQuery("SELECT ?item WHERE {}", { fetchImpl });
    expect(rows).toEqual([{ item: "x" }]);
    expect(calls[0].method).toBe("POST");
    // The endpoint asks callers to identify themselves.
    expect(calls[0].headers["User-Agent"]).toMatch(/sardiya/i);
  });

  it("retries a server error, then succeeds", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      if (n < 3) {
        return { ok: false, status: 503, text: async () => "busy", headers: { get: () => "0" } };
      }
      return ok('?item\n"y"');
    };
    const rows = await runQuery("SELECT ?item WHERE {}", { fetchImpl, retries: 3 });
    expect(rows).toEqual([{ item: "y" }]);
    expect(n).toBe(3);
  });

  it("gives up on a query the endpoint rejects outright", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 400,
      text: async () => "malformed",
      headers: { get: () => null },
    });
    await expect(runQuery("bad", { fetchImpl })).rejects.toThrow(/400/);
  });
});
