const { Router } = require('express');
const { withEffectivePrice, stockStatus } = require('../lib/pricing');
const { NEED_TAGS } = require('../lib/needTags');

// Small local parser, same behavior as products.js's withParsedNeedTags
// but kept separate on purpose — that one lives in an already-tested
// file, no need to add a cross-file dependency just to save a few lines.
function parseNeedTags(product) {
  let need_tags = [];
  try {
    const parsed = JSON.parse(product.need_tags || '[]');
    if (Array.isArray(parsed)) need_tags = parsed;
  } catch (e) { /* leave as [] */ }
  return { ...product, need_tags };
}

// Public product-browsing API for pawvy.co. Deliberately separate from
// server/routes/products.js (staff-only, exposes wholesale/cost pricing)
// and from server/routes/pos.js's /catalogue (POS-terminal specific,
// no discount/effective-price info) — this is purpose-built for real
// customer shopping: only RRP + effective (discounted) price ever leaves
// this route, never cost/wholesale/consignment pricing, and stock is
// exposed as a status band (available/low_stock/out_of_stock), never an
// exact quantity.
//
// Mounted at /api/shop, added to the PIN-gate exclusion list in
// server/index.js alongside /customers — real website visitors need to
// reach this with no staff login at all.
// Products excluded from the public website ONLY (Shop listing, product
// detail, and top-sellers). This does NOT touch is_active, so the same
// product stays fully visible/orderable in the Pawvy App (staff tool),
// POS (server/routes/pos.js), and Order Portal (server/routes/portal.js)
// — those all read from entirely separate route files and are untouched
// by this list. Match on barcode (stable across environments) rather
// than internal id, which can differ between seed and production.
//
// Current entries:
// - 5060518442339 — Lillidale Ear Cleaner 2.5L (Groomer): a trade/bulk
//   size meant for professional groomers, not public retail. Requested
//   by KT, Aug 2026 — keep purchasable via POS/Order Portal for groomer
//   customers, just not browsable/orderable on the public website.
const WEBSITE_HIDDEN_BARCODES = ['5060518442339'];

// Internal-only brand entries (e.g. "Pawvy" — used for internal supplies/
// packaging SKUs, not something a customer shops for) that should never
// appear in the public Shop filter dropdown. Same exclusion pattern as
// WEBSITE_HIDDEN_BARCODES above: hide from the public website only, not
// from is_active or any other route — Pawvy App/POS/Portal are untouched.
const WEBSITE_HIDDEN_BRAND_NAMES = ['Pawvy'];

