# Pawvy App — Warehouse Rename: Storhub → Hougang, Home → Mega

Target branch: **staging**
Repo: `pawvy-app`

**A separate `TEST_PLAN.md` is included** — please work through that on
Staging before merging to Main, given how much this touches. This
README covers what changed and why; the test plan covers how to verify
it yourself.

## What changed

- **Storhub → Hougang** (the pure-warehouse role) and **Home → Mega**
  (the operational-hub role — where sales, POS, and consignment
  placements now deduct from) — applied consistently across 20 files,
  both server and client.
- **One deliberate exception**, per your and Janice's decision: new
  shipments now default to **Mega**, not Hougang, since Mega has more
  capacity. This required its own explicit fix rather than following
  the general rename — more on this below.
- **A real database migration** that renames all *existing* data
  (inventory levels, movement history, restock checklist directions,
  shipment receiving records) to the new names, correctly preserving
  what actually happened historically — not just relabeling blindly.
  Runs automatically and safely on next startup.

## Two real, non-obvious things I found and fixed along the way

**1. A final full-codebase sweep caught 3 files my original
investigation missed** — `orders.js`, `sales.js`, and
`Reconciliation.jsx`. `sales.js`'s "every sale fulfills from Home
stock" is arguably the single most important line in this entire
change, and I'd have missed it without that last check.

**2. SQLite bakes a column's default value into the table at the
moment it's first created** — meaning changing `received_warehouse
DEFAULT 'Storhub'` to `DEFAULT 'Mega'` in the `CREATE TABLE` statement
has **zero effect on your real, already-existing production
database**. I caught this by testing the actual shipment-creation flow
and seeing it silently return the old value. Fixed properly: the
shipment-creation route now explicitly sets `'Mega'` in its `INSERT`
statement, rather than depending on a database default that would
never actually take effect.

## Deliberately left untouched

The one-time "Import Opening Stock" feature and the historical JSON
file it reads from — already run once, idempotent (a second run would
be a no-op), and not worth the risk of touching for zero practical
benefit. Verified this is byte-identical to the original after
accidentally touching pieces of it twice during implementation and
reverting both times.

## A separate bug found, not fixed here

While tracing through the adjustment logic, found that non-"Recount"
stock adjustments (Write-off, Damage, etc.) update a different,
apparently-unused database table — meaning those adjustment types may
not actually be reducing your live stock count. Confirmed the table in
question is completely empty in your real data. This is unrelated to
the rename and predates it — flagging separately rather than folding
an unrelated fix into this already-large change; happy to take this on
as its own task if you'd like.

## Verification performed — real data, real API calls, not just code review

Ran a real backend against real seeded data and tested every critical
path through the actual API (not just reading the code):

- Migration correctly transforms old-named historical data, preserving
  quantities and real historical meaning exactly.
- Inventory levels API returns the new field names with correct
  migrated values.
- New restock checklists default to "Hougang → Mega".
- New shipments default to "Mega" (confirmed via the actual creation
  endpoint, not just the schema).
- Marking a shipment received correctly adds stock to Mega.
- Recording a real sale correctly deducts from Mega, leaves Hougang
  untouched; voiding it correctly reverses.
- Recording a real consignment placement correctly deducts from Mega
  (caught and fixed a test-harness gap along the way — this route uses
  a different dependency-wiring pattern than the others).
- **The core logic of this whole change**: set up a real scenario
  where Mega was out of stock and Hougang had supply, ran the actual
  restock-suggestions engine, and confirmed it correctly suggested
  transferring stock from Hougang into Mega — not the other way round.
- All 20 changed files syntax-checked and the client build compiles
  cleanly.
- All 20 files byte-diffed against what was actually tested —
  identical.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite these files:
#   client/src/pages/Costs.jsx
#   client/src/pages/Inventory.jsx
#   client/src/pages/Reconciliation.jsx
#   client/src/pages/RestockChecklist.jsx
#   client/src/pages/Shipments.jsx
#   server/database.js
#   server/jobs/autoRestock.js
#   server/routes/adjustments.js
#   server/routes/checkout.js
#   server/routes/consignment.js
#   server/routes/forecast.js
#   server/routes/inventory.js
#   server/routes/orders.js
#   server/routes/portal.js
#   server/routes/pos.js
#   server/routes/restock.js
#   server/routes/sales.js
#   server/routes/shipments.js
#   server/routes/shop.js
#   server/utils/restockSuggestions.js

git add .
git commit -m "Rename warehouse locations: Storhub -> Hougang, Home -> Mega; new shipments now default into Mega; migrates all existing data and historical records"
git push origin staging
```

Then work through `TEST_PLAN.md` before merging to Main.
