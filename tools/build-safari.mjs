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
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stage } from "./stage.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staged = stage(root, resolve(root, "dist/safari"));
const projectDir = resolve(root, "apple");

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
    "--bundle-identifier", "org.elmokhtbr.sardiya",
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

console.log(`\n✓ Safari project regenerated at apple/Sardiya/Sardiya.xcodeproj`);
console.log("  Open it in Xcode to build/run the iOS + macOS targets.");

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
