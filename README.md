# Image storage migration: base64 in SQLite → Railway Storage Bucket

## This delivery is for the App folder (`pawvy-app`) only

18 files changed/added (plus `package.json`/`package-lock.json` for the new
`@aws-sdk/client-s3` dependency), listed in full below.

## What this actually does

The "one big boss" SEO/performance item from the earlier assessment:
every product, homepage banner, and Instagram photo was stored as a giant
base64 string directly in the database and re-sent in full on every page
load and API response. This moves all three into your Railway Storage
Bucket, replacing that with a small stable URL.

**Scope note**: this covers all 3 tables that actually had live base64
images — not just products. Checked the real code rather than relying on
memory: `instagram_posts.image_data` turned out to still be genuinely
active (a stored screenshot per photo, not the "official embed" I had
noted from an earlier session — the actual code comment explains that
was deliberately replaced for reliability). Also found and fixed **POS
and Order Portal**, which I'd missed in the first pass of this work —
both display product photos too and were still reading the old
`image_data` field directly.

## New files

- `server/lib/bucket.js` — the S3-compatible client wrapper (upload/
  stream/delete/decode), used by every route that touches an image.
  Nothing else in the app talks to the bucket directly.
- `server/routes/uploads.js` — the public proxy route (`/api/uploads/*`).
  Railway Buckets are **private only** (confirmed against Railway's own
  docs — public buckets aren't supported as of Aug 2026), so this is the
  one place that actually streams a file out publicly. Sets
  `Cache-Control: public, max-age=31536000, immutable` — safe because
  every upload gets a fresh, unique key (id + timestamp), so a given URL's
  content never changes.
- `server/jobs/imageMigration.js` — the one-time, idempotent migration.
  Runs automatically right after the server starts listening (see
  `index.js`) — no manual script for you to run. Only ever processes rows
  where `image_url IS NULL AND image_data IS NOT NULL`, so every deploy
  after the first is a no-op. A corrupted or failed row is skipped and
  logged, not fatal — it'll simply retry on the next deploy.

## Changed files

- `server/database.js` — additive `image_url` column on `products`,
  `homepage_banners`, `instagram_posts`. `image_data` is untouched in the
  schema (still there for anything not yet migrated, or as a safety net).
- `server/index.js` — mounts the uploads route; runs the migration after
  `app.listen()`, not before. **Deliberate choice, and I got it wrong on
  the first pass**: originally planned to block startup until migration
  finished, then realized that risks Railway's healthcheck timing out on
  the very first deploy if there are a few hundred images to move (each
  one is a real network round-trip). A failed/restart-looping deploy is a
  much worse outcome than a brief window right after deploy where a
  handful of not-yet-migrated products show without an image — and that
  window closes itself within roughly a minute or two.
- `server/routes/products.js` — upload/delete now go through the bucket;
  image export ZIP pulls from the bucket for migrated products, falls
  back to base64 for anything not yet migrated.
- `server/routes/homepageBanners.js`, `server/routes/instagramPosts.js` —
  same pattern: upload to bucket, store `image_url`, clean up the old
  bucket object on replace/delete.
- `server/routes/publicContent.js`, `server/routes/shop.js`,
  `server/routes/pos.js`, `server/routes/portal.js` — all now select/
  return `image_url` instead of the bloated `image_data`.
- `client/src/pages/Products.jsx`, `client/src/pages/Marketing.jsx`
  (both the banner and Instagram sections) — admin previews, upload, and
  remove flows all updated to use `image_url` as the source of truth.
  Upload transport itself is unchanged (still reads the file as base64
  client-side and POSTs it) — only what the *server* does with it
  changed, so there was no need to touch the file-picker UI.
- `pos/src/ProductCard.jsx`, `pos/src/App.jsx`, `portal/src/ProductCard.jsx`,
  `portal/src/App.jsx` — straight field rename (`image_data` →
  `image_url`); both apps call the backend same-origin, so no URL
  prefixing needed, unlike the separate website deployment.

## Verification performed

**Real limitation, stated plainly**: this sandbox has no network route to
`storage.railway.app` (network-restricted), so none of this could be
tested against your actual bucket. Tested instead against a mocked S3
client (Node's `S3Client.prototype.send` intercepted with an in-memory
object store) — this verifies every code path genuinely works, but your
first real deploy is the first real end-to-end test against your actual
bucket. Watch the Railway deploy logs when this ships — the migration
logs its own progress (`🪣 Migrating N image(s)...`).

What the mocked tests actually covered:
- **Byte-level round-trip**: uploaded a real (tiny but genuine) PNG,
  confirmed the bytes streamed back out are byte-for-byte identical.
- **Missing-key handling**: confirmed the proxy route returns a clean 404
  rather than crashing when an image doesn't exist.
- **Migration correctness**: inserted real base64 test images across all
  3 tables, ran the migration, confirmed `image_url` is set and
  `image_data` is cleared for each, and a product with *no* image is left
  completely untouched.
- **Migration idempotency**: ran it a second time, confirmed zero bucket
  operations happen (nothing left to migrate).
- **Corrupted data doesn't crash the migration**: inserted a row with
  garbage in `image_data`, confirmed it's skipped with a warning (not
  thrown), left untouched for retry next deploy.
- **Full HTTP route test**: real Express server, real requests — upload
  a product image → confirm the returned URL actually serves the
  correct bytes back with the right `Content-Type` and long-lived
  `Cache-Control` → confirm the public shop endpoint returns `image_url`
  and has genuinely stopped including `image_data` in the response →
  delete the image → confirm both the bucket object and the DB fields
  are cleared.
- **Real cold-clone build**: fresh `git clone` → applied all 18 files →
  `npm install` → full project build (`client` + `portal` + `pos`, same
  as your existing build script) — passed with no errors.
- Re-ran the full HTTP route test a second time against the cold-clone
  copy specifically, not just the working directory.
- Byte-for-byte diff confirms every file in this zip matches what was
  cold-clone built and tested above.

## One real gap, not fixed here on purpose

Cart contents already sitting in a customer's browser (localStorage)
from before this ships will have the old `image_data` field, not
`image_url` — after deploy, any pre-existing cart items would show a
missing image until re-added. Minor and self-healing (carts are short-
lived), not worth the added complexity of a dual-format fallback for
what should be a rare, temporary edge case.

## To apply

```bash
cd /path/to/your/pawvy-app
git checkout -- . && git clean -fd && git pull origin main
```

Unzip this delivery's files into that folder (overwrite), then:

```bash
git add .
git commit -m "Migrate product/banner/Instagram images from base64 to Railway Storage Bucket"
git push origin main
```

Railway auto-deploys from `main`. Watch the deploy logs — you should see
`🪣 Migrating N image(s)...` lines shortly after `🐾 Pawvy is ready`, then
`🪣 Image migration complete: N migrated, 0 failed.` once it's done.
