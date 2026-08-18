# Pawvy App — Out-of-Stock Waitlist ("Notify Me")

Target branch: **staging**
Repo: `pawvy-app`

Third piece of the Phase 0 foundation — after need tags/Best For/Pawvy's
Picks, and testimonials.

## What's in this patch

### New table (`server/database.js`)

`product_waitlist` — `product_id`, `email`, `notified_at` (nullable),
`created_at`. `UNIQUE(product_id, email)` so a customer accidentally
submitting twice for the same product is a harmless no-op, not a
duplicate row.

**Scope note:** this captures and surfaces demand data — it does **not**
yet automatically email anyone when a product restocks. That's a real,
separate follow-up (needs a hook into whatever job/flow marks a product
back in stock, plus a Resend template) that I deliberately didn't build
into this patch without confirming you actually want that automation
next — let me know if you do.

### Two separate route files — worth understanding why

This needed both a **public** endpoint (any website visitor can submit
their email, no login) and **staff-only** endpoints (see who's waiting,
per-product counts, mark notified, remove). The PIN gate in
`server/index.js` exempts routes by path *prefix*, all-or-nothing — so
one route file can't have some paths public and others gated. Split the
same way `customers.js` (public) and `customerAdmin.js` (staff) already
are:

- **`server/routes/waitlist.js`** → mounted at `/api/waitlist`, public.
  Just `POST /` — submit an email for a product.
- **`server/routes/waitlistAdmin.js`** → mounted at `/api/admin-waitlist`,
  staff-only (PIN-gated, same as everything else in Products & Pricing).
  `GET /counts`, `GET /:productId`, `PATCH /:id/notify`, `DELETE /:id`.

One subtlety I made sure to get right: `/api/admin-waitlist` does **not**
start with `/api/waitlist`, so the gate's exemption check
(`req.path.startsWith('/waitlist')`) can't accidentally also exempt the
staff routes. Verified this explicitly in testing, not just by
inspection — see below.

### Admin UI (`client/src/pages/Products.jsx`)

A small **🔔 N waiting** badge appears next to Edit/Badge/Shop on any
product row that actually has people waiting — nothing shows for
products with zero, to keep the row clean. Click it to open a list:
each entry shows the email, when they joined, a **Mark notified** button
(for tracking who you've manually reached out to — see the automation
scope note above), and a remove button.

## What this does NOT include yet

- The actual "Notify me" button/form on the website's product pages —
  that's Phase 1 work, alongside the rest of the Shop-by-Need build
  (the OOS state, sort-to-bottom, etc. from the original review).
- Automatic restock emails — flagged above, needs your confirmation
  before I build it.

## Verification performed

**10 real integration tests**, against a real Express server assembled
with the *exact* PIN gate condition copied from `server/index.js` (not
a simplified stand-in) plus real session-based auth (a real HTTP login
against `/api/auth/login` with a test PIN, producing a real Bearer
token, not a mocked one):

- Public submit works with **zero** Authorization header — proves it's
  genuinely reachable by real website visitors.
- Invalid email, missing `product_id`, and unknown `product_id` all
  correctly rejected (400/400/404).
- Submitting the same product+email twice is handled gracefully (still
  201, no duplicate row — confirmed via the count check below).
- **The staff endpoint correctly returns 401 with no Authorization
  header** — this was the one genuine security risk in this delivery
  (public/staff split relying on path-prefix logic), and it's the test
  I'd flag as most worth you knowing actually ran, not just "looks
  right on inspection."
- With a real valid token: counts endpoint returns the right count (2,
  correctly collapsed from 3 submit attempts including the duplicate);
  full list returns both real entries; marking one notified correctly
  drops the counts badge from 2 to 1; delete removes an entry and the
  list reflects it afterward.

Also:
- `client` builds clean via `npm run build`, no errors.
- Confirmed the `git diff` against origin/staging for `products.js`
  contains only the previously-delivered `needTags.js` refactor — no
  new or accidental changes snuck in this round.
- All 11 changed/new files in this zip byte-diffed against what was
  actually tested — identical.

## How to apply

If you haven't already merged `main`'s emergency hotfix into staging
(see the first delivery's README), do that first.

```bash
git checkout staging
git pull origin staging

# then copy/overwrite these files from this zip into your local
# pawvy-app folder, preserving the same paths:
#   client/src/api.js
#   client/src/pages/Marketing.jsx
#   client/src/pages/Products.jsx
#   client/src/constants.js
#   server/database.js
#   server/index.js
#   server/routes/products.js
#   server/lib/needTags.js
#   server/routes/testimonials.js
#   server/routes/waitlist.js         <-- NEW FILE
#   server/routes/waitlistAdmin.js    <-- NEW FILE

git add .
git commit -m "Out-of-stock waitlist: public submit endpoint, staff-only counts/list/notify/remove, badge in Products & Pricing"
git push origin staging
```

Nothing to test on S-App immediately, since nothing currently calls the
public submit endpoint yet — that wiring happens when the website's
Phase 1 "Notify me" button gets built. You can still confirm the admin
side works today via a direct API call if you want to see the badge
appear, or just wait until Phase 1 makes it end-to-end testable for
real.
