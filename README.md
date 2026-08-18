# Pawvy App — Shop-by-Need Testimonials

Target branch: **staging**
Repo: `pawvy-app`

Second piece of the Phase 0 foundation, after the need tags/Best For/
Pawvy's Picks delivery — this one adds testimonials.

## What's in this patch

### New table (`server/database.js`)

`testimonials` — quote, customer handle, one need tag (required — a
testimonial shows on exactly one need's page, not scattered across
several), an optional linked product, and two optional photo fields:

- `image_url` — the primary/only photo.
- `image_url_after` — optional second photo. If set, the website will
  show a labelled before/after split; if not, it's just a single photo
  with no label. Same optional-second-image convention the homepage
  banner already uses for `image_url_mobile`, not a new pattern.

### New endpoint (`server/routes/testimonials.js`)

Full CRUD at `/api/testimonials` — mirrors `homepageBanners.js`'s image
upload conventions closely (base64 `image_data` in, real bucket URL out,
old images cleaned up from the bucket on replace/delete so nothing gets
orphaned). A few things worth knowing:

- Rejects any `need_tag` not in the canonical list, same validation
  approach as the products merchandising endpoint.
- If you link a `product_id` that doesn't exist, it's rejected with a
  clear error rather than silently saving a broken reference.
- Removing just the "after" photo (going back to a single-photo card)
  is a separate explicit action (`remove_image_after: true`) from simply
  not including `image_data_after` in a request — the latter just leaves
  whatever's already there untouched, so a routine "edit the quote"
  save never accidentally wipes a photo.

### Fixed a real drift risk while I was in here

While building this, I found the admin UI's need-tag list and the
backend's had briefly drifted out of sync with each other (an old
version of one still had "Treats"/"Chewing" after the other had already
been corrected). Rather than just fix it again and risk the same thing
happening a third time, I pulled both into single shared files:

- **Backend:** `server/lib/needTags.js` — both `products.js` and the new
  `testimonials.js` import `NEED_TAGS` from here now, instead of each
  keeping its own copy.
- **Frontend:** `client/src/constants.js` — both `Products.jsx` and the
  new Testimonials section in `Marketing.jsx` import `NEED_TAG_OPTIONS`
  from here.

Functionally nothing changes for you — the tag list and order are
exactly what you confirmed (Skin & Coat → Chew → Enrichment → Gut →
Food → Dental → Grooming → Joints). This just means the two can't go
out of sync with each other again, since there's only one real copy of
the list on each side now.

### Admin UI (`client/src/pages/Marketing.jsx`)

New **"Shop-by-Need Testimonials"** section, added to the existing
Marketing page — right alongside Homepage Banner Carousel, Instagram,
Campaigns, and the Ticker, rather than a new top-level sidebar item (per
your earlier note about the sidebar getting long).

- **"+ Add Testimonial"** opens a form: pick the Need (dropdown), write
  the quote, optional customer name/handle, upload Photo 1, optionally
  upload Photo 2 ("After" — leave blank for a single photo), optionally
  link a product from a dropdown of all your products, and a
  show/hide toggle.
- The table shows both photos as thumbnails if both are set, the need
  tag as a badge, a truncated quote preview, which product (if any) is
  linked, and Show/Hide + Edit + Delete actions — same conventions as
  every other section on this page.
- Removing just the "after" photo has its own button in the edit form,
  separate from replacing Photo 1.

## What this does NOT include yet

- The actual customer-facing rendering of testimonials on the website's
  need pages — that's Phase 1, comes with the rest of the Shop-by-Need
  build.
- The product waitlist (OOS "Notify me" capture + admin visibility) —
  still the next piece after this one.

## Verification performed

- **10 real backend tests** against a real Express server + real seeded
  database, with only the actual network-touching bucket calls mocked
  (`uploadBuffer`/`deleteObject` — `decodeDataUrl`/`buildImageKey` are
  pure functions with no network dependency, so those ran for real):
  create with a real image upload + linked product succeeds; invalid
  need_tag rejected (400); missing quote rejected (400); invalid
  product_id rejected (400); the created testimonial appears correctly
  in the list with the product join and a real `image_url`; adding a
  second (after) photo via PATCH works; explicitly removing just the
  after-photo clears only that field and leaves the main photo alone;
  a partial update (quote only) doesn't wipe the need_tag or product
  link; delete removes it from the bucket and the list; an unknown ID
  returns 404 rather than crashing.
- **Regression check** after the `needTags.js` refactor: re-ran the
  products merchandising endpoint's tests to confirm pulling `NEED_TAGS`
  out into a shared file didn't change its behavior — still saves valid
  tags correctly, still rejects the old "treats" tag.
- `client` builds clean via `npm run build`, no errors.
- All 9 changed/new files in this zip byte-diffed against what was
  actually tested — identical.

## How to apply

If you haven't already merged `main`'s emergency hotfix into staging
(see the previous delivery's README), do that first.

```bash
git checkout staging
git pull origin staging

# then copy/overwrite these files from this zip into your local
# pawvy-app folder, preserving the same paths:
#   client/src/api.js
#   client/src/pages/Marketing.jsx
#   client/src/pages/Products.jsx
#   client/src/constants.js          <-- NEW FILE
#   server/database.js
#   server/index.js
#   server/routes/products.js
#   server/lib/needTags.js           <-- NEW FILE
#   server/routes/testimonials.js    <-- NEW FILE

git add .
git commit -m "Shop-by-Need testimonials: schema, CRUD endpoint, admin UI; shared need-tag list to prevent future drift"
git push origin staging
```

Once live on S-App, go to **Marketing**, scroll down — the new
"Shop-by-Need Testimonials" section should be right there under
Homepage Banner Carousel.
