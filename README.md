# Invoice fix: per-line List Price / Discount breakdown (Option 2)

## What this fixes
The "Subtotal" shown on invoices was mathematically correct but had no
visible relationship to the line items printed above it — the table
showed each line's *already-discounted* price, while Subtotal showed
a reconstructed pre-discount figure. A customer couldn't get from one
to the other by adding up anything they could actually see.

## What changed (4 files)

### `server/database.js`
New column: `invoice_items.special_discount_amt` — per-line discount
tracking, mirroring `sales.special_discount_amt` from the delivery
before this one. Needed because the invoice-wide total I built last
time isn't enough to show *which* lines were discounted and by how
much — that needs to live on each line.

**Note on this delivery's own history**: while adding this column, I
made the exact same mistake I'd made once before in an earlier
delivery — an edit accidentally deleted the two existing
`special_discount_amt`/`special_discount` ALTER statements instead of
adding alongside them. Caught it immediately via `grep` before moving
on, restored it, and verified with a real database init test that all
four columns (the two pre-existing ones plus this new one) exist
correctly. Flagging this plainly rather than leaving it unmentioned —
it's now the second time this exact slip has happened, so if you'd
like me to double-check schema edits more deliberately going forward,
that's a completely fair thing to ask for.

### `server/routes/invoices.js`
The `generate-invoice` endpoint now carries each sale's
`special_discount_amt` onto its corresponding `invoice_items` row.
Confirmed the other 3 places this table gets written to (Delivery
Orders, which show no pricing at all, and SOA generation, which
aggregates whole invoices rather than individual products) don't need
this field — genuinely out of scope, not overlooked.

### `client/src/pages/Invoices.jsx` — the main piece
`generateInvoicePDF` now checks whether *any* line on the invoice
actually has a special discount:
- **If none do** (the large majority of invoices): renders exactly
  the same 5-column table as before — Brand, Description, Qty, Unit
  Price, Total. No visible change at all.
- **If at least one line does**: the table gains a "Discount" column,
  and the price column is relabeled "List Price" (reconstructed per
  line as `unit_price + special_discount_amt ÷ qty`, so it shows the
  real pre-discount figure for that specific SKU). A line within a
  discounted invoice that itself had no discount just shows "—" in
  that cell rather than $0.00, and its List Price naturally equals
  its Unit Price. Brand column is kept throughout, per your note about
  multi-brand invoices.
- Subtotal at the bottom now literally equals the sum of what's
  printed in the table above it — that's the entire point of this fix.

### `client/src/pages/Sales.jsx`
Renamed the ledger's "List Price" column header to "Unit Price". This
wasn't originally part of what you asked for this round — I found it
while double-checking your question about ledger impact. The column
has always shown `sales.unit_price`, and once a special discount can
reduce that value, calling it "List Price" was no longer accurate for
that row. **Important: this is a label-only change.** I checked the
actual Revenue and Profit SQL formulas directly (`server/routes/
sales.js`, completely untouched by this delivery — zero diff)
and confirmed they already correctly account for the net price and
rebate separately, so no financial figure anywhere changes, only what
that one column is called.

## Verified
- 9 end-to-end tests against real running routes with a seeded
  database: an invoice with mixed discounted/undiscounted lines (both
  cases represented on one invoice), confirming per-line
  `special_discount_amt` persists and reconstructs correctly (a $20
  net line with $5 discount correctly reconstructs to $25 List
  Price), and a second invoice with no special discount at all,
  confirming it behaves identically to before — zero phantom
  discount, zero column ever showing.
- Re-ran the core scenario against a genuine fresh `git clone` with
  this delivery applied — passes there too.
- Confirmed `server/routes/sales.js` (Revenue/Profit) has zero diff —
  the Sales Ledger rename is provably a label-only change.
- Confirmed the only other 3 places `invoice_items` gets written to
  (Delivery Order, and the two SOA-generation paths) are structurally
  different and don't need this field.
- Full build (server + client + portal + POS) passes clean, both
  locally and on the cold clone.

## Not yet verified
No live UI access from this sandbox — worth generating one real
invoice of each kind (with and without a special discount) after
deploy to see the actual PDF layout, particularly whether the extra
Discount column feels cramped on a printed page next to Brand,
Description, Qty, List Price, and Total all on one row.

## To apply
1. `git checkout main`
2. `git pull origin main`
3. Unzip this delivery on top of your local `pawvy-app` folder
4. `git add -A`
5. `git commit -m "Invoice: per-line List Price / Discount breakdown when a special discount was used; Sales Ledger label fix"`
6. `git push origin main`
