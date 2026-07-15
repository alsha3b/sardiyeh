# Sardiya — Hardening Plan

**Goal:** catch every bug, resolve the code inconsistencies, and make the extension work reliably on Chrome across arbitrary websites.

**Status:** reviewed (plan-eng-review complete). Ready to implement. No code changed yet.

**Date:** 2026-07-15

---

## Premises (agreed)

1. The extension's one job: replace occupier place-names with native names in page text, plus swap one flag image, with a clean on/off. Everything else serves that.
2. "Works on any website" means: never throws on a page, never breaks the host site's own JS/layout, and degrades silently when it can't run (strict CSP, non-Latin text, no match).
3. Correctness and not-breaking-the-host-page rank above performance, which ranks above feature polish.
4. Fix root causes, not symptoms.

---

## Architecture after hardening

```
 BACKGROUND SERVICE WORKER (new)                 CONTENT SCRIPT (per frame)
 ┌───────────────────────────┐                  ┌──────────────────────────────┐
 │ onInstalled ─┐            │   storage.local   │ read dictionary from         │
 │ alarm(weekly)┤─► fetch ───┼──► dictionary ───►│ storage.local (no messaging) │
 │ startup-if-  │   AWS API  │   (single source  │                              │
 │  empty retry ┘  (host_    │    of truth)      │ if empty → no-op, wait for   │
 │                 permission)│                  │  storage.onChanged to refire │
 └───────────────────────────┘                  │                              │
                                                 │ walk DOM (incl. open shadow  │
 POPUP (one controller)                          │  roots, all frames):         │
 ┌───────────────────────────┐                   │   skip input/textarea/CE     │
 │ toggle ext_on             │   storage.sync    │   regex.test() guard         │
 │ table ◄── replacedWords ──┼── (ext_on,        │   in-place nodeValue set     │
 │ add-word → suggestion API │    selectedLang)  │   WeakMap<Text,string> orig  │
 │ i18n via getURL(json)     │                   │ record replacedWords ────────┼─► storage.local
 └───────────────────────────┘                   │ MutationObserver(addedNodes) │
                                                  │ toggle-off → re-walk +       │
                                                  │  WeakMap restore (revert)    │
                                                  └──────────────────────────────┘
```

Two contexts, coordinated through `chrome.storage`. The worker is the only thing that touches the network; the content script only ever reads `storage.local`.

---

## Decisions locked in review

| # | Decision | Supersedes |
|---|----------|-----------|
| D1 | **Revert = in-place `nodeValue` + `WeakMap<Text,string>`.** No spans, no `data-sardiya`, no green underline. Toggle-off re-walks the DOM and restores originals where `WeakMap.has(node)`. | old regex revert.js; the mid-review "tagged-span" idea |
| D2 | **Worker owns the dictionary.** Fetch on `onInstalled` + weekly `chrome.alarms`; write to `storage.local`; content script reads storage only. Add AWS origin to `host_permissions`, add `"alarms"` permission, add `storage.onChanged` listener so open tabs pick up a late-arriving dictionary; startup-if-empty retry so a failed install fetch doesn't dead-end for 7 days. | per-page localStorage cache; sync-quota writes; page-context fetch |
| D3 | **One popup controller.** Merge `script.js` + `popup.js` → single module, one handler per element, one `buildRow()` (kills the 3 duplicate row-builders), i18n via `fetch(chrome.runtime.getURL("translations/en.json"))`. Delete `script.js`; one `<script>` in `index.html`. | dual controllers; broken `en.js`/`ar.js` + `../` fetch |
| D4 | **Single Unicode-aware matcher.** One compiled regex from all keys, `(?<!\p{L})(...)(?!\p{L})` with `giu`, keys **escaped** and **sorted length-descending** (so "Tel Aviv" wins over "Tel"), plus a `regex.test()` guard so no-match nodes skip rebuilding. | `\b` boundaries; per-node allocation |
| D5 | **Full test coverage as part of the work.** jest + jest-environment-jsdom + chrome mock for every pure/DOM path; ~4 puppeteer E2E flows (timeboxed, Playwright fallback). | no tests at all |
| D6 | **Suggestion-only add-word.** User words submit to the backend; they do NOT create local replacements. Worker owns `storage.local.dictionary` outright; the weekly overwrite is correct by design. | — (clarifies intent) |
| D7 | **Handle open shadow roots + all frames.** Walk recurses into `element.shadowRoot` (open only); manifest gets `all_frames: true`. | top-frame-only, light-DOM-only walk |

