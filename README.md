# Pawvy App - Restock Planner: "To Order" column

New last column in the Restock Planner table: pieces to order to reach the brand's "Months to cover".
  To Order = Avg/Mo x Months to cover - On hand - On the way   (rounded up, never below 0)
A brand total is shown at the bottom of the table. Not rounded to master case / MOQ (that comes with the draft order step).

Files (complete, replace as-is):
- server/routes/forecast.js
- client/src/pages/Inventory.jsx

## Staging
```
git checkout staging
git pull
git merge main
# copy the 2 files from this zip over the repo (same paths)
git add server/routes/forecast.js client/src/pages/Inventory.jsx
git commit -m "Restock Planner: To Order column and brand total"
git push origin staging
```

## Merge to main
```
git checkout main
git pull
git merge staging
git push origin main
```
