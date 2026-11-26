# Pawvy App — Role PINs (Operations) + Multiple product photos

Deploy this ONE FIRST (the website zip depends on it for the extra photos).
Nothing changes for you until you (a) set an Operations PIN, or (b) add extra photos to a SKU.

## What's in it
1. **Operations PIN** (Settings > "Staff access: Operations PIN", 6 digits, master only)
   - Your own PIN works exactly as before and sees everything.
   - The Operations PIN only shows: Pending Orders, Inventory, Restock Checklist, Consignment, Customers, Enquiries.
   - Hidden from ops: "Restock In" and "Import Opening Stock" buttons (Inventory) and the Unit Cost column in Consignment > Place Stock. Pending Orders "Actual Shipping Cost" stays.
   - Enforced on the server: other areas return "no access", cost fields are removed from the data ops receives, and ops-placed consignment stock records the product's set cost automatically.
   - Changing or turning off the ops PIN signs out anyone using it. PINs are stored hashed.
   - Login screen now accepts 4 digits (yours) or 6 digits (ops).
2. **More photos per SKU** (Products & Pricing > edit a product > "More photos")
   - Main photo stays as is, plus up to 5 extra (6 total). Add several at once, reorder with the arrows, remove, or "Copy photos from another SKU" (reuses the same files, no re-upload; optional "also copy the main photo").
   - New uploads (main and extra) are automatically resized (longest side 1600px) and saved as high-quality JPEG. Upload limit is now 8MB. Existing photos are NOT touched.
   - Website receives the extra photos as `gallery`. Order Portal and POS are unchanged.
3. Grouped cards on the website follow the photos of the card's default SKU; each SKU's own product page shows its own set.

## Files (complete files, copy over the same paths)
client/src/App.jsx, AuthGate.jsx, api.js, pages/Consignment.jsx, pages/Inventory.jsx, pages/Products.jsx, pages/Settings.jsx
server/auth.js, database.js, index.js, lib/productPhoto.js (NEW), routes/consignment.js, routes/products.js, routes/shop.js

New tables are created automatically on start (role_pins, product_images; sessions gets a role column). No env var changes.

## Deploy to STAGING first
```
cd pawvy-app
git checkout staging
git pull
git merge main
# copy every file from this zip into the repo, same paths (replace when asked)
git add -A
git commit -m "Operations PIN role + multiple product photos"
git push origin staging
```
Test on staging: log in with your PIN; Settings > set an Operations PIN; log in with it in a private window and check the 6 tabs; edit a product > add 2 photos.

## Then merge to MAIN
```
git checkout main
git pull
git merge staging
git push origin main
```

## Rollback
Settings > Operations PIN > Turn off puts everyone back to normal. Extra photos can be removed per SKU.
