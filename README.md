# Feature: Instagram Highlights redesign — image upload instead of live embed

## What changed (4 files)

### 1. `server/database.js`
Added two columns to `instagram_posts` via the same safe
`ALTER TABLE ... ADD COLUMN` pattern already used throughout this file
(e.g. `products.image_data`) — non-destructive, safe to run against
your live production database on every deploy:
- `image_data TEXT` — the uploaded photo, base64, same storage pattern
  as product images
- `link_url TEXT` — optional destination link for that photo

The old `url` column is left in place rather than dropped (SQLite
`ALTER TABLE DROP COLUMN` isn't reliable under sql.js) — it's just
unused going forward. Existing rows (if any) simply won't show up on
the homepage until you re-add them with a real photo, since the
public endpoint now requires `image_data` to be present.

### 2. `server/routes/instagramPosts.js` (staff-only admin API)
- `POST` now requires `image_data` (base64) instead of `url`;
  `link_url` is optional
- `PATCH` supports updating `image_data`/`link_url` alongside the
  existing `sort_order`/`is_active`
- Removed the old Instagram-URL-format validation (`^https://
  (www\.)?instagram\.com/`) since there's no URL requirement anymore

### 3. `server/routes/publicContent.js` (public, read-only API)
`GET /api/public-content/instagram` now returns:
```json
{ "items": [{ "image": "data:image/...", "link": "https://..." }] }
```
instead of `{ "urls": [...] }`. Each item's `link` always has a real
value — if you didn't set a `link_url` for that specific photo, it
falls back to `https://instagram.com/pawvy_sg` (your profile), so a
click never dead-ends on a missing link. Only active rows with a real
uploaded image are included.

### 4. `client/src/pages/Marketing.jsx` (Pawvy App admin UI)
The "Instagram Highlights" section (same page as Campaigns and Ticker
Messages) now has a photo upload control instead of a URL text field
— same upload pattern as the Product Image field on the Products
page (file picker → preview → under-2MB check). The "Link" field is
now optional and just a plain text input, since it's not being
embedded or validated as an Instagram URL anymore — you could point
it anywhere relevant if you wanted, though Instagram post/profile
links are the obvious use. The table now shows a small photo
thumbnail per row instead of a raw URL string.

## Why this approach instead of the old embed
The previous version rendered Instagram's own official embed script
(`instagram.com/embed.js`) — that shows the *entire* post card
(caption, like count, Instagram's own UI chrome), not a clean photo,
which is why it never matched the site's design. This version sidesteps
that completely: you upload the actual image, so it looks exactly like
what you uploaded, with zero dependency on Instagram's embed script
loading or staying available.

## Verified
- Real smoke test against the actual route handlers (not just
  `node --check`) — real Express app, seeded database, live HTTP
  requests: confirmed the new columns exist, confirmed creating a
  photo with and without a link works, confirmed creating without an
  image correctly fails with 400, confirmed the public endpoint
  returns the right shape with the profile-link fallback working,
  confirmed PATCH updates persist to the database, confirmed
  deactivating a photo removes it from the public endpoint.
- Re-ran the same smoke test against a genuine fresh `git clone` with
  this delivery applied on top (full cold-start simulation).
- **Built the actual React admin client** (`client/ && npm run
  build`) — not just a syntax check — to catch any JSX errors in the
  rewritten `Marketing.jsx`. Passes clean.

## To apply
1. `git checkout main`
2. `git pull origin main`
3. Unzip this delivery on top of your local `pawvy-app` folder
4. `git add -A`
5. `git commit -m "Instagram Highlights: image upload + optional link, replacing the live embed"`
6. `git push origin main`

Railway auto-deploys both the server and the client build from `main`
on push (the `build` script in `package.json` builds `client/`,
`portal/`, and `pos/` together).

## Companion delivery
This pairs with a `pawvy-website` delivery (`InstagramGrid.jsx`,
`app/page.js`, `app/globals.css`) that renders the new `items` shape
as a plain 5-across photo grid. Apply both — the website delivery
alone won't have any photos to show until this backend change is
live and you've uploaded at least one photo via the Pawvy App.
