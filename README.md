# Pawvy App - Restock Planner: per-brand Lead Time and Months to Cover

Each brand now has its own settings in Inventory > Restock Planner (select a brand, bar above the table):
- **Lead time (weeks)**: red = cover below the lead time.
- **Months to cover**: amber = cover below this target.
- "Time to plan an order" shows when half or more of that brand's selling SKUs are red.
Until set, brands use defaults of 8 weeks and 3 months. Settings are saved per brand (new table brand_restock_settings, created automatically on startup; existing data untouched).

Files (complete, replace as-is):
- server/database.js
- server/routes/forecast.js
- client/src/api.js
- client/src/pages/Inventory.jsx

## Staging
```
git checkout staging
git pull
git merge main
# copy the 4 files from this zip over the repo (same paths)
git add server/database.js server/routes/forecast.js client/src/api.js client/src/pages/Inventory.jsx
git commit -m "Restock Planner: per-brand lead time and months to cover"
git push origin staging
```

## Merge to main
```
git checkout main
git pull
git merge staging
git push origin main
```
