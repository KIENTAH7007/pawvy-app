# Pawvy App — patch: Instagram handle required for profile-completion bonus

## What changed
**`server/lib/profileCompletion.js`**
- Added `REQUIRED_CUSTOMER_FIELDS = ['preferred_contact_channel', 'instagram_handle']`
- `isProfileComplete()` now checks both customer-level required fields (previously only
  `preferred_contact_channel`), plus the existing 7 primary-pet fields
- `instagram_handle` is now mandatory (alongside preferred contact channel) to earn the
  one-time 50B profile-completion bonus
- No schema change needed — `customers.instagram_handle` and the account-page form field
  already existed from an earlier patch
- `profile_bonus_claimed` still protects anyone who already earned the bonus — this only
  raises the bar for customers who haven't completed their profile yet

Syntax-checked with `node --check`. No other files reference the old field list.

## How to apply
```bash
git checkout main
git pull origin main
# unzip this file, "Copy and Replace" when prompted
git add -A
git commit -m "Require Instagram handle for profile-completion BUTTONS bonus"
git push origin main
```
Railway auto-deploys from `main` on push.
