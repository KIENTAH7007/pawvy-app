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

// ── Internal email (Gmail SMTP via app password) ──────────────────
// Needs GMAIL_USER, GMAIL_APP_PASSWORD, and NOTIFY_EMAIL_TO
// (comma-separated recipients) set as Railway environment variables.
//
// NOTE (Patch 102): confirmed Railway's Hobby plan blocks all outbound SMTP
// (25/465/587/2525) — so notifyEmail and notifyBackupEmail below are known
// to currently fail silently in production, same as they always have. Left
// on Gmail SMTP deliberately (not migrated to Resend) at KT's call: Resend's
// free tier has a monthly send cap, and it should be reserved for
// customer-facing signup/login email rather than spent on internal alerts —
// Telegram already covers order notifications adequately, and backups can
// wait. If that changes later, migrating these two to the same resendSend()
// pattern used by sendCustomerEmail below is a small, contained change.
let cachedTransport = null;
function getTransport() {
  if (cachedTransport) return cachedTransport;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  cachedTransport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,       // STARTTLS, not implicit SSL
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

// ── Combined: new paid website order (Stripe checkout) ─────────────
// Fired from the webhook handler once payment is actually confirmed — see
// server/routes/checkout.js. Same fire-and-forget shape as
// notifyNewPortalOrder above: independently try/caught, never blocks or
// slows down webhook processing.
function notifyNewWebsiteOrder({ orderId, customerName, customerEmail, total, lines }) {
  const itemLines = lines.map(l => `• ${l.qty}x ${l.name}`).join('\n');
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);
  const who = customerName || customerEmail;

  const telegramText =
    `🐾 *New paid website order!*\n` +
    `From: ${who}\n` +
    `Total: $${total.toFixed(2)}\n` +
    `${lines.length} SKU${lines.length === 1 ? '' : 's'}, ${itemCount} unit${itemCount === 1 ? '' : 's'} total:\n` +
    `${itemLines}\n\n` +
    `Order #${orderId} — already recorded in the Sales Ledger.`;

  const emailSubject = `New paid website order — ${who} ($${total.toFixed(2)})`;
  const emailText =
    `New paid order from ${who} (${customerEmail}).\n\n` +
    `${itemLines}\n\n` +
    `Total: $${total.toFixed(2)}\n` +
    `Order #${orderId} — already recorded in the Sales Ledger, no action needed.`;
  const emailHtml =
    `<p>New paid order from <strong>${who}</strong> (${customerEmail}).</p>` +
    `<ul>${lines.map(l => `<li>${l.qty}x ${l.name}</li>`).join('')}</ul>` +
    `<p>Total: $${total.toFixed(2)}</p>` +
    `<p>Order #${orderId} — already recorded in the Sales Ledger, no action needed.</p>`;

  Promise.all([
    notifyTelegram(telegramText),
    notifyEmail(emailSubject, emailText, emailHtml),
  ]).catch(err => console.error('⚠️  notifyNewWebsiteOrder error:', err.message));
}

// ── Customer-facing email (magic links) — Resend HTTP API ──────────
// Unlike the internal functions above (left on blocked Gmail SMTP, see
// note there), customer email uses Resend's HTTPS API, which isn't
// affected by Railway's SMTP port block. This is the one path that
// actually needs to work reliably — account verification and login.
const RESEND_API_URL = 'https://api.resend.com/emails';

async function resendSend({ from, to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, skipped: true, reason: 'RESEND_API_KEY not set' };
  }
  const resp = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, text, html }),
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    const err = new Error(`Resend API error ${resp.status}: ${errBody}`);
    err.code = resp.status;
    throw err;
  }
  return resp.json();
}

async function sendCustomerEmail(to, subject, text, html) {
  try {
    const result = await resendSend({ from: 'Pawvy <buttons@hello.pawvy.co>', to, subject, text, html });
    if (result.skipped) {
      console.log(`ℹ️  Customer email skipped (${result.reason}) — would have sent "${subject}" to ${to}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`⚠️  Customer email send error (to ${to}) [${err.code || 'unknown'}]:`, err.message);
    return false;
  }
}

// ── Debug helper: test-send that surfaces the real error ───────────
// Unlike sendCustomerEmail above (which intentionally swallows errors so a
// Resend outage never breaks a real signup), this lets the error propagate
// to the caller — used only by the staff-only test-email admin endpoint,
// for fast connectivity debugging without digging through Railway logs.
async function sendTestEmail(to) {
  if (!process.env.RESEND_API_KEY) {
    const err = new Error('RESEND_API_KEY not set on this deployment.');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  return resendSend({
    from: 'Pawvy <buttons@hello.pawvy.co>',
    to,
    subject: 'Pawvy test email',
    text: 'If you got this, the Resend connection is working.',
    html: '<p>If you got this, the Resend connection is working.</p>',
  });
}

module.exports = { notifyTelegram, notifyEmail, notifyBackupEmail, notifyNewPortalOrder, notifyNewWebsiteOrder, sendCustomerEmail, sendTestEmail };
