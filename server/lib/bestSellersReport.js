// Best Sellers Report — partner-facing PDF.
//
// One A4 page per selected brand (plus continuation pages if Top N is
// large): a podium for ranks 1-3 with product photos, then a ranked list.
// Ranked by units sold, but NO percentages or sales figures are printed —
// raw unit counts appear only when the caller turns "show units" on. Each
// brand can have its own Top N. Layout follows the approved "C - Pawvy
// Palette" mockup (drawn in mockup pixels, 794 x 1123, scaled to A4 points)
// with large product photos.

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
// Returns [{ brand, items:[{...product, units}] }] in display order, ranked
// by units sold in the period (voided sales excluded, all channels).
function collectBestSellers(db, { brandIds, dateFrom, dateTo, topN, topNByBrand = {}, excludeOos }) {
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
    const limit = topNByBrand[brand.id] || topN;
    const ranked = mine
      .filter(r => r.is_active)
      .filter(r => !excludeOos || r.stock > 0)
      .sort((a, b) => b.units - a.units
        || String(a.item_series).localeCompare(String(b.item_series))
        || String(a.variation || '').localeCompare(String(b.variation || '')))
      .slice(0, limit);
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
        .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
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
    const pad = Math.min(8, w * 0.05);
    doc.image(photo, x + pad, y + pad, { fit: [w - pad * 2, h - pad * 2], align: 'center', valign: 'center' });
    doc.restore();
  } else {
    // Branded fallback: faint Pawvy mark, so a missing photo still looks intentional.
    const mh = h * 0.5, mw = mh * (300 / 404);
    doc.save();
    doc.opacity(0.1);
    doc.image(MARK_PATH, x + (w - mw) / 2, y + (h - mh) / 2, { width: mw, height: mh });
    doc.restore();
  }
}

function drawHeader(doc) {
  const lh = 38;
  doc.image(LOGO_PATH, PAD_X, 40, { height: lh });
  doc.font('Inter-Medium').fontSize(11).fillColor(GREY);
  doc.text('BEST SELLERS REPORT', PAD_X, 40 + lh / 2 - 6.5, {
    width: CONTENT_W, align: 'right', characterSpacing: 2, lineBreak: false,
  });
}

function drawFooter(doc, partnerName) {
  const y = PAGE_H - 30 - 12;
  const text = partnerName ? `pawvy.co  ·  Prepared for ${partnerName}` : 'pawvy.co';
  doc.font('Inter').fontSize(10).fillColor(GREY);
  doc.text(text, PAD_X, y, { width: CONTENT_W, align: 'right', lineBreak: false, characterSpacing: 0.4 });
}

// Podium card: big photo with the rank medal pinned to its corner, then the
// product title (large) and variation. Card height follows from the photo
// height, so 1st/2nd/3rd step down naturally.
const PODIUM_TEXT_H = 38 + 2 + 34;
function podiumCardHeight(photoH, showUnits) {
  return 14 + photoH + 10 + PODIUM_TEXT_H + (showUnits ? 20 : 0) + 14;
}

function drawPodiumCard(doc, item, photos, rank, x, panelBottom, w, photoH, orangeMedal, showUnits) {
  const cardH = podiumCardHeight(photoH, showUnits);
  const top = panelBottom - cardH;
  doc.save();
  doc.roundedRect(x, top, w, cardH + 20, 18).fill(WHITE); // +20 so the bottom corners sit below the clipped panel edge
  doc.restore();

  const ix = x + 14, iw = w - 28, photoTop = top + 14;
  drawPhotoTile(doc, ix, photoTop, iw, photoH, 12, photos.get(item.id));

  // rank medal pinned to the photo corner
  const mr = 17, mx = ix + 10 + mr, my = photoTop + 10 + mr;
  doc.circle(mx, my, mr).lineWidth(2).fillAndStroke(orangeMedal ? ORANGE : NAVY, WHITE);
  doc.font('Fraunces-Bold').fontSize(18).fillColor(orangeMedal ? WHITE : CREAM);
  centerText(doc, String(rank), mx, my, mr * 2);

  const nameTop = photoTop + photoH + 10;
  doc.font('Inter-Semi').fontSize(15.5).fillColor(NAVY);
  doc.text(item.item_series, ix, nameTop, { width: iw, align: 'center', height: 38, ellipsis: true, lineGap: 0 });
  const used = Math.min(38, doc.heightOfString(item.item_series, { width: iw }));
  if (item.variation) {
    doc.font('Inter').fontSize(13.5).fillColor(GREY);
    doc.text(item.variation, ix, nameTop + used + 2, { width: iw, align: 'center', height: 34, ellipsis: true });
  }
  if (showUnits) {
    doc.font('Inter-Semi').fontSize(12.5).fillColor(ORANGE);
    doc.text(`${item.units} units sold`, ix, nameTop + PODIUM_TEXT_H + 2, { width: iw, align: 'center', lineBreak: false });
  }
}

// Ranks 4+ : a two-column grid of cards with large thumbnails ("grid"), or —
// when only a couple of items remain (Top 5) — full-width rows with even
// bigger photos ("wide").
const GRID = { h: 88, gap: 8, photo: 72 };
const WIDE = { h: 124, gap: 10, photo: 108 };

