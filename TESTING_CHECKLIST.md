# Testing Checklist

## Automated (run these first)

```bash
npm test            # 52 unit tests (jest + jsdom): matcher, dom, worker-core, popup-core
npm run test:e2e    # 10 e2e tests (puppeteer, headless Chromium + unpacked extension)
```

The e2e suite seeds `storage.local.dictionary` directly and covers, in a real
browser: plain-page replacement, Arabic Unicode matching, replacement under a
strict page CSP, input/textarea/contenteditable never rewritten, open shadow
DOM, dynamically-inserted nodes (observer), nodes injected into a shadow root
after load (per-root observer), text a page rewrites in place (`characterData`),
`replacedWords` cleared on a no-match page, and live toggle-off revert.

## Manual QA in real Chrome (not covered by automation)

Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → repo root.
Open the service-worker console from the extension card ("service worker" link)
and the page DevTools console for each site.

### Dictionary / worker (highest risk — the whole extension dies silently if this fails)

- [ ] **Real fetch on fresh install.** In the SW console, confirm `refresh()` hits the
  dictionary endpoint, the response has `data` (array of `{translation, value}`), and
  `chrome.storage.local` gets `dictionary` + `dictionaryTs`. Validates the real
  endpoint, response shape, and key casing.
- [ ] **First-run race.** Immediately after install, open a page before the fetch lands
  (empty storage). Confirm it shows original text, then updates to replacements when
  the dictionary arrives — via `storage.onChanged`, no reload.
- [ ] **Weekly alarm.** `chrome://serviceworker-internals` or `chrome.alarms.getAll` shows
  the `sardiya-refresh` alarm; manually firing it re-fetches.
- [ ] **Offline install self-heal.** Install with no network; confirm no replacements,
  then relaunch Chrome online and confirm `onStartup` `ensureFresh()` recovers.

### Cross-site behavior

- [ ] **Strict-CSP real site** (e.g. github.com): replacements still appear — proves the
  worker-side fetch bypasses page CSP (the real P1-1 proof; e2e only pre-seeds).
- [ ] **Client-rendered SPA** (X/Twitter, Gmail, YouTube): place names in lazily-loaded
  / infinite-scroll content get replaced, not just first paint. Watch console/CPU for
  observer thrash.
- [ ] **Full Arabic RTL site** (aljazeera.net Arabic): standalone native names matched,
  no mid-word corruption, layout intact.
- [ ] **Real web-component site** with shadow DOM: initial content replaced, and content
  injected into open shadow roots *after* load is now also replaced (per-root observer).
- [ ] **Google Maps / Google surface**: the `div.MRI68d` flag swaps to the Palestine
  flag, and nothing throws on other sites where the selector is absent.

### Safety

- [ ] **Editable surfaces** (Gmail compose, Google Docs, a code editor, any
  `contenteditable`): typing is never rewritten; no console errors.
- [ ] **Sensitive site** (a bank/login page): nothing throws, page stays usable.
- [ ] **iframes**: a page embedding a same- and cross-origin iframe gets replacements in
  both frames (`all_frames: true`).

### Popup / UX

- [ ] **Toggle off → on** with a page open: text reverts in place immediately (no reload),
  then re-applies on toggle back on.
- [ ] **Language switch** en ⇄ ar: all labels/placeholders/buttons and the error strings
  localize; direction flips LTR/RTL.
- [ ] **Add-word form**: empty-field and same-word validation show localized errors;
  a valid submit posts to the suggestion endpoint and adds a table row.
- [ ] **Replaced-words table**: entries link to palestineremembered search. Navigating to
  a no-match page in the same tab now clears the list; cross-tab last-writer-wins remains.

### Sync / storage

- [ ] `ext_on` and `selectedLanguage` (storage.sync) propagate to a second signed-in
  Chrome; `replacedWords` (storage.local) does not count against the sync quota.

### Distribution (before release)

- [ ] Packed build loads and runs; review implications of `<all_urls>` + the remote
  dictionary for Chrome Web Store submission.
