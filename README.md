# Pawvy App – MY Phase 3: Malaysia POS (+ remove East Malaysia line from MY portal)

No database changes. Apply on top of Phases 1–2.

## Git steps (inside the pawvy-app folder)
```
git checkout staging
git pull origin staging
```
Copy ONLY the code files from this zip into the repo (same folders). Do NOT copy README.md or the zip itself.
```
git add -A
git commit -m "MY phase 3: Malaysia POS (/pos/my, MYR RRP, Touch 'n Go slot); MY portal: drop East Malaysia line"
git push origin staging
```

## What changed
- **Order Portal MY:** the "East Malaysia: case by case" line is removed (everything else, incl. East capability inside the app, is untouched).
- **MY POS link:** `<your app address>/pos/my` (the normal `/pos` stays Singapore). MYR RRP prices (only products with a MY RRP set), same shared stock, same discount tools (per item / universal / manual price), same mailing + shipping fields (no shipping rule).
- Sales are written as channel "Event Sale", market MY, in MYR, with that day's exchange rate saved. If no rate exists yet it refuses with a clear message and writes nothing.
- **Payment:** the MY POS shows Touch 'n Go instead of PayNow. Until the QR is added it shows "Touch 'n Go QR is not set up yet — ask the owner before taking payment" so a wrong code is never shown. (Slot = `TNG` in `pos/src/paymentInfo.js`.)
- **No email / PDPA / BUTTONS on MY POS** for now: the email + consent fields are hidden, nothing is sent to customer accounts, and the BUTTONS campaign badge is off. Name/address/phone are still captured when an item needs mailing.
