# Pawvy App - Brand Analysis Month View

Two complete files, no database changes, no new libraries.

1. Dashboard > Brand Analysis (a brand selected): click any bar in "Monthly Profit Trend" to show only that month. Top Channels and the SKU table switch to that month, the chosen bar stays bright, a "Sep 2026 only - Show all months" tag appears in the header. Click the same bar again (or the tag) to go back to the whole year. Changing brand / market resets to the whole year.
2. Excel download (still the whole year, same button) gains three sheets:
   - Products by month: one row per product per month (units, revenue, profit) - filter / pivot friendly.
   - Units by month: one row per product, columns Jan-Dec + total, with a TOTAL row.
   - Profit by month: same grid in gross profit.
   Existing sheets (Brands, Products, Monthly, Channels) are unchanged.

Files:
- client/src/pages/Dashboard.jsx
- server/routes/reports.js

## 1. Test on staging
cd pawvy-app
git checkout staging
git pull
git merge main
# copy the 2 files from this zip into the same paths in the repo (replace), then:
git add client/src/pages/Dashboard.jsx server/routes/reports.js
git commit -m "Brand Analysis: click a month bar to filter; Excel month breakdown sheets"
git push origin staging

## 2. After you are happy, merge to main
git checkout main
git pull
git merge staging
git push origin main