module.exports = function(db) {
  const router = Router();

  // GET /api/shop/products — active products only, with brand + effective
  // pricing + stock status. Supports the same brand_id/search filters as
  // the staff endpoint for consistency, minus anything staff-only.
  router.get('/products', (req, res) => {
    const { brand_id, search, need, item_series, ids } = req.query;
    let sql = `
      SELECT
        p.id, p.item_series, p.variation, p.image_url, p.need_tags, p.best_for,
        p.price_rrp_sg, p.discount_pct, p.discount_start, p.discount_end, p.is_new, p.new_until,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        COALESCE(home.qty, 0)    AS home_qty,
        COALESCE(storhub.qty, 0) AS storhub_qty
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
      LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
      WHERE p.is_active = 1
        AND p.barcode NOT IN (${WEBSITE_HIDDEN_BARCODES.map(() => '?').join(',')})
    `;
    const params = [...WEBSITE_HIDDEN_BARCODES];
    if (brand_id) { sql += ' AND p.brand_id = ?'; params.push(brand_id); }
    if (search) {
      sql += ' AND (p.item_series LIKE ? OR p.variation LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (item_series) {
      // Exact match, not LIKE — used by the product detail page to find
      // sibling variants of the same product line (different size/flavor
      // of the same item_series). A LIKE match here risks false positives
      // if one product's item_series text happens to be a substring of
      // another's, or matches inside a variation field via the shared
      // `search` filter above — exact equality avoids that entirely.
      sql += ' AND p.item_series = ?';
      params.push(item_series);
    }
    if (ids) {
      // Explicit ID list (e.g. "12,45,88") — used by the product page's
      // variant switcher when a brand-page card already resolved its own
      // exact sibling set (see BrandDeepDive.jsx/CategoryBrowser.jsx/
      // FitCard.jsx). Not every brand's data shares one item_series
      // across size/color variants (GiGwi's colors are genuinely
      // different item_series values, matched by SKU prefix instead —
      // see matchByPrefix in the website's CategoryBrowser.jsx), so
      // re-deriving "siblings" from item_series alone doesn't work
      // universally. Passing the already-correct ID list sidesteps that
      // entirely, regardless of how a given brand's catalog is shaped.
      const idList = String(ids).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n));
      if (idList.length === 0) {
        return res.json({ products: [] });
      }
      sql += ` AND p.id IN (${idList.map(() => '?').join(',')})`;
      params.push(...idList);
    }
    if (need) {
      // need_tags is a JSON array string (e.g. '["dental","chew"]') — no
      // JSON1 dependency here, just a quoted-substring match, which is
      // exact (not a false-positive-prone plain substring check) since
      // every tag in the array is individually quoted. Validated against
      // the canonical list first so a typo'd/unknown ?need= value returns
      // a clean empty result instead of a confusing always-empty LIKE.
      if (!NEED_TAGS.includes(need)) {
        return res.status(400).json({ error: `Unknown need "${need}". Valid: ${NEED_TAGS.join(', ')}.` });
      }
      sql += ' AND p.need_tags LIKE ?';
      params.push(`%"${need}"%`);
    }
    // Aug 2026 (per KT): was brand-first / stock-second (Available
    // BetterBone → OOS BetterBone → Available Lillidale → OOS
    // Lillidale...) — fine for browsing one brand's full range, but once
    // Shop-by-Need filters down to a handful of SKUs per brand, having
    // every brand's own OOS items interspersed mid-list made shopping
    // genuinely harder. Now stock status is the TOP-level sort key
    // instead: every available product across every brand first (in
    // brand order), then every OOS product across every brand (in brand
    // order) — Available BetterBone → Available Lillidale → ... → OOS
    // BetterBone → OOS Lillidale → ...
    //
    // Same rule applied identically in routes/pos.js and routes/portal.js
    // — kept consistent across Website, POS, and Order Portal per KT's
    // explicit request.
    sql += ` ORDER BY
      CASE WHEN (COALESCE(home.qty,0) + COALESCE(storhub.qty,0)) <= 0 THEN 1 ELSE 0 END,
      b.name,
      COALESCE(p.portal_sort_order, 999999), p.item_series, p.variation`;

    const rows = db.query(sql, params);
    const products = rows.map(r => {
      const { home_qty, storhub_qty, ...rest } = withEffectivePrice(r);
      return parseNeedTags({ ...rest, stock_status: stockStatus(home_qty + storhub_qty) });
    });
    res.json({ products });
  });

  // GET /api/shop/products/:id — single product detail, same field scope
  // as the list above. Also respects WEBSITE_HIDDEN_BARCODES, so the
  // product page can't be reached by guessing/sharing a direct URL either.
  router.get('/products/:id', (req, res) => {
    const row = db.queryOne(`
      SELECT
        p.id, p.item_series, p.variation, p.image_url, p.description, p.need_tags, p.best_for,
        p.price_rrp_sg, p.discount_pct, p.discount_start, p.discount_end, p.is_new, p.new_until,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        COALESCE(home.qty, 0)    AS home_qty,
        COALESCE(storhub.qty, 0) AS storhub_qty
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
      LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
      WHERE p.id = ? AND p.is_active = 1
        AND p.barcode NOT IN (${WEBSITE_HIDDEN_BARCODES.map(() => '?').join(',')})
    `, [req.params.id, ...WEBSITE_HIDDEN_BARCODES]);

    if (!row) return res.status(404).json({ error: 'Product not found.' });
    const { home_qty, storhub_qty, ...rest } = withEffectivePrice(row);
    res.json({ product: parseNeedTags({ ...rest, stock_status: stockStatus(home_qty + storhub_qty) }) });
  });

  // GET /api/shop/brands — for a brand filter on the shop page.
  router.get('/brands', (req, res) => {
    const brands = db.query('SELECT id, name, color FROM brands ORDER BY name')
      .filter(b => !WEBSITE_HIDDEN_BRAND_NAMES.includes(b.name));
    res.json({ brands });
  });

  // GET /api/shop/top-sellers — powers the cart upsell section. Ranked by
  // total units sold over the last 90 days (matches the "popular over the
  // last 3 months" framing KT referenced), pulled from the same `sales`
  // table the internal Pawvy App itself reports from — real sales data,
  // not a guess. Out-of-stock products are excluded outright rather than
  // shown greyed out — no point upselling something that can't be bought.
  router.get('/top-sellers', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 8, 20);
    const rows = db.query(`
      SELECT
        p.id, p.item_series, p.variation, p.image_url,
        p.price_rrp_sg, p.discount_pct, p.discount_start, p.discount_end, p.is_new, p.new_until,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        COALESCE(home.qty, 0)    AS home_qty,
        COALESCE(storhub.qty, 0) AS storhub_qty,
        SUM(s.qty) AS units_sold
      FROM sales s
      JOIN products p ON p.id = s.product_id
      JOIN brands b ON b.id = p.brand_id
      LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
      LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
      WHERE p.is_active = 1 AND s.date >= date('now', '-90 days') AND COALESCE(s.voided,0) = 0
        AND p.barcode NOT IN (${WEBSITE_HIDDEN_BARCODES.map(() => '?').join(',')})
      GROUP BY p.id
      ORDER BY units_sold DESC
      LIMIT ?
    `, [...WEBSITE_HIDDEN_BARCODES, limit * 2]); // over-fetch since some will be filtered out as out-of-stock below

    const products = rows
      .map(r => {
        const { home_qty, storhub_qty, units_sold, ...rest } = withEffectivePrice(r);
        return { ...rest, stock_status: stockStatus(home_qty + storhub_qty), units_sold };
      })
      .filter(p => p.stock_status !== 'out_of_stock')
      .slice(0, limit);

    res.json({ products });
  });

  // GET /api/shop/pawvy-picks — the homepage's admin-curated section
  // (staff toggle it per-product in Products & Pricing → Shop Settings).
  // Deliberately not sales-ranked like /top-sellers above — this is
  // editorial, not algorithmic, per KT's explicit preference.
  router.get('/pawvy-picks', (req, res) => {
    const rows = db.query(`
      SELECT
        p.id, p.item_series, p.variation, p.image_url, p.need_tags, p.best_for,
        p.price_rrp_sg, p.discount_pct, p.discount_start, p.discount_end, p.is_new, p.new_until,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        COALESCE(home.qty, 0)    AS home_qty,
        COALESCE(storhub.qty, 0) AS storhub_qty
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
      LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
      WHERE p.is_active = 1 AND p.is_pawvy_pick = 1
        AND p.barcode NOT IN (${WEBSITE_HIDDEN_BARCODES.map(() => '?').join(',')})
      ORDER BY b.name, p.item_series, p.variation
    `, [...WEBSITE_HIDDEN_BARCODES]);

    const products = rows.map(r => {
      const { home_qty, storhub_qty, ...rest } = withEffectivePrice(r);
      return parseNeedTags({ ...rest, stock_status: stockStatus(home_qty + storhub_qty) });
    });
    res.json({ products });
  });

  // GET /api/shop/testimonials?need=dental — only active testimonials,
  // for exactly one need at a time (a testimonial belongs to one need,
  // see database.js). Includes the linked product's shop-facing fields
  // directly (not just an id) so the website can render the shoppable
  // row without a second round-trip per testimonial.
  router.get('/testimonials', (req, res) => {
    const { need } = req.query;
    if (!need || !NEED_TAGS.includes(need)) {
      return res.status(400).json({ error: `A valid need is required. Valid: ${NEED_TAGS.join(', ')}.` });
    }
    const rows = db.query(`
      SELECT
        t.id, t.quote, t.customer_handle, t.image_url, t.image_url_after,
        p.id AS product_id, p.item_series AS product_name, p.variation AS product_variation,
        p.image_url AS product_image_url, p.price_rrp_sg, p.discount_pct, p.discount_start, p.discount_end,
        b.name AS product_brand_name
      FROM testimonials t
      LEFT JOIN products p ON p.id = t.product_id AND p.is_active = 1
      LEFT JOIN brands b ON b.id = p.brand_id
      WHERE t.is_active = 1 AND t.need_tag = ?
      ORDER BY t.sort_order ASC, t.id ASC
    `, [need]);

    const testimonials = rows.map(r => {
      const { price_rrp_sg, discount_pct, discount_start, discount_end, ...rest } = r;
      // Only compute effective pricing if a product is actually linked —
      // withEffectivePrice expects those fields to exist, and a
      // testimonial with no linked product legitimately has none of them.
      if (rest.product_id) {
        const priced = withEffectivePrice({ price_rrp_sg, discount_pct, discount_start, discount_end });
        return { ...rest, price_rrp_sg: priced.price_rrp_sg, effective_price_rrp_sg: priced.effective_price_rrp_sg, is_discount_active: priced.is_discount_active };
      }
      return rest;
    });
    res.json({ testimonials });
  });

  return router;
};
