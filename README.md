# Pawvy App — Testimonial Photo Size Reduced

Target branch: **staging**
Repo: `pawvy-app`

## What's in this patch

**`client/src/pages/Marketing.jsx`** — reduced the recommended testimonial
photo upload size from 900×1200px to **700×930px** (still 3:4 portrait).
900×1200 was more than needed — the website's actual display size is
~340×453px, so 700×930 (roughly 2x) is still sharp on retina screens
without asking for an unnecessarily large file. Same size noted for
both Photo 1 and Photo 2.

Note: #2 (BetterBone variant switcher) is intentionally not touched in
this round — you flagged it as likely your own testing mistake, and my
own investigation with real seed data confirmed the underlying code
logic is correct (matches exactly what already works for GiGwi). If it
turns out to still be a real issue later, happy to dig back in with a
concrete repro.

## Verification performed

`client` builds clean via `npm run build`. This is a text-only change
(hint copy), no logic touched.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite:
#   client/src/pages/Marketing.jsx

git add .
git commit -m "Reduce recommended testimonial photo size from 900x1200 to 700x930"
git push origin staging
```
