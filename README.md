# Hide internal "Pawvy" brand from the public Shop filter

## This delivery is for the App folder (`pawvy-app`) only

Only one file changed: `server/routes/shop.js`.

## What changed

`GET /api/shop/brands` (powers the Shop page's brand filter dropdown) now
excludes internal-only brand entries via a new `WEBSITE_HIDDEN_BRAND_NAMES`
list — same pattern already used for `WEBSITE_HIDDEN_BARCODES` (the
groomer-size Lillidale exclusion) just above it in the same file. Currently
just `['Pawvy']`. This only affects the public website's filter dropdown —
`is_active`, POS, Portal, and the internal Pawvy App are all untouched.

Confirmed with you: the "Pawvy" brand has **no active products**, so
nothing else needed changing — "All brands" (unfiltered) was already not
showing anything under it.

## Verification performed

- Real cold-clone build: fresh clone → applied this file → `npm install` —
  clean.
- Real smoke test: inserted a "Pawvy" row and an unrelated test brand into
  a seeded DB copy, ran the actual filter logic, confirmed Pawvy is
  excluded and the other brand (and all 6 real brands) are unaffected.
- Byte-for-byte diff confirms the zipped file matches what was tested.

## To apply

```bash
cd /path/to/your/pawvy-app
git checkout -- . && git clean -fd && git pull origin main
```

Unzip this delivery's `server/routes/shop.js` into that folder (overwrite), then:

```bash
git add .
git commit -m "Shop: hide internal Pawvy brand from public filter dropdown"
git push origin main
```

Railway auto-deploys from `main` — no other steps needed.
