# Pawvy App - Backup Button

**What it adds**
- **Settings** (bottom of the side menu) now opens a page with a **Download backup** button. One click saves a full copy of the database, named like `pawvy-backup-2026-11-05.db`.
- The page shows when a backup was last downloaded. It's stored on the server, so you, Janice and staff all see the same date.
- If no backup has been downloaded for **7 days** (or ever), the word **Settings** turns amber with a dot, as a reminder. It goes back to normal right after you download one.
- Staff-only: it needs a valid PIN login. It only reads the database; it never changes your data.
- The file contains customer details, so keep it somewhere private (not a shared folder, not in chat/email).

**Files (5):** `server/index.js`, `server/routes/backup.js` (new), `client/src/api.js`, `client/src/App.jsx`, `client/src/pages/Settings.jsx` (new).
App only. No Website zip needed.

Note: right after you deploy, "Settings" will be amber because nothing has been downloaded yet. Download one and it clears.

## 1) Staging
```
cd pawvy-app
git checkout staging
git pull origin staging
```
Copy the `server` and `client` folders from this zip into your repo (merge/overwrite). Do not copy this README or the zip.
```
git add -A
git commit -m "Settings: download backup button + 7-day reminder"
git push origin staging
```
Check on staging: Settings is amber, open it, click Download backup, a .db file saves, Settings goes back to normal.

## 2) Merge to main (production)
```
git checkout main
git pull origin main
git merge staging
git push origin main
```
Then on production do one real download and save the file somewhere private. That's your first backup.
