# Pawvy App – Malaysia (MY) Market, Phase 1

Core of the MY expansion inside the Pawvy App. Phases 2 (MY Order Portal) and 3 (MY POS) come next; the website is untouched.

## BEFORE you deploy
1. Take a database backup (Railway volume copy / download pawvy.db). This phase adds columns and a new table (all additive, nothing is deleted or renamed).
2. Deploy to **staging first**, test, then main.

## Git steps (inside the pawvy-app folder)
```
git checkout staging
git pull origin staging
```
Copy ONLY the code files from this zip into the repo (keep the same folders). Do NOT copy README.md or the zip itself.
```
git add -A
git commit -m "MY market phase 1: MYR sales/costs, daily FX rate, SG/MY/All/Compare reports"
git push origin staging
```
After staging checks out: `git checkout main && git pull origin main && git merge staging && git push origin main`.

## What changed
- **Currency**: MY sales and MY operating costs are recorded in MYR. Product cost stays in SGD; MY profit = MYR revenue − SGD cost × the rate saved on that sale.
- **Exchange rate**: fetched automatically every day (and once at startup), with a manual override (Reports page → "Exchange rate" card). Each MY sale/cost saves the rate for its own date, so past records never change. If the rate service is unreachable the last known rate is used. If no rate exists at all, saving a MY sale gives a clear message.
- **Reports**: SG (default) / MY / All markets (SGD equivalent, labelled) / Compare (SG SGD | MY MYR | MY in SGD | difference, plus units, orders, avg order value, margins, by-brand and top products). Uses the existing From/To dates.
- **Dashboard**: market selector, default SG. **Sales Ledger**: each row in its own currency; totals per currency. **Costs**: SG / MY / All view; MY entered in MYR.
- **Write-offs and shipment cost variance** are SG-side: shown in SG and All markets, never in MY.
- **Partners**: MY partners get "No discount" by default and a West/East Malaysia delivery zone. SGD rebate tiers never apply to MY orders.
- **Record Sale (MY)**: MYR labels; delivery reminder "≥ MYR 600 free delivery, below MYR 600 a MYR 25 fee (West Malaysia)" / East "case by case" (reminder only; shipping figures stay typed in).
- **Invoices** for MY partners carry currency MYR.

## Good to know
- Approving a Pending Order for a MY partner is deliberately blocked until Phase 2 (portal prices there are still SGD). Record MY orders through Record Sale for now.
- "Orders" on Compare is counted as one per date + partner + channel (sales are stored per line item), so treat it as approximate.
- Existing MY test rows (if any) with no rate are filled from the rate table as soon as a rate exists.
- Check SST, import duty and Malaysian PDPA wording with your accountant/lawyer.
