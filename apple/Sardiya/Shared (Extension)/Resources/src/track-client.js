// Fire-and-forget analytics relay for the content script and popup.
//
// Only the background worker holds the Measurement Protocol secret and the
// stable client_id, so those contexts can't emit to GA4 directly. They send a
// sardiya:track message; background.js validates the name against the KPI
// allowlist (src/analytics.js) and forwards it to the AnalyticsService.
//
// Best-effort by design: swallows the "receiving end does not exist" lastError
// (worker asleep, no listener) so a dropped analytics ping never surfaces to the
// user or throws into the page.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Sardiya = root.Sardiya || {};
    Object.assign(root.Sardiya, api);
  }
})(typeof self !== "undefined" ? self : this, function () {
  function sendTrack(name, params) {
    try {
      chrome.runtime.sendMessage(
        { type: "sardiya:track", name, params: params || {} },
        () => void chrome.runtime.lastError // read to silence the warning
      );
    } catch (_) {
      // Extension context invalidated (e.g. reloaded mid-session) — ignore.
    }
  }
  return { sendTrack };
});
