# Fix: website channel gap for campaign detection

## What changed (2 files, both one-line fixes to the same root cause)

### `server/routes/customers.js` — `GET /api/customers/me`
Now passes `channel: 'website'` to `getActiveMultiplierDetail`. Before
this, it passed no channel at all, which meant only `site_wide`
campaigns were ever detected — a campaign scoped specifically to
"Website only" in the Campaigns admin was invisible to logged-in
customers, even though the multiplier logic itself already fully
supported channel scoping (built for POS earlier).

### `server/routes/publicContent.js` — `GET /api/public-content/campaign`
Same exact fix, same reason. This is the **public**, no-login-required
endpoint — worth noting it already existed, with a comment saying it
was "used for the nav's promo badge," but the website frontend never
actually called it (see the companion `pawvy-website` delivery, which
wires this up for the first time). Fixing the channel gap here means
even visitors who aren't logged in can now correctly see a
Website-scoped campaign.

## Why two separate endpoints
`/api/customers/me` (authenticated) already combines campaign-vs-
birthday and returns whichever is higher — that's for logged-in
customers, where a birthday bonus is possible.
`/api/public-content/campaign` (no auth) only ever reflects a
campaign, since there's no known customer to check a birthday against
— that's for anyone just browsing. Both needed the same channel fix
independently, since they call the shared multiplier logic separately.

## Verified — thorough, since this touches real earning-adjacent logic
8 real scenario tests against actual running route handlers with a
seeded database (not just syntax checks), covering:
- Anonymous visitor, no campaign → correctly inactive
- Anonymous visitor, Website-scoped campaign active → **now correctly
  detected** (this was the actual bug)
- Anonymous visitor, POS-only campaign active → correctly does **not**
  leak into the website's public endpoint
- Logged-in customer, nothing active → correctly null
- Logged-in customer, Website-scoped campaign active → **now
  correctly detected** (same underlying bug, different endpoint)
- Logged-in customer with an active birthday month **and** a higher
  campaign multiplier → campaign correctly wins
- Logged-in customer with an active birthday month **and** a lower
  campaign multiplier → birthday correctly wins
- Logged-in customer, POS-only campaign active → correctly does
  **not** leak into the website's `/me` endpoint (birthday still
  correctly wins instead)

Also regression-tested the **existing POS endpoint** (`/api/pos/
active-campaign`, from the earlier delivery) after touching these
neighboring files, confirming it's completely unaffected — still
correctly shows POS-scoped campaigns and still correctly excludes
Website-only ones.

Re-ran the core test against a genuine fresh `git clone` with this
delivery applied — not just my working copy — passes there too.

## To apply
1. `git checkout main`
2. `git pull origin main`
3. Unzip this delivery on top of your local `pawvy-app` folder
4. `git add -A`
5. `git commit -m "Fix: website-facing campaign endpoints weren't channel-scoped, missing Website-only campaigns"`
6. `git push origin main`

## Companion delivery
This pairs with a `pawvy-website` delivery (`components/Nav.jsx`,
`app/account/page.js`) that actually displays this data — the nav
badge and account page. Apply both together; this backend fix alone
doesn't change anything visible, and the website delivery alone would
still only show site-wide campaigns without this.
