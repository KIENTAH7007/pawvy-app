# Pawvy App — Export Images Fix + Export for Partner

## What's in this delivery

1. **Bug fix**: the "Export Images" button on Products & Pricing was failing
   with `{"error":"Not logged in."}`.
2. **New feature**: a new "Export for Partner" button on Products & Pricing
   that downloads a spreadsheet (`.xlsx`) formatted for a business partner —
   Brand, Item Series, Variation, Barcode, RRP (SGD), RRP Online (SGD),
   Description, and an **actual embedded product photo** in the last column
   (not a link or filename).

Both buttons respect whatever Brand/Search/Show Archived filters are
currently applied on the page — same as Export CSV already does.

---

## Root cause of the Export Images bug

Every `/api/products/*` route requires a login token, sent as an
`Authorization: Bearer <token>` header. The old "Export Images" button
triggered the download with a plain `window.location.href = '/api/products/export-images'`
navigation — but a browser navigation (or an `<img>` tag) can **never** attach
a custom header like that. Only a real `fetch`/`XHR` call can. So the request
reached the server with no token at all, and the login check correctly
rejected it with `{"error":"Not logged in."}`.

The fix adds a proper authenticated-download helper (`api.downloadFile()`
in `client/src/api.js`) that does a real `fetch` with the auth header, reads
the response as a `Blob`, and triggers the save via a synthetic
`<a download>` click. "Export Images" now uses this, and the new
"Export for Partner" button is built the same way from day one.

## How the new Partner Export works

A new server route, `GET /api/products/export-partner-sheet`, builds the
`.xlsx` on the fly:

- Pulls products (with the same `brand_id` / `search` / `active` filters the
  page is currently using) and writes one row per product with the 7 text
  columns plus an empty 8th "Product Image" column.
- Fetches each product's actual photo — from the image bucket if the
  product has `image_url`, or from the older base64 `image_data` column as
  a fallback — exactly the same two-path lookup the existing "Export
  Images" ZIP button already uses.
- Embeds the real photo into the Product Image cell (scaled to fit a small
  box, aspect ratio preserved), not a filename or a link.
- A product with no photo, or an image that fails to load for any reason,
  just gets a blank image cell — it never fails the whole export.

This needed a new dependency, **`exceljs`**, because the existing `xlsx`
package in this project (SheetJS, community edition) can't embed images
into cells. A second new dependency, **`image-size`**, is used only to read
each photo's width/height so it can be scaled into the cell without
stretching/distorting it.

---

## Files changed/added

- `client/src/api.js` — added `downloadFile()`, a proper authenticated
  blob-download helper.
- `client/src/pages/Products.jsx` — fixed the Export Images button to use
  the new helper; added the new "Export for Partner" button and its
  handler.
- `server/routes/products.js` — added the new
  `GET /api/products/export-partner-sheet` route.
- `package.json` / `package-lock.json` — added `exceljs` and `image-size`
  as dependencies.

Nothing else was touched. No database schema changes, no changes to any
other route.

---

## Tested before delivery

- Started the server locally against a copy of the real database, logged in
  with a real PIN, and hit both endpoints with real HTTP requests
  (authenticated and unauthenticated) via `curl`.
- Confirmed `export-images` still returns a valid ZIP and correctly 401s
  without a token.
- Confirmed `export-partner-sheet` returns a valid `.xlsx` with the right 8
  columns, that the brand/search filters correctly narrow the rows, and
  that a product's seeded photo lands embedded in the correct row (verified
  by inspecting the generated file's internal XML directly, not just that
  a file came back).
- Cold `npm run build` across all three frontends (client, portal, POS) —
  all three built clean.

---

## How to apply

From your local `pawvy-app` checkout:

```bash
git checkout main
git pull origin main
```

Copy the files from this zip into your repo, preserving their folder
structure (overwrite the existing files at those same paths):

- `client/src/api.js`
- `client/src/pages/Products.jsx`
- `server/routes/products.js`
- `package.json`
- `package-lock.json`

Then install the two new dependencies (this also makes sure your local
`node_modules` matches the updated lock file):

```bash
npm install
```

Commit and push:

```bash
git add client/src/api.js client/src/pages/Products.jsx server/routes/products.js package.json package-lock.json
git commit -m "Fix Export Images auth bug; add Export for Partner spreadsheet"
git push origin main
```

Railway will redeploy automatically from `main` as usual. No other steps,
migrations, or environment variables are needed — this uses the same image
bucket and auth setup already in place.

Once it's live, on Products & Pricing you should see two working buttons:
**Export Images** (now fixed) and **Export for Partner** (new) sitting next
to Export CSV.
