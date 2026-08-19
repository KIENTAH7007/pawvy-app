# Pawvy App — Sibling Variant Lookup (item_series exact filter)

Target branch: **staging**
Repo: `pawvy-app`

**Apply this one FIRST** — the website changes in the separate "Pawvy Website" zip call
this new filter, so the site's variant switcher won't work correctly
until this is live.

## What's in this patch

One small addition to `server/routes/shop.js`: `GET /api/shop/products`
now also accepts `?item_series=` for an **exact** match (not the
existing `?search=`'s partial LIKE match). Used by the website's new
product page variant switcher to find real sibling variants (same
product line, different size/flavor) safely — an exact match avoids the
false-positive risk of the LIKE-based search param picking up an
unrelated product whose fields happen to contain the same substring.

## Verification performed

2 real backend tests against a real seeded database: confirmed the
filter returns only exact `item_series` matches (not partial), and
returns a clean empty result (not an error) for a series that doesn't
exist. Byte-diffed the shipped file against what was tested — identical.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite this file:
#   server/routes/shop.js

git add .
git commit -m "Add exact item_series filter for sibling variant lookup"
git push origin staging
```
