# Per-device banner images (desktop + mobile) — App side

## This delivery is for the App folder (`pawvy-app`) only, targeting the
## `staging` branch (same as the rest of the carousel work).

4 files changed: `server/database.js`, `server/routes/homepageBanners.js`,
`server/routes/publicContent.js`, `client/src/pages/Marketing.jsx`.

## What this delivers (Option A, as agreed)

Each banner now has two image upload fields instead of one:

- **Desktop Image** (required) — 1920×1080, 16:9, as before
- **Mobile Image** (optional) — 4:5 portrait, composed specifically for
  phones so nothing gets cropped

Everything else about a banner stays shared and singular — one
headline, one link, one order position, one active window. This is
deliberately NOT two separate banner lists (that was the other option
discussed) — same content, just a device-appropriate image variant.

**Leaving the mobile image blank is fully supported** — the site falls
back to showing the desktop image on mobile too, so existing banners
(and any new ones staff doesn't get to right away) keep working exactly
as before with zero disruption.

Replacing one image never touches the other, and deleting a banner
cleans up both images from the bucket, not just one.

## Verification performed

- Real test, 5 scenarios: both images save correctly when both are
  provided; mobile stays genuinely null when not provided (not an empty
  string); the public endpoint correctly falls back to the desktop image
  when no mobile image exists; replacing only the mobile image leaves
  the desktop image completely untouched; deleting a banner cleans up
  both images from the bucket, not just one.
- Real cold-clone build: fresh `git clone` → applied all 4 files →
  `npm install` → full project build — passed with no errors.
- Re-ran the fallback test a second time against the cold-clone copy
  specifically.
- Byte-for-byte diff confirms every file in this zip matches what was
  cold-clone built and tested above.

## To apply

Apply together with the companion Website-side delivery — the two only
work correctly together.

```bash
cd /path/to/your/pawvy-app
git checkout staging
git pull origin staging
git checkout -- . && git clean -fd
```

Unzip this delivery's files into that folder (overwrite), then:

```bash
git add .
git commit -m "Add optional mobile-specific banner image, falls back to desktop image when not set"
git push origin staging
```

Railway's staging environment auto-deploys from `staging`.
