# Pawvy App — Shop-by-Need Foundation (Need Tags, Best For, Pawvy's Picks)

Target branch: **staging**
Repo: `pawvy-app`

## Before this patch — sync staging with the emergency hotfix

Staging was one commit behind `main` (the bucket socket-pool fix that
went straight to main during the production incident). This patch was
built on top of a local merge of that commit into staging first — it
was a clean fast-forward, no conflicts. **Do this first, before applying
anything else below:**

```bash
git checkout staging
git pull origin staging
git merge main
git push origin staging
```

## What's in this patch

This is the first slice of the Phase 0 foundation work discussed for
Shop-by-Need — specifically the piece that unblocks you starting to key
in data right away, ahead of the actual customer-facing pages (which
come later, in Phase 1).

### New product fields (`server/database.js`)

Three new columns on `products`, added via the same safe
`ALTER TABLE ... ADD COLUMN` + try/catch pattern already used throughout
this file — idempotent, safe to run against your existing production
data with zero risk of breaking anything already there:

- **`need_tags`** — which Shop-by-Need categories this product belongs
  to (Dental, Skin & Coat, Joints, Gut, Chewing, Enrichment, Treats). A
  product can belong to more than one, so this is stored as a JSON array
  string (e.g. `'["dental","chewing"]'`) — first use of this pattern in
  this schema. Defaults to `'[]'`, never NULL.
- **`best_for`** — the short "Best for: X" line shown under a product's
  name on the website. Plain nullable text.
- **`is_pawvy_pick`** — whether this product shows in the homepage's
  admin-curated "Pawvy's Picks" section (this replaces the earlier
  sales-ranked "Bestsellers" idea from our discussion — you wanted
  editorial control, not an algorithm choosing).

### New endpoint (`server/routes/products.js`)

**`PATCH /api/products/:id/merchandising`** — sets all three fields
above in one call. Deliberately kept as its own endpoint, separate from
the main product PUT, for the same reason the existing `/:id/discount`
endpoint is separate: these are website-facing merchandising fields with
nothing to do with pricing or inventory, so a bug in one can't touch the
other.

- Rejects any need tag not in the canonical list with a clear 400 error
  (canonical list: `dental, skin-coat, joints, gut, chewing, enrichment,
  treats` — these slugs are what the website's `/shop?need=` route will
  use later).
- Any field you don't include in a request keeps its current value
  rather than getting silently wiped — same convention as the discount
  endpoint's partial-update handling.
- Every endpoint that returns a product (list, single, create, update,
  discount PATCH, and this new one) now consistently hands back
  `need_tags` as a real JSON array, not a raw string — added a small
  shared helper so this is automatic everywhere rather than something
  each route has to remember.

### Admin UI (`client/src/pages/Products.jsx`, `client/src/api.js`)

New **"Shop"** button next to the existing **"Badge"** button on each
product row in Products & Pricing. Same "the button itself shows current
state" pattern Badge already uses — shows a PICK badge and/or a "N
needs" count once you've set anything, otherwise just says "Shop".

Clicking it opens a **"Shop Settings"** modal:
- A row of toggle chips for the 7 need categories — click to select any
  that apply, click again to deselect.
- A "Best for" text field.
- A "Feature in Pawvy's Picks" checkbox.
- One Save button, sends all three fields together (same reasoning as
  the Badge modal's Save — no partial-update ambiguity to get wrong).

Styled to match the existing Badge modal's conventions exactly (same
section-header style, same spacing, same button treatment) — nothing
new to learn if you've used the Badge modal before.

## What this does NOT include yet

- The actual customer-facing `/shop?need=` pages, homepage need cards,
  and Pawvy's Picks section on the website — that's Phase 1, comes next.
  This patch only gets the data model and admin entry working so you can
  start tagging products now, ahead of that.
- Testimonials (data model + admin UI) and the product waitlist
  (OOS "Notify me" capture) — separate pieces of Phase 0, coming in a
  follow-up patch.
- The nav bar swap (Blog → Shop by Need) — deliberately held back until
  the actual Shop-by-Need route exists in Phase 1; no point linking to a
  page that isn't built yet.

## Verification performed

- **8 real backend tests** against a real Express server mounted with
  the actual `products.js` router, running against a real seeded sql.js
  database (`cp data/seed.db data/pawvy.db`, real HTTP requests, no
  mocking) — covering: list/single responses always return `need_tags`
  as a real array; untagged products default to `[]` correctly; the
  merchandising PATCH saves all three fields; the save actually persists
  across a separate follow-up GET; an invalid need tag is rejected with
  400; a partial update (only `best_for`) doesn't wipe previously-set
  `need_tags`; an unknown product ID returns 404 without crashing; and
  the pre-existing `/discount` endpoint still works correctly alongside
  the new changes (regression check).
- A further end-to-end check after all files were finalized, confirming
  the brand join (`brand_name`) and the pricing helper
  (`effective_price_rrp_sg`) both still work correctly on a product
  that's also been given need tags — nothing about the existing response
  shape broke.
- `client` builds clean via `npm run build` (Vite), no errors.
- Both backend files load with no syntax errors via direct `require()`.
- All 4 changed files in this zip byte-diffed against what was actually
  tested — identical.

## How to apply

```bash
# First, if you haven't already (see top of this README):
#   git merge main   (syncs the emergency hotfix into staging)

git checkout staging
git pull origin staging

# then copy/overwrite these files from this zip into your local
# pawvy-app folder, preserving the same paths:
#   server/database.js
#   server/routes/products.js
#   client/src/api.js
#   client/src/pages/Products.jsx

git add .
git commit -m "Shop-by-Need foundation: need tags, Best For, Pawvy's Picks (schema + admin UI)"
git push origin staging
```

Railway will auto-deploy from staging. Once it's live on S-App, go to
**Products & Pricing**, click **Shop** on any product row, and you
should be able to start tagging products right away.
