# Pawvy App - Dollar Sign and RM Wording

27 complete files (list below). Display wording only: the stored currency code stays MYR everywhere (database, calculations, exchange rate, invoices logic). No database changes, no new libraries.

1. Order Portal FOC pop-up: the "A delivery fee may apply to orders below ..." sentence is removed.
2. Order Portal pop-ups: title and the order amount are now Semi-bold (600) instead of Bold (700).
3. Order Portal (SG) money wording "S$" -> "$": pop-ups, the bottom Review Order bar, the review-page nudge and rules. (Other S$ in the app, e.g. New Brand Pricing, left as is for now.)
4. "MYR" -> "RM" wherever people read it: Order Portal and POS (MY links), Sales Ledger, Dashboard, Reports, Costs, Record Sale, Event Sale, Invoices/Delivery Orders/SOA and their printouts, Pending Orders, Products labels, exchange-rate card, Partners, Excel exports, portal order email + PDF, and server messages. "SGD" is unchanged everywhere.
   A small helper (client/src/utils/curLabel.js) turns the code MYR into the word RM only when displaying.

## 1. Test on staging
cd pawvy-app
git checkout staging
git pull
git merge main
# copy all files from this zip into the same paths in the repo (replace / add), then:
git add -A
git commit -m "Portal pop-up tweaks; show RM instead of MYR on screen (code stays MYR)"
git push origin staging

## 2. After you are happy, merge to main
git checkout main
git pull
git merge staging
git push origin main

## Files
- client/src/components/FxRateCard.jsx
- client/src/components/ui.jsx
- client/src/pages/Costs.jsx
- client/src/pages/Dashboard.jsx
- client/src/pages/DocumentLibrary.jsx
- client/src/pages/EventSale.jsx
- client/src/pages/Invoices.jsx
- client/src/pages/Partners.jsx
- client/src/pages/PendingOrders.jsx
- client/src/pages/Products.jsx
- client/src/pages/RecordSale.jsx
- client/src/pages/Reports.jsx
- client/src/pages/Sales.jsx
- client/src/utils/myShipping.js
- client/src/utils/pawvyPdf.js
- portal/src/App.jsx
- portal/src/ProductCard.jsx
- portal/src/api.js
- pos/src/App.jsx
- pos/src/ProductCard.jsx
- pos/src/api.js
- server/lib/fx.js
- server/lib/portalOrderEmail.js
- server/routes/invoices.js
- server/routes/orders.js
- server/routes/reports.js
- client/src/utils/curLabel.js

