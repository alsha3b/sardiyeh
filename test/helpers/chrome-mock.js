// Minimal in-memory chrome.* mock. Enough surface for the popup, content, and
// worker code under test. Storage supports both the callback and the
// promise-returning MV3 styles. No external dependency (kept deliberately small
// so it is obvious what behavior the tests rely on).

function makeArea(onChangedListeners, areaName) {
  let store = {};
  const api = {
    _dump: () => ({ ...store }),
    get(keys, cb) {
      let out = {};
      if (keys == null) {
        out = { ...store };
      } else if (typeof keys === "string") {
        if (keys in store) out[keys] = store[keys];
      } else if (Array.isArray(keys)) {
        for (const k of keys) if (k in store) out[k] = store[k];
      } else if (typeof keys === "object") {
        for (const k of Object.keys(keys)) out[k] = k in store ? store[k] : keys[k];
      }
      if (cb) { cb(out); return; }
      return Promise.resolve(out);
    },
    set(items, cb) {
      const changes = {};
      for (const k of Object.keys(items)) {
        changes[k] = { oldValue: store[k], newValue: items[k] };
        store[k] = items[k];
      }
      for (const l of onChangedListeners) l(changes, areaName);
      if (cb) { cb(); return; }
      return Promise.resolve();
    },
    remove(keys, cb) {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) delete store[k];
      if (cb) { cb(); return; }
      return Promise.resolve();
    },
    clear(cb) {
      store = {};
      if (cb) { cb(); return; }
      return Promise.resolve();
    },
  };
  return api;
}

function makeEvent() {
  const listeners = [];
  return {
    _listeners: listeners,
    addListener: (fn) => listeners.push(fn),
    removeListener: (fn) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    _emit: (...args) => listeners.forEach((l) => l(...args)),
  };
}

function createChromeMock() {
  const onChangedListeners = [];
  const onChanged = {
    _listeners: onChangedListeners,
    addListener: (fn) => onChangedListeners.push(fn),
    removeListener: (fn) => {
      const i = onChangedListeners.indexOf(fn);
      if (i >= 0) onChangedListeners.splice(i, 1);
    },
  };

  return {
    runtime: {
      id: "test-extension-id",
      lastError: undefined,
      getURL: (p) => `chrome-extension://test/${p}`,
      sendMessage: jest.fn(),
      onMessage: makeEvent(),
      onInstalled: makeEvent(),
      onStartup: makeEvent(),
    },
    storage: {
      local: makeArea(onChangedListeners, "local"),
      sync: makeArea(onChangedListeners, "sync"),
      onChanged,
    },
    alarms: {
      create: jest.fn(),
      onAlarm: makeEvent(),
    },
    scripting: {
      executeScript: jest.fn(() => Promise.resolve([])),
    },
    tabs: {
      query: jest.fn((_q, cb) => (cb ? cb([{ id: 1 }]) : Promise.resolve([{ id: 1 }]))),
      sendMessage: jest.fn((_id, _msg, _opts, cb) => {
        const done = typeof _opts === "function" ? _opts : cb;
        if (done) done({ replacedWords: [] });
      }),
      reload: jest.fn(),
    },
  };
}

module.exports = { createChromeMock };
