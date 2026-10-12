# Pawvy App - Best Sellers Report: amendments

## What changed

1. **Bigger product photos.** Podium photos are now roughly 2x larger (largest for #1). Ranks 4+ use
   much larger thumbnails: a two-column grid of cards for Top 10 and above, and big full-width rows
   when only 4th and 5th remain (Top 5). Top 5 pages also get an extra-tall podium, since they have the room.
2. **No percentages anywhere.** Items are still ranked by units sold, but the report no longer prints
   any %. With "Show units sold" ticked it prints e.g. "40 units sold"; unticked, no numbers at all.
3. **Bigger titles.** Podium titles went from 12.5 to 15.5 pt, variation names to 13.5; titles in the
   ranked list are larger too.
4. **Different Top N per brand.** In the pop-up, each brand now has its own "Top 5/10/15/20" dropdown
   beside its checkbox. Defaults: Top 5 for every brand, Top 10 for GiGwi. The old single "Top" dropdown is gone.
5. **Footer text removed.** The "% = share of ..." line is gone. The footer now only shows
   "pawvy.co" (plus "Prepared for <partner>" if you fill that in).
6. **Ranks 4-N photos** - covered in (1).

## Files (3 changed, no new dependencies)

- `client/src/pages/Sales.jsx`
- `server/routes/sales.js`
- `server/lib/bestSellersReport.js`

## Tested

Real server + real HTTP requests + browser click-through: GiGwi Top 10 beside BetterBone Top 5 in the
same PDF, Top 5 with units shown, Top 15 spilling to a second page, products with and without photos,
exclude-out-of-stock on/off, voided sales ignored. Rendered the pages and checked them visually. All three apps build clean.

## How to apply

```bash
git checkout main
git pull origin main
```

Copy the 3 files from this zip into your repo at the same paths (overwrite), then:

```bash
git add client/src/pages/Sales.jsx server/routes/sales.js server/lib/bestSellersReport.js
git commit -m "Best Sellers Report: bigger photos/titles, no percentages, per-brand Top N, footer cleanup"
git push origin main
```

No `npm install` needed this time.
