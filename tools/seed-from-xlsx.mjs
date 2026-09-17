// Seed the Firestore `words` collection from the multi-sheet place-name
// workbook in .data/.
//
// Usage:
//   npm run seed:xlsx                 # dry run — writes nothing, prints a report
//   npm run seed:xlsx -- --commit     # write the safe pairs to Firestore
//   npm run seed:xlsx -- --verify     # re-read Firestore and diff against the plan
//
// Options:
//   --file=PATH        workbook to read            (default .data/data.xlsx)
//   --channels=a,b     any of ar,he,la             (default all three)
//   --limit=N          only process the first N records (smoke tests)
//   --commit           actually write; requires GOOGLE_APPLICATION_CREDENTIALS
//   --verify           after writing (or on its own) compare Firestore to the plan
//   --yes              skip the confirmation pause before writing
//   --approve=CH       bulk-approve one channel's clean derived keys into the
//                      allowlist (spot-check .data/review.derived-CH.json first)
//
// Replacement is script-preserving: a name found on a page is replaced with the
// native name written in the SAME script, so the reader always gets something
// they can read. That gives three channels:
//
//   ar   افرهام      -> إبراهيم   both sides are real columns   -> seeded
//   he   אברהם       -> אבראהים   value from arabic_name        -> review
//   la   Beit She'an -> Bisan     key from Wikidata             -> seeded
//
// Where each side comes from matters more than it looks, because the workbook
// was scanned and its `english_translit` column carries the damage: "Zakariya"
// arrived as "Zakarlya", "Deir Yasin" as "Deir Yast", "Ma‘sub" as "Ma‘silb 7".
// So each form is taken from whichever source actually knows it:
//
//   native name, Arabic  `arabic_name` — clean, the authority
//   native name, Latin   `english_translit`, but only on rows where it agrees
//                        with the Arabic (`latinLooksCorrupt` compares their
//                        consonant skeletons); otherwise the row is held back
//   native name, Hebrew  a 1:1 abjad mapping of `arabic_name` — never via the
//                        Latin, which would carry the scanner's errors through
//   Israeli name, Latin  absent from the workbook entirely; supplied by
//                        `enrich-wikidata.mjs`, and ONLY for settlement rows
//
// Wikidata is never asked for the native name. It labels a place by its current
// official name, so it answers بيسان with "Beit She'an" — the Israeli name. It
// supplies keys; the workbook supplies values.
//
// Two classes of row are rejected before any gating, because they are not a
// rename at all: sheets that list Israeli names with no native counterpart
// (الشوارع, a street list), and rows where both columns hold the same name.
//
// Nothing machine-generated, ambiguous, or dangerously short is ever written.
// Those land in bucketed .data/review.*.json files; approving an entry means
// copying it into .data/allowlist.json, which overrides every gate next run.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import { readWorkbook } from "./lib/xlsx.js";
import {
  extractRecords,
  riskOf,
  DEFAULT_STOPWORDS,
  isSameName,
  latinLooksCorrupt,
  SHEETS_WITHOUT_NATIVE_NAME,
  SETTLEMENT_SHEETS,
} from "./lib/dataset.js";
import { arToLatin, hebToLatin, arabicToHebrew } from "./lib/translit.js";

