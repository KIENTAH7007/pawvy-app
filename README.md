# Pawvy App – 600px Photos (simplified; replaces the earlier "600px Photos and Storage Cleanup" App zip)

## What it does
1. Small product photos are now 600 x 600 px (was 480). Large ones stay 1000 x 1000. Nothing is delivered smaller than 600 x 600
   (a small original is enlarged to 600). Older website pages that still ask for the 480 size automatically get the 600 version.
   The 600 copies are created the first time each photo is viewed.
2. The saved 480 x 480 copies (derived/trim-480/ only) are deleted automatically, once, a few seconds after the App starts.
   Nothing else is deleted: originals, the 1000 px copies, banners, Instagram and everything else stay exactly as they are.
   After the first run it does nothing. The Railway log shows a line "Removed N old 480px photo copies".
3. No clean-up screen, no database change.

## Deploy order
App first, then Website ("Pawvy Website - 600px Photos.zip", unchanged from before).

## Git steps (staging)
```
cd pawvy-app
git checkout staging
git pull origin staging
```
Copy these files from this folder into the repo, keeping the folders (NOT README.md, NOT the zip):
server/index.js, server/lib/bucket.js, server/lib/imageTrim.js, server/routes/uploads.js, server/jobs/removeOldSmallPhotos.js (new)
```
git add -A
git commit -m "Small product photos 600px, remove old 480px copies"
git push origin staging
```

## Git steps (merge to main)
```
git checkout main
git pull origin main
git merge staging
git push origin main
```
Wait for the Railway deploy to go green. The 480 copies are removed on that start (on staging when staging deploys, on production when main deploys).
