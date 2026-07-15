const { createDictRefresher, wireWorker } = require("../../src/worker-core");
const { parseTranslationData, parseFirestoreDocuments } = require("../../src/matcher");
const { createChromeMock } = require("../helpers/chrome-mock");

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

const okResponse = (body) => ({ ok: true, json: () => Promise.resolve(body) });

function make(overrides = {}) {
  const storage = overrides.storage || fakeStorage();
  const fetchFn =
    overrides.fetchFn ||
    jest.fn(() =>
      Promise.resolve(
        okResponse({ data: [{ translation: "Israel", value: "Palestine" }] })
      )
    );
  const refresher = createDictRefresher({
    fetchFn,
    storage,
    parse: parseTranslationData,
    now: () => 12345,
    url: "https://api.test/translation",
  });
  return { refresher, storage, fetchFn };
}

describe("refresh", () => {
  test("fetches, parses, and writes the dictionary + timestamp", async () => {
    const { refresher, storage, fetchFn } = make();
    const ok = await refresher.refresh();
    expect(ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith("https://api.test/translation");
    expect(storage._data().dictionary).toEqual({ Israel: "Palestine" });
    expect(storage._data().dictionaryTs).toBe(12345);
  });

  test("returns false and writes nothing when the fetch throws", async () => {
    const { refresher, storage } = make({
      fetchFn: jest.fn(() => Promise.reject(new Error("offline"))),
    });
    const ok = await refresher.refresh();
    expect(ok).toBe(false);
    expect(storage._data().dictionary).toBeUndefined();
  });

  test("returns false when the response has no data", async () => {
    const { refresher, storage } = make({
      fetchFn: jest.fn(() => Promise.resolve(okResponse({ data: null }))),
    });
    expect(await refresher.refresh()).toBe(false);
    expect(storage._data().dictionary).toBeUndefined();
  });

  test("Firestore extract path: flattens documents into the dictionary", async () => {
    const storage = fakeStorage();
    const body = {
      documents: [
        { fields: { value: { stringValue: "Yafa" }, translation: { stringValue: "Tel Aviv" } } },
      ],
    };
    const refresher = createDictRefresher({
      fetchFn: jest.fn(() => Promise.resolve(okResponse(body))),
      storage,
      parse: parseTranslationData,
      extract: parseFirestoreDocuments,
      now: () => 12345,
      url: "https://firestore.test/words",
    });
    expect(await refresher.refresh()).toBe(true);
    expect(storage._data().dictionary).toEqual({ "Tel Aviv": "Yafa" });
  });

  test("Firestore extract path: empty document list writes nothing", async () => {
    const storage = fakeStorage();
    const refresher = createDictRefresher({
      fetchFn: jest.fn(() => Promise.resolve(okResponse({ documents: [] }))),
      storage,
      parse: parseTranslationData,
      extract: parseFirestoreDocuments,
      now: () => 1,
      url: "https://firestore.test/words",
    });
    expect(await refresher.refresh()).toBe(false);
    expect(storage._data().dictionary).toBeUndefined();
  });
});

describe("ensureFresh (startup-if-empty retry)", () => {
  test("fetches when storage has no dictionary", async () => {
    const { refresher, fetchFn, storage } = make();
    await refresher.ensureFresh();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(storage._data().dictionary).toEqual({ Israel: "Palestine" });
  });

  test("does not refetch when a dictionary already exists", async () => {
    const storage = fakeStorage({ dictionary: { A: "B" } });
    const { refresher, fetchFn } = make({ storage });
    await refresher.ensureFresh();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("wireWorker", () => {
  function harness() {
    const chrome = createChromeMock();
    const refresher = { refresh: jest.fn(), ensureFresh: jest.fn() };
    wireWorker(chrome, refresher, { alarmName: "sardiya-refresh", periodInMinutes: 10080 });
    return { chrome, refresher };
  }

  test("onInstalled refreshes and creates the weekly alarm", () => {
    const { chrome, refresher } = harness();
    chrome.runtime.onInstalled._emit({});
    expect(refresher.refresh).toHaveBeenCalledTimes(1);
    expect(chrome.alarms.create).toHaveBeenCalledWith("sardiya-refresh", {
      periodInMinutes: 10080,
    });
  });

  test("onStartup ensures freshness (retry-if-empty)", () => {
    const { chrome, refresher } = harness();
    chrome.runtime.onStartup._emit();
    expect(refresher.ensureFresh).toHaveBeenCalledTimes(1);
  });

  test("onAlarm refreshes only for the matching alarm name", () => {
    const { chrome, refresher } = harness();
    chrome.alarms.onAlarm._emit({ name: "some-other-alarm" });
    expect(refresher.refresh).not.toHaveBeenCalled();
    chrome.alarms.onAlarm._emit({ name: "sardiya-refresh" });
    expect(refresher.refresh).toHaveBeenCalledTimes(1);
  });
});
