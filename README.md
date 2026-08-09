# Feature: special one-off discount in Pending Orders

## What this is
The same 4-mode discount tool POS already has (renamed "No discount" →
"Default" here, per your note), now available when you review/approve
a wholesale order in Pending Orders — for the occasional case where
you want to give a partner a one-off special price for a specific
order, separate from their standing rebate agreement.

**The core requirement**: the partner's standing rebate (the $12/$30
cash-rebate tiers, or whichever discount model that partner is on)
now checks eligibility against the order amount *after* your special
discount, not before. Confirmed against both your own examples before
building anything — the exact tests are below.

## What changed (5 files)

### `server/database.js`
Two new columns, added the same safe, non-destructive way every other
column in this file is added:
- `sales.special_discount_amt` — the special discount's amount, kept
  **separate** from `platform_fee_amt` (the partner's own rebate), so
  both survive on the record independently for your audit trail.
  `sales.unit_price` keeps meaning exactly what it always has (the
  final per-unit price, post-special, pre-rebate) — nothing about
  how the rest of the system reads that field changes.
- `invoices.special_discount` — same idea, at the invoice level.

### `server/routes/orders.js`
The order-approval endpoint now accepts and stores
`special_discount_amt` per line item, alongside the existing
`platform_fee_amt`.

### `server/routes/invoices.js`
When generating an invoice from approved sales, sums
`special_discount_amt` separately (alongside the existing
`platform_fee_amt` sum) and stores it on the invoice record. The
existing `total` formula (`subtotal − discount + shipping`) is
**unchanged** — `subtotal` already reflects the post-special amount
(since that's what's stored in `unit_price`), so nothing needed to
change there for the math to come out right.

### `client/src/pages/PendingOrders.jsx` — the main piece
- The 4-mode toggle (Default / Per item % / Universal % / Set price)
  appears right after the item list when you expand an order, before
  Shipping — same visual pattern as POS.
- **Order of operations**: special discount is applied to each line
  first, producing a post-special subtotal; the partner's existing
  rebate calculation (`calcDiscount`, unchanged) is then evaluated
  against *that* result, not the raw subtotal. This is the one
  fundamental change everything else depends on.
- The totals summary now shows: raw Subtotal → Special discount (only
  shown if > 0) → the partner's rebate (unchanged label/logic) →
  Shipping → Net Total.
- "Set Price" mode is per-line, confirmed to match your intent
  exactly — some SKUs get a fixed special price, the rest stay at
  normal wholesale.

### `client/src/pages/Invoices.jsx`
Both the generated PDF and the on-screen preview (before generating)
now show the same three-line breakdown from the mockup you approved:
Subtotal (reconstructed as the raw pre-discount figure) → Special
Discount → Partner Rebate → Shipping → Amount Due. The final amount
due is identical to what it would have been before this change — this
is purely about showing the two different discounts separately
instead of as one combined number.

## The ledger — deliberately untouched
Checked `client/src/pages/Sales.jsx` directly: its "Discount/Fee"
column only ever reads `platform_fee_amt`. It has no idea
`special_discount_amt` exists, and doesn't need to — that column
looks exactly as cramped (or not) as it did before this delivery, per
your explicit condition for going ahead with this.

## Verified — extensively, since this touches real invoicing math
**28 unit tests** run against the *actual* extracted calculation
functions (not reimplemented from memory) — including **both of your
own examples, reproduced exactly**:
- $400 → special discount → $350 → correctly **no** rebate
- $480 → special discount → $400 → correctly **$12** rebate → **$388**
  final, matching your numbers precisely

Plus edge cases: no special discount at all (behaves identically to
the pre-existing system — a genuine regression check), per-item %
across multiple lines, Set Price mode, per-line rebate distribution
reconciling to the exact cent with no rounding drift, and a different
partner discount type (`threshold_pct`) layered correctly with a
special discount on top.

**10 end-to-end backend tests** — real Express routes, real seeded
database, KT's exact example carried all the way from order approval
through to a generated invoice, confirming `sale.unit_price`,
`sale.special_discount_amt`, `sale.platform_fee_amt`, and every field
on the resulting invoice match precisely.

**One mistake I made and caught myself**: while adding the new schema
columns, an early edit accidentally deleted the pre-existing
`pos_checkout_ref` column definition instead of adding alongside it.
Caught this immediately via `git diff`, restored it, and verified with
a real database initialization test that both the old and new columns
exist correctly before proceeding — flagging this for transparency
rather than leaving it unmentioned.

Full build (server + client + portal + POS) passes clean, both
locally and from a genuine fresh `git clone` with this delivery
applied — confirmed the diff matches exactly what's in this zip.

## Not yet verified
No live UI access from this sandbox — worth a real click-through
after deploy, particularly: does the discount toggle feel natural
sitting where it is in the expanded order view, and does the invoice
breakdown read clearly on an actual printed/PDF'd document rather
than just the HTML I generated it from.

## To apply
1. `git checkout main`
2. `git pull origin main`
3. Unzip this delivery on top of your local `pawvy-app` folder
4. `git add -A`
5. `git commit -m "Special one-off discount in Pending Orders, separate from partner rebate, with invoice breakdown"`
6. `git push origin main`

Railway auto-deploys the server and rebuilds the client from `main`
on push.
