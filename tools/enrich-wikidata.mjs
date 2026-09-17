// Fill the workbook's two missing name forms from Wikidata instead of guessing
// them, and write the result to .data/wikidata.enrichment.json for
// `seed-from-xlsx.mjs` to consume.
//
// Usage:
//   npm run enrich:wikidata              # query, cache, report
//   npm run enrich:wikidata -- --refresh # ignore the cache and re-query
//   npm run enrich:wikidata -- --limit=200
//
// WHAT WIKIDATA IS AND IS NOT ASKED FOR
//
// Wikidata names a place by whatever is currently official. There is one entity
// covering both بيسان and the Israeli city built on it, and its labels are
// "Beit She'an" / בית שאן. So searching Wikidata for the Arabic name does NOT
// return the native name — it returns the coloniser's name attached to an
// entity that happens to answer to the Arabic one. Taking those labels as the
// native form produces exactly the inversion this extension exists to undo.
//
// Therefore Wikidata is asked for one thing only:
//
//   hebrew_name -> the Israeli locality -> its `en` label is the ISRAELI NAME
//                  IN LATIN ("Beit She'an", "Ma'ale Adumim"), the one key form
//                  the workbook never had.
//
// The native name always comes from the workbook, which is the authority on it:
// `arabic_name` for Arabic, `english_translit` for Latin ("Bisan"), and a 1:1
// abjad mapping of `arabic_name` for Hebrew. The one thing Wikidata may add on
// the native side is a Hebrew rendering — and only when it demonstrably renders
// the Arabic AND is not simply the Israeli name over again.
//
// Every hit is checked before it is trusted:
//   - it must sit inside historic Palestine (label matching alone will happily
//     return a same-named village in Morocco)
//   - the workbook's own grid reference must put it within MAX_KM (this is what
//     separates باب الخليل, a gate in Jerusalem, from الخليل, a city 30 km off)
//   - the label must render the name it was matched on, not rename it
//     (أرسوف is labelled אפולוניה — Apollonia, a different name entirely)
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { readWorkbook } from "./lib/xlsx.js";
import {
  extractRecords,
  SHEETS_WITHOUT_NATIVE_NAME,
  arabicSkeleton,
  latinSkeleton,
  isSameName,
} from "./lib/dataset.js";
import { buildLabelQuery, chunk, runQuery, parsePoint, inRegion, sleep } from "./lib/wikidata.js";
import { hebToLatin } from "./lib/translit.js";
import { coordToWgs84, distanceKm } from "./lib/palgrid.js";

const BATCH = 150;
const PAUSE_MS = 900; // the public endpoint asks for a modest sustained rate
// The grid approximation is good to ~2 km, so this gate rejects a wrong place
// without discarding a right one.
const MAX_KM = 5;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", ".data");
const CACHE = join(DATA_DIR, "wikidata.cache.json");
const OUT = join(DATA_DIR, "wikidata.enrichment.json");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const OPTS = {
  file: resolve(opt("file", join(DATA_DIR, "data.xlsx"))),
  limit: Number(opt("limit", "0")) || 0,
  refresh: flag("refresh"),
};

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

/**
 * Look every name up as a label in `lang`, in batches, keeping only entities
 * inside the region. Returns Map(name -> [entity, ...]).
 */
async function lookup(names, lang, cache, label) {
  const pending = OPTS.refresh ? names : names.filter((n) => !cache[`${lang}:${n}`]);
  const batches = chunk(pending, BATCH);
  if (batches.length) {
    process.stdout.write(`  ${label}: ${pending.length} names in ${batches.length} batches `);
  }
  for (const [i, batch] of batches.entries()) {
    const rows = await runQuery(buildLabelQuery(batch, lang));
    // Seed every queried name so a miss is cached as a miss, not re-queried.
    for (const name of batch) cache[`${lang}:${name}`] = cache[`${lang}:${name}`] || [];
    for (const row of rows) {
      const point = parsePoint(row.coord);
      if (!inRegion(point)) continue;
      cache[`${lang}:${row.match}`] = cache[`${lang}:${row.match}`] || [];
      cache[`${lang}:${row.match}`].push({
        qid: row.item.split("/").pop(),
        he: row.he || "",
        ar: row.ar || "",
        en: row.en || "",
        lat: point.lat,
        lon: point.lon,
      });
    }
    process.stdout.write(".");
    if (i < batches.length - 1) await sleep(PAUSE_MS);
  }
  if (batches.length) process.stdout.write("\n");

  const out = new Map();
  for (const name of names) out.set(name, cache[`${lang}:${name}`] || []);
  return out;
}

