const { Router } = require('express');
const { notifyNewPortalOrder } = require('../utils/notify');

// Live stock bucket, per the agreed Order Portal design:
// Available (>5) / Low Stock (1–5) / Out of Stock (0, blocked from ordering)
// Counts Home + Storhub combined — Storhub stock is a same-day transfer away,
// so it's genuinely available, not just Home's current fulfillment-ready qty.
function stockStatus(totalQty) {
  if (totalQty <= 0) return 'out_of_stock';
  if (totalQty <= 5) return 'low_stock';
  return 'available';
}

module.exports = function(db) {
  const router = Router();

  // GET /api/portal/catalogue — public product catalogue with live stock
  router.get('/catalogue', (req, res) => {
    const rows = db.query(`
      SELECT
        p.id, p.item_series, p.variation, p.image_data,
        p.price_wholesale_sg, p.price_rrp_sg,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        COALESCE(home.qty, 0)    AS home_qty,
        COALESCE(storhub.qty, 0) AS storhub_qty
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
      LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
      WHERE p.is_active = 1
      ORDER BY b.name, COALESCE(p.portal_sort_order, 999999), p.item_series, p.variation
    `);

    const catalogue = rows.map(r => ({
      id: r.id,
      brand_id: r.brand_id,
      brand_name: r.brand_name,
      brand_color: r.brand_color,
      item_series: r.item_series,
      variation: r.variation,
      image_data: r.image_data || null,
      price_wholesale_sg: r.price_wholesale_sg,
      price_rrp_sg: r.price_rrp_sg,
      stock_status: stockStatus(r.home_qty + r.storhub_qty),
    }));

    res.json(catalogue);
  });

  // GET /api/portal/top-sellers — top 8 IN-STOCK products by qty sold in
  // the last 3 months, for the "Our Top Sellers" upsell section on Review
  // Your Order. Out-of-stock SKUs are skipped entirely (no point upselling
  // something that can't be ordered) and backfilled from further down the
  // ranking, rather than just showing fewer than 8 cards. Same shape as
  // /catalogue (so the same ProductCard renders both) plus a 1-indexed
  // `rank` field for the #1/#2/#3 badge on the frontend.
  router.get('/top-sellers', (req, res) => {
    const since = new Date();
    since.setMonth(since.getMonth() - 3);
    const sinceStr = since.toISOString().slice(0, 10);

    // Pull more candidates than the 8 we need, since some near the top may
    // turn out to be out of stock and get filtered out below.
    const ranked = db.query(`
      SELECT s.product_id, SUM(s.qty) AS total_qty
      FROM sales s
      WHERE s.date >= ? AND COALESCE(s.voided,0) = 0
      GROUP BY s.product_id
      ORDER BY total_qty DESC
      LIMIT 30
    `, [sinceStr]);

    if (ranked.length === 0) return res.json([]);

    const ids = ranked.map(r => r.product_id);
    const rows = db.query(`
      SELECT
        p.id, p.item_series, p.variation, p.image_data, p.is_active,
        p.price_wholesale_sg, p.price_rrp_sg,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        COALESCE(home.qty, 0)    AS home_qty,
        COALESCE(storhub.qty, 0) AS storhub_qty
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
      LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
      WHERE p.id IN (${ids.map(() => '?').join(',')})
    `, ids);

    const byId = {};
    rows.forEach(r => { byId[r.id] = r; });

    // Preserve the qty-sold ranking order, drop anything archived/deleted
    // or currently out of stock, then take the top 8 that remain and
    // re-number them 1-8 cleanly (never a gap like #1, #3, #4).
    const topSellers = ranked
      .map(r => byId[r.product_id])
      .filter(r => r && r.is_active)
      .map(r => ({
        id: r.id,
        brand_id: r.brand_id,
        brand_name: r.brand_name,
        brand_color: r.brand_color,
        item_series: r.item_series,
        variation: r.variation,
        image_data: r.image_data || null,
        price_wholesale_sg: r.price_wholesale_sg,
        price_rrp_sg: r.price_rrp_sg,
        stock_status: stockStatus(r.home_qty + r.storhub_qty),
      }))
      .filter(p => p.stock_status !== 'out_of_stock')
      .slice(0, 8)
      .map((p, idx) => ({ ...p, rank: idx + 1 }));

    res.json(topSellers);
  });

  // POST /api/portal/orders — public order submission
  router.post('/orders', (req, res) => {
    const { company_name, notes, items } = req.body;

    if (!company_name || !String(company_name).trim()) {
      return res.status(400).json({ error: 'Company name is required.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Add at least one item to your order.' });
    }

    // Validate every line: product must exist, be active, have qty > 0,
    // and not be out of stock (defense in depth — the portal UI already blocks this).
    for (const line of items) {
      const qty = parseInt(line.qty);
      if (!line.product_id || !qty || qty <= 0) {
        return res.status(400).json({ error: 'Each item needs a valid product and quantity.' });
      }
      const product = db.queryOne(`
        SELECT p.id, p.is_active, p.item_series, p.variation,
          COALESCE(home.qty, 0) + COALESCE(storhub.qty, 0) AS total_qty
        FROM products p
        LEFT JOIN inventory_levels home    ON home.product_id = p.id    AND home.location    = 'Home'
        LEFT JOIN inventory_levels storhub ON storhub.product_id = p.id AND storhub.location = 'Storhub'
        WHERE p.id = ?
      `, [line.product_id]);
      if (!product || !product.is_active) {
        return res.status(400).json({ error: `One of the items in your order is no longer available.` });
      }
      if (product.total_qty <= 0) {
        return res.status(400).json({ error: `One of the items in your order just went out of stock — please remove it and try again.` });
      }
      // Hard cap: never allow ordering more than what's actually in stock
      // (Home + Storhub combined). The available number IS disclosed here —
      // deliberately, so the partner can correct their order in one try
      // instead of guessing downward repeatedly. This is a considered
      // exception to "don't show exact stock" — it only surfaces once
      // someone has already requested more than what's available.
      if (qty > product.total_qty) {
        const name = `${product.item_series}${product.variation ? ' · ' + product.variation : ''}`;
        return res.status(400).json({
          error: `Only ${product.total_qty} unit${product.total_qty === 1 ? '' : 's'} of "${name}" ${product.total_qty === 1 ? 'is' : 'are'} currently available. Please adjust the quantity and try again.`
        });
      }
    }

    const orderResult = db.run(`
      INSERT INTO portal_orders (company_name, notes, status)
      VALUES (?, ?, 'pending')
    `, [String(company_name).trim(), notes || null]);

    const portalOrderId = orderResult.lastID;
    for (const line of items) {
      const src = line.source === 'upsell' ? 'upsell' : 'catalogue';
      db.run(`
        INSERT INTO portal_order_items (portal_order_id, product_id, qty, source)
        VALUES (?, ?, ?, ?)
      `, [portalOrderId, line.product_id, parseInt(line.qty), src]);
    }

    // Fire notification (Telegram + email) — never blocks the response, and
    // each channel independently swallows its own errors (see notify.js),
    // so a notification outage can never break order submission itself.
    try {
      const productIds = items.map(l => l.product_id);
      const products = db.query(`
        SELECT id, item_series, variation FROM products
        WHERE id IN (${productIds.map(() => '?').join(',')})
      `, productIds);
      const nameById = {};
      products.forEach(p => { nameById[p.id] = `${p.item_series}${p.variation ? ' · ' + p.variation : ''}`; });

      notifyNewPortalOrder({
        orderId: portalOrderId,
        companyName: String(company_name).trim(),
        notes: notes || null,
        lines: items.map(l => ({ qty: parseInt(l.qty), name: nameById[l.product_id] || `Product #${l.product_id}` })),
      });
    } catch (err) {
      console.error('⚠️  Failed to build/send new-order notification:', err.message);
    }

    res.status(201).json({ ok: true, order_id: portalOrderId });
  });

  return router;
};
