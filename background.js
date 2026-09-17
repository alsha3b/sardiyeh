// Background service worker. The only place that touches the network. Fetches
// the dictionary on install and on a daily alarm, writing it to
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
const API_SECRET = "yAqC0kSGRV-7GXIt64PM2Q";

// Opened by Chrome when the user removes the extension; the page fires an
// extension_uninstalled MP event so churn shows up in GA4. background.js appends
// ?cid=<client_id> so the removal threads to the same GA4 user. Served from
// Firebase Hosting (site/uninstall.html, rewrite /uninstall in firebase.json).
const UNINSTALL_URL = "https://sardiyeh-elmokhtbr.web.app/uninstall";

const ALARM = "sardiya-refresh";
// Daily, not weekly: `words` is still being actively seeded from the workbook,
// so a week-long tail between an accepted name and users seeing it is too long.
// One request per client per day against a public Firestore read is negligible.
// The alarm is only (re)created in onInstalled, which also fires on extension
// update — so shipping this is what migrates existing installs off the old
// weekly period.
const DAY_MINUTES = 24 * 60;

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
  periodInMinutes: DAY_MINUTES,
});

// --- Analytics -------------------------------------------------------------
// analytics = the low-level MP transport; service = the KPI layer everything
// emits through (named events + allowlist + session stamping). See src/analytics.js.
const storage = {
  get: (key) => chrome.storage.local.get(key),
  set: (obj) => chrome.storage.local.set(obj),
};
const analytics = self.Sardiya.createAnalytics({
  measurementId: MEASUREMENT_ID,
  apiSecret: API_SECRET,
  fetchFn: (url, opts) => fetch(url, opts),
  storage,
  newId: () => crypto.randomUUID(),
});
const service = self.Sardiya.createAnalyticsService({
  analytics,
  storage,
  now: () => Date.now(),
});

chrome.runtime.onInstalled.addListener((details) => {
  service.installed(details.reason);
});

// One signal covers both the install fetch and the daily refresh: whenever the
// stored dictionary changes, report how many words it now holds.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.dictionary && changes.dictionary.newValue) {
    service.dictionaryRefreshed(
      Object.keys(changes.dictionary.newValue).length
    );
  }
});

// Relay for the content script and popup (see src/track-client.js). service.track
// gates the name against the KPI allowlist, so a hostile page can't inject
// arbitrary GA4 events. Fire-and-forget: no response, no sendResponse channel.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "sardiya:track" && typeof msg.name === "string") {
    service.track(msg.name, msg.params);
  }
});

// Forced dictionary refresh. Without this the dictionary only reloads on
// install and on the daily alarm, so a word added in Firestore stays invisible
// to an already-installed client for up to a day. Any context can pull now
// by sending { type: "sardiya:refreshDictionary" }; the reply is { ok } where ok
// mirrors refresh()'s success flag. On success the write to storage.local fires
// storage.onChanged, which is what makes open tabs re-run replacement — so no
// separate broadcast is needed here.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "sardiya:refreshDictionary") return;
  refresher.refresh().then((ok) => sendResponse({ ok }));
  return true; // keep the message channel open for the async reply
});

// The same refresh, reachable by name from the service-worker DevTools console
// (chrome://extensions → Sardiya → "service worker"):  await sardiyaRefresh()
self.sardiyaRefresh = () => refresher.refresh();

// Point Chrome's uninstall URL at the churn page, threaded to this install's
// client_id so the removal attributes to the same GA4 user.
analytics.clientId().then((cid) => {
  chrome.runtime.setUninstallURL(UNINSTALL_URL + "?cid=" + encodeURIComponent(cid));
});
