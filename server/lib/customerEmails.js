// Shared email template builders for customer-facing magic links — used by
// both server/routes/customers.js (the real signup/login flow) and
// server/routes/customerAdmin.js (staff manually resending a link).
// Kept separate from lib/customers.js since that file is pure
// data/ledger logic with no knowledge of HTTP requests or HTML.

function baseUrl(req) {
  // Always https — Railway's public URLs always are, and reading the Host
  // header directly avoids depending on Express's `trust proxy` setting
  // (not configured — req.protocol would otherwise report 'http' behind
  // Railway's proxy).
  return `https://${req.get('host')}`;
}

function htmlPage({ title, heading, body, ok }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:-apple-system,'Segoe UI',sans-serif;background:#12151f;color:#f5f2eb;
    display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
  .card{max-width:420px;text-align:center;background:#1a1e2b;border:1px solid #2a2f40;
    border-radius:14px;padding:36px 28px;}
  h1{font-size:22px;margin:0 0 12px;color:${ok ? '#7fc93e' : '#f87171'};}
  p{font-size:14px;line-height:1.6;color:rgba(245,242,235,.75);margin:0;}
</style></head>
<body><div class="card"><h1>${heading}</h1><p>${body}</p></div></body></html>`;
}

// Now that pawvy.co exists (as of the website scaffold), these point there
// instead of this backend's own standalone landing pages — set WEBSITE_URL
// as an env var on this backend (e.g. https://pawvy-website-production.
// up.railway.app, or the real pawvy.co domain once DNS is cut over).
// Falls back to the backend's own GET /verify-link / /login-link pages if
// WEBSITE_URL isn't set, so this never breaks on a deployment that hasn't
// configured it yet — same safety-net principle used elsewhere in this app.
//
// Trailing slash stripped defensively — if WEBSITE_URL is set with one
// (e.g. ".../railway.app/"), naively concatenating it with "/verify"
// produces a double slash ("...app//verify"), which breaks React Router's
// exact-path matching client-side and renders a blank page with no error
// (confirmed live — this exact bug happened in production). Stripping it
// here means the fix holds regardless of how the env var gets set.
function stripTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

// The website's own shop grid — used by the three automated reminder
// emails below (expiry / birthday / campaign), which fire from a cron job
// with no incoming HTTP request to derive a base URL from (unlike
// verify/login/receipt, which always have a `req` in scope). Falls back to
// the real production domain directly rather than the backend's own
// Railway URL, since these are proactive marketing nudges, not
// transactional flows — a customer clicking "shop now" from a reminder
// email always wants pawvy.co, never this backend's own address.
function shopUrl() {
  const target = stripTrailingSlash(process.env.WEBSITE_URL || 'https://pawvy.co');
  return `${target}/shop`;
}

// ── Option 2 "Bold Brand Header" — the approved shared shell ───────
// navy header (wordmark) → orange status band (short, all-caps context
// line) → white content → navy footer. Approved against mockups of all 6
// email types (Verify/Login/Receipt/Enquiry + the two new automated
// reminders) — see the Aug 2026 email-redesign thread.
//
// Colors are the REAL Pawvy brand system, pulled directly from
// pawvy-website/app/globals.css (:root — "Real Pawvy brand system, from
// the brand guideline PDF"), not eyeballed placeholders — matches
// --navy/--orange/--cream exactly so this email renders with the same
// brand colors as the actual site. The footer uses the same navy as the
// header (no separate darker shade), matching how the website's own
// <footer class="site-footer"> does it (background: var(--navy) — see
// globals.css line ~390) — kept in sync rather than inventing a
// email-only variant.
const BRAND_NAVY = '#14213D';
const BRAND_ORANGE = '#F36F4A';
const BRAND_CREAM = '#F5F2EB';

// Logo URL for the email header (Aug 2026, corrected). Originally tried
// as a base64-embedded data URI — that turned out to be wrong: Gmail
// (and several other major clients) deliberately does NOT render
// base64/data-URI images in email at all, confirmed against real
// documentation, not just assumed — Outlook would have shown it, Gmail
// never will, which is exactly the broken-image icon KT saw. Fixed
// properly this time: a real hosted file, served from the backend's own
// Railway domain (server/index.js's /brand-assets static route) — NOT
// pawvy.co, which isn't live yet (the same trap that broke social-share
// image previews before the domain was pointed).
const LOGO_URL = `${process.env.BACKEND_URL || 'https://pawvy-app-production.up.railway.app'}/brand-assets/pawvy-logo-email.png`;

function emailShell({ statusBand, bodyHtml }) {
  // No border-radius/overflow:hidden on the outer table (Aug 2026 fix) —
  // that combination isn't reliably supported across email clients
  // (particularly Gmail/Outlook), and was the actual cause of the thin
  // white lines KT spotted at the navy/orange and white/navy seams: the
  // client fails to clip the rounded corners cleanly and lets slivers of
  // the outer #F2F2F2 background show through at the row boundaries.
  // Plain rectangular corners render correctly everywhere — standard
  // "bulletproof email HTML" practice, not just this app's workaround.
  // color-scheme/supported-color-schemes: helps Apple Mail, Yahoo, and
  // some Outlook versions treat this as an intentional design rather
  // than "unstyled light content to auto-dark-mode." Real but limited —
  // see the [data-ogsc]/[data-ogsb] block below for the part that
  // actually matters for Outlook.com/Hotmail specifically.
  //
  // Outlook.com/Hotmail fix (Aug 2026, corrected — the first attempt at
  // this targeted the wrong client entirely; the actual complaint was
  // Outlook/Hotmail, not Gmail): confirmed via real research that
  // Outlook.com uses "full inversion," documented as more aggressive
  // than most other clients — it can flip already-dark sections (like
  // this navy header) back to light too, not just light sections to
  // dark. When Outlook.com inverts an element, it tags that element with
  // its own data-ogsc (original style color) / data-ogsb (original
  // style background) attributes — this is the same mechanism
  // Microsoft's own support docs point to for fighting the inversion
  // back: target those attributes directly with !important, once per
  // section (navy/orange/white), so each keeps its real color
  // regardless of what Outlook tried to do to it. Genuinely can't
  // promise 100% — Microsoft's own forums describe Outlook's dark-mode
  // behavior as "particularly unique" and inconsistent across versions —
  // but this is the real, specifically-targeted technique for this
  // client's actual mechanism, not a generic guess.
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    [data-ogsc] .pv-navy, [data-ogsb] .pv-navy { background-color: ${BRAND_NAVY} !important; color: #ffffff !important; }
    [data-ogsc] .pv-orange, [data-ogsb] .pv-orange { background-color: ${BRAND_ORANGE} !important; color: #ffffff !important; }
    [data-ogsc] .pv-white, [data-ogsb] .pv-white { background-color: #ffffff !important; color: #2B2B2B !important; }
  </style></head>
  <body style="margin:0;padding:0;background:#F2F2F2;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F2;padding:32px 0;">
  <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;">

    <tr>
      <td class="pv-navy" style="background:${BRAND_NAVY};padding:28px 32px;text-align:center;">
        <img src="${LOGO_URL}" width="101" height="32" alt="Pawvy" style="display:inline-block;border:0;" />
      </td>
    </tr>

    <tr>
      <td class="pv-orange" style="background:${BRAND_ORANGE};padding:14px 32px;text-align:center;">
        <span style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;letter-spacing:0.3px;">${statusBand}</span>
      </td>
    </tr>

    <tr>
      <td class="pv-white" style="background:#ffffff;padding:32px;">
        ${bodyHtml}
      </td>
    </tr>

    <tr>
      <td class="pv-navy" style="background:${BRAND_NAVY};padding:24px 32px;text-align:center;">
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:12px;color:#B9C2D6;">Pawvy Limited Partnership &middot; Singapore</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#8A96AF;">You're receiving this because you have a Pawvy account.</p>
      </td>
    </tr>

  </table>
  </td></tr>
  </table>
  </body></html>`;
}

