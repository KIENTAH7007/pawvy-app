# Delivery: Email template redesign (all 6 types) + 2 new automated reminder emails

## ⚠️ This entire delivery is for the App folder (`pawvy-app`) only

Every file in this zip is `server/*` (backend) or
`client/src/pages/Marketing.jsx` (the internal staff admin app). **Nothing
here touches `pawvy-website`** — unzip over your local `pawvy-app` clone.

## What this delivers

1. **Bold Brand Header template applied to all 6 customer email types** — the
   approved visual direction (navy header → orange status band → white
   content → navy footer), previously only mocked up, now live in
   `server/lib/customerEmails.js` for Verify, Login, Receipt, Enquiry, and
   the two new emails below. All underlying data/links/logic for the first
   4 are unchanged — this is a wrapping/restyling pass, not a rewrite of
   what they say.
2. **BUTTONS expiry reminder** — one rollup email per customer, showing up
   to 3 soonest-expiring BUTTONS batches, firing once each batch enters a
   14-day warning window (never a daily repeat for the same batch).
3. **Campaign / birthday-month reminder** — sends AT MOST ONE of a
   campaign email or a birthday email, whichever multiplier is higher
   (ties go to the campaign), reusing the exact same rule already used at
   checkout time (`getActiveMultiplierDetail` in `lib/buttons.js`).
   Campaign reminders are opt-in per campaign via a new **"Remind
   customers by email every ___ days"** field in Marketing → Campaigns.

## Files changed

- `server/database.js` — 2 additive schema changes:
  - `campaigns.email_frequency_days` (nullable INTEGER; NULL = no reminder
    emails for that campaign, the safe default for every existing row)
  - new `automated_email_log` table (dedup log shared by all 3 automated
    reminder types — see comments in the file for why one table rather
    than three)
- `server/lib/buttons.js` — added `getBestActiveCampaign()` (the
  channel-agnostic "what's the best campaign running right now" lookup
  the reminder job needs — different from the existing channel-scoped
  `getActiveMultiplierDetail`, which is for checkout time). Exported the
  Singapore-timezone date helpers so the job doesn't duplicate them.
- `server/lib/customerEmails.js` — added the shared `emailShell()` +
  `ctaButtonHtml()` helpers; rewrapped `buildVerifyEmail`,
  `buildLoginEmail`, `buildReceiptEmail` in the new shell; added
  `buildEnquiryEmail` (moved out of `routes/enquiries.js`),
  `buildButtonsExpiryEmail`, `buildBirthdayEmail`, `buildCampaignEmail`.
- `server/routes/enquiries.js` — now calls `buildEnquiryEmail()` instead
  of an inline plain-text string.
- `server/jobs/customerReminders.js` — **new file**, the daily trigger for
  both new emails, same shape as `buttonsHold.js`.
- `server/index.js` — registered the new job on a `0 5 * * *` (5am SGT)
  cron, right after the BUTTONS hold check (4am), so any batch that just
  flipped pending→credited today already has its real `expires_at` before
  this job scans for upcoming expiries.
- `server/routes/campaigns.js` — POST/PATCH now accept
  `email_frequency_days`. Note: PATCH uses a `CASE WHEN` (not COALESCE)
  so the field is only touched when explicitly provided in the request —
  otherwise the Marketing page's "Turn on/off" toggle (which only sends
  `{is_active}`) would silently wipe out an existing frequency value.
- `client/src/pages/Marketing.jsx` — new "Remind customers by email every
  ___ days" input in the Campaign modal, a status badge in the Campaigns
  table, and an explainer line describing the birthday-vs-campaign
  priority rule.

## Rules this implements (as agreed)

- **Expiry warning**: fires 14 days before a batch's `expires_at`.
- **Expiry dedup**: per-batch — each batch triggers its reminder exactly
  once, whenever it first qualifies. Multiple qualifying batches for one
  customer are rolled into a single email, top 3 soonest-expiring; a 4th+
  batch (or one that enters the window on a later day) gets its own
  follow-up email once the first 3 are marked notified.
- **Birthday reminder**: once per calendar year, tied to the *primary*
  pet's birthday month (same restriction as the existing BUTTONS
  birthday-bonus logic).
- **Campaign reminder**: opt-in per campaign (`email_frequency_days`
  must be set); fires when `days since last reminder to this customer
  for this campaign >= email_frequency_days` (or never sent before).
  Fires for **any** scope (site-wide, website-only, POS-only) — the
  email body wording adapts to the actual channel via
  `campaignChannelLabel()`.
- **Campaign vs birthday priority**: exactly one email sent, whichever
  multiplier is higher; an exact tie goes to the campaign — this
  reuses the same `>=` comparison already in
  `getActiveMultiplierDetail`, so the reminder email can never disagree
  with what the customer actually earns at checkout.
- **Unverified customers**: never receive either automated reminder
  (`account_status = 'verified'` required).

## Verification performed

- `node --check` on every touched/new file.
- **Real database init test** on a fresh clone (not just the working
  copy) — confirmed `email_frequency_days` and `automated_email_log`
  both appear correctly from a clean schema build.
- **Cold-clone build**: fresh `git clone` → apply these exact files →
  `npm install` (root) → `npm install` + `npm run build` (client) — all
  passed with no errors.
- **Backend smoke test** (seeded DB, real function calls, Resend's
  network call stubbed since the sandbox has no route to
  `api.resend.com`) covering:
  - Unverified customers are never emailed even with a qualifying batch
  - Expiry rollup only includes batches inside the 14-day window; a
    batch outside the window is correctly excluded and not logged yet
  - Running the job twice on the same day does not double-send anything
  - Campaign (2×) correctly beats birthday (1.5×) for multiple customers
    at once
  - Site-wide vs POS-only campaign emails use the correct channel wording
  - Birthday-only path fires correctly once no campaign outranks it, and
    does not re-fire within the same year
  - **Exact-tie case** (campaign multiplier == 1.5, same as birthday):
    confirmed the campaign wins, matching `getActiveMultiplierDetail`'s
    `>=` rule exactly
  - **Brand color check**: confirmed generated email HTML contains the
    real `#14213D` navy / `#F36F4A` orange, and contains neither of the
    earlier placeholder colors
- This test was run twice — once during development, and a second final
  pass against the actual cold-clone copy of the files being delivered
  here, to confirm the zipped files are the ones that were tested (not
  just the working-directory versions).

## Brand colors

`customerEmails.js`'s `BRAND_NAVY` (`#14213D`) and `BRAND_ORANGE`
(`#F36F4A`) are pulled directly from `pawvy-website/app/globals.css`'s
`:root` block ("Real Pawvy brand system, from the brand guideline PDF") —
not eyeballed. The footer uses the same navy as the header, matching how
the website's own `<footer class="site-footer">` does it (no separate
darker shade invented for email). Every email pulls from these two
constants, so any future brand color update is a one-place change.
