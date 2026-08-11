# Email dark-mode color inversion — partial mitigation, honest limitation

## This delivery is for the App folder (`pawvy-app`) only

1 file changed: `server/lib/customerEmails.js`.

## What was happening

Your screenshot showed the navy header looking washed-out and the white
content section rendering with a black background and light text — that's
Gmail's mobile app automatically trying to "dark-mode-ify" the email,
inconsistently inverting colors it wasn't designed to touch.

## Important: this is a genuine limitation, not something fully fixable

Checked real, current sources before touching anything (not assumed).
Confirmed: Gmail's mobile apps specifically **ignore** the standard meta
tags and CSS media queries that let an email declare "this design is
intentional, don't invert it" — those work fine on Apple Mail,
Outlook.com, and Yahoo Mail, just not reliably on Gmail mobile. Multiple
current sources describe Gmail's behavior here as inconsistent even
across different emails from the same sender, with "no clear pattern
across devices or accounts."

**So: this delivery is a real, standard improvement — not a guaranteed
fix.** It should measurably help on Apple Mail/Outlook.com/Yahoo, and
costs nothing on Gmail even if Gmail keeps ignoring it.

## The fix

Added two standard meta tags to the email shell (shared by all 6 email
types):

```html
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
```

This tells any client that respects it: this email is deliberately
designed with its own navy/orange/white palette — treat it as light-mode
content, don't apply automatic dark-mode color inversion.

## Verification performed

- Confirmed the meta tags appear correctly in the actual generated HTML
  across multiple email types (Receipt and Verify checked directly, both
  share the same underlying shell as all 6 types).
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
git commit -m "Email: declare light color-scheme to reduce dark-mode color inversion"
git push origin main
```

Railway auto-deploys from `main`. Worth checking how this looks in Gmail
specifically after deploying — if it's still inconsistent there, that's
expected given Gmail's documented behavior, not something to keep trying
to patch further without a fundamentally different approach (e.g.
designing an actual dark-mode variant, which Gmail mobile still wouldn't
reliably use anyway).