function ctaButtonHtml(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr><td align="center" style="background:${BRAND_ORANGE};border-radius:6px;">
      <a href="${href}" style="display:inline-block;padding:13px 32px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a>
    </td></tr>
  </table>`;
}

function buildVerifyEmail(baseUrlStr, customer, token) {
  const target = stripTrailingSlash(process.env.WEBSITE_URL || baseUrlStr);
  const path = process.env.WEBSITE_URL ? '/verify' : '/api/customers/verify-link';
  const link = `${target}${path}?token=${token}`;
  const text = `Hi ${customer.name || 'there'},\n\nWelcome to Pawvy! Confirm your account to activate your 150 BUTTONS signup bonus:\n${link}\n\nThis link expires in 14 days.`;
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${BRAND_NAVY};">Welcome to Pawvy, ${customer.name || 'there'}!</h1>
    <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#2B2B2B;">
      Confirm your account to activate your <strong style="color:${BRAND_NAVY};">150 BUTTONS</strong> signup bonus.
    </p>
    ${ctaButtonHtml('Activate my account', link)}
    <p style="margin:24px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#9AA3B2;text-align:center;">This link expires in 14 days.</p>
  `;
  const html = emailShell({ statusBand: 'ACTIVATE YOUR ACCOUNT', bodyHtml });
  return { subject: 'Activate your Pawvy account', text, html };
}

