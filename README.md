# Pawvy App — Problem-Based Bundles (Stage 1)

Target branch: **staging**
Repo: `pawvy-app`

**Apply this one first** — the website delivery calls these new endpoints.

Note: staging was one commit behind `main` (the availability-first sort
fix you applied directly). This was merged in locally first before
building on top of it — a clean fast-forward, no conflicts, but worth
doing the same on your end before applying this if you haven't already:
`git checkout staging && git pull origin staging && git merge main && git push origin staging`

## What's in this patch

### New tables (`server/database.js`)

- **`bundles`** — name, description, an optional single need tag
  (same convention as testimonials), active toggle. **Deliberately no
  price field at all** — Stage 1 bundles don't have their own price;
  see below.
- **`bundle_products`** — which real products make up a bundle, and how
  many of each. A bundle can span any number of products across any
  number of brands.

### Admin CRUD (`server/routes/bundles.js`, new file)

Staff-only, PIN-gated like everything else. Validates: a bundle needs
at least 2 products, every product ID must be real, need tag (if set)
must be one of the canonical 8.

### Public read endpoints, added to `server/routes/shop.js`

- `GET /api/shop/bundles?need=dental` — active bundles for one need
- `GET /api/shop/bundles/:id` — single bundle detail

**This is the core of Stage 1, worth understanding clearly:** every
price shown is the **live sum of each real component's current
effective price**, computed fresh on every request — never a stored or
cached bundle price. If a component's price changes anywhere else in
the system (a discount starts, a price update, anything), the bundle's
total reflects it automatically, with nothing to keep in sync by hand.
A bundle is only marked `in_stock: true` if **every** component has
enough stock for the quantity the bundle needs — same stock threshold
already used everywhere else in the app, just checked once per
component and combined.

Because of this, **checkout.js needs zero changes** — it already
independently re-validates every cart line's price and stock straight
from the products table, ignoring anything the client sends. A bundle
is just a shortcut that adds several real products to the cart; nothing
about checkout needs to know bundles exist.

### Admin UI — new "Problem-Based Bundles" section in Marketing.jsx

Same placement reasoning as Testimonials — lives under Marketing rather
than a new top-level sidebar item. "+ Add Bundle" opens a form: name,
description, an optional Need dropdown, and a dynamic product picker —
add/remove rows, each with a product dropdown and a quantity, minimum 2
products required to save.

## Verification performed

**11 real backend tests** against a real Express server + real seeded
database: created a valid bundle; confirmed a single-product bundle is
rejected; confirmed an invalid need tag is rejected; confirmed the
admin list correctly includes a bundle's full product breakdown;
**confirmed the public endpoint's computed total exactly matches the
real sum of component prices** (the core correctness check for the
whole "no stored price" design); confirmed need-filtering works and an
unrelated need returns an empty list, not an error; **confirmed a
bundle with one out-of-stock component is correctly marked
`in_stock: false`** even though its other component has stock (the
core correctness check for the stock-aggregation design); confirmed
updating a bundle's product list fully replaces the old one; confirmed
deleting a bundle removes it from both the admin list and the public
endpoint (404 afterward); confirmed an unknown bundle ID returns 404,
not a crash.

`client` builds clean via `npm run build`. All 6 changed/new files
byte-diffed against what was actually tested — identical.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite these files, preserving the same paths:
#   client/src/api.js
#   client/src/pages/Marketing.jsx
#   server/database.js
#   server/index.js
#   server/routes/shop.js
#   server/routes/bundles.js   <-- NEW FILE

git add .
git commit -m "Problem-based bundles (Stage 1): schema, admin CRUD, public read endpoints with live-computed pricing and stock"
git push origin staging
```

Once live on S-App, go to **Marketing**, scroll down to "Problem-Based
Bundles," and try creating one — pick 2+ real products, set a Need if
you want it to show on that Shop-by-Need page.
