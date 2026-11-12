# Pawvy App - Mailing Filter and Brand Excel

Four complete files, no database changes, no new libraries (Excel export uses exceljs, already installed).

1. Sales Ledger: new "Mailing required only" tick box. Shows every sale still waiting to be mailed (the red ones), across all dates; From/To are ignored while ticked, voided sales never show. Brand / Partner / Market filters still apply. Untick, or "Clear all filters", to go back.
2. Dashboard > Brand Analysis: new Download (Excel) button on the right of the brand row. A brand selected = that brand only; Overview = every brand. Uses the year and SG / MY / All markets view currently on screen. Sheets: Brands, Products, Monthly, Channels.

Files:
- server/routes/reports.js  (new GET /api/reports/brand-analysis-export, PIN-protected like the other reports)
- client/src/api.js
- client/src/pages/Sales.jsx
- client/src/pages/Dashboard.jsx

## 1. Test on staging
cd pawvy-app
git checkout staging
git pull
git merge main
# copy the 4 files from this zip into the same paths in the repo (replace), then:
git add server/routes/reports.js client/src/api.js client/src/pages/Sales.jsx client/src/pages/Dashboard.jsx
git commit -m "Sales Ledger: mailing-required filter; Dashboard: Brand Analysis Excel download"
git push origin staging

## 2. After you are happy, merge to main
git checkout main
git pull
git merge staging
git push origin main
