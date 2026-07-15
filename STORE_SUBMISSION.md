# Chrome Web Store submission notes

Reference for listing + review. Publishing mechanics (pack script, CI) live in
`tools/pack.mjs` and `.github/workflows/publish.yml`; this file holds the things
that are easy to lose: the privacy-policy hosting step, the listing copy, and the
review justifications reviewers ask for.

Tone note: this is a sensitive subject. All listing copy below is written to be
factual and diplomatic — it describes what the extension *does* (restores the
original, native names of places) and lets the reader draw the rest. Keep it that
way in edits.

- **Extension ID:** `mhojjemphcgfbjikablofecafbbkjafp`
- **Privacy policy source:** `privacy.md` (this repo)

## 1. Single purpose description (1000 char max)

Paste into the dashboard's **Single purpose** field:

> Sardiya has one purpose: to show the original, native names of places wherever
> they appear in the text you are already reading on the web. When it is turned
> on, it scans the visible text of the current page and, wherever it recognizes a
> location whose original name differs from the one displayed, it substitutes the
> original name — drawn from a community-maintained reference list of place-names.
> That is all it does. It shows no ads, adds no buttons or content to pages, does
> not touch what you type into forms, and does not read or record your browsing.
> It is an educational and cultural-heritage tool for readers who want to see the
> original names of places alongside the rest of the web they browse every day.

## 2. Permission justifications

Chrome asks for a justification for each permission and for broad host access.
Field-ready text for each:

### `storage`

> Used only to keep a small amount of state on the user's own device: (1) the
> reference list of place-names, cached locally so the extension works instantly
> and offline instead of re-downloading on every page load, and (2) the user's
> own preferences — whether the extension is on, and their chosen interface
> language. No page content, page addresses, or browsing history is ever stored.

### `alarms`

> Schedules a single background check, at most once per week, that refreshes the
> locally-cached reference list of place-names so newly-added names appear
> without the user having to reinstall or update. It does nothing else.

### Host permissions (`host_permissions`)

> **`https://firestore.googleapis.com/*`** — the extension downloads its reference
> list of place-names from a Firestore database at this origin. This is a
> read-only request for public, unauthenticated data; nothing about the user or
> the pages they visit is sent.
>
> **`https://www.google-analytics.com/*`** — anonymous, aggregate usage events
> (for example: install, on/off toggle, interface language changed, and a count
> of how many names were shown on a page) are sent here so we can understand
> usage and improve the extension. These requests never include the addresses,
> titles, or contents of the pages you visit.

### Broad host access (`<all_urls>` content-script match)

Broad host access triggers manual review. Paste into the **permission
justification** field:

> Sardiya restores the original, native names of places directly in the text of
> whatever page the user is reading. This is inherently **page-agnostic** — a
> place-name can appear on any site (news, maps, social, search, encyclopedias),
> so restricting to a fixed host allowlist would defeat the core feature. The
> content script only reads and rewrites visible text nodes; it does not collect
> page content, form input, or browsing history, and it makes no network requests
> from the page.

### Remote data vs. remote code (don't let a reviewer misclassify this)

> The reference list of place-names is fetched from Firestore as **data** (a JSON
> list of `{value, translation}` pairs), not executable code. No remote scripts
> are loaded or `eval`'d — this is Manifest V3 compliant. Analytics uses the GA4
> **Measurement Protocol** (plain HTTPS POSTs from the service worker), not the
> gtag.js remote library, so no remote code runs there either.

### Data use form

- Declare **anonymous usage / analytics data** only (GA4 via `src/analytics.js`).
- The extension does **not** collect personally identifiable information, health,
  financial, authentication, personal communications, location, web history, or
  user activity beyond an anonymous count of names shown. Certify that data is
  **not** sold, **not** used for creditworthiness, and **not** used for purposes
  unrelated to the extension's single purpose.

## 3. Store listing description (16,000 char max)

Paste into the **Description** field. Diplomatic by design — states what it does,
implies the rest.

> **See places by their original names.**
>
> Across the web — in news articles, on maps, in social posts, in search results
> and encyclopedia entries — many places are shown by names that replaced older,
> native ones. Sardiya (سرديّة, "the narrative") quietly restores those original
> names as you read.
>
> Turn it on, and Sardiya reads the visible text of the page in front of you.
> Wherever it recognizes a place whose original name differs from the one shown,
> it puts the original name back — right there in the text, with no pop-ups, no
> highlighting, and no disruption to how the page looks. Turn it off, and every
> page returns to normal instantly. You are always in control.
>
> **What it does**
>
> • Restores the original, native names of places wherever they appear in a
>   page's text.
> • Works everywhere you read — news, maps, social media, search, wikis, blogs.
> • Draws on a community-maintained reference list of place-names that grows over
>   time, so coverage improves without you doing anything.
> • Lets you suggest a name that's missing, straight from the popup.
> • Available in English and Arabic, with full right-to-left support.
>
> **Built to respect your page — and your privacy**
>
> • Sardiya changes only visible text. It never adds buttons, banners, or content
>   to a page, and it never touches what you type into forms, search boxes, or
>   messages.
> • It does not read, collect, or transmit the pages you visit. Your browsing
>   history stays on your device and never leaves it.
> • The only information ever sent is anonymous, aggregate usage statistics (such
>   as whether the extension is on and how many names were shown), used solely to
>   improve the extension. Each install is identified by a random, pseudonymous
>   id that is not tied to your identity.
> • Minimal permissions: it asks only for what it needs to store your settings,
>   refresh its list of names once a week, and download that list. Nothing more.
>
> **How it works**
>
> When a page loads, Sardiya scans its text for names it recognizes and swaps in
> the original ones — writing the text in place so nothing about the page's layout
> or behavior changes. As you scroll or the page updates, it keeps up
> automatically. Toggle it on or off any time from the toolbar; changes apply live,
> with no page reload.
>
> **A tool for memory**
>
> Names carry history. Sardiya is a small, open way to keep original place-names
> visible in everyday reading — an educational and cultural-heritage tool for
> anyone who wants to see places by the names they were first known by.
>
> Turn it on, read the web as you always do, and let the original names return.

## 4. Host the privacy policy at a public URL

The listing requires a **publicly reachable** privacy-policy URL. `privacy.md`
is the source of truth; it renders to `site/privacy.html` and is served from the
Firebase Hosting site already used for `admin/`.

Steps:
1. `npm run build:privacy` — renders `privacy.md` → `site/privacy.html`
   (`tools/render-privacy.mjs`, styled to match the admin dashboard).
2. `firebase deploy --only hosting`.
3. Paste `https://sardiyeh-elmokhtbr.web.app/privacy` into the CWS listing's
   **Privacy policy URL** field. (A `/privacy` → `/privacy.html` rewrite is
   configured in `firebase.json`.)

Always edit `privacy.md`, never `site/privacy.html` — re-run
`npm run build:privacy` and redeploy so the hosted copy never drifts.
