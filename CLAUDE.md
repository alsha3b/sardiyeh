# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sardiya (سرديّة) is a Chrome **Manifest V3** browser extension that rewrites text on any web page, replacing colonial/occupier place names with their original native (primarily Palestinian) names, and swapping a specific flag image. There is no bundler — the repository root *is* the unpacked extension. Shared logic lives in `src/*.js` as small UMD modules that load both as content/worker scripts and under jest.

See `HARDENING_PLAN.md` for the design decisions (D1–D7) behind the current architecture, and `TODO.md` / `TESTING_CHECKLIST.md` for open items and manual QA.

## Development

Load unpacked: `chrome://extensions/` → **Developer mode** → **Load unpacked** → repo root.
- After editing content-script logic (`content.js`, `src/matcher.js`, `src/dom.js`), reload the extension card **and** the target page.
- After editing the worker (`background.js`, `src/worker-core.js`), reload the extension card.
- After editing popup files (`index.html`, `popup.js`, `src/popup-core.js`, `styles.css`), just re-open the popup.

## Testing

```bash
npm test          # unit + DOM tests (jest + jsdom)
npm run test:e2e  # e2e: puppeteer loads the unpacked extension in headless Chromium
npx jest matcher  # run a single unit suite by name
```

- Unit tests are in `test/unit/`, run under jsdom. `test/helpers/chrome-mock.js` is a hand-rolled in-memory `chrome.*` (installed on `global` by `test/helpers/setup.js`).
- E2E tests are in `test/e2e/` (config: `jest.e2e.config.js`, node env). They seed `storage.local.dictionary` directly from an extension page, serve fixtures over http (content scripts don't run on `file://`), and assert against a real browser. `test/e2e/helpers.js` has the launch/seed helpers.
- Pure/DOM logic is deliberately extracted into `src/` so it is unit-testable; runtime files (`content.js`, `background.js`, `popup.js`) are thin wiring over those modules.

## Architecture

Three contexts, coordinated only through `chrome.storage`:

**Background service worker (`background.js`)** — the only place that touches the network. On `onInstalled` and a daily `chrome.alarms` tick it fetches the dictionary and writes it to `chrome.storage.local` (the single source of truth). `onStartup` re-fetches only if storage is empty (self-heals a failed install). Lifecycle wiring is `src/worker-core.js` `wireWorker`; the fetch/parse/persist logic is `createDictRefresher` (dependency-injected, unit-tested). Fetching here (not in the content script) bypasses page CSP on strict sites. A forced refresh (anything that changes `words` in Firestore is otherwise invisible until the next daily tick) is a `{ type: "sardiya:refreshDictionary" }` runtime message, replying `{ ok }`; the same call is exposed as `sardiyaRefresh()` on the worker's global for the service-worker console. Nothing needs to broadcast the result — the write to `storage.local` fires `storage.onChanged`, which is what makes open tabs re-run replacement.

The dictionary source is the **Firestore REST API** (`words` collection in project `sardiyeh-elmokhtbr`), read unauthenticated via public read rules (`firestore.rules`). `background.js` pages through `documents.list` and merges the pages; `src/matcher.js` `parseFirestoreDocuments` (the `extract` step injected into the refresher) flattens Firestore's verbose docs into the `[{value, translation}]` shape `parseTranslationData` already consumed. Analytics is GA4 via the **Measurement Protocol** (`src/analytics.js`, MV3-safe — no gtag/remote code); it needs a Measurement Protocol API secret set in `background.js` (and `site/uninstall.html`) to activate — blank secret degrades to a no-op. `createAnalytics` is the low-level POST transport; `createAnalyticsService` is the single KPI layer the whole extension emits through. The service owns the event taxonomy as named methods (`installed`, `dictionaryRefreshed`, `replacementsMade`, `toggled`, `popupOpened`, `languageChanged`, `suggestionSubmitted`), gates a generic `track(name, params)` behind an event allowlist, and stamps every event with a rolling `session_id` + `engagement_time_msec` (required or GA4's engagement/active-user/retention reports stay empty). Only the worker holds the secret + stable client_id, so the content script and popup emit via `src/track-client.js` `sendTrack`, which posts a `sardiya:track` message that `background.js`'s `onMessage` relay validates and forwards. Churn is tracked with `chrome.runtime.setUninstallURL` pointing at `site/uninstall.html` (Firebase Hosting, `/uninstall` rewrite), threaded with `?cid=<client_id>` so a removal attributes to the same GA4 user.