function buildLoginEmail(baseUrlStr, customer, token) {
  const target = stripTrailingSlash(process.env.WEBSITE_URL || baseUrlStr);
  const path = process.env.WEBSITE_URL ? '/login-verify' : '/api/customers/login-link';
  const link = `${target}${path}?token=${token}`;
  const text = `Hi ${customer.name || 'there'},\n\nHere's your Pawvy login link:\n${link}\n\nThis link expires in 15 minutes and can only be used once.`;
  // Deliberately the sparest of the six — a short-lived, one-time link is
  // not a "delight" moment, so the body skips the usual warm framing
  // rather than manufacturing enthusiasm for a utility email. Confirmed
  // okay with KT against the original 4-type mockup pass.
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${BRAND_NAVY};">Your login link</h1>
    <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#2B2B2B;">
      Hi ${customer.name || 'there'}, click below to log in to your Pawvy account.
    </p>
    ${ctaButtonHtml('Log in to Pawvy', link)}
    <p style="margin:24px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#9AA3B2;text-align:center;">This link expires in 15 minutes and can only be used once.</p>
  `;
  const html = emailShell({ statusBand: 'YOUR LOGIN LINK', bodyHtml });
  return { subject: 'Your Pawvy login link', text, html };
}

// Order receipt — sent once a website order is actually paid (see the
// webhook handler in routes/checkout.js).
function buildReceiptEmail(order, items) {
  const lines = items.map(i => `  ${i.qty}x ${i.brand_name} — ${i.item_series}${i.variation ? ' · ' + i.variation : ''} — $${(i.unit_price * i.qty).toFixed(2)}`);
  const itemsText = lines.join('\n');
  const itemsRowsHtml = items.map(i => `
    <tr>
      <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#2B2B2B;">${i.qty}x ${i.brand_name} — ${i.item_series}${i.variation ? ' · ' + i.variation : ''}</td>
      <td align="right" style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#2B2B2B;white-space:nowrap;">$${(i.unit_price * i.qty).toFixed(2)}</td>
    </tr>`).join('');

  const redemptionLine = order.buttons_redemption_value > 0
    ? `\nBUTTONS redeemed (${order.buttons_redeemed}B): -$${order.buttons_redemption_value.toFixed(2)}` : '';
  const redemptionHtml = order.buttons_redemption_value > 0
    ? `<tr><td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:${BRAND_ORANGE};">BUTTONS redeemed (${order.buttons_redeemed}B)</td><td align="right" style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:${BRAND_ORANGE};">-$${order.buttons_redemption_value.toFixed(2)}</td></tr>` : '';

  const text = `Hi ${order.customer_name || 'there'},\n\nThanks for your order! Here's your receipt:\n\n${itemsText}\n\nSubtotal: $${order.subtotal.toFixed(2)}\nShipping: $${order.shipping_amount.toFixed(2)}${redemptionLine}\nTotal paid: $${order.total_amount.toFixed(2)}\n\nWe'll get this packed and shipped soon. Thanks for shopping with Pawvy!`;
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${BRAND_NAVY};">Thanks for your order, ${order.customer_name || 'there'}!</h1>
    <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#2B2B2B;">Here's your receipt for your order.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${itemsRowsHtml}
      <tr><td colspan="2" style="border-top:1px solid #EEE;padding-top:10px;"></td></tr>
      <tr><td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B7280;">Subtotal</td><td align="right" style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B7280;">$${order.subtotal.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B7280;">Shipping</td><td align="right" style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B7280;">$${order.shipping_amount.toFixed(2)}</td></tr>
      ${redemptionHtml}
      <tr><td style="padding:10px 0 0;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:${BRAND_NAVY};">Total paid</td><td align="right" style="padding:10px 0 0;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:${BRAND_NAVY};">$${order.total_amount.toFixed(2)}</td></tr>
    </table>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">We'll get this packed and shipped soon. Thanks for shopping with Pawvy!</p>
  `;
  const html = emailShell({ statusBand: 'ORDER CONFIRMED', bodyHtml });
  return { subject: `Your Pawvy order #${order.id} is confirmed`, text, html };
}

