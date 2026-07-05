# Patch32 — Order Portal skeleton (Phase 6, Step 1)

This sets up the Order Portal as a completely separate frontend build, so it can
never break the internal app — even if there's a bug in the portal's code later,
the internal app's build is physically isolated and unaffected.

## What this adds (all brand new, nothing existing was removed)

- `portal/` — a new, independent Vite + React project (own `package.json`, own
  `vite.config.js`, own `index.html`). Currently just a placeholder "coming soon"
  page styled with your existing brand colors/fonts, to prove the deployment path
  works before any real catalogue/cart features are built on top of it.
- `server/index.js` — one new block added (nothing existing removed or changed)
  that serves the portal's build under `/order`, registered *before* the internal
  app's catch-all route. If `portal/dist` doesn't exist for any reason, it just
  logs a warning and the internal app keeps working exactly as before — this
  can't accidentally break anything.
- `package.json` (root) — `build` script now also builds the portal after the
  client build succeeds. Structured so that if the portal build ever fails, it
  prints a warning but does **not** fail the overall build — the internal app
  will still deploy normally either way.
- `.gitignore` — added `portal/node_modules/` and `portal/dist/`, same pattern as
  `client/`'s existing entries.

## How to apply
Copy this folder structure into your local repo (creates the new `portal/` folder,
replaces `server/index.js`, `package.json`, and `.gitignore`):

- `portal/` (whole new folder)
- `server/index.js`
- `package.json`
- `.gitignore`

Then:
```
git add -A
git commit -m "patch32: add Order Portal skeleton as separate build, served at /order"
git push origin main
```

## After deploying, please verify on Railway
1. Your existing app still loads and works normally at your usual URL — nothing
   should look or behave differently.
2. Visit `https://pawvy-app-production.up.railway.app/order` — you should see a
   dark navy page with "PAWVY ORDER PORTAL" placeholder text.
3. All existing pages (Dashboard, Record Sale, Event Sale, etc.) still work.

## Verified locally before packaging
- Built `client/` and `portal/` independently — both compile clean.
- Ran the exact root `npm run build` Railway will use — both builds run in
  sequence without conflict.
- Started the actual server locally and tested with curl:
  - `/` → internal app's index.html (unchanged)
  - `/order` → portal's index.html
  - `/order/anything` → still portal's index.html (confirms client-side routing
    works for whatever gets built inside the portal later)
  - `/order/assets/*.js` → 200 (asset paths resolve correctly under the subpath)
  - `/api/brands` → 200 (existing API completely unaffected)

## Next steps (not in this patch)
1. `portal_orders` DB table + `/api/portal/*` and `/api/orders/*` backend routes.
2. Real portal frontend — catalogue, search, cart, review, submit.
3. "Pending Orders" tab in the internal app.
