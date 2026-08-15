# Third banner image tier: tablets/unfolded foldables — App side

## This delivery is for the App folder (`pawvy-app`) only, targeting
## `staging`.

4 files changed: `server/database.js`, `server/routes/homepageBanners.js`,
`server/routes/publicContent.js`, `client/src/pages/Marketing.jsx`.

## What this adds

A third, optional image field per banner — **Tablet Image (4:3)** — for
viewports between phone-portrait and full desktop (iPads, an unfolded
Samsung Fold). Same pattern as the mobile image: fully optional, falls
back to the desktop image if not uploaded, independently replaceable,
independently cleaned up from the bucket on delete.

Every banner now has three possible image fields — Desktop (required),
Mobile (optional), Tablet (optional) — each falling back to the desktop
image if not set, so nothing ever breaks for a banner that only has one
or two of the three.

## Verification performed

- Real test: confirmed the tablet image saves correctly, appears in the
  public API response as `tabletImage`, and correctly falls back to the
  desktop image for a banner where no tablet-specific image was
  uploaded.
- Real cold-clone build: fresh `git clone` → applied all 4 files →
  `npm install` → full project build — passed with no errors.
- Byte-for-byte diff confirms every file in this zip matches what was
  cold-clone built and tested above.

## To apply

Apply together with the companion Website-side delivery.

```bash
cd /path/to/your/pawvy-app
git checkout staging
git pull origin staging
git checkout -- . && git clean -fd
```

Unzip this delivery's files into that folder (overwrite), then:

```bash
git add .
git commit -m "Add optional tablet-specific banner image (4:3), falls back to desktop when not set"
git push origin staging
```
