# Pawvy App — Hotfix: Inventory showing 0 at Mega and Hougang after main merge

## What broke

When the warehouse rename (Storhub → Hougang, Home → Mega) originally shipped on
16 Sep 2026, it included a one-time data migration in `server/database.js` that
renames every existing `inventory_levels` / `inventory_movements` /
`inventory_adjustments` / `inventory` / `restock_checklists` / `shipments` row
from the old location names to the new ones, on every server startup.

A later commit (21 Sep 2026, "Remove AU market; add Online RRP…") edited the
same area of `database.js` and that migration block was accidentally dropped —
not removed on purpose, just lost in the edit. It never ran again after that.

The app code itself (routes, Inventory page) had already been fully switched
over to query `'Hougang'` / `'Mega'` since the 16 Sep commit. So after your
merge to `main` today, the server started up, found no rows under those new
location names (your real stock was still sitting under the old `'Storhub'` /
`'Home'` labels), and every product read back as 0 at both locations.

**No inventory data was lost.** The quantities were never touched — they were
just sitting under the old location labels the app had stopped looking for.

## The fix

`server/database.js` — restored the missing migration block, with one safety
upgrade: if any product already has *both* an old-label row and a new-label
row (which could happen if any restock/sale was logged against Hougang/Mega
in the window between the merge and this fix), the fix merges the quantities
into the new-label row instead of raising a duplicate-key error, then renames
everything else with no collision. It's safe to run on every server startup,
exactly like the original design — the first run does the real work, every
run after that is a no-op.

Verified: cold `npm run build` in `client/`, plus a full backend smoke test —
spun up the real server against a copy of production-shaped data with
injected legacy rows (including one deliberately collision-prone product),
confirmed quantities come back correctly labelled and unchanged in total, and
confirmed the migration is a clean no-op on a second startup.

## Apply this

This only touches one file. In your `pawvy-app` folder:

```
git checkout main
git pull origin main
```

Copy `server/database.js` from this zip over your local
`pawvy-app/server/database.js`, then:

```
git add server/database.js
git commit -m "Hotfix: restore warehouse-rename data migration dropped in a later commit (fixes inventory showing 0 at Mega/Hougang)"
git push origin main
```

Railway will redeploy `main` automatically. The migration runs as part of
normal server startup — no manual database step needed. Once it's deployed,
refresh the Inventory page and your Mega/Hougang quantities should be back.

Then bring `staging` back in sync so it doesn't drift from `main`:

```
git checkout staging
git merge main
git push origin staging
```

## Test checklist after deploy

- [ ] Inventory page: spot-check a few products you know the real stock for —
      Hougang and Mega quantities should match what you expect, not 0
- [ ] Total stock (Hougang + Mega + consignment) looks right on a product or
      two you can verify by memory
- [ ] Try a restock or transfer on one product to confirm read/write still
      works normally post-fix
- [ ] Check Railway's deploy log for `✅ Schema ready` with no errors right
      after `✅ Loaded database`
