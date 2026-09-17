// Single source of truth for the files the extension ships at RUNTIME.
//
// The repo root *is* the unpacked Chrome extension, so it also holds things that
// must never reach a shipped bundle — node_modules/, secrets/, tests, admin/,
// tooling, and docs. Both packagers build from this allowlist instead of the
// repo root, so a newly-added dev file can't silently leak into a store upload
// or the Safari app target:
//   - tools/pack.mjs        → Chrome Web Store zip
//   - tools/stage.mjs       → clean staging dir fed to the Safari converter
//
// Everything here is referenced by manifest.json, directly or transitively.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const RUNTIME_FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.js",
  "index.html",
  "styles.css",
  "src/matcher.js",
  "src/dom.js",
  "src/track-client.js",
  "src/analytics.js",
  "src/worker-core.js",
  "src/popup-core.js",
  "icons",
  "images",
  "fonts",
  "translations",
  "LICENSE",
];

// Fail loudly if the allowlist drifts from what's on disk (a rename upstream
// would otherwise ship a broken bundle).
export function assertPresent(root) {
  const missing = RUNTIME_FILES.filter((p) => !existsSync(resolve(root, p)));
  if (missing.length) {
    console.error("✗ missing required runtime file(s):\n  " + missing.join("\n  "));
    process.exit(1);
  }
}
