# Pawvy App - PIN Login Protection

**What changes (1 file):** `server/auth.js`
- Wrong-PIN counting now uses the visitor's REAL address (the old way could be fooled with a fake header, so the lockout never triggered).
- New global limit: 10 wrong PINs from anyone within 15 minutes pauses PIN login for everybody for 15 minutes.
- Still 5 wrong PINs from one address = that address locked 15 minutes. PIN stays 4 digits. Nothing else changes.

**If you ever get locked out** (someone else guessing, or too many typos): wait 15 minutes, or in Railway open pawvy-app, then Deployments, then Restart. The counters live in memory, so a restart clears them.

Only App changes. No Website zip needed.

## 1) Staging
```
cd pawvy-app
git checkout staging
git pull origin staging
```
Copy `server/auth.js` from this zip into your repo's `server/` folder (overwrite). Do not copy this README or the zip.
```
git add -A
git commit -m "PIN login: real IP + global limit"
git push origin staging
```
Check on staging: log in with the correct PIN (works), then try a wrong PIN once and the right one again (still works).
Please do NOT test the lockout on production with many wrong PINs, or you will pause login for 15 minutes.

## 2) Merge to main (production)
```
git checkout main
git pull origin main
git merge staging
git push origin main
```
