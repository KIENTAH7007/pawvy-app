# Pawvy App — Hotfix: Hougang/Mega current stock levels swapped

## What was wrong

The earlier warehouse-rename fix carried the old `Storhub`→`Hougang` and
`Home`→`Mega` quantities straight across, 1:1, name-for-name. That assumed
the old `Storhub`/`Home` location values already matched physical reality —
but they didn't. You confirmed this with a live before/after count: SKU 8009
physically had 30 units at the **Mega** counter, but the system showed
Hougang=30 / Mega=0, and after ringing up 1 unit sold (which correctly
deducts from Mega), it went to Mega=-1 instead of 29.

So the *quantities* under Hougang and Mega needed a one-time swap — separate
from the rename itself, which was correct (Mega is genuinely the operational
hub, Hougang the warehouse; sales/consignment correctly deduct from Mega;
shipments correctly default into Mega; Restock Checklist's Hougang→Mega
"common" direction is correctly labelled — none of that changes).

**Scope, per your instruction:** this only swaps the current on-hand
quantities (`inventory_levels` — the "Stock Levels" page). Historical
Restock/Sale/Transfer/Write-off log entries are left exactly as they are —
nothing in `inventory_movements`, `inventory_adjustments`, shipments'
received-warehouse default, or Restock Checklist directions is touched.

## The fix

`server/database.js` — added a **one-time** swap of the `inventory_levels`
quantities between Hougang and Mega, for every product. It:

- Uses a 3-step rename-through-a-placeholder so it can never collide with
  the `UNIQUE(product_id, location)` constraint, even where a product only
  has a row at one of the two locations (that row just moves fully to the
  other name, which is the correct behaviour).
- Is guarded by a tiny `one_time_migrations` marker table so it runs
  **exactly once** — unlike the earlier rename fix, a swap is NOT safe to
  re-run on every startup (running it twice would flip the numbers straight
  back to wrong), so this needed different, one-shot-safe handling.

Verified with a full backend smoke test: spun up the real server against
injected pre-swap data covering all three shapes — a product with only a
Hougang row (your 8009/8467 case), a product with both rows, and a product
with only a Mega row — confirmed every case swaps correctly, and confirmed
restarting the server a second time does **not** re-swap (marker correctly
prevents it). Also did a cold `client/` build to confirm nothing else broke.

## Apply this

One file again. In your `pawvy-app` folder:

```
git checkout main
git pull origin main
```

Copy `server/database.js` from this zip over your local
`pawvy-app/server/database.js`, then:

```
git add server/database.js
git commit -m "Hotfix: one-time swap of Hougang/Mega current stock quantities (confirmed by physical count)"
git push origin main
```

Railway redeploys automatically; the swap runs once during that startup —
no manual database step needed. Then sync staging:

```
git checkout staging
git merge main
git push origin staging
```

## Test checklist after deploy

- [ ] Check Railway's deploy log for `✅ One-time Hougang/Mega current-stock
      swap applied` right after `✅ Loaded database` — confirms it ran
- [ ] Inventory page: 8009 and 8467 (and a few others) should now show the
      correct physical counts under Mega, not Hougang
- [ ] Record a test sale on a SKU you know the physical Mega count for —
      confirm the deduction lands on the right starting number this time
- [ ] Redeploy once more (or restart the Railway service) and re-check the
      same SKUs — numbers should be unchanged, confirming the swap didn't
      fire a second time
