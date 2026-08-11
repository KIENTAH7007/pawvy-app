# Email dark mode — corrected fix for Outlook/Hotmail specifically

## This delivery is for the App folder (`pawvy-app`) only

1 file changed: `server/lib/customerEmails.js`.

## Correcting the last delivery

The previous "dark mode" fix targeted Gmail — wrong client. The actual
recipient in your test was `ktheland@hotmail.com`, which routes through
Outlook.com, not Gmail. That was visible in the very first screenshot
and should have been caught then. This delivery targets the actual
client.

## What's different about Outlook/Hotmail specifically

Checked real, current sources (Microsoft's own support forums included)
before touching anything again. Outlook.com is documented as using
**"full inversion"** — more aggressive than most clients, since it can
flip already-dark sections (like your navy header) back to light too,
not just light sections to dark. When Outlook.com inverts an element, it
tags that specific element with its own `data-ogsc` (original style
color) / `data-ogsb` (original style background) attributes — this is
the actual mechanism, and it's the same thing Microsoft's own Q&A
threads point developers to for fighting it back.

## The fix

Added a `<style>` block targeting those exact attributes, forcing each
section's real color back with `!important`:

```css
[data-ogsc] .pv-navy, [data-ogsb] .pv-navy { background-color: #14213D !important; color: #ffffff !important; }
[data-ogsc] .pv-orange, [data-ogsb] .pv-orange { background-color: #F36F4A !important; color: #ffffff !important; }
[data-ogsc] .pv-white, [data-ogsb] .pv-white { background-color: #ffffff !important; color: #2B2B2B !important; }
```

Each table cell in the email shell now carries the matching class
(`pv-navy`, `pv-orange`, `pv-white`) so this can target them precisely.
Kept the `color-scheme` meta tags from before too — harmless, and still
helps other clients (Apple Mail, Yahoo) treat this as an intentional
design.

## Still being honest about the limits

Microsoft's own support forums describe Outlook's dark-mode behavior as
"particularly unique" and inconsistent across desktop/web/mobile
versions and account types. This is the real, specifically-targeted
technique for Outlook.com's actual mechanism — not a generic guess like
last time — but genuinely can't promise 100% across every Outlook
surface (classic Windows Outlook uses an entirely different, Word-based
rendering engine with its own separate quirks).

## Verification performed

- Confirmed the `[data-ogsc]`/`[data-ogsb]` override rules are present
  with the correct real hex values (`#14213D`, `#F36F4A`).
- Confirmed each of the 4 colored sections (header, orange band, white
  content, footer) is correctly tagged with its matching class.
- Confirmed this applies across email types — checked on a second type
  (Verify) in addition to Receipt, both share the same underlying shell.
- Real cold-clone build: fresh `git clone` → applied the file →
  `npm install` → full project build — passed with no errors.
- Byte-for-byte diff confirms the file in this zip matches what was
  cold-clone built and tested.

## To apply

```bash
cd /path/to/your/pawvy-app
git checkout -- . && git clean -fd && git pull origin main
```

Unzip this delivery's `server/lib/customerEmails.js` into that folder
(overwrite), then:

```bash
git add .
git commit -m "Email: targeted fix for Outlook.com/Hotmail dark-mode color inversion"
git push origin main
```

Railway auto-deploys from `main`. Worth testing with another email to
that same Hotmail address once deployed, since that's the actual client
this needed to work for.
