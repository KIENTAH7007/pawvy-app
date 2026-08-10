# Customer accounts: Active/Archived toggle

## This delivery is for the App folder (`pawvy-app`) only

5 files changed: `server/database.js`, `server/routes/customerAdmin.js`,
`server/jobs/customerReminders.js`, `client/src/api.js`,
`client/src/pages/Customers.jsx`.

## What this does

Exact same pattern already used on Products & Pricing — a soft
`is_active` toggle, not a delete:

- New `customers.is_active` column, defaults to active for every existing
  and new row.
- Customers page now defaults to showing only active accounts, with a
  **"Show archived"** checkbox to reveal archived ones — identical UX to
  Products & Pricing's archived toggle.
- Archived customers get an **"ARCHIVED"** badge next to their name when
  shown, same visual pattern as archived products.
- New **Archive / Restore** button per row, kept separate from (and
  before) the existing hard-delete button — archiving never removes the
  row, so the account (BUTTONS balance, order history, everything) stays
  completely intact.
- **The two automated reminder jobs (BUTTONS expiry rollup, campaign/
  birthday) now skip archived customers entirely** — both queries in
  `server/jobs/customerReminders.js` gained an `AND c.is_active = 1`
  clause alongside the existing `account_status = 'verified'` check.

**Archiving doesn't affect anything else** — an archived customer can
still log in, check out, and earn/redeem BUTTONS completely normally.
It's purely: hidden from the admin list by default, and excluded from
proactive marketing/reminder nudges. Nothing about verify/login emails
(those are customer-triggered, not proactive) changed at all.

## Your question about customer counts

Checked the actual code rather than guess: **there's currently no
"customer count" statistic anywhere in the app** — not on the Customers
page, not on the Dashboard. So there's no existing logic (verified vs.
just-captured) to tell you about. Worth knowing for whenever that gets
built: since archiving is a soft flag and never deletes the row, any
future count query will naturally include archived customers by default
unless someone deliberately filters them out — exactly the behavior you
asked for, no extra work needed on that front later.

## Verification performed

- Real backend smoke test (seeded DB, real HTTP calls): confirmed a new
  customer defaults to active; confirmed the default list (as the admin
  UI actually calls it) excludes an archived customer; confirmed the
  "show archived" list correctly reveals it; confirmed restore correctly
  flips it back; confirmed the reminder job actually skips the archived
  customer while still emailing the active one (real birthday-bonus
  scenario, Resend call stubbed).
- Real cold-clone build: fresh `git clone` → applied the full current
  repo state (matching what you already have) plus this feature →
  `npm install` → full project build — passed with no errors.
- Cross-checked every JSX tag in the modified `Customers.jsx` against its
  imports before building — the exact check that would have caught the
  Dashboard crash earlier, now a standing step for any JSX change.
- Re-ran the smoke test a second time against the cold-clone copy
  specifically.
- Byte-for-byte diff confirms every file in this zip matches what was
  cold-clone built and tested.

## To apply

```bash
cd /path/to/your/pawvy-app
git checkout -- . && git clean -fd && git pull origin main
```

Unzip this delivery's files into that folder (overwrite), then:

```bash
git add .
git commit -m "Customers: add Active/Archived toggle, excluded from automated reminder emails"
git push origin main
```

Railway auto-deploys from `main` — no other steps needed.
