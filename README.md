# Pawvy App - Restock Planner (step 1) + Shipment arrival date

## What changes
1. **Inventory > "Restock Planner"** replaces the old "Restock Recommendations" tab.
   - Brand cards: "X of Y SKUs under 2 months of cover", units on the way, and a "Time to plan an order" flag when half or more of a brand's selling SKUs are red.
   - Click a brand to see its stock-cover table: ON HAND, last 6 months of real sales, month-to-date (not averaged), AVG/MO (last 3 full months), ON THE WAY, COVER bar in months.
   - Real sales only (consignment placements are not counted; sale reversals are netted).
   - ON THE WAY = lines of Shipments still at status "ordered" (voided / received are not counted).
   - KPI "Need Reorder" is now "Low Cover SKUs".
2. **Shipments > Mark as received** now logs the arrival date (today) automatically, same as costing logs the costed date. It only happens on the first click (ordered -> received). Shipments already received are not touched; edit their arrival date manually if needed.

Not touched: Stock Levels tab, Restock In / Transfer / Write-off / Adjust, Restock Checklist, auto-restock jobs. The old /forecast/restock-recommendations endpoint is left in place (unused).

## Files (complete, replace as-is)
- client/src/api.js
- client/src/pages/Inventory.jsx
- server/routes/forecast.js
- server/routes/shipments.js

## Staging
```
git checkout staging
git pull
git merge main
# copy the 4 files from this zip over the repo (same paths)
git add client/src/api.js client/src/pages/Inventory.jsx server/routes/forecast.js server/routes/shipments.js
git commit -m "Restock Planner stock-cover table; Mark as received logs arrival date"
git push origin staging
```

## Merge to main (after you are happy on staging)
```
git checkout main
git pull
git merge staging
git push origin main
```
