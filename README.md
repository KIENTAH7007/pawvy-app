# HOTFIX — Dashboard crash (missing Input import)

## This is for the App folder (`pawvy-app`) only

1 file changed: `client/src/pages/Dashboard.jsx`.

## What broke

The previous delivery ("DB Indexes and Dashboard Date Range") added
`<Input type="date" .../>` twice in the new Top Partners date-range
picker, but I never added `Input` to the import line at the top of the
file — it only imported `KpiCard, Btn, Badge, Modal, fmt`. Since
Dashboard is the app's home page and there's no error boundary around
it, the resulting `ReferenceError: Input is not defined` crashed the
entire React app on load — the blank navy screen was the base page
background rendering with nothing mounted on top of it.

**Why my build check didn't catch it**: `npm run build` passing only
confirms the code is syntactically valid — Vite's JSX transform doesn't
verify that every component reference actually resolves to something in
scope; that only fails at runtime, when a browser actually executes it.
This project also has no ESLint configured, which is the tool that would
have caught an undefined-variable reference before it ever shipped.

## The fix

One line:
```diff
- import { KpiCard, Btn, Badge, Modal, fmt } from '../components/ui';
+ import { KpiCard, Btn, Badge, Modal, Input, fmt } from '../components/ui';
```

## Verification performed (stronger than last time)

- Real cold-clone build: fresh `git clone` → applied the fixed file →
  `npm install` → `npm run build` — passed.
- **Manually cross-referenced every single capitalized JSX tag used
  anywhere in the file against the actual import statements** (not just
  a build-pass check) — confirmed every tag now resolves to either an
  import or a component defined locally in the same file. This is the
  check that should have caught the original bug, and it's what I'm
  using from now on for any JSX delivery, not just a build-pass.
- Byte-for-byte diff confirms the zipped file matches what was
  cold-clone built above.

## To apply

```bash
cd /path/to/your/pawvy-app
git checkout -- . && git clean -fd && git pull origin main
```

Unzip this delivery's file into that folder (overwrite), then:

```bash
git add .
git commit -m "Hotfix: Dashboard crash — missing Input import"
git push origin main
```

Railway auto-deploys from `main`. This should bring the app back up
immediately once deployed.
