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

function buildVerifyEmail(baseUrlStr, customer, token) {
  const target = stripTrailingSlash(process.env.WEBSITE_URL || baseUrlStr);
  const path = process.env.WEBSITE_URL ? '/verify' : '/api/customers/verify-link';
  const link = `${target}${path}?token=${token}`;
  const text = `Hi ${customer.name || 'there'},\n\nWelcome to Pawvy! Confirm your account to activate your 150 BUTTONS signup bonus:\n${link}\n\nThis link expires in 14 days.`;
  const html = `<p>Hi ${customer.name || 'there'},</p><p>Welcome to Pawvy! Confirm your account to activate your <strong>150 BUTTONS</strong> signup bonus:</p><p><a href="${link}">${link}</a></p><p style="color:#888;font-size:12px;">This link expires in 14 days.</p>`;
  return { subject: 'Activate your Pawvy account', text, html };
}

function buildLoginEmail(baseUrlStr, customer, token) {
  const target = stripTrailingSlash(process.env.WEBSITE_URL || baseUrlStr);
  const path = process.env.WEBSITE_URL ? '/login-verify' : '/api/customers/login-link';
  const link = `${target}${path}?token=${token}`;
  const text = `Hi ${customer.name || 'there'},\n\nHere's your Pawvy login link:\n${link}\n\nThis link expires in 15 minutes and can only be used once.`;
  const html = `<p>Hi ${customer.name || 'there'},</p><p>Here's your Pawvy login link:</p><p><a href="${link}">${link}</a></p><p style="color:#888;font-size:12px;">This link expires in 15 minutes and can only be used once.</p>`;
  return { subject: 'Your Pawvy login link', text, html };
}

// Order receipt — sent once a website order is actually paid (see the
// webhook handler in routes/checkout.js). Deliberately plain-text-forward,
// matching the other customer emails here rather than an elaborate HTML
// invoice — this is a confirmation, not a tax document.
function buildReceiptEmail(order, items) {
  const lines = items.map(i => `  ${i.qty}x ${i.brand_name} — ${i.item_series}${i.variation ? ' · ' + i.variation : ''} — $${(i.unit_price * i.qty).toFixed(2)}`);
  const itemsText = lines.join('\n');
  const itemsHtml = items.map(i => `<li>${i.qty}x ${i.brand_name} — ${i.item_series}${i.variation ? ' · ' + i.variation : ''} — $${(i.unit_price * i.qty).toFixed(2)}</li>`).join('');

  const redemptionLine = order.buttons_redemption_value > 0
    ? `\nBUTTONS redeemed (${order.buttons_redeemed}B): -$${order.buttons_redemption_value.toFixed(2)}` : '';
  const redemptionHtml = order.buttons_redemption_value > 0
    ? `<p>BUTTONS redeemed (${order.buttons_redeemed}B): -$${order.buttons_redemption_value.toFixed(2)}</p>` : '';

  const text = `Hi ${order.customer_name || 'there'},\n\nThanks for your order! Here's your receipt for Order #${order.id}:\n\n${itemsText}\n\nSubtotal: $${order.subtotal.toFixed(2)}\nShipping: $${order.shipping_amount.toFixed(2)}${redemptionLine}\nTotal paid: $${order.total_amount.toFixed(2)}\n\nWe'll get this packed and shipped soon. Thanks for shopping with Pawvy!`;
  const html = `<p>Hi ${order.customer_name || 'there'},</p><p>Thanks for your order! Here's your receipt for <strong>Order #${order.id}</strong>:</p><ul>${itemsHtml}</ul><p>Subtotal: $${order.subtotal.toFixed(2)}<br>Shipping: $${order.shipping_amount.toFixed(2)}</p>${redemptionHtml}<p><strong>Total paid: $${order.total_amount.toFixed(2)}</strong></p><p>We'll get this packed and shipped soon. Thanks for shopping with Pawvy!</p>`;
  return { subject: `Your Pawvy order #${order.id} is confirmed`, text, html };
}

module.exports = { baseUrl, htmlPage, buildVerifyEmail, buildLoginEmail, buildReceiptEmail };
