// GA4 analytics for the extension, via the Measurement Protocol.
//
// Why not the Firebase Analytics JS SDK: it loads gtag.js as remote code, which
// Manifest V3 (and the Chrome Web Store) forbid in an extension. The Measurement
// Protocol is a plain HTTPS POST the service worker can make itself, lands in the
// same GA4 property, and ships no remote code.
//
// Dependency-injected (fetchFn, storage, newId) so it unit-tests without chrome
// or the network. background.js wires it to fetch + chrome.storage.local +
// crypto.randomUUID.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Sardiya = root.Sardiya || {};
    Object.assign(root.Sardiya, api);
  }
})(typeof self !== "undefined" ? self : this, function () {
  const ENDPOINT = "https://www.google-analytics.com/mp/collect";
  const CLIENT_ID_KEY = "ga_client_id";

  // deps: { measurementId, apiSecret, fetchFn, storage:{get,set}, newId:()=>string }
  function createAnalytics(deps) {
    const { measurementId, apiSecret, fetchFn, storage, newId } = deps;

    // No-op until both the property id and the MP secret are configured, so a
    // missing secret degrades to "no analytics" rather than throwing.
    const enabled = () => Boolean(measurementId && apiSecret);

    // A stable per-install pseudonymous id GA4 uses to thread events into
    // sessions. Generated once and cached in storage.local.
    async function clientId() {
      const got = await storage.get(CLIENT_ID_KEY);
      if (got && got[CLIENT_ID_KEY]) return got[CLIENT_ID_KEY];
      const id = newId();
      await storage.set({ [CLIENT_ID_KEY]: id });
      return id;
    }

    // Fire one GA4 event. Best-effort: never throws, returns whether it was sent.
    // Event names must be <=40 chars, alphanumeric/underscore, letter-first.
    async function logEvent(name, params) {
      if (!enabled()) return false;
      try {
        const client_id = await clientId();
        const url =
          ENDPOINT +
          "?measurement_id=" +
          encodeURIComponent(measurementId) +
          "&api_secret=" +
          encodeURIComponent(apiSecret);
        await fetchFn(url, {
          method: "POST",
          body: JSON.stringify({
            client_id,
            events: [{ name, params: params || {} }],
          }),
        });
        return true;
      } catch (_) {
        return false;
      }
    }

    return { logEvent, clientId, enabled };
  }

  // ---------------------------------------------------------------------------
  // AnalyticsService: the single KPI layer the whole extension emits through.
  //
  // Why a layer over logEvent: it (1) keeps every event name/param shape in one
  // testable place so they never drift across content/popup/worker, (2) gates
  // relayed events behind an allowlist so a hostile page can't spam arbitrary
  // GA4 events through the message relay, and (3) stamps every event with a
  // rolling session_id + engagement_time_msec. That last part is the critical
  // Measurement Protocol detail: without those two params GA4 records the hits
  // but leaves the Engagement / Active-Users / Retention reports empty.
  //
  // deps: { analytics, storage:{get,set}, now:()=>ms, sessionTimeoutMs? }
  // ---------------------------------------------------------------------------
  const SESSION_KEY = "ga_session";
  const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // GA4's default session gap

  // The complete KPI taxonomy. The relay only forwards names in this set, so it
  // doubles as the allowlist. Growth, engagement, contribution, ops.
  const EVENTS = new Set([
    "extension_installed", // growth: install / update (worker)
    "dictionary_refreshed", // ops: dictionary size after a refresh (worker)
    "replacements_made", // activation: core value delivered on a page (content)
    "extension_toggled", // engagement: on/off (popup)
    "popup_opened", // engagement: DAU/WAU signal (popup)
    "language_changed", // localization use (popup)
    "suggestion_submitted", // contribution: crowdsourced word suggestion (popup)
  ]);

  // Keep only primitive params (GA4 rejects nested objects) and cap string
  // length. Defends the pipeline against whatever a relayed message carries.
  function sanitizeParams(params) {
    const out = {};
    if (!params || typeof params !== "object") return out;
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string") out[k] = v.slice(0, 100);
      else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      else if (typeof v === "boolean") out[k] = v;
    }
    return out;
  }

  function createAnalyticsService(deps) {
    const { analytics, storage, now } = deps;
    const sessionTimeoutMs = deps.sessionTimeoutMs || DEFAULT_SESSION_TIMEOUT_MS;

    // Rolling session: reuse the stored session while hits keep arriving within
    // the timeout, otherwise start a new one. Persisted because the MV3 worker
    // is torn down between events. id is unix-seconds per GA4 convention.
    async function sessionParams() {
      const t = now();
      const got = await storage.get(SESSION_KEY);
      const prev = got && got[SESSION_KEY];
      const fresh = prev && t - prev.last <= sessionTimeoutMs;
      const sess = { id: fresh ? prev.id : String(Math.floor(t / 1000)), last: t };
      await storage.set({ [SESSION_KEY]: sess });
      // engagement_time_msec must be > 0 for GA4 to count the session as engaged.
      return { session_id: sess.id, engagement_time_msec: 100 };
    }

    // Single emit path. Every event — worker-originated or relayed — flows here,
    // so the allowlist, sanitizing, and session stamping apply uniformly.
    async function track(name, params) {
      if (!EVENTS.has(name)) return false;
      const session = await sessionParams();
      return analytics.logEvent(name, { ...sanitizeParams(params), ...session });
    }

    // Named KPI methods: the vocabulary the rest of the codebase calls.
    return {
      track,
      installed: (reason) => track("extension_installed", { reason }),
      dictionaryRefreshed: (word_count) =>
        track("dictionary_refreshed", { word_count }),
      replacementsMade: (count) => track("replacements_made", { count }),
      toggled: (enabled) => track("extension_toggled", { enabled }),
      popupOpened: () => track("popup_opened"),
      languageChanged: (language) => track("language_changed", { language }),
      suggestionSubmitted: (status) =>
        track("suggestion_submitted", { status }),
    };
  }

  return { createAnalytics, createAnalyticsService };
});