const COLLECTION = "words";
const BATCH_LIMIT = 400;
const PROJECT_ID = "sardiyeh-elmokhtbr";
const REST_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
  `/databases/(default)/documents/${COLLECTION}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", ".data");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const OPTS = {
  file: resolve(opt("file", join(DATA_DIR, "data.xlsx"))),
  channels: new Set(opt("channels", "ar,he,la").split(",").map((s) => s.trim())),
  limit: Number(opt("limit", "0")) || 0,
  commit: flag("commit"),
  verify: flag("verify"),
  yes: flag("yes"),
  approve: opt("approve", ""),
};

// Firestore doc ids may not contain "/", may not be "." or "..", may not match
// __.*__, and cap at 1500 bytes.
function docIdFor(key) {
  let id = key.replace(/\//g, "_");
  if (id === "." || id === "..") id = `_${id}`;
  if (/^__.*__$/.test(id)) id = `_${id}`;
  while (Buffer.byteLength(id, "utf8") > 1500) id = id.slice(0, -1);
  return id;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

// Each channel names the script it operates in, where its key and value come
// from, and whether either side had to be invented.
const CHANNELS = {
  ar: {
    script: "ar",
    describe: "Israeli name in Arabic letters → native Arabic name",
    build: (r) => ({
      keys: [r.hebrewAr.primary, ...r.hebrewAr.alternates],
      value: r.arabicName.primary,
      derived: null,
    }),
  },
  he: {
    script: "he",
    // Derived from arabic_name, NOT english_translit. The Latin column is OCR'd
    // ("Zakariya" -> "Zakarlya") and every error in it propagated into the
    // Hebrew. Arabic and Hebrew are both abjads, so the letter mapping carries
    // across exactly what the source had and invents nothing.
    describe: "Hebrew name → native name in Hebrew letters",
    build: (r) => ({
      keys: [r.hebrewName.primary, ...r.hebrewName.alternates],
      value: (r.wikidata && r.wikidata.native_hebrew) || arabicToHebrew(r.arabicName.primary),
      derived: "value",
    }),
  },
  la: {
    script: "la",
    // Both sides come from the source that actually knows them:
    //   key   Wikidata's English label for the Israeli locality ("Beit She'an")
    //   value the workbook's english_translit ("Bisan")
    // Wikidata is NOT asked for the native name — it labels a place by its
    // current official name, so it would hand back the Israeli one. And the
    // workbook's Latin is only trusted when it agrees with the Arabic, since
    // the column is OCR'd. Rows failing either test yield a transliterated
    // guess instead, which stays in the review queue.
    describe: "Israeli name in Latin letters → native name in Latin letters",
    build: (r) => {
      // Only trust the Wikidata key on a settlement row; see SETTLEMENT_SHEETS.
      const authoritativeKey =
        SETTLEMENT_SHEETS.has(r.sheet) && r.wikidata && r.wikidata.israeli_latin;
      const latinIsClean = r.latin.primary && !latinLooksCorrupt(r.arabicName.primary, r.latin.primary);
      if (authoritativeKey && latinIsClean) {
        return { keys: [authoritativeKey], value: r.latin.primary, derived: null };
      }
      return {
        keys: [arToLatin(r.hebrewAr.primary), hebToLatin(r.hebrewName.primary)],
        value: latinIsClean ? r.latin.primary : "",
        derived: "key",
      };
    },
  },
};

/**
 * Turn records into candidate dictionary entries, one per (channel, key).
 * Alternate spellings from the source and the two independent romanisation
 * guesses in the `la` channel all become separate candidates for the same value.
 */
function buildCandidates(records, stats) {
  const candidates = [];
  for (const record of records) {
    // Some sheets list Israeli names only — there is no native name to restore.
    if (SHEETS_WITHOUT_NATIVE_NAME.has(record.sheet)) {
      stats.noNativeName++;
      continue;
    }
    // The pair has to be an actual rename. Compared on the Arabic originals
    // because that is where the distinction is legible: بلعام -> بلعمة is a
    // real restoration, تركيا -> تركيا is not.
    if (isSameName(record.hebrewAr.primary, record.arabicName.primary)) {
      stats.identity++;
      continue;
    }
    for (const [name, channel] of Object.entries(CHANNELS)) {
      if (!OPTS.channels.has(name)) continue;
      const { keys, value, derived } = channel.build(record);
      if (!value) continue;
      const seen = new Set();
      keys.filter(Boolean).forEach((key, index) => {
        if (seen.has(key) || key === value) return;
        seen.add(key);
        candidates.push({
          channel: name,
          script: channel.script,
          key,
          value,
          derived,
          // The second `la` key is the Hebrew-script romanisation — a weaker
          // guess than the Arabic-sourced one, which has written vowels.
          confidence: derived && index > 0 ? "low" : derived ? "medium" : "high",
          record,
        });
      });
    }
  }
  return candidates;
}

/**
 * Group candidates by key and decide, per key, whether it is seedable.
 *
 * A key is held back when it is risky (too short, or a common word that also
 * happens to name a settlement), when it was machine-derived, or when the
 * workbook gives it more than one distinct replacement — אברהם is a well, a
 * hill and a village, and only one of them can own the name.
 */
function plan(candidates, allowlist, stopwords) {
  const byKey = new Map();
  for (const c of candidates) {
    if (!byKey.has(c.key)) byKey.set(c.key, []);
    byKey.get(c.key).push(c);
  }

  const seed = [];
  const review = [];
  const dropped = [];

  for (const [key, group] of byKey) {
    const override = allowlist.get(key);
    const values = [...new Set(group.map((c) => c.value))];
    const reasons = [];

    const risk = riskOf(key, group[0].script, stopwords);
    if (risk) reasons.push(risk);
    if (group.some((c) => c.derived)) reasons.push(`derived-${group[0].channel}`);
    if (values.length > 1) reasons.push("ambiguous");

    if (override) {
      const chosen =
        group.find((c) => c.value === override.value) || group[0];
      seed.push(toDoc({ ...chosen, value: override.value }, ["allowlisted"]));
      continue;
    }
    if (!reasons.length) {
      seed.push(toDoc(group[0], []));
      continue;
    }
    if (reasons.includes("no-letters-in-expected-script") || reasons.includes("contains-digits")) {
      dropped.push({ key, reasons, values });
      continue;
    }
    review.push({
      key,
      script: group[0].script,
      channel: group[0].channel,
      reasons,
      candidates: group.map((c) => ({
        value: c.value,
        confidence: c.confidence,
        category: c.record.category.ar,
        categoryEn: c.record.category.en,
        sheet: c.record.sheet,
        page: c.record.page,
        coordinates: c.record.coordinates,
        arabic_name: c.record.arabicName.primary,
        english_translit: c.record.latin.primary,
        hebrew_name: c.record.hebrewName.primary,
        hebrew_translit_ar: c.record.hebrewAr.primary,
      })),
    });
  }
  return { seed, review, dropped };
}

/** One Firestore document. `value` + `translation` are what the extension reads. */
function toDoc(c, extra) {
  const r = c.record;
  const doc = {
    id: docIdFor(c.key),
    translation: c.key,
    value: c.value,
    script: c.script,
    channel: c.channel,
    category: r.category.ar,
    categoryEn: r.category.en,
    sheet: r.sheet,
    source: "data.xlsx",
  };
  if (c.derived) doc.derived = c.derived;
  if (extra.length) doc.flags = extra;
  if (r.page) doc.page = r.page;
  if (r.coordinates) doc.coordinates = r.coordinates;
  if (r.notes) doc.notes = r.notes;
  if (r.arabicName.primary) doc.arabic_name = r.arabicName.primary;
  if (r.latin.primary) doc.english_translit = r.latin.primary;
  if (r.hebrewName.primary) doc.hebrew_name = r.hebrewName.primary;
  if (r.hebrewAr.primary) doc.hebrew_translit_ar = r.hebrewAr.primary;
  return doc;
}

// ---------------------------------------------------------------------------
// Firestore
// ---------------------------------------------------------------------------

/** Read the whole collection over the public REST endpoint — no credentials. */
async function fetchExisting() {
  const docs = [];
  let token;
  do {
    const url = new URL(REST_BASE);
    url.searchParams.set("pageSize", "300");
    if (token) url.searchParams.set("pageToken", token);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore read failed: ${res.status}`);
    const body = await res.json();
    for (const d of body.documents || []) {
      docs.push({
        id: d.name.split("/").pop(),
        translation: d.fields?.translation?.stringValue ?? "",
        value: d.fields?.value?.stringValue ?? "",
      });
    }
    token = body.nextPageToken;
  } while (token);
  return docs;
}

