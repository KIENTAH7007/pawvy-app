# Out-of-stock items sink to the bottom — Website, POS, Order Portal

## This delivery is for the App folder (`pawvy-app`) only

3 files changed: `server/routes/shop.js`, `server/routes/pos.js`, `server/routes/portal.js`.

## What changed

All three catalogue queries (public shop, POS, Order Portal) now sort
out-of-stock items to the bottom — **within their own brand group**, not
pulled out to the end of the whole list. Brand grouping stays exactly as
it was (`b.name` is still the top-level sort key); this just adds one
more tier underneath it. Everything else about the existing order
(`portal_sort_order`, then `item_series`, then `variation`) is completely
unchanged for both the in-stock and out-of-stock groups.

Same threshold as the existing `stockStatus()` helper (`lib/pricing.js`)
already uses: combined Home + Storhub quantity `<= 0` counts as
out-of-stock. Nothing new introduced — matches what "greyed out" already
means everywhere else in the system.

## Verification performed

- Real test across all 3 endpoints: inserted 4 products in a deliberately
  scrambled order (2 in-stock, 2 out-of-stock), confirmed all three
  return them with in-stock items first and out-of-stock items last,
  identically.
- Confirmed brand grouping is still the top-level sort — checked that
  every brand's products appear as one contiguous block in the results,
  not interleaved by stock status across brands (this was the exact
  "Option A vs Option B" distinction confirmed with you beforehand).
- Real cold-clone build: fresh `git clone` → applied all 3 files →
  `npm install` → syntax check — passed with no errors.
- Re-ran the sort test a second time against the cold-clone copy
  specifically.
- Byte-for-byte diff confirms every file in this zip matches what was
  tested above.

## To apply

```bash
cd /path/to/your/pawvy-app
git checkout -- . && git clean -fd && git pull origin main
```

Unzip this delivery's files into that folder (overwrite), then:

```bash
git add .
git commit -m "Sort out-of-stock items to the bottom (within brand) on Website, POS, and Order Portal"
git push origin main
```

Railway auto-deploys from `main`. Apply together with the companion
Website-side delivery (GiGwi's category cards + the other 5 brands'
product cards) for the full picture — this delivery alone covers the
plain Shop grid, POS, and Order Portal; the dedicated brand pages'
product cards need that separate delivery too.
