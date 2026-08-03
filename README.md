# Pawvy App (backend) — Patch: real guest-checkout account creation

Applies on top of `KIENTAH7007/pawvy-app` @ `55c226c` (current `main` at
the start of this session — "timezone fix").

**This patch pairs with the `pawvy-website-patch.zip` delivered
alongside it — apply both together, they implement one feature across
both repos.** Neither half does much on its own: the website sends a new
`create_account` field that, without this patch, the backend silently
ignores.

Verified with a real smoke test against the actual `data/seed.db`
schema (product lookup, stock check, order insert, customer insert,
verify-email build) — not just a syntax check. See "How this was
tested" below. Only one file changed: `server/routes/checkout.js`.

---

## What was actually wrong

I said in the last delivery that the website's guest-checkout checkbox
forced account creation. **That wasn't accurate — I hadn't seen this
repo yet.** Now that I have: the website's `/api/checkout/create-session`
handler never created a customer account at all, for any guest,
regardless of consent. It only ever stored the guest's email/name/phone
directly on the `website_orders` row. So there was never an account
being force-created — genuine guest checkout already worked, just with a
required PDPA consent checkbox (that part's correct and unchanged: you
do need consent to legally process someone's order/data).

The real gaps were:
1. **Checkbox copy overpromised.** The old wording said "...and create a
   Pawvy rewards account for me," implying an account would be created —
   it never was. Confusing, not a functional bug.
2. **No actual opt-in path existed to build toward.** If you *did* want
   guest checkout to sometimes create a real account (so someone can earn
   BUTTONS on that order and see it later), there was no backend support
   for that at all.
3. **The login → signup dead end** (typing an email that isn't a
   customer sends you to `/signup` with no way back) — this one was real,
   and is fixed entirely on the website side (previous patch).

Given the website now has a genuine two-checkbox split (required consent
+ optional "create my account"), this patch makes the optional one
actually do something, using the **exact same pattern POS checkout
already uses** (`upsertCustomerFromSignup`, in `server/routes/pos.js`)
so the behavior is consistent across every checkout path in the app, not
a new one-off pattern just for the website.

---

## What changed — `server/routes/checkout.js`

- Reads a new `create_account` field from the request body. Defaults to
  `true` if omitted (matches the website's checkbox defaulting to
  checked, and won't change behavior for any other caller that doesn't
  send this field — though right now the website is the only caller of
  this endpoint).
- When a guest consents (`pdpa_consent`) **and** opts in
  (`create_account`), calls `upsertCustomerFromSignup` — the same helper
  POS checkout uses — which either:
  - creates a new **unverified** customer account and sends the same
    "Activate your account" verify email as self-signup (150 BUTTONS
    signup bonus lands once they click it, not before — same as every
    other signup path, so it's never a phantom liability on an unclaimed
    account), or
  - if that email already belongs to an existing customer, just refreshes
    their contact details and links the order to that account — no
    duplicate account, no error.
- The resulting `customer_id` is now written onto the `website_orders`
  row (previously always `NULL` for guests), so `fulfillOrder`'s existing
  BUTTONS-earning logic picks it up automatically on payment — no changes
  needed there.
- When `create_account` is `false`, none of the above runs — behaves
  exactly like guest checkout always has (order recorded with
  `customer_id = NULL`, email/name/phone stored on the order only).
- Wrapped in try/catch, same defensive pattern as POS: if account
  creation fails for any reason, it's logged loudly but the order still
  proceeds — a bug here should never block a paying customer.
- Response now includes `account_created: true/false`, in case the
  website wants to reflect that on the confirmation page later (not
  currently used by the website patch — it just redirects straight to
  Stripe — but there if you want it).

---

## How this was tested

Since I now have real repo access, I ran an actual smoke test rather
than just a syntax check: copied `data/seed.db` into a scratch dev
database, seeded one product with temporary stock, spun up the real
`checkout.js` router in a bare Express app with a stubbed Stripe client
(no real Stripe/network calls), and posted three real requests through
the full `create-session` handler:

1. **Guest, `create_account: false`** → order created, `customer_id`
   stayed `NULL`, no row added to `customers`. ✅
2. **Guest, `create_account` omitted** (should default to `true`) → new
   `customers` row created (`unverified`), order's `customer_id` linked
   to it, verify email attempted, response included
   `account_created: true`. ✅
3. **Guest, `pdpa_consent: false`** → rejected with the existing
   "PDPA consent is required to check out as a guest." error, unchanged
   from before. ✅

The test script itself isn't included in this patch (it's scratch-only,
not something that belongs in the repo) — happy to hand it over
separately if useful for a future regression check.

---

## Git commands

```bash
git checkout main
git pull origin main
# unzip this patch on top ("Copy and Replace")
git add -A
git commit -m "Checkout: real optional account creation for consenting guests, matching POS's pattern"
git push origin main
```

Railway auto-deploys on push, as usual.

## What to check live after deploy (needs both patches applied)

- On the website, add an item to cart while logged out, fill in guest
  details, **leave "Also create a free Pawvy rewards account" checked**,
  complete a test-mode Stripe payment → check the Customers admin page
  for a new **unverified** account with that email, and check that a
  verify email actually sends (needs `RESEND_API_KEY`/Gmail creds
  configured on this Railway service — without them it'll log
  "email skipped" instead, same as every other signup path already
  does).
- Same flow but **uncheck** the account checkbox → complete payment →
  confirm no new row appears in `customers`, order still shows up
  correctly in Website Orders / Sales with the guest's email/name/phone.
- From `/login`, type an email that isn't a customer → land on
  `/signup?next=/cart` → click "Check out as guest instead" → confirm →
  should land back on `/cart` with the cart still intact.
