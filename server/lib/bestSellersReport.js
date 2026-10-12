// Best Sellers Report — partner-facing PDF.
//
// One A4 page per selected brand (plus continuation pages if Top N is
// large): a podium for ranks 1-3 with product photos, then a ranked list.
// Shows each SKU's SHARE of its brand's units sold in the period (%), never
// revenue or profit. Raw unit counts are only shown when the caller turns
// "show units" on. Layout mirrors the approved "C - Pawvy Palette" mockup,
// drawn in mockup pixels (794 x 1123) and scaled to A4 points.

const path = require('path');
const PDFDocument = require('pdfkit');
const { getObjectStream, decodeDataUrl } = require('./bucket');

let sharp = null;
try { sharp = require('sharp'); } catch { /* optional — falls back to raw JPEG/PNG below */ }

// ── Palette / geometry (mockup px) ────────────────────────────────
const CREAM = '#F5F2EB', NAVY = '#14213D', ORANGE = '#F36F4A', GREY = '#5b6478', WHITE = '#FFFFFF';
const PAGE_W = 595.28 / 0.75, PAGE_H = 841.89 / 0.75, K = 0.75;
const PAD_X = 44;
const CONTENT_W = PAGE_W - PAD_X * 2;

const ASSETS = path.join(__dirname, '..', 'assets');
const LOGO_PATH = path.join(ASSETS, 'pawvy-logo-navy.png');
const MARK_PATH = path.join(ASSETS, 'pawvy-mark-navy.png');
const LOGO_RATIO = 1000 / 309;

const FONT_FILES = {
  'Fraunces-Bold': '@fontsource/fraunces/files/fraunces-latin-700-normal.woff',
  'Inter':         '@fontsource/inter/files/inter-latin-400-normal.woff',
  'Inter-Medium':  '@fontsource/inter/files/inter-latin-500-normal.woff',
  'Inter-Semi':    '@fontsource/inter/files/inter-latin-600-normal.woff',
};

