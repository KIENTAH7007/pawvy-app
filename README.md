# Email logo real fix + Stripe fee manual-entry workaround

## This delivery is for the App folder (`pawvy-app`) only

9 files changed/added, listed in full below.

## 1. Email logo — the real fix this time

My earlier base64-embedded logo fix was wrong. Verified against real
documentation (not assumed): **Gmail deliberately does not render
base64/data-URI images in email at all** — that's a real, documented,
longstanding policy, not a bug. Outlook would have shown it; Gmail
never will, which is exactly the broken-image icon you saw.

Fixed properly: the logo is now a real hosted file
(`public-assets/pawvy-logo-email.png`), served by a new static route on
the backend (`/brand-assets/...`, added in `server/index.js`, outside
`/api` so the staff PIN gate never applies to it), referenced by an
absolute URL. Deliberately points at the backend's own Railway domain
(`pawvy-app-production.up.railway.app` — the same one your Stripe
webhook already uses) rather than `pawvy.co`, since that domain isn't
live yet — same trap that broke social-share previews before.

**Confirmed this applies to all 6 email types**, not just the receipt —
every builder shares the same `emailShell()` function where the logo and
the earlier white-line fix both live.

## 2. Stripe fee: manual-entry workaround, with real reconciliation logic

Your idea, built properly rather than as a quick hack. New **Stripe Fee**
field in the Sales Ledger's edit-details modal (pencil icon), shown only
for website orders. Type in a guess if Stripe hasn't reported the real
fee yet.

The key part — a new `stripe_fee_confirmed` column tracks whether a
value is real (fetched from Stripe) or still a placeholder (either the
$0 default or your manual guess). The daily 6am SGT job now checks this
flag instead of just "is the fee $0":

- **Your guess was right** → the value doesn't change, just gets marked
  confirmed. Nothing visibly happens.
- **Your guess was wrong** → silently corrected to the real value.
- **Already confirmed** (e.g. a card payment that got its real fee
  instantly) → never touched again, never re-queried, no wasted API
  calls.

There's no scenario where your manual entry and the real fee both get
counted — the job always **overwrites** with the authoritative Stripe
value once available, never adds to what's there.

## Verification performed

- Real test, 5 scenarios: manual entry correctly resets confirmed status;
  a correct guess stays the same value after the job runs; a wrong guess
  gets silently corrected to the real fee; an already-confirmed row is
  never re-queried or touched; editing an unrelated field (like notes)
  never disturbs an already-confirmed fee.
- Real test of the actual webhook endpoint end-to-end (not a simplified
  stand-in) — confirmed a real settled fee gets written in as already
  confirmed when available immediately (the common card-payment case).
- Confirmed the logo fix specifically on a *different* email type
  (Verify, not Receipt) to prove it's genuinely shared, not
  coincidentally duplicated.
- Real cold-clone build: fresh `git clone` → applied the full current
  repo state (matching what you already have) plus this delivery →
  `npm install` → full project build — passed with no errors.
- Re-ran the reconciliation test and the logo check a second time
  against the cold-clone copy specifically, not just the working
  directory.
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
git commit -m "Fix email logo for real (Gmail blocks base64 images); add manual Stripe fee entry with automatic reconciliation"
git push origin main
```

Railway auto-deploys from `main` — no other steps needed.
