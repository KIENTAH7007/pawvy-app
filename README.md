# Pawvy App — URGENT: Dashboard Profit Missing Stripe Fee, Testimonial Photo Hints

Target branch: **staging**
Repo: `pawvy-app`

## The real bug you found (item 4)

**Confirmed and fixed.** Your diagnosis was exactly right.

**Root cause:** `server/routes/sales.js` has a correct, canonical profit
formula (`PROFIT_EXPR`, at the top of the file) that subtracts the
Stripe processing fee — added in "Patch 122". But the `/sales/summary`
endpoint, which feeds the Dashboard's top-left KPI card, had **three of
its own separately hand-written copies** of the profit formula (for the
overall total, the by-brand breakdown, and the by-month breakdown) that
were written *before* Patch 122 and never updated when it shipped. So
the ledger listing and the monthly trend chart (which both use the
correct, up-to-date formula) showed the right number, while the
Dashboard's top card — using these three stale duplicates — silently
under-subtracted the Stripe fee.

**Proof, not just a theory:** I reproduced your exact scenario with a
real database — a $69.00 sale with a $30.18 cost and a $5.15 Stripe
fee:
- **Old formula: $38.82** — matches the profit figure shown for that
  exact Lillidale transaction in your screenshot.
- **New formula: $33.67** — matches what the correct calculation should
  be (revenue − cost − Stripe fee).
- **Difference: exactly $5.15** — the precise amount you identified.

## The fix

Rather than patch just the one spot, I removed the duplication
entirely — added a new `PROFIT_RAW_EXPR` constant (same formula as
`PROFIT_EXPR`, without the double-rounding issue that would come from
reusing `PROFIT_EXPR` directly inside a `SUM()`), and pointed all three
`/sales/summary` sub-queries at it. There's now exactly one place in
this file that defines what "profit" means — nothing to drift out of
sync again next time a fee or cost type gets added.

## Testimonial photo sizes (item 1 from the other conversation)

Updated `client/src/pages/Marketing.jsx`'s hint text to reflect the
corrected, smaller sizes — see the separate pawvy-website zip's README
for the full explanation (short version: single photo ~500×667px,
before/after ~350×640px each, matching your two real reference cards
exactly instead of my earlier oversized guess).

## Verification performed

**4 real backend tests** against a real Express server + real database:
inserted an actual sale row with a Stripe fee, confirmed the summary
endpoint's top-level total, by-brand breakdown, and by-month breakdown
all now correctly subtract it; then cross-checked against the separate
`/reports/trend` endpoint (the one behind your monthly chart) for the
same data and confirmed **the two numbers now agree** — directly
resolving the exact discrepancy you flagged. Also independently
verified the old formula's error reproduces your $38.82 figure exactly,
and that the gap is precisely $5.15.

## How to apply

Per your note — this can go to **staging first** like everything else;
you'll merge to `main` together with the rest once 1-3 are confirmed
okay.

```bash
git checkout staging
git pull origin staging

# copy/overwrite:
#   server/routes/sales.js
#   client/src/pages/Marketing.jsx

git add .
git commit -m "Fix dashboard profit KPI missing Stripe fee deduction (3 stale duplicate formulas in /sales/summary, never updated after Patch 122); reduce testimonial photo size hints"
git push origin staging
```

## Worth checking on S-App once live

Look at the Dashboard's top-left profit card and the monthly chart
tooltip for the same month — they should now show the **same number**.
