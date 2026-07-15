// Dictionary refresh logic for the background service worker, with its
// dependencies injected so it can be unit-tested without chrome or the network.
// background.js wires this to the real fetch + chrome.storage.local.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Sardiya = root.Sardiya || {};
    Object.assign(root.Sardiya, api);
  }
})(typeof self !== "undefined" ? self : this, function () {
  // deps: { fetchFn, storage:{get,set}, parse, now:()=>ms, url, extract? }
  //   extract(body) pulls the raw rows out of the response before parse(); it
  //   defaults to body.data (the legacy AWS shape). The Firestore read path
  //   injects one that flattens body.documents instead.
  function createDictRefresher(deps) {
    const { fetchFn, storage, parse, now, url } = deps;
    const extract = deps.extract || ((body) => (body ? body.data : null));

    // Fetch the dictionary and persist it. Returns true on success.
    async function refresh() {
      try {
        const res = await fetchFn(url);
        const body = await res.json();
        const data = extract(body);
        if (!data || (Array.isArray(data) && data.length === 0)) return false;
        const dictionary = parse(data);
        await storage.set({ dictionary, dictionaryTs: now() });
        return true;
      } catch (_) {
        return false;
      }
    }

    // Used on startup / when a tab finds storage empty: fetch only if we have
    // nothing cached, so a failed install fetch self-heals on next launch
    // instead of leaving the extension dead until the weekly alarm.
    async function ensureFresh() {
      const got = await storage.get("dictionary");
      if (got && got.dictionary) return true;
      return refresh();
    }

    return { refresh, ensureFresh };
  }

  // Wire a refresher to the chrome extension lifecycle. Kept here (not inline in
  // background.js) so the glue is unit-testable with a chrome mock.
  function wireWorker(chromeApi, refresher, opts) {
    const { alarmName, periodInMinutes } = opts;
    chromeApi.runtime.onInstalled.addListener(() => {
      refresher.refresh();
      chromeApi.alarms.create(alarmName, { periodInMinutes });
    });
    chromeApi.runtime.onStartup.addListener(() => {
      refresher.ensureFresh();
    });
    chromeApi.alarms.onAlarm.addListener((alarm) => {
      if (alarm && alarm.name === alarmName) refresher.refresh();
    });
  }

  return { createDictRefresher, wireWorker };
});
