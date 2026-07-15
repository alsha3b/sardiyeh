const { createAnalytics, createAnalyticsService } = require("../../src/analytics");

function fakeStorage(initial = {}) {
  let data = { ...initial };
  return {
    _data: () => data,
    get: (key) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
    set: (obj) => {
      data = { ...data, ...obj };
      return Promise.resolve();
    },
  };
}

function make(overrides = {}) {
  const storage = overrides.storage || fakeStorage();
  const fetchFn = overrides.fetchFn || jest.fn(() => Promise.resolve({ ok: true }));
  let n = 0;
  const analytics = createAnalytics({
    measurementId: "measurementId" in overrides ? overrides.measurementId : "G-TEST",
    apiSecret: "apiSecret" in overrides ? overrides.apiSecret : "secret123",
    fetchFn,
    storage,
    newId: () => `id-${++n}`,
  });
  return { analytics, storage, fetchFn };
}

describe("createAnalytics", () => {
  test("disabled (no-op) when the API secret is missing", async () => {
    const { analytics, fetchFn } = make({ apiSecret: "" });
    expect(analytics.enabled()).toBe(false);
    expect(await analytics.logEvent("x")).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("posts an event to the Measurement Protocol endpoint", async () => {
    const { analytics, fetchFn } = make();
    const ok = await analytics.logEvent("dictionary_refreshed", { word_count: 186 });
    expect(ok).toBe(true);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain("https://www.google-analytics.com/mp/collect");
    expect(url).toContain("measurement_id=G-TEST");
    expect(url).toContain("api_secret=secret123");
    expect(opts.method).toBe("POST");
    const payload = JSON.parse(opts.body);
    expect(payload.client_id).toBe("id-1");
    expect(payload.events).toEqual([
      { name: "dictionary_refreshed", params: { word_count: 186 } },
    ]);
  });

  test("generates a client id once and reuses it", async () => {
    const { analytics, storage } = make();
    const a = await analytics.clientId();
    const b = await analytics.clientId();
    expect(a).toBe("id-1");
    expect(b).toBe("id-1");
    expect(storage._data().ga_client_id).toBe("id-1");
  });

  test("swallows fetch errors and reports failure", async () => {
    const { analytics } = make({
      fetchFn: jest.fn(() => Promise.reject(new Error("offline"))),
    });
    expect(await analytics.logEvent("x")).toBe(false);
  });
});

describe("createAnalyticsService", () => {
  function makeService(overrides = {}) {
    const storage = overrides.storage || fakeStorage();
    const logEvent = jest.fn(() => Promise.resolve(true));
    const analytics = { logEvent };
    let clock = overrides.startMs || 1_000_000;
    const service = createAnalyticsService({
      analytics,
      storage,
      now: () => clock,
      sessionTimeoutMs: overrides.sessionTimeoutMs,
    });
    return {
      service,
      logEvent,
      storage,
      advance: (ms) => (clock += ms),
    };
  }

  test("stamps session_id + engagement_time_msec on every event", async () => {
    const { service, logEvent } = makeService({ startMs: 1_700_000_000_000 });
    await service.popupOpened();
    const [name, params] = logEvent.mock.calls[0];
    expect(name).toBe("popup_opened");
    expect(params.session_id).toBe("1700000000"); // unix seconds
    expect(params.engagement_time_msec).toBe(100);
  });

  test("reuses the session within the timeout, rolls over after it", async () => {
    const { service, logEvent, advance } = makeService({
      startMs: 1_000_000,
      sessionTimeoutMs: 1000,
    });
    await service.popupOpened();
    const first = logEvent.mock.calls[0][1].session_id;

    advance(500); // still inside the window
    await service.popupOpened();
    expect(logEvent.mock.calls[1][1].session_id).toBe(first);

    advance(5000); // past the timeout
    await service.popupOpened();
    expect(logEvent.mock.calls[2][1].session_id).not.toBe(first);
  });

  test("named methods emit the right name and params", async () => {
    const { service, logEvent } = makeService();
    await service.installed("update");
    await service.dictionaryRefreshed(186);
    await service.replacementsMade(4);
    await service.toggled(false);
    await service.languageChanged("ar");
    await service.suggestionSubmitted("success");

    const byName = Object.fromEntries(
      logEvent.mock.calls.map(([n, p]) => [n, p])
    );
    expect(byName.extension_installed.reason).toBe("update");
    expect(byName.dictionary_refreshed.word_count).toBe(186);
    expect(byName.replacements_made.count).toBe(4);
    expect(byName.extension_toggled.enabled).toBe(false);
    expect(byName.language_changed.language).toBe("ar");
    expect(byName.suggestion_submitted.status).toBe("success");
  });

  test("track rejects names outside the KPI allowlist", async () => {
    const { service, logEvent } = makeService();
    expect(await service.track("evil_event", { x: 1 })).toBe(false);
    expect(logEvent).not.toHaveBeenCalled();
  });

  test("track drops non-primitive params (GA4 rejects nested objects)", async () => {
    const { service, logEvent } = makeService();
    await service.track("replacements_made", {
      count: 3,
      nested: { a: 1 },
      fn: () => {},
      long: "x".repeat(200),
    });
    const params = logEvent.mock.calls[0][1];
    expect(params.count).toBe(3);
    expect(params.nested).toBeUndefined();
    expect(params.fn).toBeUndefined();
    expect(params.long.length).toBe(100); // capped
  });
});
