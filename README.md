# Pawvy App - Restock Planner sales fix

Restock Planner now takes monthly sales from the Sales Ledger (same source as the Dashboard), so Consignment Sales (invoiced at stock take) are counted. Voided sales are excluded; consignment placements are still NOT counted. All markets (SG + MY) are included because stock is shared.

Files (complete, replace as-is):
- server/routes/forecast.js
- client/src/pages/Inventory.jsx (caption text only)

## Staging
```
git checkout staging
git pull
git merge main
# copy the 2 files from this zip over the repo (same paths)
git add server/routes/forecast.js client/src/pages/Inventory.jsx
git commit -m "Restock Planner: use Sales Ledger so consignment sales count"
git push origin staging
```

## Merge to main
```
git checkout main
git pull
git merge staging
git push origin main
```
