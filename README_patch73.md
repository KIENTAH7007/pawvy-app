# Patch 73 — Telegram + Email notifications on new Order Portal orders

New files: `server/utils/notify.js`
Modified: `server/routes/portal.js`, `package.json`, `package-lock.json` (added `nodemailer`)

The existing "1, 2, 3…" Pending Orders badge is untouched — this adds a
push notification alongside it, fired the moment a customer submits an
order through the Order Portal.

## What happens now

When a new Order Portal order comes in, both KT and Janice get:
- A **Telegram message** listing the company, items, quantities, and any
  notes.
- An **email** (to KTHELAND@hotmail.com and janicelee@pawvy.co) with the
  same info.

Both fire in parallel and are fully independent — if Telegram is down, the
email still sends and vice versa. Neither can ever block or fail the actual
order submission; if credentials aren't set at all, both channels just log
a quiet "skipped" message and the order goes through completely normally.
This was specifically tested (see below).

## Setup required — two things only you can do

I can't create your Telegram bot or your Gmail app password for you (they
require your own accounts). Here's exactly what to do:

### 1. Telegram bot (~5 minutes, free forever)

1. Open Telegram, search for **`@BotFather`**, start a chat with it.
2. Send `/newbot`. Follow the prompts — give it any display name (e.g.
   "Pawvy Order Alerts") and a username ending in `bot` (e.g.
   `PawvyOrderAlertsBot`).
3. BotFather replies with a **token** that looks like
   `123456789:ABCdefGhIJKlmNoPQRstuVwxYZ`. This is your `TELEGRAM_BOT_TOKEN`.
4. **Both you and Janice** need to search for the bot's username in Telegram
   and send it any message (e.g. "hi") — this is how each of you registers
   to receive messages from it.
5. To find each person's chat ID: after each of you has messaged the bot,
   open this URL in a browser (replace `<TOKEN>` with your real token):
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   Look for `"chat":{"id":123456789,...}` in the response — that number is
   that person's chat ID. Do this once per person.
6. Combine both chat IDs, comma-separated, no spaces — that's
   `TELEGRAM_CHAT_IDS`.

### 2. Gmail app password (~2 minutes)

1. Sign in to [myaccount.google.com](https://myaccount.google.com) as
   `janicelee@pawvy.co`.
2. Under Security, make sure **2-Step Verification** is turned on (required
   for app passwords — turn it on first if it isn't already).
3. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
4. Create a new app password (name it "Pawvy App" or similar). Google shows
   you a 16-character password once — copy it immediately, you can't view
   it again later (though you can always generate a new one).
5. That 16-character password is your `GMAIL_APP_PASSWORD`.

If your Workspace admin console has SMTP/IMAP access restricted org-wide,
app passwords may still be blocked even with 2-Step Verification on — if
you hit an auth error after setting this up, that's the first thing to
check in the Workspace admin console.

### 3. Set these in Railway

In your Railway project → Variables, add:

| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the token from BotFather |
| `TELEGRAM_CHAT_IDS` | both chat IDs, comma-separated |
| `GMAIL_USER` | `janicelee@pawvy.co` |
| `GMAIL_APP_PASSWORD` | the 16-character app password |
| `NOTIFY_EMAIL_TO` | `KTHELAND@hotmail.com,janicelee@pawvy.co` |

None of these are ever typed into the app itself or seen by me — they live
only as Railway environment variables, read directly by the server at
runtime.

## Testing performed

- Full end-to-end test in a sandbox: seeded real products/stock, submitted
  a real order through `/api/portal/orders` with **no** notification env
  vars set — confirmed the order saved successfully and both channels
  logged a clean "skipped" message rather than erroring.
- Confirmed message formatting directly — company name, itemized
  qty × product name lines, and notes all render correctly.
- Set a deliberately fake Telegram token/chat IDs and called the send
  function directly — confirmed a failed/unreachable send **never throws**,
  it logs a warning and resolves normally. This proves a bad token or a
  Telegram/Gmail outage can never take down order submission.
- **Note:** I can't fully verify live delivery to real Telegram/Gmail from
  my sandbox (no outbound network access to those services from here) —
  once you've set the real environment variables in Railway and deployed,
  submit a real test order through the Order Portal to confirm both
  messages actually arrive on your phones/inboxes.

## Apply

```
git add -A
git commit -m "Patch 73: Telegram + email notifications for new Order Portal orders"
git push origin main
```

No database migration needed. After deploying, don't forget to set the
five environment variables above in Railway — without them, the app runs
completely normally, just without notifications (as tested).