---

## Findings, severity-ranked (final)

Severity: **P0** = wrong behavior / breaks pages today · **P1** = breaks a real class of sites · **P2** = fragility / cleanup.

### P0 — correctness (confirmed in code)

- **P0-1. Delete the BloomFilter.** `content.js:149-157` — `contains()` returns `false` on the found path; the filter is a no-op landmine that inverts all replacements if ever "fixed." Remove the class and its threading. (Superseded need: the `test()` guard in D4 is the real fast-path.)
- **P0-2. One popup controller (D3).** `script.js:43` and `popup.js:18` both bind `#toggleSwitch`; `script.js:45-48` puts the callback inside the options object. Merge to one controller, delete `script.js`.
- **P0-3. Fix localization (D3).** `index.html:119-120` loads nonexistent `translations/en.js`/`ar.js`; `script.js:119` fetches a wrong `../` path. Load the existing `.json` via `chrome.runtime.getURL`. Remove the double `script.js` include.
- **P0-4. Revert redesign (D1).** Old `revert.js:19-22` used the native name as an **unescaped** RegExp doing a **page-wide** replace, corrupting untouched text and unable to undo cleanly; `replacedSet` (a `Set`) also serialized to `{}`. Replace with WeakMap restore; revert no longer depends on stored `replacedWords`/`replacedSet` at all.

### P1 — "works on any website"

- **P1-1. Worker-owned fetch (D2).** Page-context `fetch` (`content.js:16-42`) dies under strict `connect-src` CSP. Move to the worker; add `host_permissions` for the AWS origin.
- **P1-2 / P1-3. Global cache in `storage.local` (D2).** Kills per-origin re-fetch and the `storage.sync` 8KB/item quota overflow. One fetch per week, global.
- **P1-4. Unicode matcher (D4).** `\b` never anchors Arabic; fixed via lookarounds; length-sorted, escaped keys.
- **P1-5. Observer scoping (D1/D7).** Scope reprocessing to `mutation.addedNodes`, recurse open shadow roots, disconnect-while-mutating. In-place replacement (D1) means no injected nodes to feed the observer. Also: `replaceImages` currently re-runs its `querySelector` every batch (`content.js:259-262`) — run it once, not per mutation.
- **P1-6. First-run + all-frames (D2/D7).** `storage.onChanged` listener + startup-if-empty retry so tabs open before the fetch lands still update; `all_frames: true` for iframes.

### P2 — fragility / cleanup

- **P2-1.** `div.MRI68d` flag selector (`content.js:93`) is a Google-only obfuscated class — best-effort, documented; the flag feature is Google-scoped by nature (see NOT in scope).
- **P2-2.** Runs on `<all_urls>` incl. sensitive sites — must never throw there (E2E covers a bank-login-shaped fixture).
- **P2-3.** Remove `console.log` (`content.js:32,79`) and the dead commented block (`content.js:236-251`).
- **P2-4.** Fill `TESTING_CHECKLIST.md` from the E2E matrix.
- **P2-5.** Two suggestion endpoints (Google Apps Script `popup.js:180` + AWS `/prod/suggestion`) — confirm canonical, drop the dead one (open question).
- **P2-6.** `package.json` declares jest/webpack/puppeteer with no config — D5 puts jest + puppeteer to real use; drop webpack (no bundling needed for an unpacked extension).

---

## Test plan (D5)

```
CODE PATHS (jest + jsdom)                              TARGET
[+] matcher
  ├── buildMatcher(keys): escaping                     ★★★ metachar key doesn't throw
  ├── buildMatcher(keys): length-desc order            ★★★ "Tel Aviv" beats "Tel"
  ├── buildMatcher(keys): Unicode boundary             ★★★ Arabic name matches, substring doesn't
[+] replaceTextNodes(node, dict)
  ├── replaces + records original in WeakMap           ★★★
  ├── skips input/textarea/contenteditable  [REGRESSION-CRITICAL, no-ask]  ★★★
  ├── no-match node untouched (test() guard)           ★★
  └── recurses open shadowRoot                          ★★
[+] revert(root)
  └── restores originals, leaves untouched text alone  ★★★  no page-wide bleed
[+] parseTranslationData / isWeekPassed(injectable clock)  ★★
[+] popup.buildRow(word, replacement)                   ★★  correct <tr> + links
[+] worker: alarm → fetch(mock) → storage.local(mock)   ★★  + failed-fetch retry

USER FLOWS (puppeteer, timeboxed; Playwright fallback for MV3)
  ├── toggle on → replace → toggle off → original restored   [→E2E]
  ├── strict-CSP site: dictionary still loads (P1-1 proof)   [→E2E]
  ├── Arabic-script page: native names matched               [→E2E]
  ├── typing in an input never rewritten                     [→E2E]
  └── open-shadow-DOM custom element replaced                [→E2E fixture]

TARGET COVERAGE: 100% of pure + DOM paths; E2E proves the cross-site claims.
```

