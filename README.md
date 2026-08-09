# Feature: "New" badge (per-SKU) + reusable homepage banner system

Two features, delivered together since they were discussed and approved
together. 14 files, 18 real backend tests plus a full cold-clone
verification — details below.

## Part 1 — "New" badge

### What it is
The "Discount" button in Products & Pricing is now **"Badge"** — one
modal, two independent sections (Discount, New Badge), matching your
own design: a plain on/off switch plus an expiry date for New, no
scheduled start (unlike Discount, which can still be scheduled ahead).
The button's live state shows whichever is active — "NEW", "20% off",
both together, or just "Badge" when neither is set.

### Where it shows
Automatically, everywhere product data already flows: **POS**, **Order
Portal**, and the **website** (shop grid, and every brand page's product
cards). No per-surface wiring needed beyond what's in this delivery —
once a SKU is flagged, it shows up wherever that SKU already appears.

### What changed
- **`server/database.js`** — two new columns on `products`: `is_new`,
  `new_until`. Added via the safe `ALTER TABLE` pattern already used
  throughout this file.
- **`server/lib/pricing.js`** — the shared `withEffectivePrice` helper
  (already computing `is_discount_active` for every product response)
  now also computes `is_new_active`, same date-window logic.
- **`server/routes/products.js`** — the `/:id/discount` endpoint now
  handles both Discount and New Badge fields together. They're
  genuinely independent: clearing one never touches the other — verified
  directly, not assumed.
- **`server/routes/shop.js`, `server/routes/pos.js`,
  `server/routes/portal.js`** — each surface's product query now selects
  and returns `is_new_active`.
- **`client/src/pages/Products.jsx`** — the combined "Badge" modal.
- **`pos/src/ProductCard.jsx`, `portal/src/ProductCard.jsx`** — visual
  "New" badge on the product tile (Portal's sits top-right, since that
  card already has a "Top Seller" badge top-left).

### A design note worth knowing
Per-SKU badges are fully automatic (see above). Per-**brand** badges
aren't — your brand pages are hand-written content, not
database-driven, so there's no way for a database flag to make a whole
brand page announce itself as new. That's intentional, per our
discussion: the reusable banner (Part 2) is what covers a brand-level
launch instead.

## Part 2 — Homepage banner

### What it is
A reusable full-width takeover banner for announcing a new brand —
entirely admin-driven from Pawvy App's Marketing page, so a real launch
is just filling in a form, not a code deploy.

### The admin form (Marketing page → "Homepage Banner")
- **Image upload** — recommended size shown directly in the form:
  1920×1080px minimum, landscape, keep the important part centered
  since it stretches full-width behind text.
- **Headline** — a single line of text.
- **Link** — where clicking the banner goes. Leave blank and it falls
  back to the brand gallery, so a click never dead-ends.
- **Start/end dates** — either can be left blank for open-ended.
- **On/off toggle**.

Kept as a small history list (like Instagram Highlights) rather than a
single settings row, so past launches stay on record rather than
disappearing the moment you turn one off.

### What changed
- **`server/database.js`** — new `homepage_banners` table.
- **`server/routes/homepageBanners.js`** (new file) — staff CRUD,
  mirrors `instagramPosts.js`'s exact shape.
- **`server/routes/publicContent.js`** — new `GET /banner` endpoint,
  checks `is_active` **and** the date window, falls back to the brand
  gallery if no link was set.
- **`server/index.js`** — registers the new route.
- **`client/src/api.js`, `client/src/pages/Marketing.jsx`** — the admin
  UI.

## Verified
- **18 real backend tests** against actual running routes with a
  seeded database — not syntax checks. Covers: saving Discount and New
  Badge together, clearing one without touching the other, expired vs.
  open-ended `new_until`, every one of POS/Portal/website correctly
  reflecting `is_new_active`, a regression check that an untouched
  product shows neither badge, and the full banner lifecycle (create,
  active-within-window, expired, toggled off, re-activated,
  open-ended, deleted).
- **A dedicated cross-repo integration test** confirming the exact JSON
  shape `GET /api/public-content/banner` returns matches precisely
  what the website's `HomepageBanner.jsx` component expects
  (`active`/`image`/`headline`/`link`) — not just "it returns
  something," the actual field names line up.
- Full build (server + client + portal + POS) passes clean, both
  locally and from a genuine fresh `git clone` — re-ran the core tests
  against that cold clone too, not just the build.
- **Schema edits double-checked this time**: given two earlier
  mistakes in prior deliveries, I verified every `ALTER TABLE`/`CREATE
  TABLE` addition with a real database init test immediately after
  each edit, before moving on to the next file — not just at the end.

## Not yet verified
No live UI access from this sandbox — worth a real look at the
combined "Badge" modal and the banner admin form once deployed, and
confirming the recommended banner image size actually reads clearly
in the upload UI.

## To apply
1. `git checkout main`
2. `git pull origin main`
3. Unzip this delivery on top of your local `pawvy-app` folder
4. `git add -A`
5. `git commit -m "New Badge (per-SKU) + reusable homepage banner system"`
6. `git push origin main`

## Companion delivery
This pairs with a `pawvy-website` delivery (New Badge visuals on the
shop grid and brand-page cards, plus the `HomepageBanner` component).
Apply both — this backend alone won't show anything new on the
website until that companion delivery is applied too.
