# Warehouse Rename — Staging Test Plan

This covers everything the code change touches. I've already verified
every one of these scenarios myself against a real running copy with
real seeded data — this is for you to independently confirm on Staging
with your own eyes before merging to Main.

**Recommended order**: do these roughly top to bottom — later tests
build on earlier ones (e.g. you need stock at Hougang before the
restock-suggestion test means anything).

---

## 1. Labels — quick visual sweep

- [ ] **Inventory tab**: the two stock columns are now labeled
  "HOUGANG" and "MEGA" (not "STORHUB"/"HOME").
- [ ] **Restock Checklist tab → Direction dropdown**: shows "Hougang →
  Mega (common)" as the first/default option, and "Mega → Hougang
  (rare)" as the second.
- [ ] **Shipments tab → any shipment's "Warehouse (received into)"
  field**: shows "Mega" (this field is always disabled/read-only, just
  confirm the label).

## 2. Historical data — did the rename correctly relabel existing records?

- [ ] Open a **product that had real stock before this patch**. Its
  Hougang/Mega quantities on the Inventory tab should match exactly
  what its Storhub/Home quantities were before — just relabeled, not
  changed.
- [ ] Open that same product's **movement history** (Inventory →
  click into a product, or wherever you view movement history). Old
  movements that used to say "Storhub" or "Home" should now say
  "Hougang" or "Mega" respectively — same movements, same dates, same
  quantities, just the new names.
- [ ] If you have any **old restock checklists** (completed or draft)
  from before this patch, open one. Its direction should now read
  correctly as either "Hougang → Mega" or "Mega → Hougang" — matching
  what actually happened (a checklist that moved stock from the
  warehouse to the ops hub should now say "Hougang → Mega", not the
  other way round).
- [ ] If you have any **old shipments already marked "received"**,
  open one. Its warehouse field should now say "Hougang" (since all
  pre-patch shipments were received into the old Storhub/warehouse
  role) — this is different from new shipments going forward, which
  default to Mega (see Test 5).

## 3. Sales deduct from Mega

- [ ] Record a **new sale** (any channel — website order, POS, or
  manual Sales entry) for a product with known stock.
- [ ] Confirm the product's **Mega quantity** drops by the sale
  quantity, and its **Hougang quantity is completely unchanged**.
- [ ] **Void that sale.** Confirm Mega's quantity goes back up by the
  same amount (the reversal also correctly targets Mega).

## 4. Consignment placement deducts from Mega

- [ ] Place a product on **consignment** for any partner.
- [ ] Confirm the product's **Mega quantity** drops by the placed
  quantity, and **Hougang is unchanged**.
- [ ] **Reverse/void that placement.** Confirm Mega goes back up.
- [ ] Record a **consignment return** for something already placed.
  Confirm it correctly adds back to **Mega** (not Hougang).

## 5. New shipments default into Mega (the one deliberate exception)

- [ ] Create a **new shipment** (any brand). Its "Warehouse (received
  into)" should show **Mega** by default — this is intentionally
  different from the general rename (which would suggest Hougang), so
  specifically double-check this one.
- [ ] Add a line item, mark the shipment **received**.
- [ ] Confirm the received quantity lands in **Mega**, and shows up in
  the product's movement history tagged "Shipment Received" at Mega.

## 6. Manual transfer: Restock Checklist

- [ ] Create a **new Restock Checklist**. Confirm it defaults to
  "Hougang → Mega (common)".
- [ ] Add an item, commit the checklist.
- [ ] Confirm the item's **Hougang quantity decreases** and **Mega
  quantity increases** by the transferred amount.
- [ ] Create a **second checklist**, this time manually switching the
  direction to "Mega → Hougang (rare)". Commit it with a different
  item.
- [ ] Confirm this one moves stock the opposite way — **Mega
  decreases, Hougang increases**.

## 7. Restock suggestions — the core logic of this whole change

This is the part most worth testing carefully, since it's the piece
that would have been easy to get backwards.

- [ ] Find (or create, via a test sale) a product where **Mega is at 0
  or very low**, and **Hougang has real stock** to supply from.
- [ ] Go to the Restock Checklist page and click **"Add suggested
  transfers"** (only appears when direction is "Hougang → Mega").
- [ ] Confirm the suggested item is exactly the one you expected, and
  that it's suggesting to pull stock **from Hougang, into Mega** — not
  the other way round.
- [ ] The **auto-generated daily restock checklist** (created
  automatically each morning) should also default to "Hougang → Mega"
  — check tomorrow's auto-created checklist once this is live, or ask
  me to help verify the job's output directly if you want to confirm
  sooner.

## 8. Manual adjustments

- [ ] Use **Inventory → Write-off** or **Adjust** on a product,
  targeting Mega specifically (if the UI lets you pick a location) or
  however it currently applies adjustments.
- [ ] Confirm the adjustment lands on the correct location and the
  quantity change is reflected right away on the Inventory tab.

## 9. Portal / forecast (read-only checks, lower risk)

- [ ] Order Portal's stock-availability numbers for a partner should
  still show sensible totals (this combines Hougang + Mega, so it's
  order-independent — just confirm the total looks right, not broken
  or zeroed out).
- [ ] Restock Forecasting page should load without errors and show
  reasonable "days of cover" numbers.

---

## Known, deliberate exceptions — not bugs if you see these

- **The one-time "Import Opening Stock" feature** (if you ever look at
  its code or re-trigger it) still references "Storhub"/"Home" — this
  is deliberate. That import already ran once, is idempotent (won't
  double-import), and reads from a historical file that's frozen on
  purpose. It has no bearing on anything you'll see day-to-day.
- **A separate bug I found, not fixed here**: non-"Recount" stock
  adjustments (Write-off, Damage, etc.) appear to update a different,
  unused database table — meaning those adjustment types may not
  actually be reducing your live stock count today. Confirmed the
  table in question is completely empty. This predates the rename and
  is unrelated to it — flagging separately, happy to fix as its own
  task if you'd like.

## If anything looks wrong

Note exactly which test number, what you expected, and what you
actually saw (ideally with a screenshot), and send it over — given how
much this touches, I'd rather fix a specific, well-described issue
than guess.
