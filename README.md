# Website orders auto-highlighted red (mailing required)

Every paid Pawvy.co order now lands in the Sales Ledger flagged "mailing required", so it shows red automatically. Once mailed, click the pencil icon on the row, untick "mailing required" and save — the red goes away (same as POS today).

Only one file changed: `server/routes/checkout.js` (no database change, no client rebuild needed).

## Apply
```
cd pawvy-app
git checkout staging
git pull origin staging
# copy server/routes/checkout.js from this zip over your existing one
git add server/routes/checkout.js
git commit -m "Website orders: flag mailing_required automatically so they show red in Sales Ledger"
git push origin staging
```
To go live (after testing on staging): `git checkout main && git pull origin main && git merge staging --ff-only && git push origin main && git checkout staging`

## Notes
- Applies to NEW orders only. Existing website orders are not changed (many are already mailed, so a blanket backfill would turn them all red). For any past order still unmailed, tick "mailing required" via the pencil icon.
- Multi-item orders: every line is flagged red; clear each line when mailed.
- Test: place a test order on pawvy.co → after payment, the Sales Ledger rows should be red.
