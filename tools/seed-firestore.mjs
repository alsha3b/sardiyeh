// One-time (and re-runnable) seeder: pull the dictionary from the legacy AWS
// endpoint and populate the Firestore `words` collection.
//
// Usage:
//   1. Firebase console → Project settings → Service accounts →
//      "Generate new private key". Save the JSON somewhere OUTSIDE the repo.
//   2. export GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/serviceAccount.json
//   3. npm install          # pulls firebase-admin (devDependency)
//   4. npm run seed:firestore
//
// Options (env vars):
//   SOURCE=aws            (default) fetch live rows from the AWS endpoint
//   SOURCE=file           read site/admin/seed.words.json instead (offline / pinned)
//   DRY_RUN=1             print what would be written, write nothing
//
// Idempotent: each doc id is derived from its (unique) translation key, so
// re-running upserts in place instead of creating duplicates.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import admin from "firebase-admin";

const AWS_URL =
  "https://z4kly0zbd9.execute-api.us-east-1.amazonaws.com/test/translation";
const COLLECTION = "words";
const BATCH_LIMIT = 400; // Firestore hard cap is 500 ops per batch.

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = process.env.SOURCE || "aws";
const DRY_RUN = process.env.DRY_RUN === "1";

// Firestore doc ids can't contain "/"; translations are otherwise safe & unique.
const docIdFor = (translation) => translation.replace(/\//g, "_").slice(0, 1500);

async function loadRows() {
  if (SOURCE === "file") {
    const raw = await readFile(join(__dirname, "..", "site", "admin", "seed.words.json"), "utf8");
    return JSON.parse(raw);
  }
  const res = await fetch(AWS_URL);
  const body = await res.json();
  const data = Array.isArray(body?.data) ? body.data : [];
  return data.map((x) => ({ value: x.value, translation: x.translation }));
}

async function main() {
  const rows = (await loadRows()).filter((r) => r && r.value && r.translation);
  console.log(`Loaded ${rows.length} rows from ${SOURCE.toUpperCase()}.`);

  if (DRY_RUN) {
    for (const r of rows.slice(0, 5)) console.log("  ", docIdFor(r.translation), "→", r);
    console.log(`DRY_RUN: would upsert ${rows.length} docs into "${COLLECTION}". Nothing written.`);
    return;
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path first."
    );
  }
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();

  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const r of rows.slice(i, i + BATCH_LIMIT)) {
      const ref = db.collection(COLLECTION).doc(docIdFor(r.translation));
      batch.set(ref, {
        value: r.value,
        translation: r.translation,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    written += Math.min(BATCH_LIMIT, rows.length - i);
    console.log(`  committed ${written}/${rows.length}`);
  }
  console.log(`Done. Upserted ${written} docs into "${COLLECTION}".`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
