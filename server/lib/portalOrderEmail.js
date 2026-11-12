const { sendCustomerEmail } = require('../utils/notify');

// Emailed copy of an Order Portal submission, sent to the (optional) address the partner typed.
//
// Deliberately a NEW, separate module: it only CALLS the existing sendCustomerEmail() (the same
// Resend sender the customer verification emails use) and changes nothing about it. Fire-and-forget
// from routes/portal.js AFTER the order is saved — sendCustomerEmail swallows its own errors, so a
// failed/blocked email can never undo or slow down an order.
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function sendPortalOrderCopy({ to, companyName, market, notes, lines, subtotal }) {
  const sym = market === 'MY' ? 'RM' : 'S$';
  const m = (n) => `${sym}${Number(n).toFixed(2)}`;
  const subject = "We've received your order, thank you!";

  const text =
    `We've received your order, thank you!\n\n` +
    `Hi ${companyName}, here is your order list for reference.\n\n` +
    lines.map(l => `- ${l.name} x ${l.qty} @ ${m(l.unit)} = ${m(l.unit * l.qty)}`).join('\n') +
    `\n\nSubtotal: ${m(subtotal)}\n` +
    (notes ? `\nNotes: ${notes}\n` : '') +
    `\nFinal prices, applicable discounts and any delivery fee will be reflected in your invoice. We'll be in touch shortly.\n\n` +
    `Pawvy - This is an automated email. Please don't reply to it.`;

  const rows = lines.map(l =>
    `<tr><td style="padding:7px 4px;border-bottom:1px solid #ddd6c8">${esc(l.name)}</td>` +
    `<td style="padding:7px 4px;border-bottom:1px solid #ddd6c8;text-align:center">${l.qty}</td>` +
    `<td style="padding:7px 4px;border-bottom:1px solid #ddd6c8;text-align:right">${m(l.unit)}</td>` +
    `<td style="padding:7px 4px;border-bottom:1px solid #ddd6c8;text-align:right">${m(l.unit * l.qty)}</td></tr>`
  ).join('');

  const html =
    `<div style="max-width:560px;margin:0 auto;background:#f4f1ea;color:#1c2540;font-family:Arial,Helvetica,sans-serif;font-size:13px;border-radius:12px;overflow:hidden">` +
    `<div style="background:#14213d;color:#ffffff;padding:16px 20px;font-weight:800;letter-spacing:2px">PAWVY</div>` +
    `<div style="padding:20px">` +
    `<div style="font-size:16px;font-weight:700">We've received your order, thank you!</div>` +
    `<div style="margin-top:6px;color:#556">Hi ${esc(companyName)}, here is your order list for reference.</div>` +
    `<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin:14px 0">` +
    `<tr><th style="text-align:left;padding:7px 4px;border-bottom:1px solid #ddd6c8">Item</th><th style="padding:7px 4px;border-bottom:1px solid #ddd6c8">Qty</th>` +
    `<th style="text-align:right;padding:7px 4px;border-bottom:1px solid #ddd6c8">Price</th><th style="text-align:right;padding:7px 4px;border-bottom:1px solid #ddd6c8">Total</th></tr>` +
    rows +
    `<tr><td colspan="3" style="padding:8px 4px"><strong>Subtotal</strong></td><td style="padding:8px 4px;text-align:right"><strong>${m(subtotal)}</strong></td></tr></table>` +
    (notes ? `<div style="background:#ffffff;border:1px solid #ddd;border-radius:10px;padding:10px 14px;font-size:12px;color:#445;margin-bottom:12px"><strong>Notes:</strong> ${esc(notes)}</div>` : '') +
    `<div style="font-size:12px;color:#556;line-height:1.55">Final prices, applicable discounts and any delivery fee will be reflected in your invoice. We'll be in touch shortly.</div>` +
    `<div style="margin-top:14px;font-size:11px;color:#889">Pawvy · This is an automated email. Please don't reply to it.</div>` +
    `</div></div>`;

  return sendCustomerEmail(to, subject, text, html);
}

module.exports = { sendPortalOrderCopy };
