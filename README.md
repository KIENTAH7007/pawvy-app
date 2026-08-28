# Pawvy App — Bundle Refinements: Required Need, Optional Hero Image

Target branch: **staging**
Repo: `pawvy-app`

**Apply this one first** — the website delivery depends on the new
`image_url` field in the public bundle response.

Addresses points 2 and 5 from your feedback (points 1, 3, 4 are
website-side — see that zip's README).

## 2. Need is now required, not optional

**The honest answer to your question** ("if I don't choose a need,
where does it show?") was: nowhere. The only place a bundle currently
renders on the website is a specific Shop-by-Need page, so a bundle
with no need tag was genuinely invisible — a real gap in how Stage 1
was first scoped, not something that was ever going to reveal itself
gracefully later.

Fixed by making it required, both sides:
- **Backend** (`server/routes/bundles.js`): rejects a create or update
  with a missing/blank need tag, with a clear error message explaining
  why.
- **Admin UI**: removed the "None" option from the Need dropdown,
  removed "(optional)" from the label, and added the same validation
  client-side before it even reaches the server.

## 5. Optional single bundle hero image

New `image_url` column on `bundles` (added via the safe
`ALTER TABLE ... ADD COLUMN` pattern, since this table already exists
on your live database — the schema comment explains why). Genuinely
optional: upload one if you want a polished, purpose-shot image for a
bundle; leave it blank and the website falls back to the auto-tiled
grid of each component's own product photo exactly as before. Nothing
extra required unless you want the polish for a specific bundle.

Upload/replace/remove all follow the exact same pattern already used
for Testimonials' photo field — same bucket helpers, same cleanup of
the old image when you replace or remove one.

## Verification performed

**5 real backend tests** against a real Express server + real seeded
database (bucket upload calls mocked, same as prior deliveries — no
real network path to your bucket from this sandbox): confirmed
creating a bundle without a need tag is now rejected; confirmed
creating one with a real uploaded image succeeds and the public
endpoint correctly returns the `image_url`; confirmed removing the
image via `remove_image: true` correctly nulls it out; confirmed
*updating* an existing bundle to try clearing its need tag is also
rejected (not just blocked at creation); confirmed the need-filtered
public list still works correctly end to end.

`client` builds clean via `npm run build`. All 4 changed files
byte-diffed against what was actually tested — identical.

## How to apply

```bash
git checkout staging
git pull origin staging

# copy/overwrite these files:
#   client/src/pages/Marketing.jsx
#   server/database.js
#   server/routes/bundles.js
#   server/routes/shop.js

git add .
git commit -m "Bundles: require a Need (was silently invisible without one), add optional single hero image with tiled-photo fallback"
git push origin staging
```

Once live on S-App, any bundle you already created should still work
fine (need tag was already required in practice for it to be useful,
even though the field allowed blank before). Try uploading a hero photo
to one bundle and leaving another without — both should render
correctly on the website once the paired website patch is applied.
