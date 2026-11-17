# Pawvy App - "Hide from POS, Order Portal & website" tick

New products can be prepared (prices, cost, barcode, Shipments, Inventory) without partners or customers seeing them.

## How to use (Products & Pricing)
- Edit Product (or Add Product) has a new tick: "Hide from POS, Order Portal & website".
- In the product list, each row has a quick Hide / Show button and a HIDDEN badge.
- Hidden products stay Active internally: still selectable in Shipments, Inventory, Costs, Sales Ledger. They are removed from POS, Order Portal (list, top sellers, order submission), website shop, product page, bundles, top sellers and website checkout.
- Different from Archive: Archived products cannot be picked in Shipments.
- Existing products are not hidden (default is visible). New database column is added automatically on startup.

## Files (complete, replace as-is)
- client/src/api.js
- client/src/pages/Products.jsx
- server/database.js
- server/routes/checkout.js
- server/routes/portal.js
- server/routes/pos.js
- server/routes/products.js
- server/routes/shop.js

## Staging
```
git checkout staging
git pull
git merge main
# copy the files from this zip over the repo (same paths)
git add -A
git commit -m "Products: Hide from POS, Order Portal and website tick"
git push origin staging
```

## Merge to main
```
git checkout main
git pull
git merge staging
git push origin main
```
