# Pawvy App — Sales Ledger fix: stray "0" + red-highlight instead of dot

## What changed
One file: `client/src/pages/Sales.jsx`

Two fixes to the Product column of the Sales Ledger table:

1. **Fixed the stray "0" text.** `mailing_required` comes back from the
   database as the number `0` or `1`, not `true`/`false`. The condition that
   decides whether to show the mail icon button was a raw `||` chain
   (`s.mailing_name || ... || s.mailing_required`) — when every field was
   falsy, the chain's last operand (`0`) was returned and React rendered it
   as literal text. It's now wrapped in `Boolean(...)`, so it always
   evaluates to a real `true`/`false` and never leaks a `0` into the page.

2. **Replaced the red dot with red product-name text.** Per your request,
   the small red dot badge on the mail icon is removed entirely. Instead,
   whenever a line has `mailing_required` set, the product name text itself
   (the "Product" column, e.g. "BetterBone · Grain-Free") is rendered in red
   (`#f87171`, bold) — so the whole row is obviously flagged at a glance,
   no dot required. The mail icon itself also switches to red when flagged,
   for consistency; the icon's tooltip still says "Mailing required — not
   yet sent."

Nothing else changed — same mail-icon click behavior (opens the
Customer & Mailing Details modal), same Edit Sale Details checkbox to
untoggle mailing_required once you've mailed the item, same backend/API.

## How to apply (staging)

```bash
git checkout staging
git pull origin staging
```

Copy `client/src/pages/Sales.jsx` from this zip into your repo at the same
path (overwrite the existing file), then:

```bash
git add client/src/pages/Sales.jsx
git commit -m "Sales Ledger: fix stray 0 text, red-highlight product name instead of dot for mailing-required rows"
git push origin staging
```

## Test checklist
- [ ] Sales Ledger loads with no visible "0" text anywhere in the Product
      column, for any row.
- [ ] A row with `mailing_required` unset shows the product name in normal
      color, with the mail icon only appearing if there's other mailing
      info to view (unchanged from before).
- [ ] A row with `mailing_required` set (e.g. record a POS sale with the
      "Mailing required?" checkbox ticked) shows the product name in red,
      bold — no dot anywhere.
- [ ] Clicking the mail icon still opens the same modal with mailing
      details and the "Mailing required — not yet sent" status line.
- [ ] Using the pencil (Edit Sale Details) icon to untick "Mailing
      required" flips the row back to normal color immediately after save.
