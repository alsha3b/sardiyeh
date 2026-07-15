// Background service worker. The only place that touches the network. Fetches
// the dictionary on install and on a weekly alarm, writing it to
// chrome.storage.local (the single source of truth the content script reads).
// Fetching here (not in the content script) bypasses page CSP on strict sites.
//
// Classic worker (not type: module) so importScripts can load the shared UMD
// modules. The lifecycle wiring lives in worker-core (wireWorker) so it can be
// unit-tested with a chrome mock.
importScripts("src/matcher.js", "src/analytics.js", "src/worker-core.js");

// Firestore REST read endpoint (documents.list) for the `words` collection.
// Public read is granted by the Firestore security rules (see firestore.rules);
// no API key or auth token is needed for the GET.
const PROJECT_ID = "sardiyeh-elmokhtbr";
const FIRESTORE_BASE =
  "https://firestore.googleapis.com/v1/projects/" +
  PROJECT_ID +
  "/databases/(default)/documents/words";
const PAGE_SIZE = 300;

// GA4 Measurement Protocol config. measurementId comes from the Firebase web
// config; API_SECRET is created in GA4 Admin → Data Streams → your stream →
// Measurement Protocol API secrets. Leave it blank to disable analytics.
const MEASUREMENT_ID = "G-DCQ93BN4SE";
const API_SECRET = ""; // TODO: paste the GA4 Measurement Protocol API secret

const ALARM = "sardiya-refresh";
const WEEK_MINUTES = 7 * 24 * 60;

// Fetch every page of the collection and merge into one { documents: [...] }
// body so the refresher stays a single fetch → parse step. Firestore caps a
// page at 300 docs; this loops nextPageToken so the dictionary can grow past it.
async function fetchAllDocuments() {
  const documents = [];
  let pageToken = "";
  do {
    const url =
      FIRESTORE_BASE +
      "?pageSize=" +
      PAGE_SIZE +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const res = await fetch(url);
    const body = await res.json();
    if (Array.isArray(body.documents)) documents.push(...body.documents);
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return { json: () => Promise.resolve({ documents }) };
}

const refresher = self.Sardiya.createDictRefresher({
  fetchFn: fetchAllDocuments,
  storage: {
    get: (key) => chrome.storage.local.get(key),
    set: (obj) => chrome.storage.local.set(obj),
  },
  parse: self.Sardiya.parseTranslationData,
  extract: self.Sardiya.parseFirestoreDocuments,
  now: () => Date.now(),
  url: FIRESTORE_BASE,
});

self.Sardiya.wireWorker(chrome, refresher, {
  alarmName: ALARM,
  periodInMinutes: WEEK_MINUTES,
});

// --- Analytics -------------------------------------------------------------
const analytics = self.Sardiya.createAnalytics({
  measurementId: MEASUREMENT_ID,
  apiSecret: API_SECRET,
  fetchFn: (url, opts) => fetch(url, opts),
  storage: {
    get: (key) => chrome.storage.local.get(key),
    set: (obj) => chrome.storage.local.set(obj),
  },
  newId: () => crypto.randomUUID(),
});

chrome.runtime.onInstalled.addListener((details) => {
  analytics.logEvent("extension_installed", { reason: details.reason });
});

// One signal covers both the install fetch and the weekly refresh: whenever the
// stored dictionary changes, report how many words it now holds.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.dictionary && changes.dictionary.newValue) {
    analytics.logEvent("dictionary_refreshed", {
      word_count: Object.keys(changes.dictionary.newValue).length,
    });
  }
});
