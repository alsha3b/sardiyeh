#!/usr/bin/env node
// Renders privacy.md -> site/privacy.html for Firebase Hosting.
//
// privacy.md stays the single source of truth (edit it, then re-run this and
// redeploy). The output is a self-contained static page styled to match the
// admin dashboard's dark theme. Referenced from STORE_SUBMISSION.md.
//
// Usage: npm run build:privacy  ->  site/privacy.html

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const md = readFileSync(resolve(root, "privacy.md"), "utf8");

// privacy.md's section headings are bold paragraphs (not `#` headings), and the
// in-page TOC links to custom anchors (#infocollect, ...) that have no matching
// ids. Map each numbered section to its anchor so the TOC actually navigates.
const SECTION_ANCHORS = [
  "infocollect", "infouse", "legalbases", "whoshare", "inforetain",
  "infosafe", "infominors", "privacyrights", "DNT", "uslaws",
  "policyupdates", "contact", "request",
];

let body = marked.parse(md, { gfm: true, breaks: false });

// Promote "**N. TITLE**" paragraphs to anchored <h2> headings.
body = body.replace(
  /<p><strong>(\d+)\.\s*(.*?)<\/strong><\/p>/g,
  (m, num, title) => {
    const id = SECTION_ANCHORS[Number(num) - 1];
    return id
      ? `<h2 id="${id}">${num}. ${title}</h2>`
      : `<h2>${num}. ${title}</h2>`;
  },
);
// Give the TOC block a landing id and drop stray hard-break backslashes.
body = body
  .replace(/<p><strong>TABLE OF CONTENTS<\/strong><\/p>/, '<h2 id="toc">Table of Contents</h2>')
  .replace(/\\(<\/(?:p|a)>)/g, "$1")
  .replace(/\\<br>/g, "<br>");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>سرديّة — Privacy Policy</title>
    <meta name="robots" content="index,follow" />
    <style>
      :root {
        --bg: #0f1115;
        --panel: #171a21;
        --line: #262b36;
        --text: #e6e9ef;
        --muted: #9aa4b2;
        --accent: #2f9e6b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font: 16px/1.65 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
      }
      header h1 { font-size: 17px; margin: 0; font-weight: 600; }
      main { max-width: 820px; margin: 0 auto; padding: 32px 20px 64px; }
      a { color: var(--accent); }
      h1, h2, h3, h4 { line-height: 1.3; }
      hr { border: none; border-top: 1px solid var(--line); margin: 28px 0; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      th, td {
        text-align: left; padding: 8px 10px;
        border: 1px solid var(--line); vertical-align: top;
      }
      th { color: var(--muted); font-weight: 600; background: var(--panel); }
      code { background: var(--panel); padding: 1px 5px; border-radius: 4px; }
      strong { color: #fff; }
      ul { padding-left: 22px; }
      li { margin: 4px 0; }
    </style>
  </head>
  <body>
    <header><h1>سرديّة — Privacy Policy</h1></header>
    <main>
${body}
    </main>
  </body>
</html>
`;

const out = resolve(root, "site", "privacy.html");
writeFileSync(out, html);
console.log(`✓ ${out}`);
