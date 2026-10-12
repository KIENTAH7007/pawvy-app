# Pawvy App - Best Sellers Report: bigger products and titles

Only ONE file changes: `server/lib/bestSellersReport.js`. No npm install, no database changes.

## What changed

- **Products are much bigger.** Each photo's empty white border is now trimmed away automatically
  before it goes into the PDF, and the grey frame behind photos is gone, so products sit straight on
  the white card and fill it. The trim only removes the plain background around the item - it never
  cuts into the product (this is why I did not use a "crop to fill", which could chop products).
- **Wider podium cards.** #1 is wider than #2/#3, and the cards are packed closer, so photos get more width.
- **Rank badges moved** onto the top edge of each podium card, so they no longer sit on top of the product.
- **Bigger titles.** Podium titles 17 pt (was 15.5), variation 14.5; ranked-list titles 16 pt (was 14.5);
  Top 5 rows 23 pt (was 18) with 134 px photos (was 96).
- **Less empty space.** Top 5 pages now use a taller podium and bigger rows; Top 10 pages use bigger cards.
- Fixed: with "Show units" on, long variation names could push "units" onto an awkward line - units now sit on their own line.

## How to apply

```bash
git checkout main
git pull origin main
```

Copy `server/lib/bestSellersReport.js` from this zip over the existing file, then:

```bash
git add server/lib/bestSellersReport.js
git commit -m "Best Sellers Report: trim photo borders, bigger podium photos and titles"
git push origin main
```
