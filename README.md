# Pawvy App — Availability-First Sort: Website, POS, and Order Portal

Target branch: **staging**
Repo: `pawvy-app`

This replaces the earlier "Website Sort Availability First" zip — same
fix, now applied to all three systems for consistency, per your
confirmation.

## What changed

All three product listing endpoints now sort by **stock status first,
brand second**, instead of the previous brand-first ordering:

**Before:** Available BetterBone → OOS BetterBone → Available Lillidale
→ OOS Lillidale → ...

**Now:** Available BetterBone → Available Lillidale → Available GiGwi
→ ... → OOS BetterBone → OOS Lillidale → OOS GiGwi → ...

Applied identically to:
- **`server/routes/shop.js`** — `GET /api/shop/products` (the website's
  Shop page and every Shop-by-Need page)
- **`server/routes/pos.js`** — `GET /api/pos/catalogue`
- **`server/routes/portal.js`** — `GET /api/portal/catalogue`

Within each tier (available / out-of-stock), brand order and your
existing sort priority (`portal_sort_order`, then item name) are
unchanged — only the availability/brand priority swapped, identically
in all three places.

## Verification performed

**Real backend tests** against a real seeded database with genuine
mixed inventory inserted across multiple brands (the seed DB ships with
zero stock rows by default, so this needed real data to actually
exercise the available/OOS boundary):

- Confirmed all **three** endpoints independently return every
  available product before every out-of-stock product, with real mixed
  data (215-217 products each, a real split between available and OOS
  found in each result set — not a trivial all-one-state test).
- Confirmed brand order is correctly preserved as the secondary sort
  within each tier, on all three.
- Checked the POS and Portal frontend code for any client-side
  re-sorting that might override the backend order — found only
  `.sort()` calls building a brand-name filter dropdown list, not
  re-ordering the product catalogue itself, so the backend order is
  what actually reaches the screen in both.
- Confirmed all three files load with no syntax errors.
- All 3 changed files byte-diffed against what was actually tested —
  identical.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite these files:
#   server/routes/shop.js
#   server/routes/pos.js
#   server/routes/portal.js

git add .
git commit -m "Sort product listings by availability first, then brand — consistently across Website, POS, and Order Portal"
git push origin staging
```

Worth checking on S-App: a product list in each of the three tools
(Shop-by-Need on the website, the POS catalogue, and the Order Portal
catalogue) with a mix of in-stock and OOS items across a few brands —
confirm every available product now shows before any OOS one, in all
three.