/**
 * Strip Wikidata's disambiguating qualifier: "עמוריה (נפת שכם)" is stored that
 * way to separate it from other places called עמוריה, but only "עמוריה" is the
 * name, and only the name may ever reach a page.
 */
function cleanLabel(label) {
  return String(label || "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s*,\s*[^,]+$/, "")
    .trim();
}

// Labels that describe a facility standing at a place rather than naming the
// place: "Akhziv National Park" is the park on الزيب, not a settlement name, and
// putting it in the dictionary would have the extension rewriting park signage.
const NOT_A_PLACE_NAME =
  /\b(national park|nature reserve|archaeological site|railway station|train station|junction|interchange|regional council|industrial|airport|reservoir|museum|kibbutz|moshav)\b/i;

/** Reduce any of the three scripts to a bare consonant skeleton. */
function skeletonOf(text, script) {
  if (script === "ar") return arabicSkeleton(text);
  const latin =
    script === "he"
      // Maqaf (U+05BE) and the geresh variants stand in for hyphens here and
      // must not be read as letters.
      ? hebToLatin(String(text).replace(/[־׳״'"]/g, "-"))
      : String(text);
  // Hebrew ב is read as both b and v depending on position, so أبو شوشة comes
  // back as "Avo Shosh". Fold them together or every ب/ב pair looks like a
  // mismatch.
  return latinSkeleton(latin).replace(/[aeiou]/g, "").replace(/v/g, "b");
}

/**
 * Do these two strings spell the same name, or two different names?
 *
 * This is the guard that keeps the coloniser's name out of the replacement.
 * Wikidata labels a Palestinian entity with whatever is current and official,
 * so بيسان comes back as "Beit She'an" and أرسوف as אפולוניה — correct for an
 * encyclopaedia, exactly backwards for this dictionary. Comparing consonant
 * skeletons by subsequence overlap tolerates the vowels each script supplies
 * while still separating a rendering from a renaming.
 */
function looksLikeSameName(a, aScript, b, bScript) {
  const x = skeletonOf(a, aScript);
  const y = skeletonOf(b, bScript);
  if (!x || !y) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i / short.length >= 0.6;
}

/**
 * Choose among same-named entities, and reject any that the workbook's own
 * grid reference places somewhere else entirely.
 */
function pickBest(candidates, home, maxKm) {
  const near = home
    ? candidates
        .map((c) => ({ c, km: distanceKm(home, { lat: c.lat, lon: c.lon }) }))
        .filter((x) => x.km <= maxKm)
        .sort((x, y) => x.km - y.km)
    : candidates.map((c) => ({ c, km: null }));
  if (!near.length) return null;
  // With no coordinate to arbitrate, an ambiguous name is not a match.
  if (!home && candidates.length > 1) return null;
  return near[0];
}

async function main() {
  const { records } = extractRecords(readWorkbook(OPTS.file));
  const usable = records.filter((r) => !SHEETS_WITHOUT_NATIVE_NAME.has(r.sheet));
  const rows = OPTS.limit ? usable.slice(0, OPTS.limit) : usable;

  const hebrewNames = [...new Set(rows.map((r) => r.hebrewName.primary).filter(Boolean))];
  const arabicNames = [...new Set(rows.map((r) => r.arabicName.primary).filter(Boolean))];

  console.log(`Records: ${rows.length}`);
  console.log(`Unique Hebrew names: ${hebrewNames.length}   Arabic names: ${arabicNames.length}`);
  console.log("Querying Wikidata (cached between runs; --refresh to ignore)…");

  const cache = OPTS.refresh ? {} : await readJson(CACHE, {});
  const israeli = await lookup(hebrewNames, "he", cache, "Israeli entities  ");
  const native = await lookup(arabicNames, "ar", cache, "Palestinian entities");
  await writeFile(CACHE, JSON.stringify(cache));

  const enrichment = [];
  const stats = {
    withGrid: 0,
    israeliMatched: 0,
    nativeMatched: 0,
    rejectedFarAway: 0,
    israeliLatin: 0,
    nativeHebrew: 0,
    rejectedNotRendering: 0,
    rejectedIsIsraeliName: 0,
    rejectedNotAName: 0,
  };

  for (const r of rows) {
    const heName = r.hebrewName.primary;
    const arName = r.arabicName.primary;
    const home = coordToWgs84(r.coordinates);
    if (home) stats.withGrid++;

    const heHits = israeli.get(heName) || [];
    const arHits = native.get(arName) || [];
    const isr = pickBest(heHits, home, MAX_KM);
    const nat = pickBest(arHits, home, MAX_KM);
    if ((heHits.length && !isr) || (arHits.length && !nat)) stats.rejectedFarAway++;
    if (!isr && !nat) continue;
    if (isr) stats.israeliMatched++;
    if (nat) stats.nativeMatched++;

    const entry = { hebrew_name: heName, arabic_name: arName, sheet: r.sheet };
    if (home) entry.book_position = { lat: +home.lat.toFixed(5), lon: +home.lon.toFixed(5) };

    // THE KEY SIDE — the one thing Wikidata is authoritative for here.
    if (isr) {
      entry.israeli = { qid: isr.c.qid, km: isr.km == null ? null : +isr.km.toFixed(2) };
      const en = cleanLabel(isr.c.en);
      if (en && NOT_A_PLACE_NAME.test(en)) {
        entry.israeli_latin_rejected = en;
        stats.rejectedNotAName++;
      } else if (en && looksLikeSameName(en, "la", heName, "he")) {
        entry.israeli_latin = en;
        stats.israeliLatin++;
      } else if (en) {
        entry.israeli_latin_rejected = en;
        stats.rejectedNotRendering++;
      }
    }

    // THE VALUE SIDE — only a Hebrew rendering, and only if it is genuinely the
    // native name rather than the Israeli one wearing Hebrew letters. بيسان's
    // entity offers בית שאן, which is just hebrew_name again.
    if (nat) {
      entry.native = { qid: nat.c.qid, km: nat.km == null ? null : +nat.km.toFixed(2) };
      const he = cleanLabel(nat.c.he);
      if (!he) {
        // nothing offered
      } else if (isSameName(he, heName) || looksLikeSameName(he, "he", heName, "he")) {
        entry.native_hebrew_rejected = he;
        entry.native_hebrew_rejected_why = "is the Israeli name";
        stats.rejectedIsIsraeliName++;
      } else if (looksLikeSameName(he, "he", arName, "ar")) {
        entry.native_hebrew = he;
        stats.nativeHebrew++;
      } else {
        entry.native_hebrew_rejected = he;
        entry.native_hebrew_rejected_why = "does not render the Arabic";
        stats.rejectedNotRendering++;
      }
    }

    enrichment.push(entry);
  }

  await writeFile(OUT, JSON.stringify(enrichment, null, 1));

  const pct = (n) => `${n} (${((100 * n) / rows.length).toFixed(1)}%)`;
  console.log("\n" + "─".repeat(72));
  console.log(`Rows with a usable grid reference: ${pct(stats.withGrid)}`);
  console.log(`Matched an Israeli entity:         ${pct(stats.israeliMatched)}`);
  console.log(`Matched a Palestinian entity:      ${pct(stats.nativeMatched)}`);
  console.log(`Rejected — named right, wrong place: ${stats.rejectedFarAway}`);
  console.log();
  console.log("AUTHORITATIVE FORMS RECOVERED");
  console.log(`  Israeli name in Latin (key):     ${pct(stats.israeliLatin)}`);
  console.log(`  Native name in Hebrew (value):   ${pct(stats.nativeHebrew)}`);
  console.log();
  console.log("  The native name in Latin is NOT taken from Wikidata — the workbook's");
  console.log("  english_translit is the authority (\"Bisan\", where Wikidata says");
  console.log("  \"Beit She'an\"). The seeder pairs the two.");
  console.log();
  console.log("REJECTED");
  console.log(
    `  ${stats.rejectedNotRendering} labels that name the place differently rather than` +
      ` rendering it\n     (بيسان → "Beit She'an", أرسوف → אפולוניה — the coloniser's name)`
  );
  console.log(
    `  ${stats.rejectedIsIsraeliName} Hebrew labels that were just the Israeli name again` +
      ` (بيسان → בית שאן)`
  );
  console.log(
    `  ${stats.rejectedNotAName} labels naming a facility, not a place` +
      ` ("Akhziv National Park")`
  );
  console.log("─".repeat(72));
  console.log(`Wrote ${OUT}`);
  console.log("Re-run `npm run seed:xlsx` to fold these into the seed plan.");
}

main().catch((err) => {
  console.error("Enrichment failed:", err.message);
  process.exit(1);
});
