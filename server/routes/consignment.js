const { Router } = require('express');

module.exports = function(db) {
  const router = Router();

  // ── Core on-hand calculation (snapshot-aware) ──────────────────
  // On Hand = latest_snapshot_qty + placed_since - invoiced_since - returned_since
  //
  // IMPORTANT: "since" is determined by created_at (full timestamp, true
  // recording order), NOT the user-entered `date` field. The `date` field
  // is calendar-day-only — if a Close Month snapshot and a later
  // correction (e.g. an extra return recorded after realizing more stock
  // needs to come back) both fall on the SAME calendar day, comparing by
  // `date` alone can't tell which happened first, and the later one gets
  // silently excluded from "since the snapshot" activity. created_at
  // doesn't have this ambiguity — it always reflects true insertion order.
  function getOnHand(partner_id) {
    // Latest snapshot per product
    const snapRows = db.query(`
      SELECT id, product_id, on_hand_qty, snapshot_date, consignment_price, created_at
      FROM consignment_snapshots WHERE partner_id = ?
      ORDER BY snapshot_date DESC, created_at DESC, id DESC
    `, [partner_id]);
    const latestSnap = {};
    snapRows.forEach(s => { if (!latestSnap[s.product_id]) latestSnap[s.product_id] = s; });

    // All products ever placed — use the PARTNER's actual agreed price from the most recent
    // placement record, NOT the product's default price from Products & Pricing.
    const placed = db.query(`
      SELECT cp.product_id,
        p.item_series, p.variation, p.barcode,
        p.unit_cost,
        b.name AS brand_name, b.color AS brand_color,
        SUM(cp.qty) AS total_placed_ever
      FROM consignment_placements cp
      JOIN products p ON p.id = cp.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE cp.partner_id = ?
      GROUP BY cp.product_id
    `, [partner_id]);

    // Most recent placement price per product for this partner
    const latestPrices = db.query(`
      SELECT product_id, consignment_price
      FROM consignment_placements
      WHERE partner_id = ?
        AND id IN (
          SELECT MAX(id) FROM consignment_placements
          WHERE partner_id = ?
          GROUP BY product_id
        )
    `, [partner_id, partner_id]);
    const latestPriceMap = {};
    latestPrices.forEach(r => { latestPriceMap[r.product_id] = r.consignment_price; });

    // Union of product IDs from placements + snapshots
    const allIds = new Set([
      ...placed.map(p => p.product_id),
      ...Object.keys(latestSnap).map(Number),
    ]);

    const result = [];
    for (const pid of allIds) {
      const placedInfo = placed.find(p => p.product_id === pid);
      const snap       = latestSnap[pid];
      const snapDate      = snap ? snap.snapshot_date : '1970-01-01';
      const snapCreatedAt = snap ? snap.created_at    : '1970-01-01 00:00:00';
      const snapId        = snap ? snap.id            : 0;
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

      // Activity since last snapshot (or since epoch if no snapshot) — compared
      // by created_at with id as a tiebreaker, not date. Two events recorded in
      // the same second (SQLite's CURRENT_TIMESTAMP is only second-precision)
      // would otherwise tie and the later one could be wrongly excluded — id
      // is guaranteed strictly increasing regardless of timestamp resolution,
      // so this closes that race condition completely rather than narrowing it.
      const sinceParams = [partner_id, pid, snapCreatedAt, snapCreatedAt, snapId];
      const placedSince   = db.queryOne(`SELECT COALESCE(SUM(qty),0) AS n FROM consignment_placements WHERE partner_id=? AND product_id=? AND (created_at>? OR (created_at=? AND id>?))`, sinceParams)?.n || 0;
      const invoicedSince = db.queryOne(`SELECT COALESCE(SUM(cci.qty_discrepancy),0) AS n FROM consignment_count_items cci JOIN consignment_counts cc ON cc.id=cci.count_id WHERE cc.partner_id=? AND cci.product_id=? AND cc.invoiced=1 AND cci.qty_discrepancy>0 AND (cc.created_at>? OR (cc.created_at=? AND cc.id>?))`, sinceParams)?.n || 0;
      const returnedSince = db.queryOne(`SELECT COALESCE(SUM(qty),0) AS n FROM consignment_returns WHERE partner_id=? AND product_id=? AND (created_at>? OR (created_at=? AND id>?))`, sinceParams)?.n || 0;

      const on_hand = snapQty + placedSince - invoicedSince - returnedSince;
      // Price priority: partner's most recent placement price > snapshot price > product default
      const price = latestPriceMap[pid] || snap?.consignment_price || info?.consignment_price || 0;

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
    // Inventory: stock physically left Home warehouse for the partner
    if (recordMovement) recordMovement({ date, product_id, location: 'Home', type: 'Consignment Placement', qty_change: -parseInt(qty), reference: `placement_${result.lastID}` });
    res.status(201).json({ id: result.lastID, ok: true });
  });

  router.delete('/placements/:id', (req, res) => {
    const placement = db.queryOne('SELECT * FROM consignment_placements WHERE id = ?', [req.params.id]);
    if (placement && recordMovement) {
      recordMovement({ date: new Date().toISOString().slice(0,10), product_id: placement.product_id, location: 'Home', type: 'Placement Reversal', qty_change: placement.qty, reference: `placement_${placement.id}_void` });
    }
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
    // Inventory: stock physically came back to Home warehouse
    if (recordMovement) recordMovement({ date, product_id, location: 'Home', type: 'Consignment Return', qty_change: parseInt(qty), reference: `return_${result.lastID}` });
    res.status(201).json({ id: result.lastID, ok: true });
  });

  router.delete('/returns/:id', (req, res) => {
    const ret = db.queryOne('SELECT * FROM consignment_returns WHERE id = ?', [req.params.id]);
    if (ret && recordMovement) {
      recordMovement({ date: new Date().toISOString().slice(0,10), product_id: ret.product_id, location: 'Home', type: 'Return Reversal', qty_change: -ret.qty, reference: `return_${ret.id}_void` });
    }
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
    const newSaleIds = [];
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
        const saleResult = db.run(`INSERT INTO sales (date,product_id,partner_id,channel,market,qty,unit_cost,unit_price,platform_fee_pct,platform_fee_amt,notes) VALUES (?,?,?,?,?,?,?,?,0,0,?)`,
          [date, item.product_id, partner_id, 'Consignment Sale', 'SG', qty_discrepancy, uCost, cPrice, `Stock count – count_id ${count_id}`]);
        newSaleIds.push(saleResult.lastID);
        invoiceTotal += qty_discrepancy * cPrice;
        invoiceLines.push({ product_id: item.product_id, qty: qty_discrepancy, unit_price: cPrice, line_total: qty_discrepancy * cPrice });
      }
    }

    // Per requirement: invoice every stock count automatically (only when there IS a discrepancy)
    let invoice = null;
    if (newSaleIds.length > 0) {
      const issueDate = date;
      const dueDate = (() => { const d = new Date(issueDate); d.setDate(d.getDate()+7); return d.toISOString().slice(0,10); })();
      const lastInv = db.queryOne(`SELECT invoice_number FROM invoices WHERE type='Invoice' AND invoice_number LIKE ? ORDER BY id DESC LIMIT 1`, [`INV-${issueDate.replace(/-/g,'')}-%`]);
      const seq = lastInv ? (parseInt(lastInv.invoice_number.split('-')[2]) + 1) : 1;
      const invoice_number = `INV-${issueDate.replace(/-/g,'')}-${String(seq).padStart(3,'0')}`;

      const invResult = db.run(`
        INSERT INTO invoices (invoice_number, type, partner_id, date, due_date, market, currency, subtotal, discount, shipping, total, status, notes)
        VALUES (?,?,?,?,?,?,?,?,0,0,?,?,?)
      `, [invoice_number, 'Invoice', partner_id, issueDate, dueDate, 'SG', 'SGD',
          parseFloat(invoiceTotal.toFixed(2)), parseFloat(invoiceTotal.toFixed(2)), 'Unpaid', `Auto-generated from stock count #${count_id}`]);
      const invoiceId = invResult.lastID;

      // Link each newly created sale row to this invoice + add invoice_items for PDF rendering
      newSaleIds.forEach((saleId, idx) => {
        const line = invoiceLines[idx];
        const prod = db.queryOne(`SELECT p.item_series, p.variation, b.name AS brand_name FROM products p JOIN brands b ON b.id=p.brand_id WHERE p.id=?`, [line.product_id]);
        db.run('UPDATE sales SET invoice_id = ? WHERE id = ?', [invoiceId, saleId]);
        db.run(
          'INSERT INTO invoice_items (invoice_id, product_id, description, qty, unit_price, line_total) VALUES (?,?,?,?,?,?)',
          [invoiceId, line.product_id, `${prod.brand_name} ${prod.item_series}${prod.variation?' · '+prod.variation:''}`, line.qty, line.unit_price, parseFloat(line.line_total.toFixed(2))]
        );
      });

      invoice = db.queryOne('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    }

    res.status(201).json({ ok:true, count_id, invoice_total: parseFloat(invoiceTotal.toFixed(2)), lines_invoiced: invoiceLines.length, invoice_lines: invoiceLines, invoice });
  });

  router.delete('/counts/:id', (req, res) => {
    const count = db.queryOne('SELECT * FROM consignment_counts WHERE id = ?', [req.params.id]);
    if (!count) return res.status(404).json({ error: 'Not found' });

    // Find the auto-generated invoice (matched via the note we stamp on creation) and void it too
    const linkedInvoice = db.queryOne(`SELECT * FROM invoices WHERE notes LIKE ?`, [`%stock count #${req.params.id}%`]);
    if (linkedInvoice) {
      db.run('UPDATE sales SET invoice_id = NULL WHERE invoice_id = ?', [linkedInvoice.id]);
      db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [linkedInvoice.id]);
      db.run('DELETE FROM invoices WHERE id = ?', [linkedInvoice.id]);
    }

    db.run(`UPDATE sales SET voided=1, updated_at=CURRENT_TIMESTAMP WHERE notes LIKE ? AND partner_id=?`, [`%count_id ${req.params.id}%`, count.partner_id]);
    db.run('DELETE FROM consignment_counts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── DELETE all consignment history for a partner (danger — for clearing test data) ──
  router.delete('/reset/:partner_id', (req, res) => {
    const pid = req.params.partner_id;

    // 1. Capture product IDs (for recomputing inventory_levels afterward) AND
    // the exact placement/return IDs for THIS partner, BEFORE deleting them —
    // these ids are what let us build the EXACT movement references to clean
    // up, rather than sweeping by product_id (which would also catch other
    // partners' legitimate movements for a SKU shared across partners).
    const productIds = db.query('SELECT DISTINCT product_id FROM consignment_placements WHERE partner_id=?', [pid]).map(r=>r.product_id);
    const countIds   = db.query('SELECT id FROM consignment_counts WHERE partner_id=?', [pid]).map(r=>r.id);
    const placementIds = db.query('SELECT id FROM consignment_placements WHERE partner_id=?', [pid]).map(r=>r.id);
    const returnIds     = db.query('SELECT id FROM consignment_returns WHERE partner_id=?', [pid]).map(r=>r.id);

    // 2. Void Consignment Sale records for this partner
    db.run(`UPDATE sales SET voided=1, updated_at=CURRENT_TIMESTAMP WHERE partner_id=? AND channel='Consignment Sale'`, [pid]);

    // 3. Delete count line items
    if (countIds.length) {
      db.run(`DELETE FROM consignment_count_items WHERE count_id IN (${countIds.map(()=>'?').join(',')})`, countIds);
    }

    // 4. Clear all consignment movement tables
    db.run('DELETE FROM consignment_counts     WHERE partner_id=?', [pid]);
    db.run('DELETE FROM consignment_placements  WHERE partner_id=?', [pid]);
    db.run('DELETE FROM consignment_returns     WHERE partner_id=?', [pid]);
    db.run('DELETE FROM consignment_snapshots   WHERE partner_id=?', [pid]);

    // 5. Reverse ONLY the inventory movements THIS partner's placements/returns
    // actually created — matched by their exact reference (e.g. 'placement_42',
    // 'return_17', plus '_void' reversal variants), never by product_id alone.
    // A SKU can be consigned to multiple partners at once; deleting by product
    // would also wipe out a different partner's legitimate movement history
    // for that same SKU, which is exactly the bug this fixes.
    const refs = [
      ...placementIds.flatMap(id => [`placement_${id}`, `placement_${id}_void`]),
      ...returnIds.flatMap(id => [`return_${id}`, `return_${id}_void`]),
    ];
    if (refs.length) {
      db.run(
        `DELETE FROM inventory_movements WHERE reference IN (${refs.map(()=>'?').join(',')})`,
        refs
      );
    }
    // Recalculate inventory_levels for affected products
    if (productIds.length) {
      productIds.forEach(pid2 => {
        ['Home','Storhub'].forEach(loc => {
          const net = db.queryOne(`SELECT COALESCE(SUM(qty_change),0) AS n FROM inventory_movements WHERE product_id=? AND location=?`, [pid2, loc])?.n || 0;
          const existing = db.queryOne('SELECT id FROM inventory_levels WHERE product_id=? AND location=?', [pid2, loc]);
          if (existing) db.run('UPDATE inventory_levels SET qty=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [net, existing.id]);
          else if (net !== 0) db.run('INSERT INTO inventory_levels (product_id,location,qty) VALUES (?,?,?)', [pid2, loc, net]);
        });
      });
    }

    res.json({ ok: true, partner_id: pid, products_affected: productIds.length, counts_removed: countIds.length });
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

  let recordMovement = null;
  router._setInventoryHook = (fn) => { recordMovement = fn; };

  // Expose for cross-route reuse (Phase 4 inventory aggregation)
  router._getOnHand = getOnHand;
  router._getConsignmentPartnerIds = () => db.query("SELECT id FROM partners WHERE model='Consignment' AND is_active=1").map(p => p.id);

  return router;
};
