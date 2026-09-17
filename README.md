# Pawvy App — Company Address Update

Target branch: **staging**
Repo: `pawvy-app`

## What changed

Found and updated the old address ("91, Defu Lane 10, Singapore 539221")
to the new one ("39 Woodlands Close, Mega@Woodlands, #05-58, Unit 1H,
Singapore 737856").

**Where it lived**: a single shared constant, `PAWVY.address`, in
`client/src/utils/pawvyPdf.js`. This one constant feeds every generated
PDF document across the app — invoices, delivery orders, SOAs,
consignment placements and returns, and restock orders — via the
shared `pawvyAddressBlockHtml()` function used on the Inventory,
Consignment, and Invoices pages. One change covers all of them.

**Pawvy Website**: checked exhaustively — the address does not appear
anywhere in the website's source code. Nothing to change there.

## Verification performed

- Confirmed there is only the one occurrence in the entire `pawvy-app`
  codebase (both before and after the edit, to make sure nothing was
  missed and nothing was left over).
- Syntax-checked the modified file.
- Confirmed the shared constant is genuinely used by all the document
  types that display a company address, not duplicated elsewhere.
- Exhaustively searched the website repo for the old address in every
  file type — genuinely absent from the source.

## Timing

Since this is a single static text value with no logic attached, you
can apply and deploy this whenever suits you — it isn't tied to
October 1st the way the warehouse rename is. If you'd like it to show
the new address starting exactly October 1st (to match your physical
move), simply merge and deploy this together with the warehouse rename
on that date; the new address will show from the moment the deploy
goes live, same mechanism as before.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite:
#   client/src/utils/pawvyPdf.js

git add .
git commit -m "Update company address to 39 Woodlands Close, Mega@Woodlands"
git push origin staging
```

Suggest generating one test document (e.g. a draft invoice PDF) on
Staging afterward just to eyeball the new address renders correctly.
