// Source-level guards for popup wiring. popup.js is an IIFE that binds chrome
// and the live DOM, so its internals aren't directly importable; and jsdom
// applies no stylesheets, so a computed-font assertion (body[dir] → font-family)
// can't work. These guards assert the load-bearing facts at the source level.
const fs = require("fs");
const path = require("path");

const read = (p) => fs.readFileSync(path.join(__dirname, "../../", p), "utf8");

describe("popup.js font override (ET3 regression)", () => {
  const src = read("popup.js");

  test("no inline fontFamily override — font must follow language via CSS", () => {
    // The old bug: popup.js unconditionally set
    //   document.body.style.fontFamily = "'IBM Plex Sans Arabic', sans-serif";
    // which forced one font for both languages. It must be gone so body /
    // body[dir="rtl"] rules (Space Mono LTR, Thmanyah Sans RTL) apply.
    expect(src).not.toMatch(/style\.fontFamily\s*=/);
    expect(src).not.toContain("IBM Plex Sans Arabic");
  });
});

describe("popup wiring", () => {
  test("popup.js routes view state through renderState + keeps analytics", () => {
    const src = read("popup.js");
    expect(src).toContain("renderState");
    expect(src).toContain("sendTrack"); // analytics preserved through the merge
  });

  test("index.html loads track-client before popup.js so sendTrack is defined", () => {
    const html = read("index.html");
    const track = html.indexOf("src/track-client.js");
    const popup = html.indexOf('src="popup.js"');
    expect(track).toBeGreaterThan(-1);
    expect(popup).toBeGreaterThan(-1);
    expect(track).toBeLessThan(popup);
  });

  test("index.html loads no remote CDN resources (CSP-safe)", () => {
    const html = read("index.html");
    expect(html).not.toMatch(/https?:\/\/cdn\./);
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/http-equiv=["']Content-Security-Policy/i);
  });

  test("styles.css self-hosts fonts and drops the Google Fonts @import", () => {
    const css = read("styles.css");
    expect(css).not.toMatch(/@import[^;]*googleapis/);
    expect(css).toContain("@font-face");
    expect(css).toContain("fonts/SpaceMono-Regular.ttf");
    expect(css).toContain("fonts/thmanyahsans-Regular.woff2");
  });

  test("manifest defines a strict extension_pages CSP", () => {
    const mf = JSON.parse(read("manifest.json"));
    expect(mf.content_security_policy.extension_pages).toContain("script-src 'self'");
  });
});
