# Database indexes + Dashboard Top Partners date range picker

## This delivery is for the App folder (`pawvy-app`) only

2 files changed: `server/database.js`, `client/src/pages/Dashboard.jsx`.

## Indexes (`server/database.js`)

12 new indexes on the columns actually filtered by the Sales Ledger,
Dashboard, and Reports queries (`date`, `partner_id`, `product_id` across
`sales`, `invoices`, `invoice_items`, `inventory_movements`,
`website_orders`, `website_order_items`, `portal_orders`). Purely
additive (`CREATE INDEX IF NOT EXISTS`) — no data or query results
change, only how fast SQLite can find matching rows as those tables grow
over the years. No code changes needed anywhere else; every existing
query that filters on these columns picks the index up automatically.

## Dashboard — Top Partners date range (`client/src/pages/Dashboard.jsx`)

The `GET /api/reports/partners` endpoint was already fully date-range
agnostic — the YTD restriction was purely a frontend default with no
documented reasoning behind it (confirmed by reading the actual code, not
guessed). So this needed zero backend changes.

- Replaced the hardcoded "Jan – {month} YTD" label with a real From/To
  date range picker, same `Input type="date"` pattern already used on
  Reports.jsx, for consistency.
- Defaults to YTD on page load (unchanged from before).
- Header label switches between "YTD PROFIT RANKING" and "CUSTOM RANGE
  PROFIT RANKING" depending on whether the selected range still matches
  YTD exactly.
- "Reset to YTD" button appears once you've changed the range, to get
  back to the default in one click.
- Applies to both the "Partners" and "All Channels" toggle views — same
  date range drives both, since they're the same underlying report at a
  different grouping.

## Verification performed

- Real DB init test on a fresh clone: confirmed all 12 indexes are
  created, and a sanity-check query (sum sales for a partner within a
  date range) returns the identical correct result with indexes present
  as it would without them — indexes only change speed, not correctness.
- Real cold-clone build: fresh `git clone` → applied both files →
  `npm install` (root + client) → `npm run build` (client) — passed with
  no errors.
- Re-ran the index verification a second time against the cold-clone
  copy specifically, not just the working directory.
- Byte-for-byte diff confirms both files in this zip match what was
  cold-clone built and tested.

## To apply

```bash
cd /path/to/your/pawvy-app
git checkout -- . && git clean -fd && git pull origin main
```

Unzip this delivery's files into that folder (overwrite), then:

```bash
git add .
git commit -m "Add DB indexes for scaling; Dashboard Top Partners gets a real date range picker"
git push origin main
```

Railway auto-deploys from `main` — no other steps needed.
