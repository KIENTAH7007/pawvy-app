# Pawvy App — Timezone Date Bug Fix (Sales Ledger + App-Wide)

Target branch: **staging**
Repo: `pawvy-app`

## The bug you reported, and what it actually was

Sales Ledger's default "To" date was showing yesterday instead of
today. Root cause: `new Date().toISOString().slice(0, 10)` — this
pattern looks correct but `.toISOString()` converts to UTC *before*
formatting. Singapore is UTC+8, so any time between midnight and 8am
SGT, this silently returns **yesterday's date**. For month-boundary
math specifically (building "last day of this month" as a Date object
at local midnight), the same UTC conversion shifts the date back by a
day regardless of time of day — which is exactly why you saw it.

## What I found when I searched the whole app, as you asked

This exact pattern was used in **13 client files and 19 server files**
— not just Sales Ledger. I checked every single one individually
rather than blindly replacing every `.toISOString()` in the codebase,
since plenty of those uses are genuinely correct (token expiry
timestamps, `credited_at`, session expiry — real moments in time,
unaffected by this bug, left untouched). Only fixed the ones that were
actually using it to represent a Singapore calendar date.

**Confirmed everything empirically**, not just by reading the code —
simulated the exact 2am SGT scenario and watched the buggy pattern
produce the wrong date, then re-ran the same test against the fixed
code and confirmed it now returns the correct date.

### Fixed — client side (13 files)

Sales.jsx, Costs.jsx (both had the *same* buggy `currentMonthRange`
function duplicated — now share one correct utility instead), Marketing.jsx
(3 separate spots), Inventory.jsx, Products.jsx, Consignment.jsx,
Reports.jsx, Invoices.jsx (3 spots — this file already had one correct,
commented "avoid toISOString" fix for its SOA period-range logic; the
other 3 spots nearby still had the bug), CostReference.jsx (2 spots),
Shipments.jsx (2 spots — see the extra bug found below), EventSale.jsx,
Dashboard.jsx, RecordSale.jsx.

**A second, unrelated bug found and fixed while in Shipments.jsx:** the
monthly variance calculation hardcoded `${thisMonth}-31` as the end of
the month — wrong for February, April, June, September, and November.
Replaced with the same real end-of-month calculation used everywhere
else now.

### Fixed — server side (19 files)

- **`server/lib/pricing.js`** — the discount active/inactive date-window
  check. This one genuinely matters: in the early-morning window, a
  discount could start late or expire late, meaning a customer might
  briefly see the wrong price.
- **`server/routes/invoices.js`** — document number generation (`today`
  in `INV-YYYYMMDD-NNN`) and 3 issue-date defaults.
- **`server/routes/customers.js`** — the birthday-change cooldown "ends
  on" date shown to customers.
- **`server/jobs/autoRestock.js`**, **`server/jobs/backup.js`** — daily
  job labels (restock checklist name, backup email subject/filename).
- **10 route files** (shipments, orders, pos, checkout, restock,
  inventory, adjustments, sales, consignment, publicContent) — all
  "today" defaults for order dates, sale dates, inventory movement
  dates, and the homepage banner date-window check.
- **3 "rolling window" lookback calculations** (restock suggestions,
  restock forecasting, portal's "Top Sellers") — these looked different
  from the obvious "today" pattern (they start from `new Date()` then
  subtract days/months before formatting), but tested empirically and
  confirmed they have the *same* underlying bug. Fixed all 3.

### Deliberately left alone — confirmed safe, not just assumed

- **`server/auth.js`** — already correct. Deliberately uses UTC
  arithmetic to compute an SGT day-end boundary (23:59:59 SGT ==
  15:59:59 UTC) — a legitimate pattern, not the bug.
- **Invoices.jsx's `addDays` helper**, and the matching `priorStart`/
  `priorEnd` calculations in `server/routes/invoices.js` and the
  `dueDate` calculation in `server/routes/consignment.js` — all follow
  a different pattern (parse a date-only string, which becomes 8am
  local time, then do local-time date math) that happens to be
  timezone-safe. Tested this empirically across 3 different times of
  day before concluding it was fine — not left alone by assumption.
- Every timestamp recording an exact moment (token expiry,
  `credited_at`, session expiry, `nowIso`) — these are correct as
  full UTC ISO strings and were never affected by this bug in the
  first place.

## What this means going forward

Built one shared utility on each side —
`client/src/utils/dates.js` and `server/utils/dates.js` — exporting
`localDateStr()`, `localMonthStr()`, and (client-side)
`currentMonthRange()`. Anywhere that previously had its own local copy
of this logic now imports the shared, correct version instead, so this
can't silently drift out of sync again the way the duplicated
`currentMonthRange()` in Sales.jsx and Costs.jsx did.

## Verification performed

- **Empirically reproduced the exact bug** at 2am SGT before touching
  any code, confirming `new Date().toISOString().slice(0,10)` really
  does return the wrong date — not just reasoning about it.
- **Re-ran the same test against the fixed utility** and confirmed it
  now returns the correct date at the same simulated time.
- Individually checked every ambiguous case (`addDays`, `priorStart`/
  `priorEnd`, `dueDate`, `auth.js`) with real date-math tests across
  multiple times of day, rather than guessing from the code shape alone.
- Full client production build (`vite build`) — clean, no errors.
- All 19 modified/new server files load with no errors
  (`node -e "require(...)"` on each).
- Confirmed no duplicate imports introduced across any of the 19 server
  files.
- **Real backend smoke test**: seeded a real discount window covering
  today's actual date, started a real server with the fixed
  `pricing.js`, and confirmed via a real HTTP request that the product
  correctly shows as discount-active with the right effective price.
- Full repo-wide sweep for the buggy pattern after all fixes — zero
  remaining instances outside the confirmed-safe cases above.
- All 33 changed/new files byte-diffed against what was actually
  tested — identical.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite these files, preserving the same paths:
#   client/src/pages/Consignment.jsx
#   client/src/pages/CostReference.jsx
#   client/src/pages/Costs.jsx
#   client/src/pages/Dashboard.jsx
#   client/src/pages/EventSale.jsx
#   client/src/pages/Inventory.jsx
#   client/src/pages/Invoices.jsx
#   client/src/pages/Marketing.jsx
#   client/src/pages/Products.jsx
#   client/src/pages/RecordSale.jsx
#   client/src/pages/Reports.jsx
#   client/src/pages/Sales.jsx
#   client/src/pages/Shipments.jsx
#   server/jobs/autoRestock.js
#   server/jobs/backup.js
#   server/lib/pricing.js
#   server/routes/adjustments.js
#   server/routes/checkout.js
#   server/routes/consignment.js
#   server/routes/customers.js
#   server/routes/forecast.js
#   server/routes/inventory.js
#   server/routes/invoices.js
#   server/routes/orders.js
#   server/routes/portal.js
#   server/routes/pos.js
#   server/routes/publicContent.js
#   server/routes/restock.js
#   server/routes/sales.js
#   server/routes/shipments.js
#   server/utils/restockSuggestions.js

# these are NEW files:
#   client/src/utils/dates.js
#   server/utils/dates.js

git add .
git commit -m "Fix timezone bug: dates silently shifted back a day in Singapore before 8am UTC, across 13 client + 19 server files. Add shared date utilities to prevent future drift."
git push origin staging
```

## Worth checking on S-App once live

- Open Sales Ledger — "To" should default to today's real date.
- If you can, check any of the fixed pages again first thing in the
  morning (before 8am) once — that's the exact window this bug lived
  in, and the one time of day the old code would have looked "fine"
  the rest of the day but wrong then.
