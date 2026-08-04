# Fix: Hide Lillidale Ear Cleaner 2.5L (Groomer) from public website only

## What changed
`server/routes/shop.js` — added a `WEBSITE_HIDDEN_BARCODES` exclusion
list, currently containing one entry: `5060518442339` (Lillidale Ear
Cleaner 2.5L Groomer size). Applied to all three routes in this file:
`GET /products`, `GET /products/:id`, and `GET /top-sellers`.

## Why
This is a trade/bulk size meant for professional groomers, not public
retail — but it was reachable and orderable on the public website Shop.

## What did NOT change
- **Database**: no schema change, no `is_active` flag touched. The
  product row is untouched.
- **POS** (`server/routes/pos.js`): completely separate route file,
  reads its own `/api/pos/catalogue` — untouched, product still fully
  scannable/sellable in-store.
- **Order Portal** (`server/routes/portal.js`): also a separate route
  file — untouched, product still orderable there for wholesale/
  consignment customers.
- **pawvy-website**: no changes needed. The website only ever talks to
  `/api/shop/*`, and doesn't hardcode this product anywhere else
  (checked — no matches for the barcode or product name in the repo).

Only the public-facing `/api/shop` routes (used exclusively by
pawvy-website) are affected.

## How it's matched
By barcode, not internal database `id` — the seed database and your
live production database can have different auto-increment IDs for
the same product, so barcode is the stable identifier across
environments.

## Verified
- Full cold-clone simulation: fresh `git clone`, `npm install` from
  scratch, seeded from `data/seed.db`, real Express app spun up, real
  HTTP requests made against the actual route handler (not just
  `node --check`).
- Confirmed: the 2.5L product is excluded from both the full catalogue
  listing and brand-filtered listing.
- Confirmed: a direct fetch of its product-detail URL by ID now
  returns 404 (can't be reached by a shared/guessed link either).
- Confirmed: every other Lillidale product (e.g. the regular 250ml Ear
  Cleaner) is completely unaffected — still listed, still fetchable.
- Confirmed: `pos.js` and `portal.js` have zero references to the new
  exclusion list — grepped to be sure.

## To apply
1. `git checkout main`
2. `git pull origin main`
3. Unzip this delivery on top of your local `pawvy-app` folder
   ("Copy and Replace") — only touches `server/routes/shop.js`
4. `git add -A`
5. `git commit -m "Hide Lillidale 2.5L Groomer ear cleaner from public website Shop only"`
6. `git push origin main`

Railway auto-deploys `pawvy-app` from `main` on push. The website
itself needs no redeploy — it just calls the updated API.

## If you ever need to hide another product from the website only
Add its barcode to the `WEBSITE_HIDDEN_BARCODES` array at the top of
`server/routes/shop.js` — one line, no other changes needed.