// Contact-form confirmation — moved here from being inline in
// routes/enquiries.js so all 6 customer email types share the one
// template shell in one place.
function buildEnquiryEmail(name) {
  const text = `Thanks for reaching out! We've received your message and will get back to you soon.`;
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${BRAND_NAVY};">We got your message${name ? ', ' + name : ''}!</h1>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#2B2B2B;">
      Thanks for reaching out — we've received your message and will get back to you soon.
    </p>
  `;
  const html = emailShell({ statusBand: 'MESSAGE RECEIVED', bodyHtml });
  return { subject: 'We got your message — Pawvy', text, html };
}

// ── BUTTONS expiry reminder ─────────────────────────────────────────
// One rollup email per customer per day (never one email per batch — see
// server/jobs/customerReminders.js for the dedup/trigger rules), showing
// the top 3 soonest-expiring batches. `batches` is expected pre-sorted
// ascending by expires_at and already limited to 3 by the caller — this
// function is pure rendering, same division of responsibility as
// buildReceiptEmail (job/route does the query, this just formats it).
function buildButtonsExpiryEmail(customer, batches) {
  const rowsText = batches.map(b =>
    `  ${new Date(b.expires_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })} — ${b.amount} BUTTONS`
  ).join('\n');
  const totalExpiring = batches.reduce((sum, b) => sum + b.amount, 0);
  const text = `Hi ${customer.name || 'there'},\n\nSome of your BUTTONS are expiring soon:\n${rowsText}\n\nCheck out the new, exciting products on Pawvy.co now: ${shopUrl()}`;

  const rowsHtml = batches.map(b => {
    const daysLeft = Math.max(0, Math.ceil((new Date(b.expires_at) - Date.now()) / (24 * 60 * 60 * 1000)));
    const dateStr = new Date(b.expires_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' });
    return `
      <tr>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:${BRAND_NAVY};font-weight:bold;">${dateStr} <span style="font-weight:normal;color:#9AA3B2;font-size:12px;">(in ${daysLeft} day${daysLeft === 1 ? '' : 's'})</span></td>
        <td align="right" style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:${BRAND_ORANGE};">${b.amount} BUTTONS</td>
      </tr>`;
  }).join('');

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${BRAND_NAVY};">Your BUTTONS are about to expire</h1>
    <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#2B2B2B;">
      Hi ${customer.name || 'there'}, a heads up before they're gone — some of your BUTTONS are expiring soon. Check out the new, exciting products on <a href="${shopUrl().replace('/shop','')}" style="color:${BRAND_ORANGE};font-weight:bold;text-decoration:underline;">Pawvy.co</a> now.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_CREAM};border:1px solid #F0DFCB;border-radius:8px;margin-bottom:20px;">
      <tr><td style="padding:20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
      </td></tr>
    </table>
    <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">
      That's <strong style="color:${BRAND_NAVY};">${totalExpiring} BUTTONS</strong> — worth up to <strong style="color:${BRAND_NAVY};">$${(totalExpiring * 0.02).toFixed(2)} off</strong> your next order (BUTTONS can cover up to 30% of your order total).
    </p>
    ${ctaButtonHtml('Shop now and use your BUTTONS', shopUrl())}
  `;
  const html = emailShell({ statusBand: 'BUTTONS EXPIRING SOON', bodyHtml });
  return { subject: 'Your BUTTONS are expiring soon', text, html };
}

