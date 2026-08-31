# Pawvy App — Wild Balance Page Dependency Fix

Target branch: **staging**
Repo: `pawvy-app`

**Apply this one first** — the website delivery genuinely depends on
this fix to work at all.

## What's in this patch

One line, but a real bug: `GET /api/shop/products` (the list endpoint
every brand page uses to fetch its products) was missing the
`description` field from its SELECT entirely. Only the single-product
detail endpoint had it. This wasn't specific to Wild Balance — it's a
gap that's been there in the shared products list endpoint — it just
never mattered until the Wild Balance page needed to read description
text for its product grouping (see the website README for why).

## How this was found

Not by inspection — by actually running the real backend and real
Next.js frontend together against seeded data and fetching the real
page. My own isolated unit tests all passed using data I'd typed by
hand (which included `description` because I put it there myself) —
they never would have caught this, since the gap was specifically in
how the *real* API responds, not in the matching logic itself. Worth
knowing since it's a good example of exactly why `npm run build`
passing doesn't prove runtime correctness — this needed a real
end-to-end request to surface.

## Verification performed

- Confirmed the fix directly: seeded a real database with 19 realistic
  Wild Balance products, ran the actual backend, and confirmed
  `description` is now present in `/api/shop/products` responses.
- `shop.js` loads with no syntax errors.
- Single-file change, byte-diffed against what was actually tested —
  identical.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite:
#   server/routes/shop.js

git add .
git commit -m "Add description to the products list endpoint's SELECT — was only in the single-product detail endpoint, needed for Wild Balance's product grouping"
git push origin staging
```
