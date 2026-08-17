# Update desktop banner hint text: 16:7 → 16:8, add nav-bar safe-zone note

## This is for the App folder (`pawvy-app`) only, targeting `staging`.

1 file changed: `client/src/pages/Marketing.jsx`.

Updates the recommended dimensions under the Desktop Image upload field
to "1920×960px (16:8)", matching the website side, and adds a direct
note about keeping critical content 90-100px clear of the top edge (the
nav bar sits over that area) — so future uploaders don't need to ask.

## To apply

Apply together with the companion Website-side delivery.

```bash
cd /path/to/your/pawvy-app
git checkout staging
git pull origin staging
git checkout -- . && git clean -fd
```

Unzip this delivery's file into that folder (overwrite), then:

```bash
git add .
git commit -m "Update desktop banner hint text to 16:8, add nav-bar safe-zone note"
git push origin staging
```
