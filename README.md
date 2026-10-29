# Pawvy App – Faster Images and Banner Optimiser

## What it does
1. Product photos with the border trimmed (used on pawvy.co) are now SAVED in the bucket the first time they are
   made (under derived/…), in two sizes: 480px (cards) and 1000px (product page). After that they are just a file read –
   no re-processing after a deploy/restart. Originals are never touched (POS, Order Portal, PDFs still use them).
   The trimming itself is also lighter, and at most 2 photos are processed at a time.
2. New banner uploads are automatically resized and compressed (desktop 1920px, tablet 1200px, mobile 800px, WebP).
   The untouched original is also kept in the bucket (folders banners-original etc.). New Instagram highlights are resized to 800px.
3. New button on Marketing tab > Homepage Banner Carousel: "Optimise existing images". Click it ONCE after deploying.
   It makes lighter copies of the current banners and Instagram images and points the website at them. Originals stay in the
   bucket, an already-light image is skipped, and it is safe to click again. It shows a before/after size list.

No database change. Extra bucket space is tiny (well under 1 GB).

## Deploy order
Deploy this App zip FIRST. The Website zip works with or without it, but the speed-up needs both.

## Git steps
```
cd pawvy-app
git checkout staging
git pull origin staging
```
Copy the code files from this folder into the repo, keeping the folders (NOT README.md, NOT the zip):
client/src/api.js, client/src/pages/Marketing.jsx, server/lib/imageTrim.js, server/lib/imageOptimize.js (new),
server/lib/optimizeExisting.js (new), server/routes/homepageBanners.js, server/routes/instagramPosts.js, server/routes/uploads.js
```
git add -A
git commit -m "Saved trimmed photos, banner optimiser, lighter image processing"
git push origin staging
```
After Railway deploys staging: Marketing tab > click "Optimise existing images" and check the homepage banners still look right.
Then merge to main:
```
git checkout main
git pull origin main
git merge staging
git push origin main
```
Then click "Optimise existing images" once on production too (production has its own database and bucket).
