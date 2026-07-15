# TODO

Tracked follow-ups after the hardening pass (see `HARDENING_PLAN.md` for the full design). Fixed items are kept for the record; open items are ranked by impact.

## Open — Safari / Apple port (in progress)

Goal: ship the same extension on Safari (macOS first, iOS as a follow-up) from this one repo — no separate codebase. Apple's `safari-web-extension-converter` wraps the existing web files in a native container app under `apple/`.

- [ ] **Re-run the converter against a clean staging dir, not the repo root.** The first run (`xcrun safari-web-extension-converter . --project-location apple/`) swept the *entire* dev repo into the extension target as in-place references — `node_modules/`, `secrets/`, `test/`, `admin/`, `tools/`, `dist/`, `*.md`, `jest.config.js`, and even `apple/` itself (recursive self-reference). It would bundle secrets + deps into the shipped app. **Fix:** add a build step that stages only the runtime files into e.g. `dist/safari/` — `manifest.json`, `background.js`, `content.js`, `src/`, `index.html`, `popup.js`, `styles.css`, `translations/`, `icons/`, `images/`, `LICENSE` — then run the converter against *that* dir. Delete the current `apple/` and regenerate. _This is the same staging step flagged for Chrome Web Store packaging below; build one `dist/<target>/` pipeline for both._
- [ ] **Host-permission onboarding.** Safari does not silently honor `<all_urls>` + `host_permissions`. The user must click the toolbar button → **Allow on Every Website** or replacement never runs. Add onboarding copy (in the container app's `Main.html` and/or popup) explaining this, in both `en`/`ar`.
- [ ] **iOS background reliability.** On iOS the service worker is evicted aggressively and the weekly `chrome.alarms` dictionary refresh is unreliable. The existing `onStartup` "refetch if storage empty" self-heal covers a cold start; consider a lazy freshness check (refetch if `dictionary` older than N days) on the content-script/popup path so iOS stays current without depending on the alarm. macOS is fine.
- [ ] **Verify the flag swap + `web_accessible_resources` under Safari.** Resource URLs use the `safari-web-extension://` scheme; confirm `images/Palestine_Flag.png` still resolves and the `div.MRI68d` swap works after conversion.
- [ ] **Signing + distribution.** Needs a paid Apple Developer account. Set bundle IDs/signing in Xcode; test locally via Safari **Develop ▸ Allow Unsigned Extensions**. Ship via App Store Connect (App Review of `<all_urls>` + the remote dictionary, same scrutiny as the CWS item below), or notarized direct distribution for macOS only.
- [ ] **Decide iOS scope.** macOS is near-drop-in; iOS works but the popup is a different interaction and background is flakier. Recommend macOS-first, iOS as a follow-up.

## Open — Popup redesign follow-ups (2026-07-15)

From the design + eng review of the popup (score 4→8) and a fresh-agent gap check.
The redesign itself (empty state, first-run welcome, honest suggest flow, labeled
toggle, off-banner, self-hosted fonts + strict manifest CSP, language-driven font,
minimal RTL-mirrored table, `renderState` seam) shipped in this change with tests.
Fixed in-line during the gap check: blank suggest-confirm close button (added
`suggestConfirmClose` key), dead `word-header`/`replacement-header` i18n calls +
unused `word`/`replacement` keys, orphaned `thead`/`th` CSS.

Also now fixed:
- **Empty state redundant subtitle** — `renderState` hides `#replaced-words-subtitle`
  when the empty state is shown (title row + controls stay). Unit-tested in
  `popup-core.test.js`.
- **Color duplication in `buildRow`** — inline `#97700B`/`#000000` removed from
  `searchLink`; link colors now owned by `.replaced-words-table td a` in `styles.css`.

Skipped (accepted): converting `SpaceMono-*.ttf` → `.woff2` (~40% smaller) — low
value, fonts are packaged locally with no network cost.

## Open — P3 / accepted limitations

- [ ] **Flag swap (`div.MRI68d`) is Google-only and untested.** Selector rot would go unnoticed. Consider a generic image-match strategy or accept as best-effort.
- [ ] **`<all_urls>` scope.** Still runs on every site with no allowlist. Product decision, especially before Chrome Web Store submission. _Open question from the plan._
- [ ] **Cross-node multi-word matching.** "Tel `<em>`Aviv`</em>`" split across nodes won't match (matcher sees one text node at a time).
- [ ] **Initial full-document walk isn't chunked.** Fine on normal pages; revisit with `requestIdleCallback` only if real large pages show a main-thread stall.
- [ ] **Closed shadow roots** are browser-inaccessible — cannot be handled.
- [ ] **Chrome Web Store distribution.** Packaging + CI are in place (`npm run pack`, `.github/workflows/publish.yml`). Remaining listing steps — privacy-policy hosting and the `<all_urls>` / remote-dictionary review justifications — are captured in `STORE_SUBMISSION.md`.