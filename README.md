# Fix: Marketing page tables squeezed/uncscrollable

## Root cause
The shared `Page` component (used by *every* page in the app, not just
Marketing) wrapped its content in a div with `height: '100%'`. That's
a **hard cap**, not a minimum — it told the page "you are exactly this
tall, no taller," regardless of how much content was actually inside.
`<main>` (the actual scroll container, in `App.jsx`) already correctly
had `overflowY: 'auto'` — but scrolling only helps if content is
*allowed* to exceed the visible height in the first place, and `Page`
was silently preventing that.

This was a **latent bug that predates this delivery** — it just never
got triggered before, because no page's content had ever actually
needed more vertical space than a typical screen. The new Homepage
Banner section (previous delivery) made Marketing the first page to
cross that line, which is why all four sections — not just the new
one — appeared squeezed at once.

## What changed (1 file)
`client/src/components/ui.jsx` — `Page`'s wrapper now uses
`minHeight: '100%'` instead of `height: '100%'`. A short page still
fills the full height exactly as before (nothing changes visually
there); a tall page can now actually grow past the viewport, letting
`<main>`'s existing scroll do its job.

## Why this is safe for every other page using `Page`
Checked the pages most likely to depend on exact sizing
(`Dashboard.jsx` and others using `100vh`/fixed-height patterns) — the
few places that do use `height: '100%'` internally are self-contained
elements with their own explicit pixel constraints (a progress-bar
fill inside its own fixed-height bar, a panel with its own
`maxHeight` + `overflowY`), not dependent on `Page`'s own height being
capped. None of them break with this change.

## Verified
- Client build passes clean, both locally and from a genuine fresh
  cold-clone simulation.
- Confirmed the exact CSS value change directly (`minHeight:'100%'`
  now present, old `height:'100%'` gone).

## Not yet verified
No live UI access from this sandbox — worth confirming directly that
all four Marketing sections scroll into view properly now, and a
quick check that no other page (Dashboard especially) looks different.

## To apply
1. `git checkout main`
2. `git pull origin main`
3. Unzip this delivery on top of your local `pawvy-app` folder
4. `git add -A`
5. `git commit -m "Fix: Page component height cap was silently preventing scroll on tall pages"`
6. `git push origin main`
