# Update desktop banner hint text: 16:9 → 16:7

## This is for the App folder (`pawvy-app`) only, targeting `staging`.

1 file changed: `client/src/pages/Marketing.jsx`.

Updates the recommended dimensions shown under the Desktop Image upload
field from "1920×1080px (16:9)" to "1920×840px (16:7)", matching the
new ratio on the website side. Also updated the internal dev comment
above this section for the same reason.

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
git commit -m "Update desktop banner hint text to match new 16:7 ratio"
git push origin staging
```
