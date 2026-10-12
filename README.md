# Pawvy App - Best Sellers Report (PDF)

## What's new

A **Best Sellers Report** button on the **Sales Ledger** page (next to Record Sale).
Click it, and a pop-up lets you choose:

- **Period** - last 30 days, 3 months, 6 months, year to date, this/last month, or custom dates
- **Top** - 5, 10, 15 or 20 items per brand
- **Brands** - tick the brands this partner carries (all ticked by default; Select all / Clear)
- **Exclude out-of-stock items** - on by default
- **Show units sold** - off by default (the PDF then shows only each item's % share)
- **Prepared for** - optional partner name, printed in the footer

Click **Generate PDF** and it downloads one PDF with one page per selected brand: a podium for
ranks 1-3 with product photos, then the ranked list. If Top 15/20 doesn't fit one page, the list
continues on a second page for that brand.

How the numbers work:
- Counts every sales channel; voided sales are excluded.
- % = the item's units / all units that brand sold in the period (so it always means "share of the
  brand's sales", and doesn't change when you toggle out-of-stock).
- Archived (inactive) products never appear. Out-of-stock = no stock in Mega + Hougang combined.
- Products without a photo show a faint Pawvy mark on a cream tile instead of an empty box.
- A selected brand with no qualifying sales gets a page saying so (nothing is silently skipped).

## Files

- `client/src/pages/Sales.jsx` - the button and pop-up
- `server/routes/sales.js` - new route `GET /api/sales/best-sellers-report` (PIN-protected like the rest)
- `server/lib/bestSellersReport.js` - NEW: data query and PDF drawing
- `server/assets/pawvy-logo-navy.png`, `pawvy-mark-navy.png` - NEW: your logo, recoloured navy
- `package.json` / `package-lock.json` - new dependencies: `pdfkit` (PDF), `sharp` (shrinks photos so
  the PDF stays small, and handles WebP), `@fontsource/fraunces` and `@fontsource/inter` (the brand fonts)

No database changes. No environment variables needed.

## Tested

Real server, logged in with a PIN, real HTTP requests and a real browser click-through:
401 without login; 400 for no brand / bad dates; multi-brand PDFs; Top 15 continuation page; an
out-of-stock item excluded and included on toggle; a 999-unit voided sale ignored; products with and
without photos; a brand with no sales. Rendered the PDF pages and checked them visually.
All three frontends cold-build clean.

## How to apply

```bash
git checkout main
git pull origin main
```

Copy the files from this zip into your repo at the same paths (overwrite where they exist), then:

```bash
npm install
git add client/src/pages/Sales.jsx server/routes/sales.js server/lib/bestSellersReport.js server/assets package.json package-lock.json
git commit -m "Add Best Sellers Report (partner-facing PDF) to Sales Ledger"
git push origin main
```

Railway redeploys from main as usual.
