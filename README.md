# Pawvy App – MY Phase 2: Malaysia Order Portal

Apply on top of Phase 1 + the 5 fixes. One tiny additive database change (a `market` column on portal orders, default SG) – existing orders stay SG.

## Git steps (inside the pawvy-app folder)
```
git checkout staging
git pull origin staging
```
Copy ONLY the code files from this zip into the repo (same folders). Do NOT copy README.md or the zip itself.
```
git add -A
git commit -m "MY phase 2: Malaysia Order Portal (/order/my), MYR prices, MY orders in Pending Orders"
git push origin staging
```

## What's new
- **MY link:** `<your app address>/order/my` (the normal `/order` link stays Singapore, unchanged). Shows MYR wholesale + RRP prices, only products that have a MY wholesale price (Products & Pricing), the same shared live stock, and the MY delivery note (West: above MYR 600 free / below MYR 25; East case by case). No rebate lines.
- **Orders:** flagged MY (badge in Pending Orders and in the Telegram/email alert). Prices default to the MY wholesale price.
- **Approving a MY order:** pick a MY partner (the list only shows MY partners), enter shipping charged/cost by hand as usual (MYR + the West/East reminder). The sale is recorded in MYR with that day's exchange rate. Approving with an SG partner (or an SG order with a MY partner) is blocked with a clear message.
- **Dashboard upsell chart:** follows the market selector (MY = MY-link orders in MYR; SG/All = the SG portal in SGD).
- Top sellers on the MY link are based on MY sales.

## Please check
- MY products show only if "MY wholesale price" is filled in Products & Pricing.
- The MY delivery wording on the portal is customer-facing — edit if you want different words.
- A partner can only be in one market. If an existing partner (e.g. an SG company) orders via the MY link, set its market to MY first.
