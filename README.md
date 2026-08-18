# Pawvy App — URGENT: Bucket Socket-Pool Exhaustion Fix

**This fixes the bug causing your current production incident** (banner
Mobile/Tablet images blank, Instagram grid blank on mobile, admin image
uploads hanging forever) — confirmed from your Railway log showing
`socket usage at capacity=50 and 1667 additional requests are enqueued`.

## What was actually happening

Every image on your site (banners, products, Instagram grid) is served
through one route: `server/routes/uploads.js`, which streams the file
from the Railway bucket to the visitor's browser using
`obj.Body.pipe(res)`.

The problem: if the browser stops listening partway through — picks a
different `<picture>` source once it's decided which one it needs,
the visitor navigates away, or a mobile connection drops — plain
`.pipe()` does **not** clean up the source stream. That leaves the
underlying connection to the bucket permanently checked out of the
connection pool (default limit: 50 connections), forever, for that one
request.

With real site traffic, this bled the pool dry over time. Once all 50
were stuck, every further image request — including new admin uploads —
had to queue behind whatever was already stuck, which for practical
purposes meant "stuck forever." Desktop looked fine only because
already-cached images (1-year immutable cache) never needed to ask the
backend again — it wasn't actually healthy, it just wasn't asking.

I also reproduced and confirmed a second, worse symptom of the same bug
in isolation: the raw `.pipe()` pattern can throw an **unhandled error**
when the client disconnects mid-stream, which in the worst case can crash
the whole Node process outright.

## The fix

**`server/routes/uploads.js`** — replaced `obj.Body.pipe(res)` with
Node's `stream.pipeline()`, which guarantees both the source and
destination streams are properly destroyed/cleaned up no matter which
side closes first. This means the bucket connection's socket is always
released back to the pool, even when a visitor's browser cancels the
request halfway through.

**`server/lib/bucket.js`** — raised the S3 client's `maxSockets` from
the default 50 to 200 as a second safety net. This is headroom on top of
the real fix above, not a substitute for it — every image on the whole
site shares this one client, so 50 was thin for real traffic even
without a leak.

## Verification performed (real, not just "it looks right")

- Both files load and their `require`s resolve with no syntax errors.
- `bucket.js` initializes correctly with the new `NodeHttpHandler`
  config wired in.
- **Real Express server smoke test** (`server/routes/uploads.js` mounted
  for real, only the bucket SDK boundary mocked since this sandbox has
  no network path to your actual Railway bucket) — 4 real HTTP requests
  against a real running server:
  1. Normal download → 200, correct content-type, correct byte count.
  2. Missing key → clean 404, no crash.
  3. **Client aborts mid-stream** (the exact bug scenario) → server does
     not crash or hang.
  4. **A normal request made right after the aborted one** → still 200,
     still correct bytes — proving the server recovers cleanly and isn't
     left in a bad state by the disconnect.
- Directly reproduced the *old* buggy behavior in isolation first (raw
  `.pipe()` with a simulated client disconnect) and confirmed it throws
  an unhandled error — concrete proof this was a real, exploitable bug
  and not a theoretical one.
- Byte-for-byte diffed both files in this zip against what was actually
  tested — identical.

## Immediate relief while you decide how to deploy this

**A manual redeploy/restart of the pawvy-app backend service on Railway
resets the connection pool to empty right away** and should make the
site work normally again immediately, even before this code fix ships.
Worth doing now regardless of when you apply this patch — it buys time,
it just doesn't prevent the pool from filling up again eventually
without the actual fix.

## How to apply

This touches the **backend** (`pawvy-app`), which affects every visitor
immediately, not just admin/internal tools — worth deciding deliberately
whether this goes straight to `main` as an emergency (given production
is actively degraded right now) or through `staging` first as usual.
Your call — the commands below work the same either way, just swap the
branch name.

```bash
# If treating as emergency (recommended given active production impact):
git checkout main
git pull origin main

# If going through staging first as usual:
# git checkout staging
# git pull origin staging

# then copy/overwrite these two files from this zip into your local
# pawvy-app folder, preserving the same paths:
#   server/routes/uploads.js
#   server/lib/bucket.js

git add .
git commit -m "Fix bucket socket-pool exhaustion: use stream.pipeline() instead of raw .pipe() so client disconnects don't leak connections; raise maxSockets as headroom"
git push origin main
# (or: git push origin staging)
```

Railway will auto-deploy from whichever branch you push to. Once it's
live, re-test the same direct image URL on your phone:
```
https://pawvy-app-production.up.railway.app/api/uploads/instagram/2-1786352484165.jpg
```