// Partner-facing brand names (DB stores the spaced spellings).
const DISPLAY_NAMES = { 'Better Bone': 'BetterBone', 'East Sea Brother': 'Eastsea Brother' };
const displayBrandName = n => DISPLAY_NAMES[n] || n;
// Confirmed display order for multi-brand reports.
const BRAND_ORDER = ['Better Bone', 'Lillidale', 'Puzzle Feeder', 'East Sea Brother', 'Salmoil', 'GiGwi'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso, withYear) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
}
function fmtPeriod(from, to) {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${fmtDate(from, !sameYear)} - ${fmtDate(to, true)}`;
}

// ── Data ──────────────────────────────────────────────────────────
// Returns [{ brand, shownItems:[{...product, units, pct}] }] in display order.
// % = product units / ALL units the brand sold in the period (active or
// not, in stock or not) so the figure always means "share of the brand's
// sales" and doesn't silently change when "exclude out-of-stock" is toggled.
function collectBestSellers(db, { brandIds, dateFrom, dateTo, topN, excludeOos }) {
  const ph = brandIds.map(() => '?').join(',');
  const rows = db.query(`
    SELECT p.id, p.item_series, p.variation, p.image_url, p.image_data, p.is_active,
           b.id AS brand_id, b.name AS brand_name,
           SUM(s.qty) AS units,
           COALESCE(mega.qty, 0) + COALESCE(hougang.qty, 0) AS stock
    FROM sales s
    JOIN products p ON p.id = s.product_id
    JOIN brands b ON b.id = p.brand_id
    LEFT JOIN inventory_levels mega    ON mega.product_id = p.id    AND mega.location    = 'Mega'
    LEFT JOIN inventory_levels hougang ON hougang.product_id = p.id AND hougang.location = 'Hougang'
    WHERE COALESCE(s.voided, 0) = 0
      AND s.date >= ? AND s.date <= ?
      AND b.id IN (${ph})
    GROUP BY p.id
    HAVING SUM(s.qty) > 0
  `, [dateFrom, dateTo, ...brandIds]);

  const brands = db.query(`SELECT id, name FROM brands WHERE id IN (${ph})`, brandIds);
  brands.sort((a, b) => {
    const ia = BRAND_ORDER.indexOf(a.name), ib = BRAND_ORDER.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name);
  });

  return brands.map(brand => {
    const mine = rows.filter(r => r.brand_id === brand.id);
    const brandTotal = mine.reduce((a, r) => a + r.units, 0);
    const ranked = mine
      .filter(r => r.is_active)
      .filter(r => !excludeOos || r.stock > 0)
      .sort((a, b) => b.units - a.units
        || String(a.item_series).localeCompare(String(b.item_series))
        || String(a.variation || '').localeCompare(String(b.variation || '')))
      .slice(0, topN)
      .map(r => ({ ...r, pct: brandTotal ? Math.round((r.units / brandTotal) * 100) : 0 }));
    return { brand, items: ranked };
  });
}

// ── Images ────────────────────────────────────────────────────────
async function rawImage(p) {
  if (p.image_url) {
    const key = p.image_url.replace(/^\/api\/uploads\//, '');
    const obj = await getObjectStream(key);
    const chunks = [];
    for await (const c of obj.Body) chunks.push(c);
    return Buffer.concat(chunks);
  }
  if (p.image_data) return decodeDataUrl(p.image_data).buffer;
  return null;
}

// pdfkit only embeds JPEG/PNG, and a raw phone-sized upload would bloat the
// PDF — so normalise to a modest JPEG (flattened on the cream tile colour).
async function loadPhoto(p) {
  try {
    const buf = await rawImage(p);
    if (!buf) return null;
    if (sharp) {
      return await sharp(buf).rotate()
        .resize({ width: 560, height: 560, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: CREAM })
        .jpeg({ quality: 82 }).toBuffer();
    }
    const isJpg = buf[0] === 0xFF && buf[1] === 0xD8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    return (isJpg || isPng) ? buf : null;
  } catch {
    return null; // a missing/corrupt photo falls back to the branded tile, never fails the report
  }
}

async function loadPhotos(items) {
  const out = new Map();
  for (let i = 0; i < items.length; i += 6) {
    await Promise.all(items.slice(i, i + 6).map(async p => out.set(p.id, await loadPhoto(p))));
  }
  return out;
}

// ── Drawing helpers (all in mockup px; caller has applied scale) ──
function centerText(doc, str, cx, cy, w) {
  const h = doc.currentLineHeight();
  doc.text(str, cx - w / 2, cy - h / 2, { width: w, align: 'center', lineBreak: false });
}

function drawPhotoTile(doc, x, y, w, h, radius, photo) {
  doc.save();
  doc.roundedRect(x, y, w, h, radius).fill(CREAM);
  doc.restore();
  if (photo) {
    doc.save();
    doc.roundedRect(x, y, w, h, radius).clip();
    const pad = Math.min(8, w * 0.06);
    doc.image(photo, x + pad, y + pad, { fit: [w - pad * 2, h - pad * 2], align: 'center', valign: 'center' });
    doc.restore();
  } else {
    // Branded fallback: faint Pawvy mark, so a missing photo still looks intentional.
    const mh = h * 0.52, mw = mh * (300 / 404);
    doc.save();
    doc.opacity(0.1);
    doc.image(MARK_PATH, x + (w - mw) / 2, y + (h - mh) / 2, { width: mw, height: mh });
    doc.restore();
  }
}

function drawHeader(doc, continued) {
  const lh = 38;
  doc.image(LOGO_PATH, PAD_X, 40, { height: lh });
  doc.font('Inter-Medium').fontSize(11).fillColor(GREY);
  doc.text('BEST SELLERS REPORT', PAD_X, 40 + lh / 2 - 6.5, {
    width: CONTENT_W, align: 'right', characterSpacing: 2, lineBreak: false,
  });
}

function drawFooter(doc, brandName, partnerName) {
  const y = PAGE_H - 30 - 12;
  doc.font('Inter').fontSize(10).fillColor(GREY);
  doc.text(`% = share of ${brandName} units sold in the period. Voided sales excluded.`, PAD_X, y, {
    width: CONTENT_W * 0.62, lineBreak: false, characterSpacing: 0.4,
  });
  const right = partnerName ? `pawvy.co  ·  Prepared for ${partnerName}` : 'pawvy.co';
  doc.text(right, PAD_X + CONTENT_W * 0.5, y, {
    width: CONTENT_W * 0.5, align: 'right', lineBreak: false, characterSpacing: 0.4,
  });
}

function drawPodiumCard(doc, item, photos, rank, x, panelBottom, w, cardH, photoH, orangeMedal, showUnits) {
  const top = panelBottom - cardH;
  doc.save();
  doc.roundedRect(x, top, w, cardH + 20, 18).fill(WHITE); // +20 so the bottom corners sit below the clipped panel edge
  doc.restore();

  const ix = x + 14, iw = w - 28;
  // medal
  doc.circle(ix + 16, top + 14 + 16, 16).fill(orangeMedal ? ORANGE : NAVY);
  doc.font('Fraunces-Bold').fontSize(17).fillColor(orangeMedal ? WHITE : CREAM);
  centerText(doc, String(rank), ix + 16, top + 14 + 16, 32);

  // photo
  const photoTop = top + 14 + 32;
  drawPhotoTile(doc, ix, photoTop, iw, photoH, 12, photos.get(item.id));

  // name block (max 2 lines of series, 1-2 of variation inside 48px)
  const nameTop = photoTop + photoH + 8;
  doc.font('Inter-Semi').fontSize(12.5).fillColor(NAVY);
  doc.text(item.item_series, ix, nameTop, { width: iw, align: 'center', height: 32, ellipsis: true, lineGap: 0.5 });
  const used = Math.min(32, doc.heightOfString(item.item_series, { width: iw, lineGap: 0.5 }));
  doc.font('Inter').fontSize(12).fillColor(GREY);
  if (item.variation) doc.text(item.variation, ix, nameTop + used + 1, { width: iw, align: 'center', height: 16, ellipsis: true });

  // percent
  const pctTop = nameTop + 48 + 8;
  doc.font('Fraunces-Bold').fontSize(32).fillColor(ORANGE);
  doc.text(`${item.pct}%`, ix, pctTop, { width: iw, align: 'center', lineBreak: false });
  if (showUnits) {
    doc.font('Inter').fontSize(11).fillColor(GREY);
    doc.text(`${item.units} units sold`, ix, pctTop + 40, { width: iw, align: 'center', lineBreak: false });
  }
}

function drawRow(doc, item, photos, rank, y, showUnits) {
  const x = PAD_X, w = CONTENT_W, h = 52;
  doc.roundedRect(x, y, w, h, 14).fill(WHITE);

  doc.font('Fraunces-Bold').fontSize(20).fillColor(NAVY);
  centerText(doc, String(rank), x + 12 + 15, y + h / 2, 30);

  drawPhotoTile(doc, x + 56, y + 6, 40, 40, 10, photos.get(item.id));

  const pillW = 54, pillH = 26, right = x + w - 16;
  const unitsW = showUnits ? 74 + 14 : 0;
  const textX = x + 110;
  const textW = right - pillW - 14 - unitsW - textX;

  doc.font('Inter-Semi').fontSize(13).fillColor(NAVY);
  doc.text(item.item_series, textX, y + 9, { width: textW, lineBreak: false, ellipsis: true });
  if (item.variation) {
    doc.font('Inter').fontSize(12).fillColor(GREY);
    doc.text(item.variation, textX, y + 27, { width: textW, lineBreak: false, ellipsis: true });
  }

  if (showUnits) {
    doc.font('Inter').fontSize(12).fillColor(GREY);
    doc.text(`${item.units} units`, right - pillW - 14 - 74, y + h / 2 - 7, { width: 74, align: 'right', lineBreak: false });
  }

  doc.roundedRect(right - pillW, y + (h - pillH) / 2, pillW, pillH, 13).fill(NAVY);
  doc.font('Inter-Semi').fontSize(13).fillColor(CREAM);
  centerText(doc, `${item.pct}%`, right - pillW / 2, y + h / 2, pillW);
}

// pdfkit decides when to auto-break to a new page from UNSCALED coordinates,
// but this file draws in mockup px under doc.scale(K) — so y values up to
// PAGE_H (1123) would otherwise look like they overflow an 842pt page and
// spawn blank extra pages. A negative bottom margin lifts that limit; every
// element is positioned explicitly, so nothing relies on auto-flow anyway.
function newPage(doc) {
  doc.addPage();
  doc.page.margins.bottom = -(PAGE_H - 841.89) - 100;
}

// One brand = 1+ pages.
function drawBrand(doc, { brand, items }, ctx, photos) {
  const name = displayBrandName(brand.name);
  const { period, partnerName, showUnits } = ctx;

  newPage(doc);
  doc.save(); doc.scale(K);
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(CREAM);
  drawHeader(doc);

  // Title block
  const titleTop = 100;
  doc.rect(PAD_X, titleTop + 5, 28, 3).fill(ORANGE);
  doc.font('Inter-Semi').fontSize(12).fillColor(ORANGE);
  const eyebrow = items.length ? `TOP ${items.length} · MOST LOVED` : 'BEST SELLERS';
  doc.text(eyebrow, PAD_X + 38, titleTop, { lineBreak: false, characterSpacing: 2.4 });
  doc.font('Fraunces-Bold').fontSize(72).fillColor(NAVY);
  doc.text(name, PAD_X, titleTop + 22, { lineBreak: false });
  doc.font('Inter-Semi').fontSize(13).fillColor(NAVY);
  doc.text(period, PAD_X, titleTop + 22 + 52, { width: CONTENT_W, align: 'right', lineBreak: false });
  doc.font('Inter').fontSize(13).fillColor(GREY);
  doc.text('All sales channels', PAD_X, titleTop + 22 + 52 + 21, { width: CONTENT_W, align: 'right', lineBreak: false });

  const panelTop = 220, panelH = 392, panelBottom = panelTop + panelH;

  if (!items.length) {
    doc.roundedRect(PAD_X, panelTop, CONTENT_W, 200, 26).fill(NAVY);
    doc.font('Inter-Medium').fontSize(14).fillColor(CREAM);
    doc.text('No qualifying sales for this brand in the selected period.', PAD_X, panelTop + 90, {
      width: CONTENT_W, align: 'center', lineBreak: false,
    });
    drawFooter(doc, name, partnerName);
    doc.restore();
    return;
  }

  // Podium panel (cards are clipped to the rounded navy panel)
  doc.roundedRect(PAD_X, panelTop, CONTENT_W, panelH, 26).fill(NAVY);
  doc.save();
  doc.roundedRect(PAD_X, panelTop, CONTENT_W, panelH, 26).clip();
  const top3 = items.slice(0, 3);
  const gap = 14, innerW = CONTENT_W - 44;
  const cardW = (innerW - gap * 2) / 3;
  // Visual order: 2nd, 1st, 3rd. With fewer than 3 items, centre what exists.
  const spec = { 1: { h: 348, ph: 150, o: true }, 2: { h: 296, ph: 112, o: false }, 3: { h: 268, ph: 92, o: false } };
  const order = [2, 1, 3].filter(r => top3[r - 1]);
  const totalW = order.length * cardW + (order.length - 1) * gap;
  let cx = PAD_X + (CONTENT_W - totalW) / 2;
  for (const r of order) {
    drawPodiumCard(doc, top3[r - 1], photos, r, cx, panelBottom, cardW, spec[r].h, spec[r].ph, spec[r].o, showUnits);
    cx += cardW + gap;
  }
  doc.restore();

  // Ranked list (4+), flowing onto continuation pages if needed
  const rest = items.slice(3);
  const ROW_PITCH = 58, LIST_BOTTOM = PAGE_H - 30 - 12 - 14;
  let y = panelBottom + 22;
  drawFooter(doc, name, partnerName);
  let rank = 4;
  for (const item of rest) {
    if (y + 52 > LIST_BOTTOM) {
      doc.restore();
      newPage(doc);
      doc.save(); doc.scale(K);
      doc.rect(0, 0, PAGE_W, PAGE_H).fill(CREAM);
      drawHeader(doc);
      doc.font('Fraunces-Bold').fontSize(34).fillColor(NAVY);
      doc.text(`${name}`, PAD_X, 100, { lineBreak: false });
      doc.font('Inter').fontSize(13).fillColor(GREY);
      doc.text(`${period}  ·  continued`, PAD_X, 112, { width: CONTENT_W, align: 'right', lineBreak: false });
      drawFooter(doc, name, partnerName);
      y = 160;
    }
    drawRow(doc, item, photos, rank, y, showUnits);
    y += ROW_PITCH; rank += 1;
  }
  doc.restore();
}

// ── Public ────────────────────────────────────────────────────────
async function renderBestSellersPdf(db, opts, stream) {
  const groups = collectBestSellers(db, opts);
  const photos = await loadPhotos(groups.flatMap(g => g.items));

  const doc = new PDFDocument({
    size: 'A4', margin: 0, autoFirstPage: false,
    info: { Title: 'Pawvy Best Sellers Report', Author: 'Pawvy' },
  });
  for (const [name, mod] of Object.entries(FONT_FILES)) doc.registerFont(name, require.resolve(mod));
  doc.pipe(stream);

  const ctx = {
    period: fmtPeriod(opts.dateFrom, opts.dateTo),
    partnerName: opts.partnerName || '',
    showUnits: !!opts.showUnits,
  };
  for (const g of groups) drawBrand(doc, g, ctx, photos);
  doc.end();
  return groups;
}

module.exports = { renderBestSellersPdf, collectBestSellers, displayBrandName };
