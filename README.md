# Pawvy App (backend) — Patch: include description in the shop list API

Applies on top of `KIENTAH7007/pawvy-app` @ `main`. One file changed:
`server/routes/shop.js`. Syntax-checked and tested with a real request
against the real route (not just `node --check`) — see below. Also
re-verified against a fresh clone with this exact patch applied, not
just my working copy.

**Pairs with `pawvy-website-patch.zip` — apply both.** This is the
actual root-cause fix; the website patch is the part that does
something useful with the data once it's actually available.

## What changed

`GET /api/shop/products` (the list endpoint every brand page uses to
fetch its products) never included the `description` column — only
`GET /api/shop/products/:id` (the single-product page) did. Added
`p.description` to the list endpoint's SELECT. That's the entire
change — one line.

## How this was tested

1. Seeded a real description onto one product in a copy of your actual
   seed database.
2. Spun up the real `shop.js` router in a bare Express app and made an
   actual HTTP request to `/api/shop/products`.
3. Confirmed the seeded product's description came through correctly,
   and that all 216 other products correctly had none (no accidental
   leakage or default value).
4. Repeated the entire test again against a **fresh clone of your real
   `main` with this exact patch zip applied** — not just my local
   working copy — to make sure what's in the zip actually behaves the
   same way live.

## Git commands

```bash
git checkout main
git pull origin main
# unzip this patch on top ("Copy and Replace")
git add -A
git commit -m "Include description in the shop products list endpoint"
git push origin main
```

Also apply `pawvy-website-patch.zip` (same flow, other repo) — the
frontend change that actually displays this on brand pages.

## What to check live after deploy

Not much to check on this side specifically — this just makes data
available that wasn't before. The actual visible behavior is on the
website side; see that README's checklist.
