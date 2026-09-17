#!/usr/bin/env node
// Regenerates the Safari Web Extension Xcode project (apple/) from a CLEAN
// staging dir — never the repo root.
//
// The first conversion was run against the repo root and swept node_modules/,
// secrets/, tests, admin/, and tooling into the app target as in-place
// references (they'd ship inside the .app). This pipeline instead:
//   1. stages only the runtime allowlist into dist/safari/ (stage.mjs), and
//   2. passes --copy-resources so the project physically copies just those
//      files rather than referencing paths back in the repo.
//
// Requires macOS + Xcode (xcrun safari-web-extension-converter).
// Usage:  node tools/build-safari.mjs

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stage } from "./stage.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staged = stage(root, resolve(root, "dist/safari"));
const projectDir = resolve(root, "apple");

// The App Store Connect app record uses this bundle id; the extension target
// derives from it as `<id>.Extension`.
const BUNDLE_ID = "com.elmokhtbr.sardiya";

// Everything the archive needs is derived, never hand-set in Xcode — because the
// converter regenerates the project from scratch on every run (rmSync below), so
// any manual signing/version edit would be wiped. Instead we patch the generated
// pbxproj here:
//   - marketing version  ← manifest.json "version" (single source of truth)
//   - build number       ← APPLE_BUILD env, else a monotonic UTC timestamp
//   - signing team       ← APPLE_TEAM_ID env (or .env), for automatic signing
loadEnv(root); // pick up APPLE_TEAM_ID / APPLE_BUILD from a git-ignored .env
const { version } = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const build = process.env.APPLE_BUILD || utcStamp();
const team = process.env.APPLE_TEAM_ID || "";

// Fresh project each run. --force already overwrites, but dropping the old tree
// first guarantees no stragglers survive a rename/removal upstream.
rmSync(projectDir, { recursive: true, force: true });

console.log(`▸ converting ${staged} → ${projectDir}`);
execFileSync(
  "xcrun",
  [
    "safari-web-extension-converter",
    staged,
    "--project-location", projectDir,
    "--app-name", "Sardiya",
    "--bundle-identifier", BUNDLE_ID,
    "--swift",
    "--copy-resources",
    "--no-open",
    "--no-prompt",
    "--force",
  ],
  { cwd: root, stdio: "inherit" }
);

// The converter's generated container-app landing page (Main.html) only tells
// the user how to *enable* the extension — it never mentions that Safari also
// needs per-site host permission ("Allow on Every Website"), without which
// replacement silently never runs. Main.html is regenerated on every build, so
// we can't hand-edit it; patch it here instead. The popup carries the same hint
// (index.html + translations), but the container app is the first screen a
// Safari user sees, so it's worth stating there too.
patchContainerApp(projectDir);

// Stamp version / build number / signing team into the fresh project so an
// archive is ready with no manual Xcode step.
patchBuildSettings(projectDir, { version, build, team });

console.log(`\n✓ Safari project regenerated at apple/Sardiya/Sardiya.xcodeproj`);
console.log(`  version ${version} (build ${build})  bundle ${BUNDLE_ID}`);
if (team) {
  console.log(`  signing team ${team} — archive/upload ready.`);
} else {
  console.log(
    "  ⚠ no signing team: set APPLE_TEAM_ID (in .env or the environment) so\n" +
      "    archives sign automatically. Find it at developer.apple.com → Membership."
  );
}

function patchContainerApp(dir) {
  const MARKER = "sardiya-permission-hint";
  // Bilingual (en + ar) — the converter's container app isn't localized, so we
  // show both rather than rely on the device language.
  const note =
    `\n    <!-- ${MARKER} -->\n` +
    `    <p class="sardiya-permission-hint" style="max-width: 32em; margin: 1em auto; line-height: 1.5;">` +
    `Once enabled, open any website, click the سرديّة button in Safari’s toolbar, ` +
    `and choose “Allow on Every Website” — otherwise names won’t be replaced.</p>\n` +
    `    <p class="sardiya-permission-hint" dir="rtl" style="max-width: 32em; margin: 1em auto; line-height: 1.5;">` +
    `بعد التفعيل، افتح أي موقع واضغط على زر سرديّة في شريط أدوات Safari ` +
    `واختر «السماح على كل المواقع»، وإلا فلن يتم استبدال الأسماء.</p>\n`;

  const targets = findFiles(dir, "Main.html");
  if (!targets.length) {
    console.warn("⚠ no Main.html found to patch — container-app hint skipped");
    return;
  }
  for (const file of targets) {
    let html = readFileSync(file, "utf8");
    if (html.includes(MARKER)) continue; // idempotent
    if (!html.includes("</body>")) continue;
    html = html.replace("</body>", `${note}</body>`);
    writeFileSync(file, html);
    console.log(`  ↳ patched ${file.replace(dir + "/", "")}`);
  }
}

function findFiles(dir, name) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findFiles(full, name));
    else if (entry.name === name) out.push(full);
  }
  return out;
}

// Rewrite the generated pbxproj's version/build in every build config, and the
// signing team when one is provided. The converter emits one buildSettings block
// per target × configuration (8 total), each with its own copy of these keys, so
// we replace globally rather than once.
function patchBuildSettings(dir, { version, build, team }) {
  const pbx = join(dir, "Sardiya/Sardiya.xcodeproj/project.pbxproj");
  if (!existsSync(pbx)) {
    console.warn("⚠ project.pbxproj not found — version/signing patch skipped");
    return;
  }
  let s = readFileSync(pbx, "utf8");
  s = s.replace(/MARKETING_VERSION = [^;]*;/g, `MARKETING_VERSION = ${version};`);
  s = s.replace(/CURRENT_PROJECT_VERSION = [^;]*;/g, `CURRENT_PROJECT_VERSION = ${build};`);
  if (team) {
    if (/DEVELOPMENT_TEAM = /.test(s)) {
      s = s.replace(/DEVELOPMENT_TEAM = [^;]*;/g, `DEVELOPMENT_TEAM = ${team};`);
    } else {
      // The converter omits DEVELOPMENT_TEAM entirely; add one (matching the
      // block's indentation) right after each CODE_SIGN_STYLE line.
      s = s.replace(
        /(\n(\t*)CODE_SIGN_STYLE = [^;]*;)/g,
        `$1\n$2DEVELOPMENT_TEAM = ${team};`
      );
    }
  }
  writeFileSync(pbx, s);
}

// Monotonic, state-free build number: UTC yyyymmddHHMM. Always increases run over
// run, so App Store Connect never rejects a re-upload for a non-incrementing build.
function utcStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
  );
}

// Minimal .env reader (no dependency): loads KEY=value lines that aren't already
// set in the environment. Mirrors how the repo's Chrome credentials are handled.
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
