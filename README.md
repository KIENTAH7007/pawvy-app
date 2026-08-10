# Fix: replacing a product image now cleans up the old bucket file

## This delivery is for the App folder (`pawvy-app`) only

1 file changed: `server/routes/products.js`.

## What was wrong

Found while answering your question about how bucket cleanup works: the
product image "Replace Image" flow (Products & Pricing) was the one place
that didn't clean up the old bucket file when a new one replaced it —
banners and Instagram posts already did this correctly, products didn't.
Not a broken feature exactly (the new image always displayed correctly),
just a silent, growing pile of orphaned old files in the bucket every time
a product photo got replaced rather than removed outright.

## The fix

`POST /:id/image` now looks up the product's current `image_url` before
uploading, and — **only after the new upload succeeds** — deletes the old
bucket object. Order matters here: if the new upload ever failed, the old
image stays untouched rather than the product ending up with no image at
all.

## Verification performed

- Real test: uploaded an image, replaced it with a second one, confirmed
  the bucket ends up with exactly 1 object (not 2), confirmed the
  database points at the new URL, and confirmed the new image is still
  actually servable through the proxy route after the swap.
- Real cold-clone build: fresh `git clone` → applied the full current
  repo state (matching what you already have) plus this fix →
  `npm install` → full project build — passed with no errors.
- Re-ran the same test a second time against the cold-clone copy
  specifically.
- Byte-for-byte diff confirms the zipped file matches what was tested.

## To apply

```bash
cd /path/to/your/pawvy-app
git checkout -- . && git clean -fd && git pull origin main
```

Unzip this delivery's `server/routes/products.js` into that folder
(overwrite), then:

```bash
git add .
git commit -m "Fix: replacing a product image now cleans up the old bucket file"
git push origin main
```

Railway auto-deploys from `main`. Nothing to migrate or clean up
retroactively — any already-orphaned files from before this fix are
tiny (fractions of a cent each) and not worth chasing down; this just
stops new ones from accumulating going forward.
