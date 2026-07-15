#!/usr/bin/env node
// Copies ONLY the runtime allowlist (runtime-files.mjs) into a clean staging
// directory. This is the directory any packager — the Safari converter above
// all — must point at, NEVER the repo root (which also holds node_modules/,
// secrets/, tests, admin/, and tooling that must not ship).
//
// Usage:  node tools/stage.mjs [dest-dir]   (default: dist/staging)
// Also importable: `import { stage } from "./stage.mjs"`.

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_FILES, assertPresent } from "./runtime-files.mjs";

// Stage the allowlist into `dest`, wiping it first so a removed/renamed file
// upstream can't leave a straggler behind. Returns the absolute dest path.
export function stage(root, dest) {
  assertPresent(root);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const rel of RUNTIME_FILES) {
    cpSync(resolve(root, rel), resolve(dest, rel), {
      recursive: true,
      filter: (src) => !src.endsWith(".DS_Store"),
    });
  }
  return dest;
}

// CLI entry (skipped when imported).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const dest = stage(root, resolve(root, process.argv[2] || "dist/staging"));
  console.log(`✓ staged ${RUNTIME_FILES.length} entries → ${dest}`);
}
