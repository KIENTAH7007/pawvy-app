# Update mobile banner hint text: 4:5 → 2:3

## This is for the App folder (`pawvy-app`) only, targeting `staging`.

1 file changed: `client/src/pages/Marketing.jsx`.

Just the hint text under the Mobile Image upload field, updated to match
the new 2:3 ratio (see the companion Website-side delivery for the
actual CSS change this describes).

## To apply

```bash
cd /path/to/your/pawvy-app
git checkout staging
git pull origin staging
git checkout -- . && git clean -fd
```

Unzip this delivery's file into that folder (overwrite), then:

```bash
git add .
git commit -m "Update mobile banner hint text to match new 2:3 ratio"
git push origin staging
```
