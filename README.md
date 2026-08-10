# Fixes from your first live PayNow test: email logo/lines/wording, Stripe fee tracking

## This delivery is for the App folder (`pawvy-app`) only

5 files changed/added: `server/lib/customerEmails.js`, `server/lib/stripeFees.js`
(new), `server/routes/checkout.js`, `server/index.js`, `server/jobs/stripeFeeRefresh.js` (new).

## 1. Email: real logo instead of text

Replaced the plain-text "PAWVY" wordmark in the email header with the
actual transparent white logo — the same real file already used on the
website's own nav bar and footer (`pawvy-logo-white.png`), resized for
email use.

Embedded as base64 directly in the email HTML rather than linked to a
hosted URL, deliberately: (1) many email clients block external images
until the recipient clicks "show images" — inlining shows the logo
immediately; (2) avoids depending on `pawvy.co` being live, the same
trap that broke social-share previews before the domain was pointed.
This is a single small (~3KB) file reused across every email, not the
per-row bloat problem the bucket migration fixed for product images — a
completely different situation.

## 2. Email: white lines fixed (real root cause, not a random glitch)

The outer email table had `border-radius:10px; overflow:hidden;` —
that combination isn't reliably supported across email clients
(particularly Gmail/Outlook), and was the actual cause of the thin white
lines at the navy/orange and white/navy seams: the client fails to clip
the rounded corners cleanly and lets slivers of the outer background
color show through at the row boundaries. Removed for plain rectangular
corners, which render correctly everywhere — this is standard
"bulletproof email HTML" practice, not just a workaround for this app.

## 3. Email: order number simplified

Per your suggestion — dropped the visible order number from the status
band and body text (now "ORDER CONFIRMED" / "Here's your receipt for
your order" instead of "ORDER #11 CONFIRMED" / "Order #11"). Kept it in
the **subject line** ("Your Pawvy order #11 is confirmed") since that's
genuinely useful for inbox search later if you ever need to look up a
specific order — wasn't part of what you flagged as cluttered.

## 4. Stripe processing fee not showing for PayNow — real fix, not a quick patch

Checked your actual Stripe screenshot: payment succeeded at 12:42 PM,
but "Funds available" wasn't until Aug 12 — **~2 days later**. That's
PayNow's real settlement time; the fee genuinely doesn't exist via the
API until then. The existing code only retried for ~4.5 seconds at
webhook time, which was never going to close a 2-day gap — that's not a
bug in the retry logic itself, just a mismatch in scale.

**Fix**: extracted the fee-fetching logic into a shared module
(`server/lib/stripeFees.js`) used by both the webhook (unchanged
behavior — still tries immediately, which works fine for card payments)
and a **new daily job** (`server/jobs/stripeFeeRefresh.js`, runs 6am
SGT) that catches whatever the webhook missed. It only touches sales
rows where `stripe_fee_amt` is still `0` and the linked order has a
Stripe payment intent — genuinely settled fees get written in, anything
still pending is left alone and retried automatically the next day.
Only ever updates one sales row per order (matching the existing
"fee lives on the first line item" convention, so multi-item orders
never double-count it).

**Your existing Order #11**: once this deploys, the next 6am SGT run
will pick it up automatically — no manual fix needed, and no action
needed on your end.

## Verification performed

- Real test: built the actual receipt email and confirmed the logo
  image is present, the old text wordmark is gone, the problematic
  border-radius/overflow CSS is gone, the subject line keeps the order
  number while the visible body/status band don't.
- Real test with a mocked Stripe API covering 4 scenarios: a settled fee
  gets written in correctly; a still-pending fee (simulating PayNow's
  real delay) is left alone rather than guessed at; a multi-item order
  only has ONE of its two sales rows updated (confirming no double-
  counting); an order that already has its fee recorded is never
  re-queried at all (no wasted API calls).
- Real cold-clone build: fresh `git clone` → applied the full current
  repo state (matching what you already have) plus this delivery →
  `npm install` → full project build — passed with no errors.
- Re-ran both tests a second time against the cold-clone copy
  specifically, not just the working directory.
- Byte-for-byte diff confirms every file in this zip matches what was
  cold-clone built and tested above.

## To apply

```bash
cd /path/to/your/pawvy-app
git checkout -- . && git clean -fd && git pull origin main
```

Unzip this delivery's files into that folder (overwrite), then:

```bash
git add .
git commit -m "Fix: email logo/white-lines/wording, add daily Stripe fee refresh for PayNow"
git push origin main
```

Railway auto-deploys from `main` — no other steps needed.
