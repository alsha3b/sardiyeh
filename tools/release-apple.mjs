#!/usr/bin/env node
// One-command Apple release for the Safari-extension container app — iOS and/or
// macOS, straight to App Store Connect (TestFlight).
//
// Usage:
//   node tools/release-apple.mjs            # both iOS and macOS  (npm run release:apple)
//   node tools/release-apple.mjs ios        # iOS only            (npm run release:ios)
//   node tools/release-apple.mjs macos      # macOS only          (npm run release:mac)
//
// Pipeline: regenerate the Xcode project ONCE (so both platforms share the same
// version + build number), then per platform: archive → export + upload. Both
// platforms use the same App Store path — `method: app-store-connect`,
// `destination: upload` — so macOS needs no separate notarization step (that's
// only for distribution outside the store).
//
// The upload and provisioning run non-interactively via an App Store Connect API
// key, so this works locally and in CI with no Xcode UI and no Apple-ID password.
//
// Required credentials (put them in the git-ignored .env — see .env.example):
//   APPLE_TEAM_ID   10-char Developer Team id (also used by build-safari.mjs)
//   ASC_KEY_ID      App Store Connect API key id
//   ASC_ISSUER_ID   App Store Connect API issuer id
//   ASC_KEY_PATH    path to AuthKey_<id>.p8  (default: first secrets/AuthKey_*.p8)
//
// Create the key once at App Store Connect → Users and Access → Integrations →
// App Store Connect API (role: App Manager so it can auto-create the extension's
// App ID + profiles), download the .p8 into secrets/, and record the two ids.
//
// Requires macOS + Xcode.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(root);

const PROJECT = resolve(root, "apple/Sardiya/Sardiya.xcodeproj");
const PLATFORMS = {
  ios: { label: "iOS", scheme: "Sardiya (iOS)", destination: "generic/platform=iOS" },
  macos: { label: "macOS", scheme: "Sardiya (macOS)", destination: "generic/platform=macOS" },
};

// ── which platforms? (args; default both) ─────────────────────────────────────
const selected = parsePlatforms(process.argv.slice(2));

// ── preflight: credentials ────────────────────────────────────────────────────
const team = process.env.APPLE_TEAM_ID;
const keyId = process.env.ASC_KEY_ID;
const issuerId = process.env.ASC_ISSUER_ID;
const keyPath = process.env.ASC_KEY_PATH
  ? resolve(root, process.env.ASC_KEY_PATH)
  : autoFindKey(root);

const missing = [];
if (!team) missing.push("APPLE_TEAM_ID");
if (!keyId) missing.push("ASC_KEY_ID");
if (!issuerId) missing.push("ASC_ISSUER_ID");
if (!keyPath || !existsSync(keyPath)) missing.push("ASC_KEY_PATH (AuthKey_*.p8)");
if (missing.length) {
  console.error(
    "✗ cannot upload to App Store Connect — missing credential(s):\n  " +
      missing.join("\n  ")
  );
  console.error(
    "\nAdd them to .env (see .env.example). Create the API key at App Store\n" +
      "Connect → Users and Access → Integrations → App Store Connect API\n" +
      "(role: App Manager) and download the .p8 into secrets/."
  );
  process.exit(1);
}

const auth = [
  "-authenticationKeyPath", keyPath,
  "-authenticationKeyID", keyId,
  "-authenticationKeyIssuerID", issuerId,
];
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

// ── regenerate the project once (shared version/build/team) ───────────────────
console.log(
  `▸ regenerating the Safari Xcode project (targets: ${selected
    .map((k) => PLATFORMS[k].label)
    .join(" + ")})…`
);
run("node", ["tools/build-safari.mjs"]);

// ── release each selected platform ────────────────────────────────────────────
const optionsPlist = resolve(root, "dist/ExportOptions.plist");
writeFileSync(optionsPlist, exportOptions(team));

for (const key of selected) release(PLATFORMS[key], key);

const { version } = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
console.log(
  `\n✓ Uploaded Sardiya ${version} to App Store Connect: ` +
    selected.map((k) => PLATFORMS[k].label).join(" + ")
);
console.log(
  "  Processing takes a few minutes; builds then appear under TestFlight\n" +
    "  (per platform). Assign to a test group to distribute. The first upload of\n" +
    "  a version needs the one-time export-compliance answer in App Store Connect."
);

// ── steps ─────────────────────────────────────────────────────────────────────

function release(p, key) {
  const outDir = resolve(root, "dist", key);
  const archivePath = join(outDir, "Sardiya.xcarchive");
  const exportDir = join(outDir, "export");

  console.log(`\n▸ [${p.label}] archiving "${p.scheme}"…`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  run("xcodebuild", [
    "-project", PROJECT,
    "-scheme", p.scheme,
    "-configuration", "Release",
    "-destination", p.destination,
    "-archivePath", archivePath,
    "archive",
    "-allowProvisioningUpdates", // let the API key mint app + extension profiles
    ...auth,
  ]);

  console.log(`▸ [${p.label}] exporting + uploading to App Store Connect…`);
  run("xcodebuild", [
    "-exportArchive",
    "-archivePath", archivePath,
    "-exportOptionsPlist", optionsPlist,
    "-exportPath", exportDir,
    "-allowProvisioningUpdates",
    ...auth,
  ]);
}

// ── helpers ───────────────────────────────────────────────────────────────────

function parsePlatforms(argv) {
  if (!argv.length) return ["ios", "macos"];
  const out = [];
  for (const raw of argv) {
    const a = raw.toLowerCase();
    const key = a === "mac" || a === "macos" || a === "osx" ? "macos" : a;
    if (!PLATFORMS[key]) {
      console.error(`✗ unknown platform "${raw}" — use: ios, macos (or omit for both)`);
      process.exit(1);
    }
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

// Upload straight to App Store Connect (TestFlight) with automatic signing.
// manageAppVersionAndBuildNumber=false keeps the build number build-safari.mjs
// stamped (a monotonic UTC timestamp) instead of letting Xcode rewrite it.
function exportOptions(teamID) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>${teamID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
`;
}

function autoFindKey(dir) {
  const s = resolve(dir, "secrets");
  if (!existsSync(s)) return "";
  const f = readdirSync(s).find((n) => /^AuthKey_.*\.p8$/.test(n));
  return f ? join(s, f) : "";
}

// Minimal .env reader (no dependency); mirrors tools/build-safari.mjs.
function loadEnv(dir) {
  const p = resolve(dir, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