function drawGridCard(doc, item, photos, rank, x, y, w, showUnits) {
  const h = GRID.h;
  doc.roundedRect(x, y, w, h, 14).fill(WHITE);
  doc.font('Fraunces-Bold').fontSize(22).fillColor(NAVY);
  centerText(doc, String(rank), x + 12 + 15, y + h / 2, 30);

  const px = x + 46;
  drawPhotoTile(doc, px, y + (h - GRID.photo) / 2, GRID.photo, GRID.photo, 10, photos.get(item.id));

  const tx = px + GRID.photo + 12, tw = x + w - 12 - tx;
  doc.font('Inter-Semi').fontSize(14.5);
  const th = Math.min(36, doc.heightOfString(item.item_series, { width: tw }));
  const sub = [item.variation, showUnits ? `${item.units} units` : null].filter(Boolean).join('  ·  ');
  const blockH = th + (sub ? 16 : 0);
  let ty = y + (h - blockH) / 2;
  doc.fillColor(NAVY).text(item.item_series, tx, ty, { width: tw, height: 36, ellipsis: true });
  if (sub) {
    doc.font('Inter').fontSize(12.5).fillColor(GREY);
    doc.text(sub, tx, ty + th + 2, { width: tw, lineBreak: false, ellipsis: true });
  }
}

function drawWideRow(doc, item, photos, rank, y, showUnits) {
  const x = PAD_X, w = CONTENT_W, h = WIDE.h;
  doc.roundedRect(x, y, w, h, 16).fill(WHITE);
  doc.font('Fraunces-Bold').fontSize(28).fillColor(NAVY);
  centerText(doc, String(rank), x + 14 + 20, y + h / 2, 40);

  const px = x + 64;
  drawPhotoTile(doc, px, y + (h - WIDE.photo) / 2, WIDE.photo, WIDE.photo, 12, photos.get(item.id));

  const tx = px + WIDE.photo + 20, tw = x + w - 20 - tx;
  doc.font('Inter-Semi').fontSize(18);
  const th = Math.min(46, doc.heightOfString(item.item_series, { width: tw }));
  const lines = [item.variation, showUnits ? `${item.units} units sold` : null].filter(Boolean);
  const blockH = th + lines.length * 21;
  let ty = y + (h - blockH) / 2;
  doc.fillColor(NAVY).text(item.item_series, tx, ty, { width: tw, height: 46, ellipsis: true });
  ty += th + 3;
  lines.forEach((ln, i) => {
    doc.font(i === 0 && item.variation ? 'Inter' : 'Inter-Semi').fontSize(14.5).fillColor(i === 0 && item.variation ? GREY : ORANGE);
    doc.text(ln, tx, ty, { width: tw, lineBreak: false, ellipsis: true });
    ty += 21;
  });
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

  // Top 5 (or fewer) leaves plenty of page, so the podium gets even larger photos.
  const tall = items.length <= 5;
  const panelTop = 220, panelH = tall ? 452 : 392, panelBottom = panelTop + panelH;

  if (!items.length) {
    doc.roundedRect(PAD_X, panelTop, CONTENT_W, 200, 26).fill(NAVY);
    doc.font('Inter-Medium').fontSize(14).fillColor(CREAM);
    doc.text('No qualifying sales for this brand in the selected period.', PAD_X, panelTop + 90, {
      width: CONTENT_W, align: 'center', lineBreak: false,
    });
    drawFooter(doc, partnerName);
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
  // Photo heights chosen so the tallest card (1st) fits under the panel's top padding.
  const spec = tall
    ? { 1: { ph: 268, o: true }, 2: { ph: 218, o: false }, 3: { ph: 184, o: false } }
    : { 1: { ph: 224, o: true }, 2: { ph: 182, o: false }, 3: { ph: 152, o: false } };
  const order = [2, 1, 3].filter(r => top3[r - 1]);
  const totalW = order.length * cardW + (order.length - 1) * gap;
  let cx = PAD_X + (CONTENT_W - totalW) / 2;
  for (const r of order) {
    drawPodiumCard(doc, top3[r - 1], photos, r, cx, panelBottom, cardW, spec[r].ph, spec[r].o, showUnits);
    cx += cardW + gap;
  }
  doc.restore();
  drawFooter(doc, partnerName);

  // Ranks 4+
  const rest = items.slice(3);
  const LIST_BOTTOM = PAGE_H - 30 - 12 - 14;
  let rank = 4;

  if (rest.length && rest.length <= 2) {
    let y = panelBottom + 22;
    for (const item of rest) {
      drawWideRow(doc, item, photos, rank++, y, showUnits);
      y += WIDE.h + WIDE.gap;
    }
  } else if (rest.length) {
    const colW = (CONTENT_W - GRID.gap) / 2;
    let y = panelBottom + 22;
    for (let i = 0; i < rest.length; i += 2) {
      if (y + GRID.h > LIST_BOTTOM) {
        doc.restore();
        newPage(doc);
        doc.save(); doc.scale(K);
        doc.rect(0, 0, PAGE_W, PAGE_H).fill(CREAM);
        drawHeader(doc);
        doc.font('Fraunces-Bold').fontSize(34).fillColor(NAVY);
        doc.text(name, PAD_X, 100, { lineBreak: false });
        doc.font('Inter').fontSize(13).fillColor(GREY);
        doc.text(`${period}  ·  continued`, PAD_X, 112, { width: CONTENT_W, align: 'right', lineBreak: false });
        drawFooter(doc, partnerName);
        y = 160;
      }
      drawGridCard(doc, rest[i], photos, rank++, PAD_X, y, colW, showUnits);
      if (rest[i + 1]) drawGridCard(doc, rest[i + 1], photos, rank++, PAD_X + colW + GRID.gap, y, colW, showUnits);
      y += GRID.h + GRID.gap;
    }
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
