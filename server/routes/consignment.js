const { Router } = require('express');

module.exports = function(db) {
  const router = Router();

  // ── Core on-hand calculation (snapshot-aware) ──────────────────
  // On Hand = latest_snapshot_qty + placed_since - invoiced_since - returned_since
  function getOnHand(partner_id) {
    // Latest snapshot per product
    const snapRows = db.query(`
      SELECT product_id, on_hand_qty, snapshot_date, consignment_price
      FROM consignment_snapshots WHERE partner_id = ?
      ORDER BY snapshot_date DESC
    `, [partner_id]);
    const latestSnap = {};
    snapRows.forEach(s => { if (!latestSnap[s.product_id]) latestSnap[s.product_id] = s; });

    // All products ever placed
    const placed = db.query(`
      SELECT cp.product_id,
        p.item_series, p.variation, p.barcode,
        p.unit_cost, p.price_consignment_sg AS consignment_price,
        b.name AS brand_name, b.color AS brand_color,
        SUM(cp.qty) AS total_placed_ever
      FROM consignment_placements cp
      JOIN products p ON p.id = cp.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE cp.partner_id = ?
      GROUP BY cp.product_id
    `, [partner_id]);

    // Union of product IDs from placements + snapshots
    const allIds = new Set([
      ...placed.map(p => p.product_id),
      ...Object.keys(latestSnap).map(Number),
    ]);

    const result = [];
    for (const pid of allIds) {
      const placedInfo = placed.find(p => p.product_id === pid);
      const snap       = latestSnap[pid];
      const snapDate   = snap ? snap.snapshot_date : '1970-01-01';
      const snapQty    = snap ? snap.on_hand_qty   : 0;

      // If no placement info, fetch product details from products table
      let info = placedInfo;
      if (!info) {
        info = db.queryOne(`
          SELECT p.id AS product_id, p.item_series, p.variation, p.unit_cost,
            p.price_consignment_sg AS consignment_price,
            b.name AS brand_name, b.color AS brand_color
          FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = ?
        `, [pid]);
      }

      // Activity since last snapshot (or since epoch if no snapshot)
      const placedSince   = db.queryOne(`SELECT COALESCE(SUM(qty),0) AS n FROM consignment_placements WHERE partner_id=? AND product_id=? AND date>?`, [partner_id, pid, snapDate])?.n || 0;
      const invoicedSince = db.queryOne(`SELECT COALESCE(SUM(cci.qty_discrepancy),0) AS n FROM consignment_count_items cci JOIN consignment_counts cc ON cc.id=cci.count_id WHERE cc.partner_id=? AND cci.product_id=? AND cc.invoiced=1 AND cci.qty_discrepancy>0 AND cc.date>?`, [partner_id, pid, snapDate])?.n || 0;
      const returnedSince = db.queryOne(`SELECT COALESCE(SUM(qty),0) AS n FROM consignment_returns WHERE partner_id=? AND product_id=? AND date>?`, [partner_id, pid, snapDate])?.n || 0;

      const on_hand = snapQty + placedSince - invoicedSince - returnedSince;
      const price   = info?.consignment_price || snap?.consignment_price || 0;

      result.push({
        ...(info || {}),
        product_id:      pid,
        snapshot_qty:    snapQty,
        snapshot_date:   snapDate === '1970-01-01' ? null : snapDate,
        placed_since:    placedSince,
        invoiced_since:  invoicedSince,
        returned_since:  returnedSince,
        on_hand,
        consignment_price: price,
        total_placed:    placedInfo?.total_placed_ever || 0,
      });
    }

    return result.filter(p => (p.total_placed || 0) > 0 || (p.snapshot_qty || 0) > 0);
  }

  // ── GET on-hand summary ────────────────────────────────────────
  router.get('/on-hand/:partner_id', (req, res) => {
    const partner = db.queryOne('SELECT * FROM partners WHERE id = ?', [req.params.partner_id]);
    res.json({ partner, items: getOnHand(req.params.partner_id) });
  });

  // ── GET consignment partners ───────────────────────────────────
  router.get('/partners', (req, res) => {
    res.json(db.query("SELECT * FROM partners WHERE model='Consignment' AND is_active=1 ORDER BY company_name"));
  });

  // ── GET snapshots (period history) ────────────────────────────
  router.get('/snapshots/:partner_id', (req, res) => {
    const rows = db.query(`
      SELECT cs.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color
      FROM consignment_snapshots cs
      JOIN products p ON p.id = cs.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE cs.partner_id = ?
      ORDER BY cs.snapshot_date DESC, cs.created_at DESC
    `, [req.params.partner_id]);

    // Group by period
    const periods = {};
    rows.forEach(r => {
      const key = r.period_label || r.snapshot_date;
      if (!periods[key]) periods[key] = { label: key, date: r.snapshot_date, items: [] };
      periods[key].items.push(r);
    });
    res.json(Object.values(periods).sort((a,b) => b.date.localeCompare(a.date)));
  });

  // ── GET placements history ─────────────────────────────────────
  router.get('/placements/:partner_id', (req, res) => {
    res.json(db.query(`
      SELECT cp.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color
      FROM consignment_placements cp
      JOIN products p ON p.id = cp.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE cp.partner_id = ? ORDER BY cp.date DESC, cp.created_at DESC
    `, [req.params.partner_id]));
  });

  // ── GET returns history ────────────────────────────────────────
  router.get('/returns/:partner_id', (req, res) => {
    res.json(db.query(`
      SELECT cr.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color
      FROM consignment_returns cr
      JOIN products p ON p.id = cr.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE cr.partner_id = ? ORDER BY cr.date DESC, cr.created_at DESC
    `, [req.params.partner_id]));
  });

  // ── GET counts history ─────────────────────────────────────────
  router.get('/counts/:partner_id', (req, res) => {
    const counts = db.query(`
      SELECT cc.*, COUNT(cci.id) AS line_count,
        COALESCE(SUM(cci.qty_discrepancy),0) AS total_discrepancy,
        ROUND(COALESCE(SUM(cci.qty_discrepancy * cci.consignment_price),0),2) AS invoice_amount
      FROM consignment_counts cc
      LEFT JOIN consignment_count_items cci ON cci.count_id = cc.id
      WHERE cc.partner_id = ?
      GROUP BY cc.id ORDER BY cc.date DESC, cc.created_at DESC
    `, [req.params.partner_id]);

    res.json(counts.map(c => ({
      ...c,
      items: db.query(`
        SELECT cci.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color
        FROM consignment_count_items cci
        JOIN products p ON p.id = cci.product_id
        JOIN brands   b ON b.id = p.brand_id
        WHERE cci.count_id = ?
      `, [c.id]),
    })));
  });

  // ── POST place stock ──────────────────────────────────────────
  router.post('/placements', (req, res) => {
    const { partner_id, product_id, date, qty, consignment_price, unit_cost, notes } = req.body;
    if (!partner_id || !product_id || !date || !qty) return res.status(400).json({ error: 'partner_id, product_id, date, qty required' });
    let price = consignment_price, cost = unit_cost;
    if (price === undefined || cost === undefined) {
      const prod = db.queryOne('SELECT unit_cost, price_consignment_sg FROM products WHERE id = ?', [product_id]);
      if (price === undefined) price = prod?.price_consignment_sg || 0;
      if (cost  === undefined) cost  = prod?.unit_cost || 0;
    }
    const result = db.run(
      'INSERT INTO consignment_placements (partner_id,product_id,date,qty,unit_cost,consignment_price,notes) VALUES (?,?,?,?,?,?,?)',
      [partner_id, product_id, date, parseInt(qty), parseFloat(cost||0), parseFloat(price||0), notes||null]
    );
    res.status(201).json({ id: result.lastID, ok: true });
  });

  router.delete('/placements/:id', (req, res) => {
    db.run('DELETE FROM consignment_placements WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── POST record return ────────────────────────────────────────
  router.post('/returns', (req, res) => {
    const { partner_id, product_id, date, qty, notes } = req.body;
    if (!partner_id || !product_id || !date || !qty) return res.status(400).json({ error: 'partner_id, product_id, date, qty required' });
    const result = db.run(
      'INSERT INTO consignment_returns (partner_id,product_id,date,qty,notes) VALUES (?,?,?,?,?)',
      [partner_id, product_id, date, parseInt(qty), notes||null]
    );
    res.status(201).json({ id: result.lastID, ok: true });
  });

  router.delete('/returns/:id', (req, res) => {
    db.run('DELETE FROM consignment_returns WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── POST stock count + auto-invoice ──────────────────────────
  router.post('/counts', (req, res) => {
    const { partner_id, date, notes, items } = req.body;
    if (!partner_id || !date || !items?.length) return res.status(400).json({ error: 'partner_id, date, items required' });
    const onHandMap = {};
    getOnHand(partner_id).forEach(r => { onHandMap[r.product_id] = r; });
    const countResult = db.run(
      'INSERT INTO consignment_counts (partner_id,date,notes,invoiced) VALUES (?,?,?,1)',
      [partner_id, date, notes||null]
    );
    const count_id = countResult.lastID;
    let invoiceTotal = 0;
    const invoiceLines = [];
    for (const item of items) {
      const oh              = onHandMap[item.product_id] || { on_hand:0, consignment_price:0, unit_cost:0 };
      const qty_on_hand     = oh.on_hand;
      const qty_counted     = parseInt(item.qty_counted) || 0;
      const qty_discrepancy = Math.max(0, qty_on_hand - qty_counted);
      const cPrice          = parseFloat(oh.consignment_price) || 0;
      const uCost           = parseFloat(oh.unit_cost) || 0;
      db.run(
        'INSERT INTO consignment_count_items (count_id,product_id,qty_on_hand,qty_counted,qty_discrepancy,consignment_price,unit_cost) VALUES (?,?,?,?,?,?,?)',
        [count_id, item.product_id, qty_on_hand, qty_counted, qty_discrepancy, cPrice, uCost]
      );
      if (qty_discrepancy > 0) {
        db.run(`INSERT INTO sales (date,product_id,partner_id,channel,market,qty,unit_cost,unit_price,platform_fee_pct,platform_fee_amt,notes) VALUES (?,?,?,?,?,?,?,?,0,0,?)`,
          [date, item.product_id, partner_id, 'Consignment Sale', 'SG', qty_discrepancy, uCost, cPrice, `Stock count – count_id ${count_id}`]);
        invoiceTotal += qty_discrepancy * cPrice;
        invoiceLines.push({ product_id: item.product_id, qty: qty_discrepancy, unit_price: cPrice, line_total: qty_discrepancy * cPrice });
      }
    }
    res.status(201).json({ ok:true, count_id, invoice_total: parseFloat(invoiceTotal.toFixed(2)), lines_invoiced: invoiceLines.length, invoice_lines: invoiceLines });
  });

  router.delete('/counts/:id', (req, res) => {
    const count = db.queryOne('SELECT * FROM consignment_counts WHERE id = ?', [req.params.id]);
    if (!count) return res.status(404).json({ error: 'Not found' });
    db.run(`UPDATE sales SET voided=1, updated_at=CURRENT_TIMESTAMP WHERE notes LIKE ? AND partner_id=?`, [`%count_id ${req.params.id}%`, count.partner_id]);
    db.run('DELETE FROM consignment_counts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── POST close month (snapshot) ────────────────────────────────
  router.post('/snapshot', (req, res) => {
    const { partner_id, period_label, date } = req.body;
    if (!partner_id || !date) return res.status(400).json({ error: 'partner_id and date required' });
    const items = getOnHand(partner_id);
    if (items.length === 0) return res.status(400).json({ error: 'No active consignment stock to snapshot' });
    for (const item of items) {
      db.run(
        'INSERT INTO consignment_snapshots (partner_id,product_id,snapshot_date,period_label,on_hand_qty,consignment_price) VALUES (?,?,?,?,?,?)',
        [partner_id, item.product_id, date, period_label||null, Math.max(0, item.on_hand), item.consignment_price||0]
      );
    }
    res.status(201).json({ ok:true, items_snapshotted: items.length, date, period_label });
  });

  return router;
};
