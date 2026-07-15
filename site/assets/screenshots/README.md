# Landing page screenshots

Drop the images here — the landing page (`site/index.html`) references these
exact filenames. Until a file exists, the page shows a labelled placeholder
frame, so nothing breaks.

| File | Shown as | Suggested shot |
|------|----------|----------------|
| `popup.png`   | The popup | Extension popup: the on/off toggle + the "replaced words" table populated on a real page. |
| `page.png`    | Before / after | A real web page with names restored — ideally a split or annotated before→after. |
| `suggest.png` | Suggest a name | The add-word / suggestion dialog in the popup. |

Guidance:
- Aspect ratio ~16:10 (the frames are `aspect-ratio: 16/10`, images are `object-fit: cover`).
- Export at 2× (e.g. 1600×1000) for crisp display on retina screens.
- PNG for UI crispness; keep each under ~400 KB if you can.
- Dark UI screenshots sit best against the page's dark background.

To add more slots, copy a `<figure>` block in the `#see` section of `site/index.html`.
