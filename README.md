# Pawvy App — Public Shop-by-Need Endpoints

Target branch: **staging**
Repo: `pawvy-app`

This is the backend piece Phase 1 (the actual website build) needs to
even start — the public, no-login endpoints the website will call.
Everything from here on out (homepage need cards, the `/shop?need=`
page, testimonials display) is website-side (`pawvy-website`) work that
calls these.

Only one file changed this round — everything from the previous three
deliveries (need tags, testimonials, waitlist) is already on your
staging and confirmed matching, so nothing else needed to move.

## What's in this patch (`server/routes/shop.js`)

### 1. `?need=` filtering on the existing product list

`GET /api/shop/products?need=dental` now returns only products tagged
with that need. Validated against the canonical need list first — an
unknown/typo'd `?need=` value returns a clear 400 instead of silently
returning an empty list that'd be confusing to debug later. No `?need=`
param at all still works exactly as before (existing brand/search
filters, full catalogue) — this is purely additive.

Also added `need_tags` and `best_for` to both the product list and
single-product-detail responses — the website will need these to render
category chips and the "Best for" line from the original UX review.

### 2. `GET /api/shop/pawvy-picks`

The homepage's curated section — only products staff have flagged via
the Shop Settings modal in Products & Pricing. Deliberately **not**
sales-ranked (that's what the existing `/top-sellers` endpoint is for,
used elsewhere for the cart upsell) — this is purely editorial, matching
your explicit preference for curation over an algorithm.

### 3. `GET /api/shop/testimonials?need=dental`

Only active testimonials for one need at a time. Includes the linked
product's shop-facing details (name, brand, image, price) directly in
the response — not just a product ID — so the website can render the
shoppable "Add to cart" row on a testimonial card without a second
API call per testimonial. A testimonial with no linked product simply
omits those fields rather than erroring. Missing/invalid `?need=`
returns 400, same validation approach as the products filter.

## Verification performed

**9 real backend tests**, against a real Express server with the actual
`products.js`, `testimonials.js`, and `shop.js` routers all mounted
together (only the network-touching bucket calls mocked), running
against a real seeded database:

- Tagged two real products with different needs, flagged one as a
  Pawvy's Pick, created two testimonials (one linked to a product, one
  not) — then confirmed:
  - `?need=dental` returns exactly the dental-tagged product, excludes
    the gut-tagged one; `?need=gut` is the correct mirror image.
  - An invalid `?need=` value is rejected with 400.
  - **No `?need=` param at all still returns the full, unfiltered
    catalogue correctly** — explicit regression check that existing
    website behavior (today's live Shop page) isn't touched.
  - Single product detail correctly includes `need_tags` (as a real
    array) and `best_for`.
  - `/pawvy-picks` returns only the flagged product.
  - `/testimonials?need=dental` returns both testimonials; the linked
    one carries correct product name and computed effective price; the
    unlinked one has no product/price fields and doesn't error.
  - A need with zero testimonials returns a clean empty array, not an
    error.
  - Missing `?need=` on the testimonials endpoint is rejected with 400.
- `client` rebuilt clean via `npm run build` — confirms nothing on the
  admin side broke, even though this patch is backend-only.
- Directly compared every file from the previous three deliveries
  against the real current `origin/staging` (fetched fresh, not
  assumed) — confirmed all of them match exactly what you already
  applied, so this delivery is genuinely just the one new file.

## How to apply

```bash
git checkout staging
git pull origin staging

# then copy/overwrite this one file from this zip into your local
# pawvy-app folder, preserving the same path:
#   server/routes/shop.js

git add .
git commit -m "Public shop endpoints: ?need= product filtering, Pawvy's Picks, testimonials-by-need"
git push origin staging
```

Nothing to visually check on S-App for this one — it's a backend-only
change with no admin UI. I'll confirm it's working correctly once the
website side (Phase 1) is built on top of it and actually calls these
endpoints.
