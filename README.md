# Push the banner carousel to STAGING (not main)

## This delivery is for the App folder (`pawvy-app`) only, targeting the
## `staging` branch specifically.

4 files: `server/database.js`, `server/routes/homepageBanners.js`,
`server/routes/publicContent.js`, `client/src/pages/Marketing.jsx`.

This is the exact same carousel + Show/Hide caption toggle already
delivered and tested earlier (see the "Homepage Banner Carousel with
Caption Toggle" delivery) — no code changes since then, just re-packaged
to go onto `staging` instead of `main`, since staging ended up showing
the old reverted hero rather than the carousel.

## To apply — note the branch

```bash
cd /path/to/your/pawvy-app
git checkout staging
git pull origin staging
git checkout -- . && git clean -fd
```

Unzip this delivery's files into that folder (overwrite), then:

```bash
git add .
git commit -m "Push banner carousel + caption toggle to staging for image design review"
git push origin staging
```

Railway's staging environment auto-deploys from this branch — should
update automatically once pushed. `main`/production is untouched by
this; pawvy.co keeps showing the reverted hero as expected.

## What to do once this is live on staging

Head to Staging Pawvy App (S-App) → Marketing → Homepage Banner
Carousel, and upload/adjust your banner images there as you design them.
Check the result on Staging Pawvy Website (S-Web) — that's now a
completely safe space to iterate without customers seeing anything
in-progress.