**Backend & admin** — the `words` collection is populated/updated three ways: a one-time local seeder (`tools/seed-firestore.mjs`, uses `firebase-admin`, pulls from the legacy AWS endpoint or `admin/seed.words.json`), the workbook seeder below, and a login-gated CRUD page (`admin/index.html`, deployed to Firebase Hosting, uses the full Firebase JS SDK since it's a normal web page, not the extension). Firestore rules + hosting config live in `firestore.rules` / `firebase.json` / `.firebaserc`.

**Workbook seeder (`tools/seed-from-xlsx.mjs` + `tools/lib/*.js`)** — bulk-loads the 52-sheet place-name workbook in `.data/data.xlsx` (gitignored) into `words`. `npm run seed:xlsx` is a **dry run**; `-- --commit` writes and then re-reads Firestore to verify every planned doc landed.

Replacement is **script-preserving** — a name is replaced with the native name in the *same* script, so the reader always gets something they can read. That gives three channels:

| channel | key → value | source |
| --- | --- | --- |
| `ar` | `افرهام` → `إبراهيم` | both real workbook columns — **seeded** |
| `he` | `אברהם` → `אבראהים` | value transliterated from `arabic_name` — **held for review** |
| `la` | `Beit She'an` → `Bisan` | key from Wikidata, value from the workbook — **seeded** |

**Where each name form comes from is the whole ballgame, because the workbook was scanned and its `english_translit` column is OCR-damaged** — "Zakariya" arrived as "Zakarlya", "Deir Yasin" as "Deir Yast". So each form is taken from whichever source actually knows it:

| form | source |
| --- | --- |
| native name, Arabic | `arabic_name` — clean, the authority |
| native name, Latin | `english_translit`, but only on rows where `latinLooksCorrupt` finds it agrees with the Arabic |
| native name, Hebrew | 1:1 abjad mapping of `arabic_name` (`arabicToHebrew`) — never via the Latin, which would carry the scanner's errors through |
| Israeli name, Latin | absent from the workbook; supplied by `tools/enrich-wikidata.mjs` |

**Wikidata is never asked for the native name.** It labels a place by its current official name, so it answers بيسان with "Beit She'an" — the Israeli name. Taking that as the native form would invert the entire point of the extension. Wikidata supplies keys; the workbook supplies values.

`enrich-wikidata.mjs` joins `hebrew_name` against Wikidata labels in batches and gates every hit three ways: it must lie in historic Palestine, the workbook's own Palestine Grid reference must place it within 5 km (`tools/lib/palgrid.js` — this is what separates باب الخليل, a gate in Jerusalem, from الخليل, the city 30 km off), and the label must *render* the matched name rather than rename it (أرسوف is labelled אפולוניה). Keys are only trusted on `SETTLEMENT_SHEETS` rows, because Wikidata knows villages, not wells — match a well named בענה and you get the village next to it. Results cache in `.data/wikidata.cache.json`.

Two classes of row are rejected before any gating, because they are not a rename at all: `SHEETS_WITHOUT_NATIVE_NAME` (الشوارع is a list of Israeli street names with two Arabic spellings of the *same* name — no Palestinian counterpart), and rows where both columns hold one name (`isSameName`, which deliberately still treats بلعام → بلعمة as a real restoration).

Nothing reaches users unreviewed. `tools/lib/dataset.js` gates every key and routes failures into one bucket each under `.data/`:
- `review.ambiguous.json` — the workbook gives the name several places (אברהם is a well, a hill *and* a village); each candidate is labelled with its category, page and coordinates so a human can pick one.
- `review.risky.json` — real names that are also everyday words (`ים` "sea", `שדה` "field"). Seeding these would rewrite ordinary prose. Extend the list via `.data/stopwords.json`.
- `review.derived-he.json` / `review.derived-la.json` — machine transliterations; spot-check, then `-- --approve=he` bulk-moves the clean ones into `.data/allowlist.json`.

`.data/allowlist.json` (`[{translation, value}]`) overrides every gate, so approving a key is just an entry in that file. `tools/lib/xlsx.js` is a zero-dependency xlsx reader (ZIP + inflate + regex XML) so the repo still ships no bundler; it auto-detects each sheet's columns, including the springs sheet (العيون) which has no header row and runs right-to-left.

**Content script (`src/matcher.js` + `src/dom.js` + `content.js`, injected in that order, `all_frames`)** —
- `src/matcher.js`: `buildMatcher(dict)` compiles one regex from all keys — escaped, sorted longest-first (so "Tel Aviv" beats "Tel"), lowercased lookup, `(?<!\p{L})…(?!\p{L})` Unicode boundaries (works for Arabic). `apply(text, onMatch)` does the string transform; `matches(text)` is a stateless guard.
- `src/dom.js`: `walk` (recurses open shadow roots, skips input/textarea/contenteditable/script/style), `replaceTextNodes` (in-place `nodeValue` write, originals saved in a `WeakMap`), `reprocessTextNode` (re-match a single text node the page rewrote in place; refreshes the WeakMap baseline), `revertAll` (re-walk, restore from the WeakMap), `collectReplaceableNodes` / `collectCharacterDataTargets` (flatten MutationRecords into added subtrees / rewritten text nodes, dropping editable targets).
- `content.js`: reads the dictionary from storage, gates on `ext_on`, runs the initial pass, and runs `MutationObserver`s (`childList` + `characterData` + `subtree`) that **accumulate** added nodes and rewritten text nodes into pending sets and drain on a trailing debounce (never drops nodes on busy SPAs), disconnecting while it mutates. One observer per open shadow root is attached as roots are discovered (observers don't cross shadow boundaries), since the initial `walk` only covers shadow content present at load. `replacedWords` is recorded in memory in the top frame only (avoids double-counting frames) and handed to the popup on demand via a `chrome.runtime.onMessage` responder — there is no shared storage key, so lists never race between tabs.

**Popup (`index.html` + `src/popup-core.js` + `popup.js`)** — `popup-core.js` has `buildRow` (one row builder) and `applyTranslations`. `popup.js` is the single controller: on/off toggle (writes `ext_on`; the content script applies/reverts **live** via `storage.onChanged`, no reload), the replaced-words table (queries the active tab via `chrome.tabs.query` + `chrome.tabs.sendMessage(tabId, …, {frameId: 0})`, so it shows that tab's list only), the add-word dialog (POSTs a suggestion; does not create a local replacement), and language loading (`fetch(chrome.runtime.getURL("translations/<lang>.json"))`).

### Key data flow

`ext_on` (storage.sync) is the master switch — the content script reacts live via `storage.onChanged`. `dictionary` (storage.local) flows worker → content script (and a late arrival re-triggers replacement). `replacedWords` flows content script → popup table on demand over runtime messaging (per active tab; not stored). Revert is DOM-based (WeakMap), so it does not depend on stored state.

## Localization

English (`en`, LTR) and Arabic (`ar`, RTL), selection persisted in `storage.sync.selectedLanguage`. Strings live in `translations/en.json` / `ar.json` and are loaded via `chrome.runtime.getURL` — add new keys to **both** files and reference them through `applyTranslations` / the popup's `t(...)`.

## Conventions

- `src/*.js` are UMD: they attach to `self.Sardiya` in the browser and `module.exports` under jest. Keep new shared logic here so it stays testable; keep `chrome.*` and DOM-lifecycle wiring in the runtime files.
- Manifest permissions are intentionally minimal: `storage`, `alarms`, plus `host_permissions` for the dictionary/suggestion origins. Do not add `scripting`/`activeTab` back unless a feature needs them.
- Replacement writes `textNode.nodeValue` directly (no injected spans) so it never perturbs layout, CSS, or framework reconciliation.
