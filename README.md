# Homepage banner carousel — App side (with Show/Hide caption toggle)

## This delivery is for the App folder (`pawvy-app`) only

4 files changed: `server/database.js`, `server/routes/homepageBanners.js`,
`server/routes/publicContent.js`, `client/src/pages/Marketing.jsx`.

This supersedes the earlier "Homepage Banner Carousel" delivery — same
carousel fix, plus one addition based on your follow-up (your existing
banner images already have designed-in text, so a second overlay caption
can look redundant).

## What's new in this version

Each banner now has a **"Show this headline as a caption on the banner
image"** checkbox, on by default.

- **Checked** (default): works exactly as before — the headline shows as
  an overlay caption on the banner.
- **Unchecked**: the headline still exists as real text in the page —
  still the real H1 for the first banner, still real `alt` text on the
  image — it's just not visibly rendered on screen. Standard, legitimate
  accessibility technique (screen-reader-only text), not the same thing
  as hiding content from Google while showing something different to
  visitors.

The admin table shows a small "HIDDEN" badge next to any banner with the
caption turned off, and a small "H1" badge (from the earlier delivery)
next to whichever banner is currently first in order — so it's clear at
a glance which banner is driving the page's real heading, and whether
its text is visible or not.

## The actual bug this whole feature started from, still fixed

The public endpoint used `LIMIT 1` — it only ever showed one banner no
matter how many you added. Now returns every currently-active banner,
ordered.

## Verification performed

- Real test against the actual public endpoint: confirmed
  `showCaption: true` and `showCaption: false` both come through
  correctly per-banner.
- Real cold-clone build: fresh `git clone` → applied all 4 files →
  `npm install` → full project build — passed with no errors.
- Re-ran the test a second time against the cold-clone copy
  specifically.
- Byte-for-byte diff confirms every file in this zip matches what was
  cold-clone built and tested above.

## To apply

Apply together with the companion Website-side delivery — the two only
work correctly together. If you already applied the earlier version of
this delivery, just apply this one on top — it's the complete, current
state of all 4 files, not a diff.

```bash
cd /path/to/your/pawvy-app
git checkout -- . && git clean -fd && git pull origin main
```

Unzip this delivery's files into that folder (overwrite), then:

```bash
git add .
git commit -m "Homepage banner: add per-banner Show/Hide caption toggle"
git push origin main
```

Railway auto-deploys from `main`.
