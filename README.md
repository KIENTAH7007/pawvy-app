# Pawvy App — Unsubscribe for Automated Reminder Emails

Target branch: **staging**
Repo: `pawvy-app`

Part of the PDPA / Spam Control Act compliance work. Adds a real
unsubscribe link to the three automated reminder emails (BUTTONS
expiry, birthday-month, campaign) sent by `server/jobs/
customerReminders.js`.

## What's in this patch

- **New column**: `customers.marketing_opt_out` (defaults to 0 for
  everyone). Only affects these three reminder email types — never
  blocks order confirmations, account verification, or anything else,
  and never restricts using the account itself.
- **New helper**: `getOrCreateUnsubscribeToken(db, customerId)` in
  `lib/customers.js` — reuses the existing `auth_tokens` table (just a
  new `purpose` value, no new table needed) with a 1-year expiry.
  Unlike login/verify tokens, this one isn't single-use — clicking the
  same link twice just re-confirms, it doesn't error.
- **New public endpoint**: `GET /api/customers/unsubscribe-link` —
  same pattern as the existing `verify-link` route (a standalone
  confirmation page rendered directly by the backend, no login
  required). Already covered by the existing PIN-gate exception for
  `/api/customers`, so no extra auth wiring needed.
- **Email template**: all three reminder emails now include a real
  "Unsubscribe from these reminder emails" link in the footer. The
  transactional emails (verify, login) are completely unaffected —
  confirmed they still render correctly with no unsubscribe link.
- **The daily job itself**: both the BUTTONS-expiry candidate query
  and the campaign/birthday candidate query now exclude anyone with
  `marketing_opt_out = 1`.

## Verification performed — real data, not just code review

- Seeded two real customers with **identically qualifying** expiring
  BUTTONS batches, opted one out via the real endpoint, then ran the
  actual candidate queries — confirmed only the non-opted-out customer
  came back. Same check repeated for the campaign/birthday query.
- Hit the real unsubscribe endpoint with a real generated token,
  confirmed the customer's flag flipped to 1, and confirmed the real
  HTML confirmation page renders.
- Clicked the same link a second time — confirmed it still returns
  200 with the same confirmation, not an error.
- Hit the endpoint with a fake/invalid token — confirmed it correctly
  returns 400 with a real "link invalid" page.
- Rendered a real reminder email end-to-end and confirmed the
  unsubscribe link is present with a real, working token embedded in
  it — not just present in the template source.
- Rendered the verify and login emails and confirmed they're
  completely unaffected — no unsubscribe link, exactly as intended,
  since those are account-critical, not promotional.
- All 5 changed files syntax-checked and load cleanly.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite:
#   server/database.js
#   server/jobs/customerReminders.js
#   server/lib/customerEmails.js
#   server/lib/customers.js
#   server/routes/customers.js

git add .
git commit -m "Add unsubscribe link to automated reminder emails (BUTTONS expiry/birthday/campaign) — PDPA/Spam Control Act compliance"
git push origin staging
```

The `marketing_opt_out` column gets added automatically on next
startup (same safe migration pattern already used elsewhere in this
file — wrapped in try/catch, safe to run repeatedly).

## Worth a real check once live

Trigger a reminder email to a real test account, click the
unsubscribe link, and confirm the next day's run correctly skips that
account.
