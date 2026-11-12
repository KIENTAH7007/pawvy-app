# Pawvy App - Partner Export Market

Two complete files. "Export for Partner" (Products & Pricing) now follows the SG / MY toggle on the page:
- SG: unchanged (RRP (SGD), RRP Online (SGD)); file name pawvy-partner-products-DATE.xlsx
- MY: RRP (RM) and RRP Online (RM) taken from the MY prices; file name pawvy-partner-products-my-DATE.xlsx
Brand / search / archived filters work as before. It lists the same products you see in the table; a product with no MY price set shows 0 (same as SG today).

Files:
- client/src/pages/Products.jsx
- server/routes/products.js

## 1. Test on staging
cd pawvy-app
git checkout staging
git pull
git merge main
# copy the 2 files from this zip into the same paths in the repo (replace), then:
git add client/src/pages/Products.jsx server/routes/products.js
git commit -m "Products: Export for Partner follows the SG/MY toggle"
git push origin staging

## 2. After you are happy, merge to main
git checkout main
git pull
git merge staging
git push origin main