// ── Birthday-month reminder ─────────────────────────────────────────
// Fires once per calendar year, tied to the primary pet's birthday month
// (see getActiveMultiplierDetail in lib/buttons.js for the same
// birthday-month check used at earn time — this email is purely
// informational and never itself grants the bonus).
function buildBirthdayEmail(customer, pet) {
  const petName = pet?.name || 'your pet';
  const monthLabel = new Date(`${pet.birthday}T00:00:00`).toLocaleDateString('en-SG', { month: 'long', timeZone: 'Asia/Singapore' });
  const text = `Hi ${customer.name || 'there'},\n\nIt's ${petName}'s birthday month! You'll earn 1.5x BUTTONS on every order this month (unless a bigger campaign is running, in which case you get whichever is higher).\n\nShop now: ${shopUrl()}`;
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${BRAND_NAVY};">It's ${petName}'s birthday month! 🎂</h1>
    <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#2B2B2B;">
      Hi ${customer.name || 'there'}, ${petName} turns another year older this ${monthLabel} — and that means bonus BUTTONS on every order, all month long.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_CREAM};border:1px solid #F0DFCB;border-radius:8px;margin-bottom:20px;">
      <tr><td style="padding:20px 24px;text-align:center;">
        <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:13px;color:#6B7280;">Birthday bonus</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:20px;font-weight:bold;color:${BRAND_ORANGE};">1.5&times; BUTTONS on every order in ${monthLabel}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">
      Treat ${petName} to something nice this month — the extra BUTTONS land in your account automatically at checkout.
    </p>
    ${ctaButtonHtml(`Shop ${petName}'s birthday picks`, shopUrl())}
  `;
  const html = emailShell({ statusBand: 'BIRTHDAY BONUS', bodyHtml });
  return { subject: `It's ${petName}'s birthday month! 🎂`, text, html };
}

// ── Active-campaign reminder ─────────────────────────────────────────
// `campaign` is a row from the campaigns table (name/multiplier/scope/
// scope_value/end_date). Channel wording is derived from scope so a
// POS-only or Website-only campaign never claims to apply somewhere it
// doesn't — see server/jobs/customerReminders.js for why this fires for
// every scope, not just website-facing ones (KT: POS/event campaigns like
// Pet Expo still deserve the reminder, worded correctly for that channel).
function campaignChannelLabel(campaign) {
  if (campaign.scope !== 'channel') return 'storewide — on our website and at POS/event sales';
  return campaign.scope_value === 'pos' ? 'at our POS / event sales' : 'on our website';
}

function buildCampaignEmail(customer, campaign) {
  const channelLabel = campaignChannelLabel(campaign);
  const endDateStr = new Date(`${campaign.end_date}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' });
  const text = `Hi ${customer.name || 'there'},\n\n"${campaign.name}" is live — earn ${campaign.multiplier}x BUTTONS ${channelLabel} until ${endDateStr}.\n\nShop now: ${shopUrl()}`;
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${BRAND_NAVY};">${campaign.name} is live</h1>
    <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#2B2B2B;">
      Hi ${customer.name || 'there'}, for a limited time you'll earn <strong>${campaign.multiplier}&times; BUTTONS</strong> ${channelLabel}.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_CREAM};border:1px solid #F0DFCB;border-radius:8px;margin-bottom:20px;">
      <tr><td style="padding:20px 24px;text-align:center;">
        <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:13px;color:#6B7280;">Campaign ends</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:20px;font-weight:bold;color:${BRAND_ORANGE};">${endDateStr}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">
      Applies automatically ${channelLabel} — no code needed.
    </p>
    ${ctaButtonHtml('Shop the campaign', shopUrl())}
  `;
  const html = emailShell({ statusBand: campaign.name.toUpperCase(), bodyHtml });
  return { subject: `${campaign.name} is live — earn ${campaign.multiplier}× BUTTONS`, text, html };
}

module.exports = {
  baseUrl, htmlPage,
  buildVerifyEmail, buildLoginEmail, buildReceiptEmail, buildEnquiryEmail,
  buildButtonsExpiryEmail, buildBirthdayEmail, buildCampaignEmail,
  shopUrl, campaignChannelLabel,
};
