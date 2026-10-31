# Pawvy App – Credit Lines on Invoice and SOA

## What it does
- **Generate Invoice** and **Generate SOA**: new optional section "Credit / adjustment (optional)". Click "+ Add credit line",
  type a free-text description and an amount. Up to 10 lines. The amount is deducted from the document total and printed as a
  green negative line (the Invoice also shows a "Credit / Adjustment" line in the totals box). A negative total is allowed.
- **Nothing entered = nothing changes.** Every invoice and SOA comes out exactly as before. The Vanillapup rebate (auto and
  manual) is untouched; if a credit line is added on a Vanillapup SOA, it sits right after the Vanillapup CN line.
- Invoice credits flow into the SOA automatically, because the SOA uses each invoice's total.
- **Operating Costs**: new category "Credit Notes". When you give a partner a credit, add a cost with this category so profit reflects it.
  (Sales figures are not reduced; only profit via Operating Costs.)
- You still issue the formal credit note document yourself; the app only deducts the amount.
- Small additive database change: one new column (invoice_items.is_credit, default 0). It is added automatically on first start,
  existing data is untouched. Backup is still good practice before the merge (Railway: download /data/pawvy.db).

## Git steps (staging)
```
cd pawvy-app
git checkout staging
git pull origin staging
```
Copy these code files from this folder into the repo, keeping the folders (NOT README.md, NOT the zip):
client/src/pages/Costs.jsx, client/src/pages/Invoices.jsx, server/database.js, server/routes/invoices.js
```
git add -A
git commit -m "Credit / adjustment lines on Invoice and SOA, Credit Notes cost category"
git push origin staging
```
Test on staging: Invoices & Docs > Generate Invoice > add a credit line > print. Then Generate SOA the same way.
Also confirm an invoice/SOA with NO credit line looks exactly as before.

## Git steps (merge to main)
```
git checkout main
git pull origin main
git merge staging
git push origin main
```
Wait for Railway to deploy and go green. (Website zip: none for this change.)
