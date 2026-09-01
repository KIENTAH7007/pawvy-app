const { Router } = require('express');
const { localDateStr } = require('../utils/dates');

module.exports = function(db, inventoryRouter) {
  const router = Router();

  function withItems(order) {
    const items = db.query(`
      SELECT poi.id, poi.product_id, poi.qty, poi.source,
        p.item_series, p.variation, p.price_wholesale_sg, p.price_rrp_sg,
        b.name AS brand_name, b.color AS brand_color
      FROM portal_order_items poi
      JOIN products p ON p.id = poi.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE poi.portal_order_id = ?
      ORDER BY b.name, p.item_series, p.variation
    `, [order.id]);
    return { ...order, items };
  }

  // GET /api/orders — list all portal orders (optionally filtered by status)
  router.get('/', (req, res) => {
    const { status } = req.query;
    let sql = `
      SELECT po.*, pt.company_name AS matched_partner_name
      FROM portal_orders po
      LEFT JOIN partners pt ON pt.id = po.partner_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND po.status = ?'; params.push(status); }
    sql += ' ORDER BY po.submitted_at DESC';

    const orders = db.query(sql, params).map(withItems);
    res.json(orders);
  });

  // GET /api/orders/:id — single order with items
  router.get('/:id', (req, res) => {
    const order = db.queryOne('SELECT * FROM portal_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(withItems(order));
  });

  // PUT /api/orders/:id — amend company name / notes / partner match / line items.
  // Only allowed while still pending — an approved or rejected order is final.
  router.put('/:id', (req, res) => {
    const order = db.queryOne('SELECT * FROM portal_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') {
      return res.status(400).json({ error: `This order is already ${order.status} and can't be amended.` });
    }

    const { company_name, notes, partner_id, items } = req.body;

    db.run(`
      UPDATE portal_orders
      SET company_name = COALESCE(?, company_name),
          notes         = ?,
          partner_id    = ?
      WHERE id = ?
    `, [
      company_name !== undefined ? String(company_name).trim() : null,
      notes !== undefined ? notes : order.notes,
      partner_id !== undefined ? (partner_id || null) : order.partner_id,
      req.params.id
    ]);

    if (Array.isArray(items)) {
      // Preserve each product's existing source tag across an amend (KT
      // editing qty/adding SKUs shouldn't silently wipe out whether the
      // partner originally added something via the upsell section).
      const existingSource = {};
      db.query('SELECT product_id, source FROM portal_order_items WHERE portal_order_id = ?', [req.params.id])
        .forEach(r => { existingSource[r.product_id] = r.source; });

      db.run('DELETE FROM portal_order_items WHERE portal_order_id = ?', [req.params.id]);
      for (const line of items) {
        const qty = parseInt(line.qty);
        if (!line.product_id || !qty || qty <= 0) continue;
        const src = line.source || existingSource[line.product_id] || 'catalogue';
        db.run(`
          INSERT INTO portal_order_items (portal_order_id, product_id, qty, source)
          VALUES (?, ?, ?, ?)
        `, [req.params.id, line.product_id, qty, src]);
      }
    }

    res.json(withItems(db.queryOne('SELECT * FROM portal_orders WHERE id = ?', [req.params.id])));
  });

  // POST /api/orders/:id/approve — creates real sale records and deducts inventory.
  // Body: { partner_id, items: [{ product_id, qty, unit_cost, unit_price, platform_fee_pct, platform_fee_amt, special_discount_amt }] }
  // Pricing/discount math is computed by the internal review UI (same logic as Record
  // Sale, based on the selected partner's discount model) and passed in already-final —
  // this endpoint's job is just to commit it consistently, the same way /api/sales does.
  //
  // special_discount_amt (new): KT's one-off, per-occasion discount, kept separate from
  // platform_fee_amt (the partner's own standing rebate) purely for audit trail — see the
  // comment on the sales table schema in server/database.js. unit_price here is still the
  // FINAL per-unit price (post-special, pre-rebate) — its meaning is unchanged, this is
  // purely an additive field alongside it.
  router.post('/:id/approve', (req, res) => {
    const order = db.queryOne('SELECT * FROM portal_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') {
      return res.status(400).json({ error: `This order is already ${order.status}.` });
    }

    const { partner_id, items, shipping_charged, shipping_cost } = req.body;
    if (!partner_id) {
      return res.status(400).json({ error: 'Select which partner this order belongs to before approving — the company name typed on the portal is free text and can\'t be trusted to match automatically.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required to approve this order.' });
    }

    const today = localDateStr();
    const saleIds = [];
    const shipCharged = parseFloat(shipping_charged) || 0;
    const shipCost    = parseFloat(shipping_cost)    || 0;

    for (let i = 0; i < items.length; i++) {
      const line = items[i];
      const qty = parseInt(line.qty);
      if (!line.product_id || !qty || qty <= 0 || line.unit_price === undefined) {
        return res.status(400).json({ error: 'Each item needs a valid product, quantity, and price.' });
      }

      let cost = line.unit_cost;
      if (cost === undefined || cost === null) {
        const product = db.queryOne('SELECT unit_cost FROM products WHERE id = ?', [line.product_id]);
        cost = product?.unit_cost || 0;
      }
      const fee_pct = line.platform_fee_pct || 0;
      const fee_amt = line.platform_fee_amt !== undefined
        ? parseFloat(line.platform_fee_amt)
        : parseFloat(((qty * line.unit_price) * (fee_pct / 100)).toFixed(2));
      const special_amt = parseFloat(line.special_discount_amt) || 0;

      // Shipping is per-order, not per-line — same convention as Record Sale:
      // only the first created sale row carries it.
      const isFirst = i === 0;

      const result = db.run(`
        INSERT INTO sales
          (date, product_id, partner_id, channel, market, qty, unit_cost, unit_price,
           platform_fee_pct, platform_fee_amt, special_discount_amt, shipping_charged, shipping_cost, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, [
        today, line.product_id, partner_id || null, 'Wholesale Order', 'SG',
        qty, cost, line.unit_price, fee_pct, fee_amt, special_amt,
        isFirst ? shipCharged : 0, isFirst ? shipCost : 0,
        `Order Portal — ${order.company_name}`
      ]);

      saleIds.push(result.lastID);

      if (inventoryRouter?._recordMovement) {
        inventoryRouter._recordMovement({
          date: today, product_id: line.product_id, location: 'Home',
          type: 'Sale', qty_change: -qty, reference: `sale_${result.lastID}`
        });
      }
    }

    db.run(`
      UPDATE portal_orders
      SET status = 'approved', partner_id = ?, created_sale_ids = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [partner_id || null, saleIds.join(','), req.params.id]);

    res.json({ ok: true, sale_ids: saleIds, order: withItems(db.queryOne('SELECT * FROM portal_orders WHERE id = ?', [req.params.id])) });
  });

  // POST /api/orders/:id/reject — declines the order, no sales created
  router.post('/:id/reject', (req, res) => {
    const order = db.queryOne('SELECT * FROM portal_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') {
      return res.status(400).json({ error: `This order is already ${order.status}.` });
    }
    db.run(`UPDATE portal_orders SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    res.json(withItems(db.queryOne('SELECT * FROM portal_orders WHERE id = ?', [req.params.id])));
  });

  // POST /api/orders/:id/void — marks an approved or rejected order as voided.
  // This is purely a bookkeeping marker on the order record — it deliberately
  // does NOT touch the sales table. If the order was approved and already
  // created a sale, that sale is voided manually in the Sales Ledger, by design.
  router.post('/:id/void', (req, res) => {
    const order = db.queryOne('SELECT * FROM portal_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'pending') {
      return res.status(400).json({ error: 'This order is still pending — reject it instead of voiding.' });
    }
    if (order.voided_at) {
      return res.status(400).json({ error: 'This order is already voided.' });
    }
    db.run('UPDATE portal_orders SET voided_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    res.json(withItems(db.queryOne('SELECT * FROM portal_orders WHERE id = ?', [req.params.id])));
  });

  return router;
};
