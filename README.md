# Pawvy App — SOA Paid/Unpaid Cascades to Its Invoices

Target branch: **staging**
Repo: `pawvy-app`

## What this does

Marking an SOA Paid now automatically marks every invoice it includes
as Paid too. Marking it back to Unpaid reverts all of them back to
Unpaid — the "undo an accidental click" case you described.

Toggling any single invoice individually — whether or not it belongs
to an SOA — works exactly as it always has. Nothing about that path
changed.

## How it works

Both directions read the invoice's own `included_in_soa_id` link
(already there, already correct) — no new schema, no new columns.

- **Marking Paid**: only cascades to invoices that are currently
  Unpaid. An invoice that was already correctly paid earlier — with
  its own real paid date — is left completely alone, not silently
  overwritten with today's date.
- **Marking Unpaid**: cascades to every included invoice
  unconditionally, since you confirmed the one edge case where this
  could matter (an invoice paid independently before its SOA was ever
  touched) is rare enough — one occurrence ever — not to need extra
  tracking machinery for it.

## Verification performed — a real SOA, real linked invoices

Seeded a real SOA linking 3 real invoices, ran the actual backend, and
tested every scenario through the real API, not just reasoning about
the code:

1. Marked the SOA Paid → confirmed all 3 invoices flipped to Paid with
   today's real date.
2. Marked the SOA back to Unpaid → confirmed all 3 reverted to Unpaid,
   date cleared — the "undo" case.
3. **The exact scenario you described**: manually marked one invoice
   Paid on its own, *then* marked the SOA Paid — confirmed that
   invoice's status was left untouched by the cascade (not
   double-processed or reset), while the genuinely-unpaid ones in the
   same SOA correctly flipped to Paid.
4. Toggled one invoice individually (not through the SOA) — confirmed
   it only changed that one invoice, with zero effect on the SOA
   itself or its other invoices, and confirmed there's no reverse
   cascade (invoice → SOA).
5. Confirmed the syntax loads cleanly with no errors.

## Scope of this change

One file, ~15 lines added to two existing route handlers. No schema
changes, no frontend changes — the button you already click calls the
same endpoint; the page just shows the updated statuses on its next
reload, same as it already does today.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite:
#   server/routes/invoices.js

git add .
git commit -m "Marking an SOA Paid/Unpaid now cascades to its included invoices, using the existing included_in_soa_id link — individual invoice toggling is unaffected"
git push origin staging
```

## Worth a real check once live

Generate an SOA, mark it Paid, confirm all its invoices flip too.
Mark it back Unpaid, confirm they all revert. Then toggle one invoice
on its own and confirm the SOA itself doesn't change.
