# Patch 84 — Pawvy POS System + Dashboard event/channel performance filter

Big patch, two independent features. All sandbox-tested end-to-end before
packaging.

---

## 1. Pawvy POS System

A brand new public portal at **`/pos`**, separate build from both the
internal app and the Order Portal (same architecture pattern — isolated,
so nothing here can break the internal app or the Order Portal). Same
overall shape as the Order Portal, with these deliberate differences:

- **Title**: "Pawvy POS System" in the browser tab and top bar.
- **RRP only, everywhere** — verified nothing sends `price_wholesale_sg`
  to this portal at all, not even hidden in the payload.
- **Barcode scanning**: the search bar doubles as a scan target. A barcode
  scanner types the full code and sends Enter almost instantly — the app
  checks for an exact barcode match on Enter and, if found, adds it to
  cart automatically (qty +1 if already there) and clears the field for
  the next scan. If there's no exact match, Enter does nothing special —
  it just keeps working as normal live-filtering text search.
- **Review page**: no "Delivery" card — replaced with a **Payment
  Instructions** card (the same PayNow QR + UEN/Name/Bank/Account you
  already use, pulled directly from the internal Event Sale tab so it's
  guaranteed identical).
- **No Company Name field.** Notes (optional) and Shipping (optional) are
  present, matching Event Sale/Direct Sale.
- **Mailing Details (optional)**: Name, Address, Phone — for the cases
  where an item needs to be mailed rather than collected. All three
  optional, shown as their own section on Review.
- **"Thank you!" button** — writes real `sales` rows immediately (channel
  `Event Sale`, same as the internal Event Sale tab), deducts inventory
  the normal way, and that's it. No pending-approval step, no
  `portal_orders` row, no Telegram/email notification — straight to Sales
  Ledger.

### Where the mailing info goes, and how to see it later

Added three columns directly on `sales`: `mailing_name`,
`mailing_address`, `mailing_phone`. Simple by design — since POS sales
skip the approval queue entirely, there's no separate "POS orders" table
to manage; the info just travels with the sale record itself.

**To view it**: open **Sales Ledger** — any sale with mailing info now
shows a small mail icon next to the product name. Click it to see the
name/address/phone in a popup. Nothing new to learn beyond that one icon.

### Testing performed

- Confirmed `/api/pos/catalogue` never includes `price_wholesale_sg` in
  its response shape at all (not just hidden in the UI).
- Full checkout test: submitted a real cart with mailing info + shipping,
  confirmed the resulting `sales` rows have the correct channel, RRP as
  `unit_price`, mailing fields, and shipping — and confirmed inventory
  was correctly deducted (20 → 18 after selling 2).
- Confirmed the same stock-validation safety net as the Order Portal:
  tried to oversell past available stock, got a clear rejection showing
  current availability.
- Confirmed `/pos/` builds and serves correctly (title tag verified) —
  same static-serving pattern as `/order`.
- `npm run build` clean for both the internal client and the new `pos/`
  build.

---

## 2. Dashboard — Event / Channel Performance filter

New card on the Dashboard: pick a **Channel** (Event Sale, Direct Online/
Offline Sale, or any marketplace/B2B channel) and a **date range**, hit
Run, and see Revenue / Profit / Units Sold / Transactions for that exact
slice, plus a per-brand breakdown — built specifically so you can pull up
"how did this event do" on demand.

Uses the exact same revenue/profit formulas as the rest of Reports & P&L
(shared SQL constants), so these numbers will always agree with your other
reports — no separate calculation logic to drift out of sync.

### Testing performed

Seeded sales across three different scenarios — matching channel/date
range, matching channel but wrong date, and wrong channel entirely —
confirmed the filter correctly includes only the first and excludes both
of the others, with accurate per-brand revenue/profit breakdown.

---

## Files changed

**New:** `server/routes/pos.js`, `pos/` (entire new build — `App.jsx`,
`ProductCard.jsx`, `QtyStepper.jsx`, `api.js`, `main.jsx`, `pawvyLogo.js`,
`paymentInfo.js`, `package.json`, `vite.config.js`, `index.html`)

**Modified:** `server/database.js` (mailing columns), `server/index.js`
(pos routing + static serving), `server/routes/reports.js`
(channel-performance endpoint), `package.json` (pos build step),
`client/src/pages/Sales.jsx` (mailing info modal), `client/src/api.js`
(channelPerformance), `client/src/pages/Dashboard.jsx` (performance
filter card)

## Apply

```
git add -A
git commit -m "Patch 84: Pawvy POS System + Dashboard event/channel performance filter"
git push origin main
```

No new environment variables. No database migration needed — the three
new `sales` columns are added automatically on first startup, same as
every prior patch.

**One heads-up**: the POS build adds a bit to your deploy time (a third
frontend build alongside the internal app and Order Portal), and it's set
up as non-blocking — if the `pos` build somehow failed, the deploy would
still succeed and the internal app would be unaffected, exactly like the
existing Order Portal build safety net.
