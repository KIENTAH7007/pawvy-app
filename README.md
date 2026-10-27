# Pawvy App – Referral Bonus 200B
Only change: referral bonus 150B -> 200B (server/lib/buttons.js, one line). Signup bonus (150B) and first-purchase bonus unchanged.
New referrals only; already-pending referral bonuses keep their 150B. No database change.

```
cd pawvy-app
git checkout staging
git pull origin staging
```
Copy server/lib/buttons.js from this folder into the repo (same path). Not README.md, not the zip.
```
git add -A
git commit -m "Referral bonus 200B"
git push origin staging
```
Merge to main (after staging check):
```
git checkout main
git pull origin main
git merge staging
git push origin main
```
