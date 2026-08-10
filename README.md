# HOTFIX — Every image broken everywhere (missing PIN-gate exclusion)

## This is for the App folder (`pawvy-app`) only

1 file changed: `server/index.js`.

## Root cause

The image proxy route (`/api/uploads/*`, added in the bucket migration
delivery) was mounted correctly, but I never added it to the PIN-gate's
exclusion list — the same list `/shop`, `/portal`, `/pos`, and others are
already on. Every request to `/api/uploads/*` was hitting
`auth.requireAuth`, which hard-401s anything without a Bearer token.

This explains every symptom you reported at once:

- **New uploads immediately broken**: the upload itself is an
  authenticated `fetch()` call and succeeded fine — but the moment the
  browser tries to *display* the result via `<img src>`, that's a plain
  image request with no Authorization header. Browsers never attach
  custom headers to `<img>` tags.
- **Even the logged-in admin app couldn't see its own thumbnails**: same
  reason — your session token lives in `localStorage` and only gets
  attached by the app's `fetch()` wrapper, never by native `<img>` loads.
- **Website, POS, Portal**: all hit the same wall regardless of their own
  endpoints already being correctly public — `/api/uploads` itself was
  simply never on the exclusion list.

The bucket, the migration, the route's actual logic, every frontend
component — all genuinely fine, confirmed by the 192 real files already
sitting in your bucket at the correct sizes. This was a single missing
line in the access-control list, not a problem with the migration
itself.

## The fix

One line added to the PIN-gate's exclusion check in `server/index.js`:

```diff
- if (req.path.startsWith('/portal') || ... || req.path === '/health') return next();
+ if (req.path.startsWith('/portal') || ... || req.path.startsWith('/uploads') || req.path === '/health') return next();
```

## Verification performed

Rebuilt the *actual* PIN-gate middleware (not a simplified stand-in) and
ran a real end-to-end test against it:

- Uploaded a real image with a valid staff auth token — confirmed it
  still succeeds (this part was never broken).
- Fetched the resulting `image_url` **with no Authorization header at
  all** — exactly what a browser's `<img>` tag does — confirmed this now
  returns `200` with the correct image bytes (this is the exact bug,
  reproduced and confirmed fixed).
- Confirmed a genuinely staff-only route (`/api/products`, the full
  product list) **still correctly returns 401 with no auth** — the fix
  only opens the one route that needs to be public, nothing else.
- Real cold-clone build: fresh `git clone` → applied the full current
  state of the repo (matching what you already have from the prior
  bucket delivery) plus this fix → `npm install` → full project build
  (client + portal + pos) — passed with no errors.
- Re-ran the exact same end-to-end test a second time against the
  cold-clone copy specifically.
- Byte-for-byte diff confirms the zipped file matches what was tested.

## To apply

```bash
cd /path/to/your/pawvy-app
git checkout -- . && git clean -fd && git pull origin main
```

Unzip this delivery's `server/index.js` into that folder (overwrite),
then:

```bash
git add .
git commit -m "Hotfix: /api/uploads was still behind the staff PIN gate, breaking every image everywhere"
git push origin main
```

Railway auto-deploys from `main`. No re-migration needed — your 192
images are already safely in the bucket; this fix just lets everything
actually *see* them. Should be visible everywhere (website, admin app,
POS, Portal) immediately once deployed.
