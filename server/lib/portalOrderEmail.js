const path = require('path');
const PDFDocument = require('pdfkit');
const { resendSend } = require('../utils/notify');
const { getObjectStream } = require('./bucket');
const { trimmedSquare } = require('./imageTrim');
let sharp = null; try { sharp = require('sharp'); } catch (e) { /* thumbnails simply skipped */ }

// Order Portal: the partner's emailed copy of their order — an invoice-style email plus the SAME
// document as an attached PDF (and the ORDER SENT screen offers that PDF as "Download PDF").
//
// Separate module on purpose: it only ADDS things. The existing customer emails are untouched.
// Everything here is best-effort — a failed thumbnail, PDF or email never affects the order.
const NAVY = '#14213d', ORANGE = '#f36f4a';
const BASE_URL = process.env.BACKEND_URL || 'https://pawvy-app-production.up.railway.app';
const LOGO_FILE = path.join(__dirname, '..', '..', 'public-assets', 'pawvy-logo-email.png');
const PAWVY = {
  name: 'Pawvy Limited Partnership',
  address: ['39 Woodlands Close', 'Mega@Woodlands, #05-58, Unit 1H', 'Singapore 737856'],
  email: 'janicelee@pawvy.co',
};

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cur = (market) => (market === 'MY' ? 'RM' : 'SGD');   // what people read; the data code stays MYR
const money = (market, n) => `${cur(market)} ${Number(n).toFixed(2)}`;

