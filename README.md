# Feature: POS top bar shows active campaign multiplier

## What changed (3 files)

### `server/routes/pos.js`
New endpoint: `GET /api/pos/active-campaign`. Reuses the exact same
`getActiveMultiplierDetail(db, { channel: 'pos' })` logic already used
for the real BUTTONS earning calculation (see the earlier POS
BUTTONS delivery) — this is purely a read-only display of that same
lookup, not a separate check, so the badge can never show a different
multiplier than what customers actually earn. Returns:
```json
{ "active": true, "multiplier": 3, "name": "Expo Weekend" }
```
No `customerId` is passed, so this deliberately never reflects a
birthday-month bonus — that's per-customer and doesn't make sense on a
general storefront badge — only a real, currently-active campaign.

### `pos/src/api.js`
Added `posApi.getActiveCampaign()`, same one-line pattern as the
existing `getCatalogue()`/`checkout()` calls.

### `pos/src/App.jsx`
- Fetches the active campaign once when the terminal loads, alongside
  the existing catalogue fetch. Not polled continuously — a campaign
  starting or ending mid-shift while the terminal's already open is
  rare enough that a page refresh (which staff already do between
  shifts) is a reasonable way to pick it up, rather than adding a
  polling interval to a screen that's typically open all day.
- If that request fails for any reason, the badge just doesn't show —
  no error message, since this is a "nice to display" banner, not
  something that should alarm staff or block checkout if it happens
  to fail to load.
- The `TopBar` component now has `justify-content: space-between`
  instead of everything left-aligned — confirmed this doesn't affect
  the other screen that reuses `TopBar` (the order-review screen),
  since it only ever passes one child there, and space-between with a
  single child behaves identically to how it looked before.
- When a campaign is active, a badge appears on the right side of the
  top bar: "🎉 3× BUTTONS today" (using whatever the real multiplier
  is). Hovering it shows the campaign's name as a tooltip. When no
  campaign is active, nothing renders — the header looks exactly as
  it does today.

## Verified
- Full build (server + client + portal + POS) passes clean, both
  locally and from a genuine fresh cold-clone simulation.
- **Real smoke tests against the actual endpoint** (not just a
  syntax check) covering every scenario that matters:
  - No campaign active → badge correctly reports inactive
  - A **Website-only** scoped campaign does **not** leak into the POS
    badge — this was the one I was most careful to verify, since
    getting this wrong would show customers an incorrect promise
  - A POS-scoped campaign shows with the correct multiplier and name
  - A site-wide campaign (applies to both channels) also correctly
    shows on POS
  - An expired campaign (date range already passed) correctly doesn't
    show
- **Regression-tested the existing POS checkout flow** after touching
  `pos.js` again — confirmed the catalogue endpoint and the real
  BUTTONS-earning checkout flow (from the earlier delivery) both still
  work exactly as before; this new endpoint is purely additive.
- Re-ran the core scenario tests against a genuine fresh `git clone`
  with this delivery applied, not just my working copy — all pass
  there too.

## Not yet verified
No live browser access from this sandbox — worth a visual check once
deployed to confirm the badge looks right at actual terminal screen
widths (especially on the "compact mobile" scenario you normally test
with, since the badge text needs a bit of room next to the logo/title
on the left).

## To apply
1. `git checkout main`
2. `git pull origin main`
3. Unzip this delivery on top of your local `pawvy-app` folder
4. `git add -A`
5. `git commit -m "POS: show active campaign multiplier badge in top bar"`
6. `git push origin main`

Railway auto-deploys the server and rebuilds the POS client from
`main` on push.
