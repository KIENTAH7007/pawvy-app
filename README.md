# Pawvy App — Order Portal box-quantity nudge

## What this does
Adds an optional "Pack Size" field per product (Products & Pricing admin
form). When set, the Order Portal shows a one-line hint under the
quantity stepper — "Add X more for full box" — whenever a partner's
quantity is 1–2 units short of a full box. Purely informational, no
discount, never blocks the order. Products with no Pack Size set behave
exactly as before (no hint shown).

## Files in this zip (complete files — replace, don't merge)
- server/database.js
- server/routes/products.js
- server/routes/portal.js
- client/src/pages/Products.jsx
- portal/src/ProductCard.jsx

## Before you start
```
git checkout -- .
git clean -fd
git pull origin main
git checkout staging
git pull origin staging
```

## Apply
Copy the 5 files from this zip into your local pawvy-app folder,
overwriting the existing files at the same paths.

## After copying
```
git add server/database.js server/routes/products.js server/routes/portal.js client/src/pages/Products.jsx portal/src/ProductCard.jsx
git commit -m "Order Portal: optional box-quantity nudge (pack_size)"
git push origin staging
```

## To test on staging once deployed
1. Products & Pricing → edit a BetterBone Mini product → set
   "Pack Size (units/box)" to 6 → Save.
2. Open the Order Portal → find that product → type qty 4 or 5 into
   the stepper → confirm the hint "Add X more for full box" appears
   under the Add button.
3. Type qty 6 (or any multiple of 6) → hint should disappear.
4. Type qty 1, 2, or 3 → hint should NOT appear (only shows within
   2 units of a full box, per KT's request — not worth nudging from
   very low quantities).
5. Check a product with no Pack Size set — Order Portal should look
   completely unchanged, no hint ever shown.
6. Confirm existing behavior is untouched: adding to cart, removing,
   editing cart quantity via +/- and typing, Add button, all as before.

## Notes
- pack_size is nullable — every existing product is unaffected until
  you explicitly set a value.
- No discount, no price change anywhere — this is UI-only.
- Verified with a real backend smoke test against seed data (migration
  applies cleanly, PUT/POST save and clear pack_size correctly, portal
  catalogue returns it per-product) and clean cold-clone builds of both
  the portal and admin client frontends.