**Regression (IRON RULE, mandatory):** the input/textarea/contenteditable skip test — the refactor could silently break `shouldSkipNode` and corrupt user typing on every site.

---

## Failure modes (per new codepath)

| Codepath | Realistic failure | Test? | Error handling? | User sees |
|----------|-------------------|-------|-----------------|-----------|
| Worker fetch | AWS down / offline at install | yes (retry test) | startup-if-empty + weekly retry | original text (silent, acceptable) |
| Worker fetch | strict-CSP site | E2E | worker context bypasses page CSP | replacements work |
| Matcher build | key with regex metachar | unit | `escapeRegExp` | matcher still builds |
| replaceTextNodes | SPA re-renders over replacement | E2E | observer re-applies; in-place = no node injection | replacement re-appears |
| replaceTextNodes | contenteditable | unit (regression) | `shouldSkipNode` | typing intact |
| revert | node detached by framework | — | `WeakMap.has` guard skips dead nodes | no crash |

No failure mode is both untested AND silent AND unhandled → **no critical gaps.**

---

## What already exists (reused, not rebuilt)

- Dictionary fetch/parse (`fetchDictionary`, `parseTranslationData`), 7-day freshness (`isWeekPassed`) — reused, relocated to the worker.
- `shouldSkipNode` input-protection — reused, now regression-tested.
- Observer throttle/debounce (`content.js:283-312`) — reused, rescoped.
- `escapeRegExp` (`content.js:106`) — reused in the matcher builder.
- `translations/en.json` / `ar.json` — reused (loaded correctly for the first time).
- `puppeteer` + `jest` deps — put to real use instead of sitting unused.

---

## NOT in scope (deferred, with rationale)

- **Cross-node multi-word matching** ("Tel `<em>`Aviv`</em>`") — matcher sees one text node at a time; reconstructing across siblings is a large change for a rare case. TODO.
- **`characterData` mutations** (live tickers/chat updating text without adding nodes) — observer watches `childList` only; watching characterData risks feedback loops. Documented limitation. TODO.
- **Initial-walk chunking** (`requestIdleCallback`) — only matters on very large pages; revisit if E2E shows main-thread stalls. TODO.
- **Closed shadow roots** — browser-inaccessible, cannot be handled. Documented.
- **Chrome Web Store distribution** — the extension is load-unpacked today; a CWS listing (and its review of `<all_urls>` + remote dictionary) is separate product work. TODO.
- **Flag-swap generalization** — `div.MRI68d` is Google-only; a generic image-match strategy is out of scope. The flag feature stays Google-scoped.
- **webpack bundling** — unnecessary for an unpacked extension; removing the dep, not adding a build.

---

## Parallelization

| Step | Modules | Depends on |
|------|---------|-----------|
| A. Content-script core (matcher, in-place replace, revert, shadow/frames) | `content.js`, `revert.js` | — |
| B. Background worker + manifest | new `background.js`, `manifest.json` | — |
| C. Popup merge + i18n | `popup.js`, `script.js`(del), `index.html`, `translations/` | — |
| D. Tests | `__tests__/`, jest/puppeteer config, `package.json` | A, B, C |

`Lane A: content core` / `Lane B: worker+manifest` / `Lane C: popup` run in **parallel worktrees** (disjoint modules). Merge all three, then **Lane D (tests)** last since it exercises everything. One conflict flag: A and B both edit `manifest.json` (A adds `all_frames`, B adds `background`/`alarms`/`host_permissions`) — coordinate that one file or let B own it.

---

## Implementation Tasks

Synthesized from this review. P1 blocks ship; P2 same branch; P3 follow-up.

