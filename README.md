# Pawvy App (backend) — Patch: enquiry phone now required

Applies on top of `KIENTAH7007/pawvy-app` @ `408df4f` (current `main`).
One file changed: `server/routes/enquiries.js`. Syntax-checked and smoke
tested against a real Express app + the actual route handler (not just
`node --check`) — see below.

**Pairs with `pawvy-website-patch.zip`, item 6** — the website's contact
form now marks phone as required in the browser, but a required-only
frontend field can always be skipped by anyone hitting the API directly.
This patch adds the same requirement server-side so it's actually
enforced, not just suggested.

## What changed

`POST /api/enquiries` now rejects a submission with no phone number:

```js
if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone number is required.' });
```

Same pattern as the existing email/message checks right above it —
nothing new introduced, just one more required field in the same style.

## How this was tested

Spun up the real route handler in a bare Express app and posted two real
requests:

1. **No phone** → `400 { error: 'Phone number is required.' }` ✅
2. **With phone** → `201 { ok: true, id: 1 }`, row actually inserted ✅

## Git commands

```bash
git checkout main
git pull origin main
# unzip this patch on top ("Copy and Replace")
git add -A
git commit -m "Enquiries: require phone number server-side, matching the website form"
git push origin main
```

## What to check live after deploy

Submit the "Get in touch" form on the website with the phone field
blank (you'll need to bypass the browser's own required-field check,
e.g. via dev tools, to actually reach the API) — should come back with
an error instead of creating an enquiry.
