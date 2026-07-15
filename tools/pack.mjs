#!/usr/bin/env node
// Builds a Chrome Web Store upload zip containing ONLY the files the extension
// ships at runtime — nothing from the dev/build/backend side. The repo root is
// the unpacked extension, so this is an explicit allowlist rather than an
// ignore-list (safer: a new dev file can't accidentally leak into the store zip).
//
// Usage: npm run pack  ->  dist/sardiya-<version>.zip

import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_FILES, assertPresent } from "./runtime-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));

// The allowlist lives in runtime-files.mjs so the Chrome zip and the Safari
// staging dir can never drift apart.
const INCLUDE = RUNTIME_FILES;
assertPresent(root);

const outDir = resolve(root, "dist");
const outZip = resolve(outDir, `sardiya-${version}.zip`);
mkdirSync(outDir, { recursive: true });
rmSync(outZip, { force: true });

// -r recurse dirs, -X strip extra file attrs, exclude any stray .DS_Store.
execFileSync("zip", ["-r", "-X", outZip, ...INCLUDE, "-x", "*.DS_Store"], {
  cwd: root,
  stdio: "inherit",
});

console.log(`\n✓ ${outZip}`);
console.log(`  version ${version} — ready to upload to the Chrome Web Store`);
