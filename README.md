# Pawvy App — Shop-by-Need Foundation (Corrected Tag List + Order)

Target branch: **staging**
Repo: `pawvy-app`

This supersedes the previous "Shop-by-Need Foundation" zip — same
feature, corrected tag list per your latest amendments. If you haven't
applied the previous one yet, just apply this one instead (it's the
complete feature, not a partial diff). If you already applied the
previous one, this patch's file changes will simply overwrite the tag
list and order to the corrected version below — nothing else changes.

## Before this patch — sync staging with the emergency hotfix

Same note as last time, only relevant if you haven't already done this:
staging needs `main`'s bucket socket-pool fix merged in first. Skip this
if you already did it for the previous delivery.

```bash
git checkout staging
git pull origin staging
git merge main
git push origin staging
```

## What changed from the previous delivery

Per your amendments:
- **Removed:** Treats
- **Renamed:** Chewing → Chew
- **Added:** Food, Grooming
- **Reordered** to this exact sequence everywhere it appears (admin UI,
  backend validation, schema comment):

  **Skin & Coat → Chew → Enrichment → Gut → Food → Dental → Grooming → Joints**

This sequence is now the source of truth for the website build later too
(homepage need cards, Shop filter order) — no need to specify it again
when that work starts.

Updated in three places, kept in sync:
- `server/routes/products.js` — the `NEED_TAGS` validation list (backend
  rejects anything not in this exact list).
- `client/src/pages/Products.jsx` — the `NEED_TAG_OPTIONS` list that
  renders the toggle chips in the Shop Settings modal, same order.
- `server/database.js` — updated the schema comment referencing the tag
  list, for anyone reading the code later (comment only, no functional
  change — the column itself was always a plain JSON-array text field
  with no database-level constraint on which tags are valid).

## Verification performed

- 4 real backend tests against a real Express server + real seeded
  database: confirmed the 3 new tags (`chew`, `food`, `grooming`) save
  correctly; confirmed the old `treats` tag is now correctly **rejected**
  with a 400 (proves it's actually gone, not just hidden in the UI);
  confirmed the old `chewing` slug is also correctly rejected (renamed,
  not aliased — old data referencing it would need re-tagging, but since
  you haven't started entering data yet this has zero real-world impact);
  confirmed all 8 correct tags save together in the exact right order.
- `client` rebuilt clean via `npm run build`, no errors.
- Grepped the final state of all three files side by side to confirm the
  backend list, frontend list, and schema comment all show the exact
  same 8 tags in the exact same order — no drift between them.
- All 4 changed files in this zip byte-diffed against what was actually
  tested — identical.

## How to apply

```bash
git checkout staging
git pull origin staging

# then copy/overwrite these files from this zip into your local
# pawvy-app folder, preserving the same paths:
#   server/database.js
#   server/routes/products.js
#   client/src/api.js
#   client/src/pages/Products.jsx

git add .
git commit -m "Shop-by-Need tags: remove Treats, rename Chewing to Chew, add Food + Grooming, reorder to final sequence"
git push origin staging
```

Once live on S-App, the Shop Settings modal's chips should now read, top
to bottom / left to right: Skin & Coat, Chew, Enrichment, Gut, Food,
Dental, Grooming, Joints — ready for you to start tagging products.
