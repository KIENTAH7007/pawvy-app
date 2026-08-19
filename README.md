# Pawvy App — Sibling Lookup Fix, "Joint" Rename, Testimonial Photo Hints

Target branch: **staging**
Repo: `pawvy-app`

**Apply this one FIRST** — the website patch (separate zip) depends on
the new `?ids=` filter here.

## What's in this patch

### 1. `server/routes/shop.js` — bulk `?ids=` fetch, fixing the missing variant switcher

This is the fix for your #4 — the variant switcher not showing up on
multi-variant products. Root cause, confirmed with real GiGwi seed data:
GiGwi's color variants are matched by distinct SKU prefixes, meaning
each color is a genuinely different `item_series` in the database, not
a shared series with a different `variation`. My earlier fix
(`?item_series=` exact match) only works for brands where sizes/flavors
share one `item_series` — it silently failed for GiGwi specifically,
which is exactly the product you tested with.

Real proof, using your actual seed data: a GiGwi product's `item_series`
match returned exactly 1 result (itself) — confirming why the switcher
never appeared. The new `?ids=1,2,3` bulk-fetch, used from the website
side now, correctly returns all 3.

`GET /api/shop/products?ids=12,45,88` — returns exactly those products,
in one request. Malformed or nonexistent IDs return a clean empty
result, never an error.

### 2. `client/src/constants.js` — "Joints" → "Joint"

Label only — the underlying slug (`joints`) is unchanged, so nothing
you've already tagged in S-App needs re-tagging.

### 3. `client/src/pages/Marketing.jsx` — testimonial photo size hints

Answers your sizing question directly in the admin UI, same convention
as the banner upload fields: **900×1200px (3:4 portrait)** for Photo 1,
same size for Photo 2 ("After") — noted that each photo keeps its own
portrait shape side by side on the website, not squeezed into a shorter
slice (see the website patch's CSS fix for the "images cut off" issue).

## Verification performed

- 3 real backend tests for `?ids=`: correct products returned for a
  valid list, clean empty result for nonexistent IDs, graceful handling
  of malformed input (no crash).
- **Reproduced your exact bug with real seed data**: confirmed GiGwi
  products in the seed catalog do have distinct `item_series` per
  color (checked a sample of 10 — all 10 unique), confirmed the old
  `item_series` approach really did return only 1 result for a real
  GiGwi product, and confirmed the new `?ids=` approach correctly
  returns all 3 for the same set.
- `client` builds clean via `npm run build`.
- All 3 changed files byte-diffed against what was tested — identical.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite these files:
#   server/routes/shop.js
#   client/src/pages/Marketing.jsx
#   client/src/constants.js

git add .
git commit -m "Add ?ids= bulk fetch (fixes variant switcher for brands with per-variant item_series like GiGwi), rename Joints to Joint, add testimonial photo size hints"
git push origin staging
```
