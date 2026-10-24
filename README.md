# Pawvy App - Ambassador and Referral Codes

Part 1 of 2 (deploy this one FIRST, then the website zip).

## What's in it
- **Customers tab > View Details**: new "Special ambassador" checkbox (confirm pop-up), ★ AMBASSADOR badge in the list.
  - Ambassadors get **no cap on BUTTONS redemption** (normal customers stay at 30%).
  - Ambassadors get a **custom referral code** editor. Rules are enforced by the server: 4-12 characters, letters/numbers only, saved in capitals, unique across ALL codes (including old ones), reserved/offensive words refused. The old code keeps working as an alias.
  - Ambassadors get a **Referrals report**: signed up, made 1st purchase, referral BUTTONS earned, and a per-person list (code used, status).
- **Free-delivery rule, everyone**: items -> BUTTONS redemption -> free delivery checked on what is LEFT (>= S$60) -> payment. Shipping never earns BUTTONS. (Server: `server/routes/checkout.js`.)
- New signups can carry a referral code (old or new). The exact code used is recorded. Guest checkout that creates an account also honours a remembered code.
- Public `GET /api/customers/referral-code/:code` powers the website's "Code accepted" tick (returns only valid true/false, rate-limited).
- Tiny fix: BUTTONS-to-dollar rounding no longer loses 1B on float edge cases (e.g. S$17.40 -> 870B, not 869B).

## Database
Safe, additive only (runs automatically on start): new columns `customers.is_ambassador`, `customers.referral_code_used`, new table `referral_code_aliases`. No existing rows are changed.

## Files (copy these code files only, NOT this README or the zip)
- client/src/api.js
- client/src/pages/Customers.jsx
- server/database.js
- server/lib/buttons.js
- server/lib/customers.js
- server/routes/checkout.js
- server/routes/customerAdmin.js
- server/routes/customers.js

## Git steps
```
git checkout staging
git pull origin staging
# copy the 8 files above into the repo, same paths
git add -A
git commit -m "Ambassadors: no-cap BUTTONS, custom referral codes, referrals report; free delivery checked after BUTTONS"
git push origin staging
```
Then merge staging to main when tested:
```
git checkout main
git pull origin main
git merge staging
git push origin main
git checkout staging
```

## Quick test on staging
1. Customers > View Details on a test customer > tick "Special ambassador" > set code e.g. MYTEST1 > Save.
2. Try PAWVY / AB / a code already used: each should be refused with a message.
3. Website (after zip 2): sign up a new test account with that code, make a first purchase: both accounts get 150B (pending 7 days). The ambassador's Referrals report shows the person.
4. Cart as the ambassador: redeem BUTTONS above 30%; fully redeeming an S$60 order leaves S$3 (shipping) to pay.
