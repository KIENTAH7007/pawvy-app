# Pawvy App (backend) — Revert: remove description from the shop list endpoint

Reverts the previous "Include description in the shop products list
endpoint" patch. Applies on top of `KIENTAH7007/pawvy-app` @ `main`.
One file changed: `server/routes/shop.js`. Syntax-checked and verified
against a fresh clone with this exact patch applied.

## What this does

`GET /api/shop/products` (the list endpoint brand pages use) no longer
includes `p.description` — back to exactly what it selected before.

**Untouched**: `GET /api/shop/products/:id` (the single-product
endpoint the Shop page's product detail page uses) still includes
`description`, unaffected by this revert — that's the feature you're
keeping.

## Git commands

```bash
git checkout main
git pull origin main
# unzip this patch on top ("Copy and Replace")
git add -A
git commit -m "Revert: remove description from the shop products list endpoint"
git push origin main
```

Also apply `pawvy-website-patch.zip` (same flow, other repo) — the
frontend half of this revert.
