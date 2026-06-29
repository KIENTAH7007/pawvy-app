const { Router } = require('express');

module.exports = function(db) {
  const router = Router();

  // ── Helpers ────────────────────────────────────────────────────

  // Calculate current on-hand for every product a partner has ever received
  function getOnHand(partner_id) {
    // All products ever placed with this partner
    const placed = db.query(`
      SELECT cp.product_id,
        p.item_series, p.variation, p.barcode,
        p.unit_cost, p.price_consignment_sg AS consignment_price,
        b.name AS brand_name, b.color AS brand_color,
        COALESCE(SUM(cp.qty), 0) AS total_placed
      FROM consignment_placements cp
      JOIN products p ON p.id = cp.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE cp.partner_id = ?
      GROUP BY cp.product_id
    `, [partner_id]);

    // Invoiced discrepancies (units confirmed sold via stock count)
    const invoiced = db.query(`
      SELECT cci.product_id, COALESCE(SUM(cci.qty_discrepancy), 0) AS total_invoiced
      FROM consignment_count_items cci
      JOIN consignment_counts cc ON cc.id = cci.count_id
      WHERE cc.partner_id = ? AND cc.invoiced = 1 AND cci.qty_discrepancy > 0
      GROUP BY cci.product_id
    `, [partner_id]);

    // Returns
    const returned = db.query(`
      SELECT product_id, COALESCE(SUM(qty), 0) AS total_returned
      FROM consignment_returns
      WHERE partner_id = ?
      GROUP BY product_id
    `, [partner_id]);

    const invoicedMap = {};
    invoiced.forEach(r => { invoicedMap[r.product_id] = r.total_invoiced; });
    const returnedMap = {};
    returned.forEach(r => { returnedMap[r.product_id] = r.total_returned; });

    return placed.map(p => {
      const inv = invoicedMap[p.product_id] || 0;
      const ret = returnedMap[p.product_id] || 0;
      const on_hand = p.total_placed - inv - ret;
      return { ...p, total_invoiced: inv, total_returned: ret, on_hand };
    }).filter(p => p.total_placed > 0); // only show products with placement history
  }

  // ── GET on-hand summary for a partner ─────────────────────────
  router.get('/on-hand/:partner_id', (req, res) => {
    const { partner_id } = req.params;
    const rows = getOnHand(partner_id);
    const partner = db.queryOne('SELECT * FROM partners WHERE id = ?', [partner_id]);
    res.json({ partner, items: rows });
  });

  // ── GET consignment partners (model = Consignment) ────────────
  router.get('/partners', (req, res) => {
    res.json(db.query(
      "SELECT * FROM partners WHERE model = 'Consignment' AND is_active = 1 ORDER BY company_name"
    ));
  });

  // ── GET placements history for a partner ──────────────────────
  router.get('/placements/:partner_id', (req, res) => {
    res.json(db.query(`
      SELECT cp.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color
      FROM consignment_placements cp
      JOIN products p ON p.id = cp.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE cp.partner_id = ?
      ORDER BY cp.date DESC, cp.created_at DESC
    `, [req.params.partner_id]));
  });

  // ── GET returns history for a partner ────────────────────────
  router.get('/returns/:partner_id', (req, res) => {
    res.json(db.query(`
      SELECT cr.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color
      FROM consignment_returns cr
      JOIN products p ON p.id = cr.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE cr.partner_id = ?
      ORDER BY cr.date DESC, cr.created_at DESC
    `, [req.params.partner_id]));
  });

  // ── GET count history for a partner ──────────────────────────
  router.get('/counts/:partner_id', (req, res) => {
    const counts = db.query(`
      SELECT cc.*, COUNT(cci.id) AS line_count,
        COALESCE(SUM(cci.qty_discrepancy), 0) AS total_discrepancy,
        ROUND(COALESCE(SUM(cci.qty_discrepancy * cci.consignment_price), 0), 2) AS invoice_amount
      FROM consignment_counts cc
      LEFT JOIN consignment_count_items cci ON cci.count_id = cc.id
      WHERE cc.partner_id = ?
      GROUP BY cc.id
      ORDER BY cc.date DESC, cc.created_at DESC
    `, [req.params.partner_id]);

    // Attach line items to each count
    const result = counts.map(c => {
      const items = db.query(`
        SELECT cci.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color
        FROM consignment_count_items cci
        JOIN products p ON p.id = cci.product_id
        JOIN brands   b ON b.id = p.brand_id
        WHERE cci.count_id = ?
      `, [c.id]);
      return { ...c, items };
    });
    res.json(result);
  });

  // ── POST place stock ──────────────────────────────────────────
  router.post('/placements', (req, res) => {
    const { partner_id, product_id, date, qty, consignment_price, unit_cost, notes } = req.body;
    if (!partner_id || !product_id || !date || !qty) {
      return res.status(400).json({ error: 'partner_id, product_id, date, qty required' });
    }
    // Auto-fill price/cost from product if not provided
    let price = consignment_price;
    let cost  = unit_cost;
    if (price === undefined || cost === undefined) {
      const prod = db.queryOne('SELECT unit_cost, price_consignment_sg FROM products WHERE id = ?', [product_id]);
      if (price === undefined) price = prod?.price_consignment_sg || 0;
      if (cost  === undefined) cost  = prod?.unit_cost || 0;
    }
    const result = db.run(
      'INSERT INTO consignment_placements (partner_id, product_id, date, qty, unit_cost, consignment_price, notes) VALUES (?,?,?,?,?,?,?)',
      [partner_id, product_id, date, parseInt(qty), parseFloat(cost), parseFloat(price), notes || null]
    );
    res.status(201).json({ id: result.lastID, ok: true });
  });

  // ── DELETE a placement ─────────────────────────────────────────
  router.delete('/placements/:id', (req, res) => {
    db.run('DELETE FROM consignment_placements WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── POST record return ────────────────────────────────────────
  router.post('/returns', (req, res) => {
    const { partner_id, product_id, date, qty, notes } = req.body;
    if (!partner_id || !product_id || !date || !qty) {
      return res.status(400).json({ error: 'partner_id, product_id, date, qty required' });
    }
    const result = db.run(
      'INSERT INTO consignment_returns (partner_id, product_id, date, qty, notes) VALUES (?,?,?,?,?)',
      [partner_id, product_id, date, parseInt(qty), notes || null]
    );
    res.status(201).json({ id: result.lastID, ok: true });
  });

  // ── DELETE a return ────────────────────────────────────────────
  router.delete('/returns/:id', (req, res) => {
    db.run('DELETE FROM consignment_returns WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── POST stock count + auto-invoice ──────────────────────────
  // Body: { partner_id, date, notes, items: [{ product_id, qty_counted }] }
  router.post('/counts', (req, res) => {
    const { partner_id, date, notes, items } = req.body;
    if (!partner_id || !date || !items?.length) {
      return res.status(400).json({ error: 'partner_id, date, items required' });
    }

    // Get current on-hand for cross-reference
    const onHandMap = {};
    getOnHand(partner_id).forEach(r => { onHandMap[r.product_id] = r; });

    // Save count header
    const countResult = db.run(
      'INSERT INTO consignment_counts (partner_id, date, notes, invoiced) VALUES (?,?,?,1)',
      [partner_id, date, notes || null]
    );
    const count_id = countResult.lastID;

    let invoiceTotal = 0;
    const invoiceLines = [];

    for (const item of items) {
      const oh = onHandMap[item.product_id] || { on_hand: 0, consignment_price: 0, unit_cost: 0 };
      const qty_on_hand     = oh.on_hand;
      const qty_counted     = parseInt(item.qty_counted) || 0;
      const qty_discrepancy = Math.max(0, qty_on_hand - qty_counted); // units sold
      const cPrice = parseFloat(oh.consignment_price) || 0;
      const uCost  = parseFloat(oh.unit_cost) || 0;

      // Save count line
      db.run(
        'INSERT INTO consignment_count_items (count_id, product_id, qty_on_hand, qty_counted, qty_discrepancy, consignment_price, unit_cost) VALUES (?,?,?,?,?,?,?)',
        [count_id, item.product_id, qty_on_hand, qty_counted, qty_discrepancy, cPrice, uCost]
      );

      // If discrepancy > 0, auto-create a sale record (Consignment Sale)
      if (qty_discrepancy > 0) {
        db.run(`
          INSERT INTO sales
            (date, product_id, partner_id, channel, market, qty, unit_cost, unit_price,
             platform_fee_pct, platform_fee_amt, notes)
          VALUES (?,?,?,?,?,?,?,?,0,0,?)
        `, [
          date, item.product_id, partner_id,
          'Consignment Sale', 'SG',
          qty_discrepancy, uCost, cPrice,
          `Stock count – count_id ${count_id}`
        ]);
        invoiceTotal += qty_discrepancy * cPrice;
        invoiceLines.push({
          product_id: item.product_id,
          qty: qty_discrepancy,
          unit_price: cPrice,
          line_total: qty_discrepancy * cPrice,
        });
      }
    }

    res.status(201).json({
      ok: true, count_id,
      invoice_total: parseFloat(invoiceTotal.toFixed(2)),
      lines_invoiced: invoiceLines.length,
      invoice_lines: invoiceLines,
    });
  });

  // ── DELETE a count (and its sale records) ─────────────────────
  router.delete('/counts/:id', (req, res) => {
    const count = db.queryOne('SELECT * FROM consignment_counts WHERE id = ?', [req.params.id]);
    if (!count) return res.status(404).json({ error: 'Not found' });

    // Void all sales created from this count
    db.run(`UPDATE sales SET voided = 1 WHERE notes LIKE ? AND partner_id = ?`,
      [`%count_id ${req.params.id}%`, count.partner_id]);

    db.run('DELETE FROM consignment_counts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
