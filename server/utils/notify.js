const nodemailer = require('nodemailer');

// ── Telegram ──────────────────────────────────────────────────────
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_IDS (comma-separated, one
// per recipient) set as Railway environment variables. Uses Node's
// built-in fetch — no extra dependency needed.
async function notifyTelegram(text) {
  const token   = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!token || chatIds.length === 0) {
    console.log('ℹ️  Telegram notification skipped — TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_IDS not set.');
    return;
  }

  await Promise.all(chatIds.map(async (chatId) => {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        console.error(`⚠️  Telegram send failed for chat ${chatId}: ${resp.status} ${body}`);
      }
    } catch (err) {
      // Never let a notification failure affect the caller (e.g. order submission)
      console.error(`⚠️  Telegram send error for chat ${chatId}:`, err.message);
    }
  }));
}

// ── Email (Gmail SMTP via app password) ──────────────────────────
// Needs GMAIL_USER, GMAIL_APP_PASSWORD, and NOTIFY_EMAIL_TO
// (comma-separated recipients) set as Railway environment variables.
//
// Uses explicit host/port/STARTTLS config rather than the `service: 'gmail'`
// shorthand. That shorthand connects via port 465 (implicit SSL) — which
// timed out entirely in production (confirmed: even the existing daily
// backup email, unrelated to anything added in Patch 99, has never
// actually arrived either). Port 587 with STARTTLS is the more commonly
// allowed outbound path on containerized hosts, so switching to it is the
// fix being tried here. Timeouts are also shortened from nodemailer's
// defaults (which run to several minutes) to ~15s, so a real network block
// fails fast and visibly in the logs instead of hanging silently.
let cachedTransport = null;
function getTransport() {
  if (cachedTransport) return cachedTransport;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  cachedTransport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,       // STARTTLS, not implicit SSL — see note above
    requireTLS: true,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  });
  return cachedTransport;
}

async function notifyEmail(subject, text, html) {
  const to = process.env.NOTIFY_EMAIL_TO;
  const transport = getTransport();

  if (!transport || !to) {
    console.log('ℹ️  Email notification skipped — GMAIL_USER / GMAIL_APP_PASSWORD / NOTIFY_EMAIL_TO not set.');
    return;
  }

  try {
    await transport.sendMail({
      from: `"Pawvy Order Alerts" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error(`⚠️  Email send error [${err.code || 'unknown'}]:`, err.message);
  }
}

// ── Database backup email (separate recipient from order/digest alerts) ──
// Deliberately its own function/recipient (BACKUP_EMAIL_TO) rather than
// reusing NOTIFY_EMAIL_TO — per request, backups go to a dedicated inbox
// so they don't clutter the main business inbox.
async function notifyBackupEmail(subject, text, attachmentPath, attachmentName) {
  const to = process.env.BACKUP_EMAIL_TO;
  const transport = getTransport();

  if (!transport || !to) {
    console.log('ℹ️  Backup email skipped — GMAIL_USER / GMAIL_APP_PASSWORD / BACKUP_EMAIL_TO not set.');
    return false;
  }

  try {
    await transport.sendMail({
      from: `"Pawvy Backups" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
      attachments: [{ filename: attachmentName, path: attachmentPath }],
    });
    return true;
  } catch (err) {
    console.error(`⚠️  Backup email send error [${err.code || 'unknown'}]:`, err.message);
    return false;
  }
}

// ── Combined: new Order Portal submission ─────────────────────────
// Fire-and-forget from the caller's perspective — both channels are
// independently try/caught above, so a Telegram or email outage never
// blocks or slows down the actual order submission response.
function notifyNewPortalOrder({ orderId, companyName, notes, lines }) {
  const itemLines = lines.map(l => `• ${l.qty}x ${l.name}`).join('\n');
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);

  const telegramText =
    `🐾 *New Order Portal order!*\n` +
    `Company: ${companyName}\n` +
    `${lines.length} SKU${lines.length === 1 ? '' : 's'}, ${itemCount} unit${itemCount === 1 ? '' : 's'} total:\n` +
    `${itemLines}` +
    (notes ? `\nNotes: ${notes}` : '') +
    `\n\nReview in Pending Orders → Pawvy App.`;

  const emailSubject = `New Order Portal submission — ${companyName}`;
  const emailText =
    `New order received from ${companyName}.\n\n` +
    `${itemLines}` +
    (notes ? `\n\nNotes: ${notes}` : '') +
    `\n\nOrder #${orderId} — review and approve it in Pending Orders.`;
  const emailHtml =
    `<p>New order received from <strong>${companyName}</strong>.</p>` +
    `<ul>${lines.map(l => `<li>${l.qty}x ${l.name}</li>`).join('')}</ul>` +
    (notes ? `<p><em>Notes: ${notes}</em></p>` : '') +
    `<p>Order #${orderId} — review and approve it in Pending Orders.</p>`;

  // Deliberately not awaited by the caller — see notifyNewPortalOrder usage in portal.js.
  Promise.all([
    notifyTelegram(telegramText),
    notifyEmail(emailSubject, emailText, emailHtml),
  ]).catch(err => console.error('⚠️  notifyNewPortalOrder error:', err.message));
}

// ── Customer-facing email (magic links) ────────────────────────────
// Reuses the same Gmail transport/credentials as the internal notify
// functions above, but sends to a customer-supplied address rather than a
// fixed NOTIFY_EMAIL_TO/BACKUP_EMAIL_TO recipient. Kept as its own function
// (not a generalized version of notifyEmail) so the "from" name is
// customer-facing ("Pawvy") rather than internal ("Pawvy Order Alerts"),
// and so a future swap to a dedicated transactional provider (Resend/Brevo/
// SES) — more appropriate at real customer-email volume than a personal
// Gmail account — only has this one call site to change, not every
// internal notification too.
async function sendCustomerEmail(to, subject, text, html) {
  const transport = getTransport();
  if (!transport) {
    console.log(`ℹ️  Customer email skipped (GMAIL_USER/GMAIL_APP_PASSWORD not set) — would have sent "${subject}" to ${to}`);
    return false;
  }
  try {
    await transport.sendMail({
      from: `"Pawvy" <${process.env.GMAIL_USER}>`,
      to, subject, text, html,
    });
    return true;
  } catch (err) {
    console.error(`⚠️  Customer email send error (to ${to}) [${err.code || 'unknown'}]:`, err.message);
    return false;
  }
}

// ── Debug helper: test-send that surfaces the real error ───────────
// Unlike sendCustomerEmail above (which intentionally swallows errors so a
// Gmail outage never breaks a real signup), this lets the error propagate
// to the caller — used only by the staff-only test-email admin endpoint,
// for fast connectivity debugging without digging through Railway logs.
async function sendTestEmail(to) {
  const transport = getTransport();
  if (!transport) {
    const err = new Error('GMAIL_USER / GMAIL_APP_PASSWORD not set on this deployment.');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  return transport.sendMail({
    from: `"Pawvy" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Pawvy test email',
    text: 'If you got this, the Gmail connection is working.',
    html: '<p>If you got this, the Gmail connection is working.</p>',
  });
}

module.exports = { notifyTelegram, notifyEmail, notifyBackupEmail, notifyNewPortalOrder, sendCustomerEmail, sendTestEmail };
