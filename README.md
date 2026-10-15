# Pawvy App – trimmed product images endpoint (for the website)

Adds `?trim=1` to image URLs: `/api/uploads/<key>?trim=1` returns the same photo with the empty border trimmed and re-padded to a square, so the product fills more of its card. Nothing that isn't background is cut (corner labels like "Classic"/"Mini", shadows and small print stay). Without `?trim=1` nothing changes, so the app, POS, portal and PDF reports are untouched. Uploaded originals are never modified.

Files: `server/lib/imageTrim.js` (new), `server/routes/uploads.js` (changed). Uses `sharp`, already in package.json. No database change.

## Apply
```
cd pawvy-app
git checkout staging
git pull origin staging
# copy server/lib/imageTrim.js and server/routes/uploads.js from this zip into the same places
git add server/lib/imageTrim.js server/routes/uploads.js
git commit -m "Uploads: ?trim=1 returns border-trimmed square product photos for the website"
git push origin staging
```
Deploy this one first (the website zip works either way: if the app is older it simply ignores ?trim=1 and serves the original).

Quick check after deploy: open `<app-url>/api/uploads/<any product image key>?trim=1` in a browser — it should be the same photo, tighter and square.
