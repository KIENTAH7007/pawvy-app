const { Router } = require('express');
const { withEffectivePrice, stockStatus } = require('../lib/pricing');

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
module.exports = function(db) {
  const router = Router();

  // GET /api/shop/products — active products only, with brand + effective
  // pricing + stock status. Supports the same brand_id/search filters as
  // the staff endpoint for consistency, minus anything staff-only.
  router.get('/products', (req, res) => {
    const { brand_id, search } = req.query;
    let sql = `
      SELECT
        p.id, p.item_series, p.variation, p.image_data,
        p.price_rrp_sg, p.discount_pct, p.discount_start, p.discount_end,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        COALESCE(home.qty, 0)    AS home_qty,
        COALESCE(storhub.qty, 0) AS storhub_qty
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
      LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
      WHERE p.is_active = 1
    `;
    const params = [];
    if (brand_id) { sql += ' AND p.brand_id = ?'; params.push(brand_id); }
    if (search) {
      sql += ' AND (p.item_series LIKE ? OR p.variation LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY b.name, COALESCE(p.portal_sort_order, 999999), p.item_series, p.variation';

    const rows = db.query(sql, params);
    const products = rows.map(r => {
      const { home_qty, storhub_qty, ...rest } = withEffectivePrice(r);
      return { ...rest, stock_status: stockStatus(home_qty + storhub_qty) };
    });
    res.json({ products });
  });

  // GET /api/shop/products/:id — single product detail, same field scope
  // as the list above.
  router.get('/products/:id', (req, res) => {
    const row = db.queryOne(`
      SELECT
        p.id, p.item_series, p.variation, p.image_data, p.description,
        p.price_rrp_sg, p.discount_pct, p.discount_start, p.discount_end,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        COALESCE(home.qty, 0)    AS home_qty,
        COALESCE(storhub.qty, 0) AS storhub_qty
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
      LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
      WHERE p.id = ? AND p.is_active = 1
    `, [req.params.id]);

    if (!row) return res.status(404).json({ error: 'Product not found.' });
    const { home_qty, storhub_qty, ...rest } = withEffectivePrice(row);
    res.json({ product: { ...rest, stock_status: stockStatus(home_qty + storhub_qty) } });
  });

  // GET /api/shop/brands — for a brand filter on the shop page.
  router.get('/brands', (req, res) => {
    res.json({ brands: db.query('SELECT id, name, color FROM brands ORDER BY name') });
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
        p.id, p.item_series, p.variation, p.image_data,
        p.price_rrp_sg, p.discount_pct, p.discount_start, p.discount_end,
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
      GROUP BY p.id
      ORDER BY units_sold DESC
      LIMIT ?
    `, [limit * 2]); // over-fetch since some will be filtered out as out-of-stock below

    const products = rows
      .map(r => {
        const { home_qty, storhub_qty, units_sold, ...rest } = withEffectivePrice(r);
        return { ...rest, stock_status: stockStatus(home_qty + storhub_qty), units_sold };
      })
      .filter(p => p.stock_status !== 'out_of_stock')
      .slice(0, limit);

    res.json({ products });
  });

  return router;
};
