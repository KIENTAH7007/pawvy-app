# BUTTONS multiplier timezone fix

## What was wrong

`server/lib/buttons.js` computed "today's month" and campaign date-range
checks using `.getUTCMonth()` / `.toISOString()` — raw UTC, not
Singapore time. Singapore is UTC+8, so these can disagree by up to 8
hours around midnight in either direction:

- Around midnight to 8am Singapore time, UTC is still on the *previous*
  calendar day — this is exactly what you caught: at 1 Aug 2026, 7:35am
  SGT, it was still 31 July in UTC, so the code correctly-by-its-own-
  broken-logic still saw "July" and kept the birthday bonus active.
- The mirror-image bug also existed at the *start* of a birthday month:
  during the first ~8 hours of 1 July in Singapore, UTC would still say
  30 June, so a July-birthday customer's bonus wouldn't yet be active
  even though it was already their birthday month locally.

Same root cause affects the campaign `start_date`/`end_date` window
check, so campaigns set to run e.g. "1–7 Aug" could start/end up to 8
hours off from what the Pawvy App's date fields actually mean in
Singapore.

## The fix

Added two small helpers that extract Singapore's calendar month/date
using `Intl.DateTimeFormat` with an explicit `timeZone: 'Asia/Singapore'`
— this works correctly regardless of what timezone the Railway server's
OS is actually set to, rather than depending on server config being
right (which is easy to get wrong and hard to notice, versus this being
explicit in the code). Both the birthday-month comparison and the
campaign date-range check now use these instead of raw UTC extraction.

Tested directly against the function (mocked DB) with three cases:
1. Your exact scenario (1 Aug, 7:35am SGT, July birthday) — now correctly
   shows no bonus.
2. Mid-July SGT — still correctly shows the 1.5x bonus.
3. The mirror-image edge case (1:30am SGT on 1 July) — now correctly
   shows the bonus starting right at Singapore midnight, which the old
   code would have missed for its first ~8 hours.

## File in this patch

- `server/lib/buttons.js` — complete file. Only the multiplier/campaign
  date logic changed; the earn/redeem ledger math (`calculateEarnedButtons`,
  the 30% redemption cap, the 7-day hold, etc.) is untouched.

## Deploying

```bash
git checkout main
git pull origin main
```

Unzip on top of your local `pawvy-app` folder, then:

```bash
git add -A
git commit -m "Fix BUTTONS birthday/campaign multiplier to use Singapore timezone, not UTC"
git push origin main
```
