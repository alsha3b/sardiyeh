// Wikidata query helpers.
//
// The workbook is missing two of the six name forms the extension wants, and
// machine transliteration can only guess at them. Wikidata holds both as real
// labels, so this module exists to go and fetch them:
//
//   join on hebrew_name -> the Israeli entity  -> its `en` label is the Israeli
//                                                 name in Latin (a key form)
//   join on arabic_name -> the Palestinian entity -> its `en` and `he` labels
//                                                 are the native name in Latin
//                                                 and Hebrew (value forms)
//
// Queries go through the public SPARQL endpoint, which asks for a descriptive
// User-Agent and a modest request rate. Matching by label keeps each query on
// the label index; the transitive `P31/P279*` class filters that read more
// naturally all time out at this scale.

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "sardiya-dictionary-seeder/1.0 (https://github.com/alsha3b/sardiya; contact: baselsader@protonmail.com)";

// Historic Palestine, generously bounded. Label matching alone would happily
// return a village in Morocco that shares a name, so every hit is checked
// against this box before it is trusted.
const REGION = { minLon: 34.2, maxLon: 35.95, minLat: 29.4, maxLat: 33.4 };

/** Parse a WKT point as Wikidata returns it: "Point(lon lat)". */
function parsePoint(wkt) {
  const m = /Point\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/.exec(String(wkt || ""));
  return m ? { lon: Number(m[1]), lat: Number(m[2]) } : null;
}

function inRegion(point) {
  if (!point) return false;
  return (
    point.lon >= REGION.minLon &&
    point.lon <= REGION.maxLon &&
    point.lat >= REGION.minLat &&
    point.lat <= REGION.maxLat
  );
}

/** Strip SPARQL TSV decoration: angle brackets, quotes, language tags. */
function stripCell(cell) {
  let s = String(cell == null ? "" : cell).trim();
  if (s.startsWith("<") && s.endsWith(">")) return s.slice(1, -1);
  s = s.replace(/\^\^<[^>]*>$/, "").replace(/@[\w-]+$/, "");
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function parseTsv(text) {
  const lines = String(text || "").trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split("\t").map((h) => h.replace(/^\?/, ""));
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row = {};
    header.forEach((h, i) => { row[h] = stripCell(cells[i]); });
    return row;
  });
}

const escapeLiteral = (s) => String(s).replace(/[\\"]/g, "\\$&");

/**
 * A query that looks up `names` as labels in `lang` and returns each matching
 * entity's coordinates plus its labels in the other two scripts.
 */
function buildLabelQuery(names, lang) {
  const others = ["he", "ar", "en"].filter((l) => l !== lang);
  const values = names.map((n) => `"${escapeLiteral(n)}"@${lang}`).join(" ");
  return `SELECT ?item ?match ?coord ${others.map((l) => `?${l}`).join(" ")} WHERE {
  VALUES ?match { ${values} }
  ?item rdfs:label ?match ; wdt:P625 ?coord .
${others.map((l) => `  OPTIONAL { ?item rdfs:label ?${l} . FILTER(lang(?${l})="${l}") }`).join("\n")}
}`;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * POST one SPARQL query, retrying on the endpoint's overload responses.
 * Returns parsed TSV rows.
 */
async function runQuery(query, { retries = 4, fetchImpl = fetch } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query; charset=utf-8",
        Accept: "text/tab-separated-values",
        "User-Agent": USER_AGENT,
      },
      body: query,
    });
    if (res.ok) return parseTsv(await res.text());
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(`SPARQL ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    // Honour Retry-After when the endpoint sends one — including 0, which means
    // "go ahead now" — and fall back to exponential backoff when it does not.
    const after = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(after) && after >= 0 ? after * 1000 : 2000 * 2 ** attempt);
  }
}

module.exports = {
  ENDPOINT,
  USER_AGENT,
  REGION,
  parsePoint,
  inRegion,
  parseTsv,
  stripCell,
  buildLabelQuery,
  chunk,
  runQuery,
  sleep,
};
