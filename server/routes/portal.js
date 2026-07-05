const { Router } = require('express');

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
      ORDER BY b.name, p.item_series, p.variation
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
      // (Home + Storhub combined). The exact number is intentionally not
      // disclosed in this message — only that the requested amount isn't
      // available — to keep exact stock levels private.
      if (qty > product.total_qty) {
        const name = `${product.item_series}${product.variation ? ' · ' + product.variation : ''}`;
        return res.status(400).json({ error: `The quantity requested for "${name}" isn't available right now. Please reduce the quantity and try again.` });
      }
    }

    const orderResult = db.run(`
      INSERT INTO portal_orders (company_name, notes, status)
      VALUES (?, ?, 'pending')
    `, [String(company_name).trim(), notes || null]);

    const portalOrderId = orderResult.lastID;
    for (const line of items) {
      db.run(`
        INSERT INTO portal_order_items (portal_order_id, product_id, qty)
        VALUES (?, ?, ?)
      `, [portalOrderId, line.product_id, parseInt(line.qty)]);
    }

    res.status(201).json({ ok: true, order_id: portalOrderId });
  });

  return router;
};
