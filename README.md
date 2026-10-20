# Pawvy App – MY Phase 1 fixes (5 items)

Apply on top of the Phase 1 patch. Nothing in the database changes (no new migrations).

## Git steps (inside the pawvy-app folder)
```
git checkout staging
git pull origin staging
```
Copy ONLY the code files from this zip into the repo (same folders). Do NOT copy README.md or the zip itself.
```
git add -A
git commit -m "MY phase 1 fixes: MYR cost on sales screens, Event/Direct sale market switch, SG/MY colour badges + cards, MYR invoices, partner market filter"
git push origin staging
```

## What was fixed
1. **Record Sale (MY)** – Unit Cost now shows in MYR (SGD cost × the rate for the sale date, read-only for MY) and the profit preview uses it. The saved cost is still SGD; the ledger already calculated correctly. For MY sales the SGD rebate tiers/delivery rows are no longer shown (the sale's market decides, not the partner's registered market).
2. **Event Sale / Direct Online / Direct Offline** – new Market switch (SG/MY). MY uses MYR RRP, MYR labels and MYR profit; changing market re-prices lines already picked. Payment card shows a Touch 'n Go placeholder for MY instead of PayNow.
3. **SG / MY look** – SG = blue, MY = amber badge. Sales Ledger totals are now two cards (SG card, MY card), and the Mkt column in Sales Ledger, Costs, Partners and Invoices uses the same badge.
4. **Invoices** – Generate Invoice/DO/SOA screens, invoice list and the PDFs show MYR for MY. The PayNow/UOB payment block is for SGD only: MYR invoices show "payable in MYR – contact Pawvy for payment details" until you give me the Malaysia payment details. One invoice can't mix SG and MY sales (it asks you to invoice each market separately).
5. **Partners** – Market filter (All / SG / MY, with counts).