/**
 * Fail before the confirmation prompt rather than after it — being asked to
 * approve 2,550 writes and then told the credentials are missing is a waste of
 * the reader's attention and teaches them to click through the prompt.
 */
function assertCredentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  throw new Error(
    "GOOGLE_APPLICATION_CREDENTIALS is not set — nothing was written.\n" +
      "  Point it at a service account key and re-run:\n" +
      "    export GOOGLE_APPLICATION_CREDENTIALS=\"$PWD/secrets/<key>.json\"\n" +
      "  Generate one at Firebase console → Project settings → Service accounts."
  );
}

async function commit(docs) {
  const { default: admin } = await import("firebase-admin");
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();

  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + BATCH_LIMIT)) {
      const { id, ...fields } = doc;
      batch.set(db.collection(COLLECTION).doc(id), {
        ...fields,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    written += Math.min(BATCH_LIMIT, docs.length - i);
    process.stdout.write(`\r  committed ${written}/${docs.length}`);
  }
  process.stdout.write("\n");
  return written;
}

/** Re-read the collection and confirm every planned doc landed intact. */
async function verify(docs) {
  const live = new Map((await fetchExisting()).map((d) => [d.id, d]));
  const missing = [];
  const mismatched = [];
  for (const doc of docs) {
    const got = live.get(doc.id);
    if (!got) missing.push(doc.id);
    else if (got.value !== doc.value || got.translation !== doc.translation) {
      mismatched.push({ id: doc.id, expected: doc.value, got: got.value });
    }
  }
  return { total: docs.length, live: live.size, missing, mismatched };
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

// A held key lands in exactly one bucket, worst problem first, because that
// determines how a human has to deal with it. One nine-thousand-entry file is
// not reviewable; four files with distinct jobs are.
//
//   ambiguous  the workbook offers several places by this name — pick one
//   risky      a real name that is also an everyday word — keep or discard
//   derived-*  a machine transliteration — spot-check, then bulk-approve
const BUCKETS = [
  { file: "review.ambiguous.json", match: (r) => r.reasons.includes("ambiguous") },
  {
    file: "review.risky.json",
    match: (r) => r.reasons.includes("too-short") || r.reasons.includes("common-word"),
  },
  { file: "review.derived-he.json", match: (r) => r.reasons.includes("derived-he") },
  { file: "review.derived-la.json", match: (r) => r.reasons.includes("derived-la") },
  { file: "review.other.json", match: () => true },
];

async function writeReviewBuckets(review) {
  const out = BUCKETS.map((b) => ({ ...b, items: [] }));
  for (const entry of review) {
    (out.find((b) => b.match(entry)) || out[out.length - 1]).items.push(entry);
  }
  for (const bucket of out) {
    if (!bucket.items.length) continue;
    await writeFile(join(DATA_DIR, bucket.file), JSON.stringify(bucket.items, null, 1));
  }
  return out.filter((b) => b.items.length).map((b) => ({ file: b.file, n: b.items.length }));
}

/**
 * Bulk-approve one channel's machine-derived keys.
 *
 * Only takes keys whose sole problem is that they were derived — anything also
 * ambiguous or risky still needs a human, so it stays behind.
 */
async function approveChannel(channel, review, allowRows) {
  const reason = `derived-${channel}`;
  const clean = review.filter(
    (r) => r.reasons.length === 1 && r.reasons[0] === reason && r.candidates.length
  );
  if (!clean.length) {
    console.log(`\nNothing to approve for channel "${channel}".`);
    return;
  }
  const existing = new Set(allowRows.map((r) => r.translation));
  const added = [];
  for (const entry of clean) {
    if (existing.has(entry.key)) continue;
    // Candidates are ordered by confidence; a single-value group means every
    // source row agreed, so the first one is the whole answer.
    const best = entry.candidates.find((c) => c.confidence !== "low") || entry.candidates[0];
    added.push({
      translation: entry.key,
      value: best.value,
      approvedFrom: reason,
      confidence: best.confidence,
    });
    existing.add(entry.key);
  }
  await writeFile(
    join(DATA_DIR, "allowlist.json"),
    JSON.stringify([...allowRows, ...added], null, 1)
  );
  console.log(
    `\nApproved ${added.length} "${channel}" keys into .data/allowlist.json` +
      ` (${review.length - clean.length} still need a human).` +
      `\nRe-run without --approve to see them in the seed plan.`
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const count = (items, key) =>
  items.reduce((acc, it) => acc.set(it[key], (acc.get(it[key]) || 0) + 1), new Map());

function report({ sheets, records, seed, review, dropped, existing, buckets, stats }) {
  const line = (s = "") => console.log(s);
  line("─".repeat(72));
  line(`Workbook: ${OPTS.file}`);
  line(`Sheets: ${sheets.length}   records: ${records.length}`);

  const guessed = sheets.filter((s) => s.inferred);
  if (guessed.length) {
    line();
    line("Sheets with no header row — column mapping was inferred, please check:");
    for (const s of guessed) {
      const cols = Object.entries(s.columns)
        .sort((a, b) => a[1] - b[1])
        .map(([f, i]) => `${i}:${f}`)
        .join("  ");
      line(`  ${s.name}  (${s.kept} rows)  ${cols}`);
    }
  }

  line();
  line("CHANNELS");
  for (const [name, ch] of Object.entries(CHANNELS)) {
    const mark = OPTS.channels.has(name) ? "on " : "off";
    line(`  [${mark}] ${name}  ${ch.describe}`);
  }

  line();
  line("WIKIDATA ENRICHMENT");
  if (!stats.enriched) {
    line("  none loaded — run `npm run enrich:wikidata` to fetch the Israeli");
    line("  name in Latin, the one key form the workbook does not contain");
  } else {
    line(`  ${stats.enriched} rows matched, ${stats.enrichedKeys} with an authoritative` +
         ` Israeli name in Latin`);
  }

  line();
  line("REJECTED BEFORE GATING");
  line(`  ${stats.noNativeName} rows from sheets that list Israeli names only` +
       ` (${[...SHEETS_WITHOUT_NATIVE_NAME].join(", ")})`);
  line(`  ${stats.identity} rows where the "rename" is the same name twice`);
  line(`  (${stats.latinSuspect} rows have english_translit that disagrees with` +
       ` the Arabic — scanner damage; not seeded from, reported for enrichment)`);

  line();
  line(`WOULD SEED: ${seed.length} docs`);
  for (const [ch, n] of count(seed, "channel")) line(`    ${ch}: ${n}`);
  const overlap = seed.filter((d) => existing.has(d.id));
  const changed = overlap.filter((d) => existing.get(d.id).value !== d.value);
  line(`    overwrites ${overlap.length} of the ${existing.size} existing docs` +
       (changed.length ? ` (${changed.length} with a DIFFERENT value)` : ""));
  for (const d of changed.slice(0, 10)) {
    line(`      ${d.translation}: "${existing.get(d.id).value}" → "${d.value}"`);
  }
  if (changed.length > 10) line(`      … and ${changed.length - 10} more`);

  line();
  line(`HELD FOR REVIEW: ${review.length} keys`);
  for (const b of buckets) line(`    ${String(b.n).padStart(5)}  .data/${b.file}`);
  for (const r of review.filter((x) => x.reasons.includes("ambiguous")).slice(0, 2)) {
    line(`    e.g. ${r.key}  (${r.reasons.join(", ")})`);
    for (const c of r.candidates) {
      line(`         → ${c.value}  [${c.category}/${c.categoryEn}]  p.${c.page || "?"}  ${c.coordinates || ""}`);
    }
  }

  if (dropped.length) {
    line();
    line(`DROPPED (unusable): ${dropped.length}`);
    for (const [reason, n] of count(dropped.map((d) => ({ r: d.reasons[0] })), "r")) {
      line(`    ${reason}: ${n}`);
    }
  }

  const bytes = Buffer.byteLength(JSON.stringify(seed), "utf8");
  line();
  line(`Payload: ~${(bytes / 1024 / 1024).toFixed(2)} MB of document JSON.`);
  line("  The extension downloads the whole collection weekly — if this is too");
  line("  heavy, re-run with metadata trimmed or drop the `notes` field.");
  line();
  line("NEXT");
  line("  .data/review.ambiguous.json  one place per name — pick a value by hand");
  line("  .data/review.risky.json      real names that are also everyday words");
  line("  .data/review.derived-*.json  machine guesses — spot-check, then");
  line("                               `npm run seed:xlsx -- --approve=he`");
  line("  Approve by appending {\"translation\":…, \"value\":…} to .data/allowlist.json.");
  line("─".repeat(72));
}

// ---------------------------------------------------------------------------

async function main() {
  const workbook = readWorkbook(OPTS.file);
  const { records: allRecords, sheets } = extractRecords(workbook);
  const records = OPTS.limit ? allRecords.slice(0, OPTS.limit) : allRecords;

  const allowRows = await readJson(join(DATA_DIR, "allowlist.json"), []);
  const allowlist = new Map(
    allowRows
      .filter((r) => r && r.translation && r.value)
      .map((r) => [r.translation, r])
  );
  const extraStopwords = await readJson(join(DATA_DIR, "stopwords.json"), []);
  const stopwords = new Set(
    [...DEFAULT_STOPWORDS, ...extraStopwords].map((w) => String(w).toLowerCase())
  );

  const stats = { noNativeName: 0, identity: 0, latinSuspect: 0 };
  for (const r of records) {
    if (latinLooksCorrupt(r.arabicName.primary, r.latin.primary)) stats.latinSuspect++;
  }
  const enrichment = await readJson(join(DATA_DIR, "wikidata.enrichment.json"), []);
  const byName = new Map(
    enrichment.map((e) => [`${e.hebrew_name}\u0000${e.arabic_name}`, e])
  );
  for (const r of records) {
    r.wikidata = byName.get(`${r.hebrewName.primary}\u0000${r.arabicName.primary}`) || null;
  }
  stats.enriched = records.filter((r) => r.wikidata).length;
  stats.enrichedKeys = records.filter((r) => r.wikidata && r.wikidata.israeli_latin).length;

  const candidates = buildCandidates(records, stats);
  const { seed, review, dropped } = plan(candidates, allowlist, stopwords);

  const existingDocs = await fetchExisting();
  const existing = new Map(existingDocs.map((d) => [d.id, d]));

  await writeFile(join(DATA_DIR, "seed.preview.json"), JSON.stringify(seed, null, 1));
  if (dropped.length) {
    await writeFile(join(DATA_DIR, "dropped.json"), JSON.stringify(dropped, null, 1));
  }
  const buckets = await writeReviewBuckets(review);

  report({ sheets, records, seed, review, dropped, existing, buckets, stats });

  if (OPTS.approve) {
    return approveChannel(OPTS.approve, review, allowRows);
  }

  if (!OPTS.commit) {
    if (OPTS.verify) {
      console.log("\nVerifying the plan against live Firestore (nothing written)…");
      console.log(summarizeVerify(await verify(seed)));
    } else {
      console.log("\nDRY RUN — nothing written. Re-run with --commit to write.");
    }
    return;
  }

  assertCredentials();

  if (!OPTS.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `\nWrite ${seed.length} docs to "${COLLECTION}" in ${PROJECT_ID}? [y/N] `
    );
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) return console.log("Aborted.");
  }

  await commit(seed);
  console.log(summarizeVerify(await verify(seed)));
}

function summarizeVerify(v) {
  const lines = [
    `Verify: ${v.total - v.missing.length - v.mismatched.length}/${v.total} planned docs present and correct` +
      ` (collection now holds ${v.live}).`,
  ];
  if (v.missing.length) lines.push(`  MISSING ${v.missing.length}: ${v.missing.slice(0, 10).join(", ")}`);
  if (v.mismatched.length) {
    lines.push(`  MISMATCHED ${v.mismatched.length}:`);
    for (const m of v.mismatched.slice(0, 10)) {
      lines.push(`    ${m.id}: expected "${m.expected}" got "${m.got}"`);
    }
  }
  if (!v.missing.length && !v.mismatched.length) lines.push("  All good.");
  return lines.join("\n");
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