function keyOf(imageUrl) {
  return imageUrl && imageUrl.startsWith('/api/uploads/') ? imageUrl.replace(/^\/api\/uploads\//, '') : null;
}
// Absolute URL for the email's thumbnail (same trimmed 600px copy the Website uses).
function thumbUrl(imageUrl) {
  const k = keyOf(imageUrl);
  return k ? `${BASE_URL}/api/uploads/${k}?trim=1&w=600` : null;
}

// Small JPEG thumbnail for the PDF, from the same trimmed copy. null on any problem.
async function loadThumb(imageUrl) {
  const key = keyOf(imageUrl);
  if (!key || !sharp) return null;
  try {
    const work = (async () => {
      const obj = await getObjectStream(key);
      const chunks = [];
      for await (const c of obj.Body) chunks.push(c);
      const sq = await trimmedSquare(Buffer.concat(chunks), key, 600);
      if (!sq || !sq.buf) return null;
      return sharp(sq.buf).resize(120, 120, { fit: 'inside' }).flatten({ background: '#ffffff' }).jpeg({ quality: 78 }).toBuffer();
    })();
    return await Promise.race([work, new Promise(resolve => setTimeout(() => resolve(null), 5000))]);
  } catch (e) { return null; }
}

// ── PDF (A4) — same look as the invoices: navy header, From / Ordered by, item table, footer bar ──
async function buildOrderPdf(d) {
  try {
    const thumbs = new Array(d.lines.length).fill(null);
    for (let i = 0; i < d.lines.length; i += 6) {
      await Promise.all(d.lines.slice(i, i + 6).map(async (l, j) => { thumbs[i + j] = await loadThumb(l.imageUrl); }));
    }
    return await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      const W = 595.28, H = 841.89, X0 = 40, X1 = W - 40;
      const COL = { img: X0, name: X0 + 50, qty: 345, unit: 390, total: 475 };

      const header = () => {
        doc.rect(0, 0, W, 62).fill(NAVY);
        try { doc.image(LOGO_FILE, X0, 15, { height: 32 }); } catch (e) { doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('PAWVY', X0, 22, { lineBreak: false }); }
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19).text('ORDER LIST', 300, 13, { width: X1 - 300, align: 'right', lineBreak: false });
        doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(10).text(d.when, 300, 38, { width: X1 - 300, align: 'right', lineBreak: false });
      };
      const tableHead = (y) => {
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.5);
        doc.text('ITEM', COL.name, y, { lineBreak: false });
        doc.text('QTY', COL.qty, y, { width: 40, align: 'center', lineBreak: false });
        doc.text('UNIT PRICE', COL.unit, y, { width: 75, align: 'right', lineBreak: false });
        doc.text('TOTAL', COL.total, y, { width: X1 - COL.total, align: 'right', lineBreak: false });
        doc.moveTo(X0, y + 14).lineTo(X1, y + 14).lineWidth(1.5).strokeColor(NAVY).stroke();
        return y + 20;
      };

      doc.addPage(); header();
      // From / Ordered by
      let y = 84;
      doc.fillColor('#666666').font('Helvetica').fontSize(7.5).text('FROM', X0, y, { characterSpacing: 1, lineBreak: false });
      doc.fillColor('#444444').fontSize(9);
      [PAWVY.name, ...PAWVY.address].forEach((t, i) => doc.text(t, X0, y + 14 + i * 12.5, { lineBreak: false }));
      doc.fillColor(NAVY).font('Helvetica-Bold').text(PAWVY.email, X0, y + 14 + 4 * 12.5, { lineBreak: false });
      doc.fillColor('#666666').font('Helvetica').fontSize(7.5).text('ORDERED BY', 330, y, { characterSpacing: 1, lineBreak: false });
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(d.company, 330, y + 14, { width: X1 - 330 });
      const cy = doc.y;
      if (d.email) doc.fillColor('#444444').font('Helvetica').fontSize(9).text(d.email, 330, cy + 2, { width: X1 - 330 });
      y = 170;
      doc.moveTo(X0, y).lineTo(X1, y).lineWidth(2).strokeColor('#f0f2f5').stroke();
      y = tableHead(y + 16);

      d.lines.forEach((l, i) => {
        doc.font('Helvetica').fontSize(9.5);
        const nameH = doc.heightOfString(l.name, { width: 280 });
        const rowH = Math.max(44, nameH + 16);
        if (y + rowH > H - 150) { doc.addPage(); header(); y = tableHead(84); }
        if (thumbs[i]) { try { doc.image(thumbs[i], COL.img, y + (rowH - 38) / 2, { fit: [38, 38], align: 'center', valign: 'center' }); } catch (e) {} }
        else { doc.roundedRect(COL.img, y + (rowH - 38) / 2, 38, 38, 5).lineWidth(0.5).strokeColor('#dfe5ee').fillAndStroke('#eef2f7', '#dfe5ee'); }
        doc.fillColor('#222222').font('Helvetica').fontSize(9.5).text(l.name, COL.name, y + (rowH - nameH) / 2, { width: 280 });
        const ty = y + (rowH - 10) / 2;
        doc.text(String(l.qty), COL.qty, ty, { width: 40, align: 'center', lineBreak: false });
        doc.text(money(d.market, l.unit), COL.unit, ty, { width: 75, align: 'right', lineBreak: false });
        doc.font('Helvetica-Bold').text(money(d.market, l.unit * l.qty), COL.total, ty, { width: X1 - COL.total, align: 'right', lineBreak: false });
        doc.moveTo(X0, y + rowH).lineTo(X1, y + rowH).lineWidth(0.5).strokeColor('#e6e1d6').stroke();
        y += rowH;
      });

      // subtotal
      y += 12;
      doc.fillColor(NAVY).font('Helvetica').fontSize(11).text('Subtotal', COL.unit - 40, y, { width: 115, align: 'right', lineBreak: false });
      doc.font('Helvetica-Bold').text(money(d.market, d.subtotal), COL.total, y, { width: X1 - COL.total, align: 'right', lineBreak: false });
      y += 28;
      if (d.notes) {
        doc.font('Helvetica').fontSize(9.5);
        const nh = doc.heightOfString(`Notes: ${d.notes}`, { width: X1 - X0 - 24 });
        if (y + nh + 120 > H) { doc.addPage(); header(); y = 84; }
        doc.roundedRect(X0, y, X1 - X0, nh + 16, 6).fill('#f7f5ef');
        doc.fillColor('#445566').text(`Notes: ${d.notes}`, X0 + 12, y + 8, { width: X1 - X0 - 24 });
        y += nh + 28;
      }
      if (y + 100 > H) { doc.addPage(); header(); y = 84; }
      doc.fillColor('#667788').font('Helvetica').fontSize(9).text('This is the list you submitted. Final prices, applicable discounts and any delivery fee will be reflected in your invoice. We\'ll be in touch shortly.', X0, y, { width: X1 - X0 });
      y = doc.y + 24;
      doc.fillColor(NAVY).font('Helvetica-BoldOblique').fontSize(13).text('Thank you for the partnership !', X0, y, { width: X1 - X0, align: 'center', lineBreak: false });
      doc.rect(0, H - 12, W, 12).fill(ORANGE);
      doc.end();
    });
  } catch (e) {
    console.error('⚠️  Portal order PDF failed:', e.message);
    return null;
  }
}

