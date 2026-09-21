# Pawvy App — AU removal, Online RRP (Shopee/Lazada), Mailing Required

Three independent amendments in one patch, as discussed. All three are
purely additive/subtractive at the schema level — nothing touches
existing money, stock, or Order Portal logic (including the pack_size
box-nudge you already patched to staging — this builds on top of it).

## What this does

### 1) AU market removed
- `price_wholesale_au` / `price_rrp_au` dropped from the schema
  definition for brand-new installs. On your existing staging/production
  database, the two columns physically remain (SQLite's `ALTER TABLE
  DROP COLUMN` is unreliable under sql.js — same reasoning as the old
  `instagram_posts.url` column already left in place elsewhere in this
  codebase) — they're just never read or written by the app again.
  Fully inert, harmless dead data.
- 'AU' removed from every market dropdown/tab: Products & Pricing (table
  tabs, Edit modal, CSV export), Partners, Sales Ledger filter, Costs,
  Reports filter, Record Sale, and the top-bar market badge.
- Confirmed with you beforehand: no partners, sales, or costs currently
  tagged 'AU', so this is a clean removal.

### 2) Online RRP (Shopee/Lazada) — new field, SG and MY
- New optional column per market: `price_rrp_online_sg`,
  `price_rrp_online_my`. NULL by default.
- **One-time backfill only**: every existing product with an RRP > 0 gets
  seeded at `RRP × 1.08` (rounded to 2dp) the first time this runs.
  From that moment on it's a **fully independent, manually-edited
  field** — it will NOT auto-follow if RRP changes later. No "reset to
  RRP+8%" button, per your instruction.
- Products & Pricing: both the SG tab/columns and MY tab/columns now
  show 5 columns instead of 4 (added "RRP Online"). Same in the Edit
  modal, and in the CSV export.
- The RRP−10% brands (GiGwi, Puzzle Feeder, Salmoil) needed **zero
  code changes** — confirmed that arrangement was never stored in the
  app, purely an informal understanding with retailers.

### 3) "Mailing required?" per line item
- **POS (event sales)**: each cart line in the Review Order screen now
  has a "Mailing required? — not on hand, ship from operation hub"
  checkbox. Independent per line — e.g. items A and B handed over on
  the spot, item C checked because it needs to ship from the hub later.
- If ANY line is checked, Recipient Name / Address / Phone become
  mandatory before checkout completes (checked both in the POS app and
  again on the server, same defense-in-depth pattern already used for
  PDPA consent).
- **Sales Ledger**: the mail icon next to a sale now shows a small
  **bright red dot** when that specific line still needs mailing — spot
  it without opening anything. The "Customer & Mailing Details" popup
  (the same one that already shows name/address/phone) now also states
  "Mailing required — not yet sent" or "Mailing not required".
- **Marking an item as mailed**: click the pencil icon ("Edit Sale
  Details") on that row — same modal you already use for shipping/
  mailing/notes — untick "Mailing required", Save Changes. The red dot
  disappears immediately.

## Files in this zip (complete files — replace, don't merge)
- server/database.js
- server/routes/products.js
- server/routes/pos.js
- server/routes/sales.js
- client/src/App.jsx
- client/src/pages/Products.jsx
- client/src/pages/Sales.jsx
- client/src/pages/Costs.jsx
- client/src/pages/Reports.jsx
- client/src/pages/Partners.jsx
- client/src/pages/RecordSale.jsx
- pos/src/App.jsx

This was built directly on top of your current `staging` branch (i.e.
it already includes the pack_size / box-nudge patch you applied
earlier) — safe to apply as complete-file replacements.

## Before you start
```
git checkout staging
git pull origin staging
```

## Apply
Copy the 12 files from this zip into your local pawvy-app folder,
overwriting the existing files at the same paths.

## After copying
```
git add server/database.js server/routes/products.js server/routes/pos.js server/routes/sales.js client/src/App.jsx client/src/pages/Products.jsx client/src/pages/Sales.jsx client/src/pages/Costs.jsx client/src/pages/Reports.jsx client/src/pages/Partners.jsx client/src/pages/RecordSale.jsx pos/src/App.jsx
git commit -m "Remove AU market; add Online RRP (Shopee/Lazada); per-line mailing-required flag"
git push origin staging
```

## To test on staging once deployed

**1) AU removal**
- Products & Pricing: only SG / MY tabs remain, no AU pricing section
  in the Edit modal, CSV export has no AU columns.
- Partners, Sales Ledger filter, Costs, Reports filter, Record Sale:
  only SG / MY as market options anywhere.

**2) Online RRP**
- Open any product's Edit modal — SG Pricing now shows RRP Online
  (SGD) next to RRP; MY Pricing shows RRP Online MY (MYR) next to RRP
  MY. Both should already show a value (RRP × 1.08) on first load,
  from the automatic backfill.
- Edit a product's online RRP to any custom number, save, then
  separately change that same product's regular RRP and save again —
  confirm the online RRP you set stays exactly as you left it (does
  NOT recalculate).
- Products & Pricing table: SG tab shows 5 pricing columns, MY tab
  shows 5 pricing columns.

**3) Mailing required**
- Open POS → add 3 items to cart → check "Mailing required?" on only
  one of them → try to submit without filling in Name/Address/Phone —
  should be blocked with a clear message.
- Fill in Name/Address/Phone → submit → go to Sales Ledger → confirm
  only that one line shows a bright red dot on its mail icon; the
  other two lines' mail icons have no dot.
- Click the mail icon on the flagged line → confirm the popup says
  "Mailing required — not yet sent".
- Click the pencil icon on that same row → untick "Mailing required" →
  Save Changes → confirm the red dot is gone and the popup now says
  "Mailing not required for this item".
- Check a normal checkout with nothing flagged still behaves exactly
  as before (no checkbox interaction needed, no validation triggered).

## Notes
- All three changes verified with a real backend smoke test against
  seed data: schema migration correctness, the RRP×1.08 backfill math,
  online-RRP independence after a later RRP change, the mailing-
  required validation (both the "blocked without address" and
  "succeeds with address" paths), the per-line A/B/C split landing
  correctly in the sales table, and the flip-back-to-0 via the Edit
  Details PATCH endpoint.
- Cold-clone builds verified clean for both the admin client and the
  POS frontend.
- Nothing here touches inventory deduction, pricing calculations used
  in P&L, or the Order Portal — those are all untouched by this patch.
