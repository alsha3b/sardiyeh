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

  return { createAnalytics };
});