// ── Email HTML (same design as the PDF) ──
function buildEmailHtml(d) {
  const rows = d.lines.map(l => {
    const t = thumbUrl(l.imageUrl);
    return `<tr>` +
      `<td style="padding:7px 4px;border-bottom:1px solid #e6e1d6;width:46px">${t ? `<img src="${esc(t)}" width="38" height="38" alt="" style="display:block;width:38px;height:38px;border-radius:6px;border:1px solid #dfe5ee;object-fit:contain;background:#fff">` : '&nbsp;'}</td>` +
      `<td style="padding:7px 4px;border-bottom:1px solid #e6e1d6;font-size:12px;color:#222">${esc(l.name)}</td>` +
      `<td style="padding:7px 4px;border-bottom:1px solid #e6e1d6;font-size:12px;text-align:center">${l.qty}</td>` +
      `<td style="padding:7px 4px;border-bottom:1px solid #e6e1d6;font-size:12px;text-align:right;white-space:nowrap">${money(d.market, l.unit)}</td>` +
      `<td style="padding:7px 4px;border-bottom:1px solid #e6e1d6;font-size:12px;text-align:right;white-space:nowrap"><strong>${money(d.market, l.unit * l.qty)}</strong></td></tr>`;
  }).join('');
  const th = (t, a) => `<th style="font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:${NAVY};padding:7px 4px;border-bottom:2px solid ${NAVY};text-align:${a}">${t}</th>`;
  return `<div style="max-width:620px;margin:0 auto;background:#ffffff;color:#222;font-family:Arial,Helvetica,sans-serif;font-size:12px;border:1px solid #e6e1d6">` +
    `<table width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY}"><tr>` +
    `<td style="padding:14px 22px"><img src="${BASE_URL}/brand-assets/pawvy-logo-email.png" height="28" alt="PAWVY" style="display:block;height:28px"></td>` +
    `<td style="padding:14px 22px;text-align:right"><div style="font-size:19px;font-weight:700;color:#fff;letter-spacing:1px">ORDER LIST</div><div style="color:${ORANGE};font-size:12px;font-weight:600;margin-top:3px">${esc(d.when)}</div></td></tr></table>` +
    `<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #f0f2f5"><tr>` +
    `<td valign="top" style="padding:18px 22px"><div style="color:#666;font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">From</div>` +
    `<div style="font-size:11.5px;color:#444;line-height:1.65">${PAWVY.name}<br>${PAWVY.address.join('<br>')}<br><strong style="color:${NAVY}">${PAWVY.email}</strong></div></td>` +
    `<td valign="top" style="padding:18px 22px"><div style="color:#666;font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">Ordered by</div>` +
    `<div style="font-size:14px;font-weight:700;color:${NAVY}">${esc(d.company)}</div>${d.email ? `<div style="font-size:11.5px;color:#444;margin-top:3px">${esc(d.email)}</div>` : ''}</td></tr></table>` +
    `<div style="padding:14px 22px 6px"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th('', 'left')}${th('Item', 'left')}${th('Qty', 'center')}${th('Unit price', 'right')}${th('Total', 'right')}</tr>${rows}` +
    `<tr><td colspan="4" style="padding:10px 4px;text-align:right;font-size:13px;color:${NAVY}">Subtotal</td><td style="padding:10px 4px;text-align:right;font-size:13px;color:${NAVY};white-space:nowrap"><strong>${money(d.market, d.subtotal)}</strong></td></tr></table>` +
    (d.notes ? `<div style="background:#f7f5ef;border-radius:8px;padding:9px 12px;font-size:11.5px;color:#445;margin:10px 0"><strong>Notes:</strong> ${esc(d.notes)}</div>` : '') +
    `<div style="font-size:11px;color:#667;line-height:1.55;margin:10px 0">This is the list you submitted. Final prices, applicable discounts and any delivery fee will be reflected in your invoice. We'll be in touch shortly.</div></div>` +
    `<div style="text-align:center;padding:14px;font-style:italic;font-size:14px;font-weight:600;color:${NAVY}">Thank you for the partnership !</div><div style="background:${ORANGE};height:9px"></div></div>`;
}

// Fire-and-forget from routes/portal.js AFTER the order is saved. Never throws.
async function sendPortalOrderCopy(d, pdf) {
  try {
    const text =
      `We've received your order, thank you!\n\nHi ${d.company}, here is your order list for reference` + (pdf ? ' (PDF attached).' : '.') + `\n\n` +
      d.lines.map(l => `- ${l.name} x ${l.qty} @ ${money(d.market, l.unit)} = ${money(d.market, l.unit * l.qty)}`).join('\n') +
      `\n\nSubtotal: ${money(d.market, d.subtotal)}\n` + (d.notes ? `\nNotes: ${d.notes}\n` : '') +
      `\nFinal prices, applicable discounts and any delivery fee will be reflected in your invoice. We'll be in touch shortly.\n\nPawvy - This is an automated email. Please don't reply to it.`;
    const html =
      `<div style="max-width:620px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#1c2540">` +
      `<div style="font-size:16px;font-weight:700;margin:0 0 6px">We've received your order, thank you!</div>` +
      `<div style="font-size:13px;color:#556;margin:0 0 14px">Hi ${esc(d.company)}, here is your order list for reference.</div></div>` +
      buildEmailHtml(d) +
      `<div style="max-width:620px;margin:10px auto 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#889">Pawvy · This is an automated email. Please don't reply to it.</div>`;
    await resendSend({
      from: 'Pawvy <buttons@hello.pawvy.co>', to: d.email, subject: "We've received your order, thank you!", text, html,
      attachments: pdf ? [{ filename: 'Pawvy-Order-List.pdf', content: pdf.toString('base64') }] : undefined,
    });
  } catch (err) {
    console.error(`⚠️  Portal order copy email failed (to ${d.email}):`, err.message);
  }
}

module.exports = { buildOrderPdf, sendPortalOrderCopy };
