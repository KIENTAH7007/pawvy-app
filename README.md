# Pawvy App — Hotfix: Order Portal showing everything as unavailable

## Root cause (this explains all three bugs from today)

Traced this back to one single accident, three days after the original
warehouse rename: the "Order Portal: optional box-quantity nudge" commit
(18 Sep) was built from a **stale, pre-rename copy** of the code — one taken
before the 16 Sep Storhub→Hougang / Home→Mega rename had merged in. Saving
that stale copy's changes silently reverted the rename in two files back to
the old location names, alongside the legitimate box-quantity feature:

1. `server/database.js` — the data-migration block that renames existing
   rows got dropped entirely. **Fixed earlier today** (the inventory-showing-0
   hotfix).
2. `server/database.js` — three schema DEFAULT values (shipment intake
   warehouse, restock checklist direction, adjustment location) also got
   reverted back to `'Storhub'`/`'Home'`. Low-impact since the app always
   passes an explicit value rather than relying on these defaults, but
   fixed now for consistency.
3. `server/routes/portal.js` — **this is today's bug.** Every Order Portal
   query (catalogue, top-sellers, order submission) joins
   `inventory_levels` against the location names `'Home'` and `'Storhub'`.
   Since your actual stock has been living under `'Hougang'`/`'Mega'` since
   the rename, every single one of those joins matched nothing — every
   product's computed stock was 0, so everything showed "Currently
   unavailable," regardless of real stock.

I also swept the rest of the codebase for the same pattern and found one
more, lower-traffic spot: the CSV "2026 baseline import" endpoint in
`server/routes/inventory.js` was writing new opening-stock rows under
`'Storhub'`/`'Home'` too. Fixed for consistency, though it's a one-off admin
tool that isn't part of normal day-to-day flow.

## The fix

Three files this time:

- `server/routes/portal.js` — all three endpoints (`/catalogue`,
  `/top-sellers`, `/orders`) now join against `'Mega'`/`'Hougang'`, matching
  every other part of the app (Website, POS already query these correctly).
- `server/database.js` — the three leftover schema defaults corrected back
  to `'Mega'`/`'hougang_to_mega'`.
- `server/routes/inventory.js` — the baseline-import endpoint now writes to
  `'Hougang'`/`'Mega'`.

Verified with a full backend smoke test against the real server: seeded one
product with real stock split across Mega(20)+Hougang(5), and two genuinely
out-of-stock products, then hit the actual `/api/portal/catalogue` endpoint
over HTTP — the in-stock product correctly showed `"available"`, the two
empty ones correctly showed `"out_of_stock"` (previously all three would
have shown out of stock). Also tested the order-submission hard-cap: an
order for more than the available 25 units was correctly rejected with the
right number, and an order within stock succeeded. Cold `npm run build`
across all three frontends (client, POS, portal) passes clean.

## Apply this

```
git checkout main
git pull origin main
```

Copy `server/database.js`, `server/routes/portal.js`, and
`server/routes/inventory.js` from this zip over your local files, then:

```
git add server/database.js server/routes/portal.js server/routes/inventory.js
git commit -m "Hotfix: Order Portal availability was joining against pre-rename location names (Home/Storhub), showing everything as unavailable"
git push origin main
```

Railway redeploys automatically — no manual database step needed (this fix
is pure query/schema-default logic, not a data migration). Then sync
staging:

```
git checkout staging
git merge main
git push origin staging
```

## Test checklist after deploy

- [ ] Open the Order Portal — products you know are in stock should now
      show as Available / Low Stock instead of "Currently unavailable"
- [ ] Try submitting a test order within stock — should succeed
- [ ] Try ordering more than what's available on one SKU — should be
      rejected with the correct "Only N units available" message
- [ ] Top Sellers section on Review Your Order — should show real upsell
      products again, not an empty section
