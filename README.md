# Fix: POS and Order Portal New badges now match the website

## What was wrong
These two badges were styled separately from the website's — inline
`<span>`/`<div>` styles, not the shared CSS class the website uses — so
when the website's badge got bigger and switched to orange, these two
were never touched and stayed small and blue.

## What changed (2 files)

### `pos/src/ProductCard.jsx`
Font size, padding, and background now match the website's `.new-tag`
exactly (12.5px, 6px×14px padding, Pawvy Orange, cream text, subtle
orange-tinted shadow).

### `portal/src/ProductCard.jsx`
Same sizing, but kept the **text color as navy**, not cream — this
card already has a "Top Seller" badge (orange background, navy text)
sitting right next to where New shows up. Matching that sibling
badge's own convention means two orange pills on the same card read
as one consistent design, rather than looking like two different
components that happened to end up the same color.

## Verified
- Both POS and Order Portal build clean, locally and from a genuine
  fresh cold-clone simulation.
- Confirmed the exact pixel values match the website's `.new-tag` rule
  directly, not just "similar."

## To apply
1. `git checkout main`
2. `git pull origin main`
3. Unzip this delivery on top of your local `pawvy-app` folder
4. `git add -A`
5. `git commit -m "POS/Portal: New badge size and color now match the website"`
6. `git push origin main`