- [ ] **T1 (P0, human: ~2h / CC: ~15min)** — content.js — Replace matcher + replacement engine: delete BloomFilter, build one length-sorted escaped Unicode regex with `test()` guard, in-place `nodeValue` + `WeakMap` original store.
  - Surfaced by: Arch/Code — Issues 4, 6; P0-1, P1-4
  - Files: `content.js`
  - Verify: jest matcher + replaceTextNodes units green
- [ ] **T2 (P0, human: ~1h / CC: ~10min)** — revert — Rewrite revert to re-walk + `WeakMap` restore; drop `replacedSet` storage dependency.
  - Surfaced by: Arch — Issue 1/6; P0-4
  - Files: `revert.js`, `content.js`
  - Verify: revert unit asserts no page-wide bleed
- [ ] **T3 (P1, human: ~3h / CC: ~20min)** — background — New service worker: fetch on install + weekly alarm → `storage.local`; `host_permissions`, `alarms`, `storage.onChanged`, startup-if-empty retry.
  - Surfaced by: Arch — Issue 2; P1-1/2/3/6
  - Files: `background.js` (new), `manifest.json`
  - Verify: worker unit with mocked fetch + storage
- [ ] **T4 (P0, human: ~3h / CC: ~20min)** — popup — Merge script.js into one popup.js controller, single `buildRow()`, JSON i18n via `getURL`; delete script.js; fix index.html includes.
  - Surfaced by: Arch/Code — Issue 3; P0-2/P0-3
  - Files: `popup.js`, `script.js` (delete), `index.html`
  - Verify: popup buildRow unit + manual popup open
- [ ] **T5 (P1, human: ~2h / CC: ~15min)** — content.js/manifest — Shadow-root recursion + `all_frames: true`; rescope observer to addedNodes; run flag swap once.
  - Surfaced by: Arch/Perf — Issue 8; P1-5
  - Files: `content.js`, `manifest.json`
  - Verify: shadow-DOM E2E fixture
- [ ] **T6 (P1, human: ~1.5d / CC: ~40min)** — tests — Wire jest+jsdom+chrome mock; unit-cover every path incl. the mandatory input-skip regression; ~4 puppeteer E2E (timeboxed, Playwright fallback).
  - Surfaced by: Test review — Issue 5
  - Files: `__tests__/`, `jest.config`, `package.json`
  - Verify: `npm test` green, coverage report
- [ ] **T7 (P2, human: ~30min / CC: ~5min)** — cleanup — Remove console.logs + dead commented block; drop webpack dep; confirm canonical suggestion endpoint; fill TESTING_CHECKLIST.md.
  - Surfaced by: Code/P2
  - Files: `content.js`, `package.json`, `TESTING_CHECKLIST.md`

---

## Open questions

- Does the AWS dictionary API return **lowercase keys**? The lookup lowercases the page word; if keys are capitalized, lowercase both at load. Confirmable from the first QA console run.
- Canonical suggestion endpoint: Google Apps Script vs AWS `/prod/suggestion` (P2-5)?
- Is `<all_urls>` intended, or should there be a domain scope / user allowlist (P2-2)?

---

## The assignment (do this before code)

Load the current build unpacked and run **two E2E rows by hand first**: one Arabic-script page and github.com (strict CSP), DevTools console open on each. This confirms P1-1 (CSP fetch failure) and P1-4 (Arabic non-match) with your own eyes and answers the key-casing open question. Report what the console shows, then we start the P0 sweep (T1/T2/T4) from ground truth.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 8 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run |
| Outside Voice | Claude subagent | Independent 2nd opinion | 1 | issues_found | 7 findings, 5 folded / 2 decided |

- **CROSS-MODEL:** Outside voice contradicted the review's initial revert choice (spans); resolved to in-place `nodeValue` + WeakMap (D1/D6). Both models agree on worker-owned storage, Unicode matcher, and full test coverage. Length-sort ordering, `host_permissions`, `onChanged`/retry, `all_frames`, and shadow-DOM handling were all folded in from the outside voice.
- **VERDICT:** ENG REVIEW COMPLETE — 8 issues all resolved, plan updated, ready to implement. CEO/Design reviews not required for a hardening pass. Run the assignment, then implement T1-T7.

**UNRESOLVED DECISIONS:**
- AWS dictionary API key casing (blocks final matcher casing detail; answered by the assignment's console run)
- Canonical suggestion endpoint (Google Apps Script vs AWS) — does not block P0/P1 work
