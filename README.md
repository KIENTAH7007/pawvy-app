# Feature: POS/event sales earn BUTTONS (held until email verified) + channel-scoped campaigns

## Context
Two things confirmed missing when you asked me to check: POS/event sales
have never earned BUTTONS at all (only website checkout did), and
campaigns had no way to apply to just one channel (Website vs POS) even
though the database already had unused columns clearly meant for this.
This delivery builds both, together, since they share the same
underlying multiplier logic.

## What changed (7 files)

### 1. `server/database.js`
New column: `sales.pos_checkout_ref` — groups the multiple `sales` rows
a single POS checkout creates (one per line item) under one shared
reference, the same role `website_order_id` already plays for website
orders. Added via the same safe `ALTER TABLE ... ADD COLUMN` pattern
used throughout this file — non-destructive on your live database.

### 2. `server/lib/buttons.js`
- **`getActiveMultiplierDetail`** now takes a `channel` parameter
  (`'website'` | `'pos'` | `null`). A campaign with `scope='site_wide'`
  still applies regardless of channel (unchanged default behavior for
  anyone who doesn't set a channel); a campaign with `scope='channel'`
  only applies when `scope_value` matches the calling channel.
- **`recordPurchaseButtons`** gained two new optional parameters:
  `onDate` (defaults to `new Date()`, unchanged for the website) and
  `channel` (defaults to `null`, unchanged for the website unless
  explicitly passed). `onDate` matters specifically for POS, where
  BUTTONS might be recorded well after the actual sale (see below) —
  the campaign multiplier that applies is whatever was live **on the
  original sale date**, not whatever happens to be running when the
  customer eventually verifies days or weeks later.
- **New: `recordPosCheckoutButtons(db, { customerId, checkoutRef })`**
  — the shared logic for crediting one POS checkout's BUTTONS, used in
  two places (below). Computes the subtotal from the actual persisted
  `sales` rows (not any original request body), so the math can never
  drift from what's really in the ledger, and correctly nets to zero if
  every line in that checkout was later voided. Idempotent — checks for
  an existing batch first, safe to call more than once.

### 3. `server/routes/pos.js`
- Every checkout now backfills `pos_checkout_ref` (the first line's own
  id) onto all its lines.
- **If the resolved customer is already verified**, their BUTTONS are
  credited immediately, same as a website order.
- **If they're unverified** (a brand-new signup at this event, or a
  returning customer who never verified before) — **nothing is
  recorded yet**. Per your decision, purchase BUTTONS for an unverified
  account are held until they actually verify their email, so the
  7-day hold can never quietly finish before anyone's confirmed the
  account is real.

### 4. `server/routes/customers.js`
The email verification endpoint (`completeToken`, used by both the
verify-link and JSON verify routes) now does one more thing alongside
crediting the existing 150B signup bonus: it looks up **every**
past POS checkout tied to that email that hasn't been credited yet
(excluding voided sales), and credits them all in one sweep, oldest
first. The 7-day hold on each starts counting from **this moment**
(verification), not from the original sale date — that's the entire
point of holding.

**Also fixed a related bug while I was in this code**: the
first-purchase-bonus check on the *website* checkout side only ever
looked at prior website orders — it had no way of knowing a customer's
real first purchase might have been a POS sale credited later via this
new sweep. Left as-is, that risked double-granting the 100B bonus (and
a referral bonus stacked on top) to someone whose actual first
purchase was at an event. Fixed by checking for an existing
`first_purchase_bonus` batch (any channel) instead of just prior
website orders — see `server/routes/checkout.js`.

### 5. `server/routes/sales.js`
The void-a-sale route now also cascades to POS checkouts (previously
only handled website orders): voiding a sale tied to `pos_checkout_ref`
correctly voids that checkout's still-pending BUTTONS, same 7-day-hold
reasoning as the website path (does nothing if the hold already
expired — that's by design, not a gap).

### 6. `client/src/pages/Marketing.jsx`
Added an "Applies to" selector to the Campaigns form — Website only,
POS/event sales only, or Both. The database columns for this
(`scope`/`scope_value`) already existed and the backend route already
accepted them; only the admin UI was missing. Also added a column to
the campaigns table showing which channel each one targets.

## Verified — this one touches real money/loyalty logic, so tested thoroughly
Not just `node --check` — 27 real scenario tests against actual running
route handlers with a seeded database, covering every risk I identified
while designing this:
- Already-verified customer earns the correct amount immediately at POS
- Unverified customer earns nothing at time of sale
- Verifying retroactively credits **every** past unprocessed POS
  checkout in one sweep, in the correct order
- First-purchase bonus (100B) grants **exactly once**, even when a
  customer has multiple pre-verification POS checkouts being swept at
  the same time
- Voiding a POS sale correctly voids both its purchase batch and its
  first-purchase bonus batch
- A POS-only campaign and a Website-only campaign coexist without
  conflicting, and live POS earning actually applies the right
  channel's rate
- Cross-channel double-grant is prevented: a customer whose first
  purchase was at a POS event does not get a second 100B bonus if they
  later buy on the website
- **Retroactive credits use the multiplier that was active on the
  original sale date**, confirmed with a campaign that had already
  expired by the time verification happened — this was the trickiest
  correctness detail and the one most worth a dedicated test
- Re-ran the entire core suite a second time against a genuine fresh
  `git clone` with this delivery applied (not just my working copy) —
  all pass there too
- Full build (server + client + portal + POS) passes clean, both
  locally and on the cold clone

## Not yet verified
No way to test the actual email-sending/click-the-link flow end-to-end
from this sandbox (no real email delivery here) — I tested by pulling
the verify token directly from the database and calling the JSON verify
endpoint with it, which exercises the exact same `completeToken` logic
the real email link hits, but a real click-through after deploy is
still worth doing once, especially to see the confirmation page's
BUTTONS balance number looks right in practice.

## To apply
1. `git checkout main`
2. `git pull origin main`
3. Unzip this delivery on top of your local `pawvy-app` folder
4. `git add -A`
5. `git commit -m "POS/event sales earn BUTTONS (held until verified) + channel-scoped campaigns"`
6. `git push origin main`

Railway auto-deploys the server and rebuilds the client from `main` on
push.
