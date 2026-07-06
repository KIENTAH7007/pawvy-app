const { Router } = require('express');

// Shipments (Phase 7).
// Step 1: skeleton (tables + placeholder tab).
// Step 2: SKU cost reference + document library.
// Step 3 (this patch): shipment entry, landed cost calculator, variance
// ledger, dashboard/detail views.
// Inventory auto-sync on Qty Received is still Step 4 — deliberately NOT
// wired up yet. Marking a shipment "Received" in this patch only changes
// its status; it does not touch Inventory. That comes next, built and
// sandbox-tested in isolation per the agreed sequence.
module.exports = function(db) {
  const router = Router();

  function nextShipmentCode() {
    const last = db.queryOne(`SELECT shipment_code FROM shipments ORDER BY id DESC LIMIT 1`);
    let n = 1;
    if (last?.shipment_code) {
      const m = last.shipment_code.match(/(\d+)$/);
      if (m) n = parseInt(m[1], 10) + 1;
    }
    return `SHP-${String(n).padStart(4, '0')}`;
  }

  function varianceFlag(pct) {
    const a = Math.abs(pct);
    if (a <= 5) return 'healthy';
    if (a <= 15) return 'watch';
    return 'risky';
  }

  // ── Shipments list + summary ─────────────────────────────────────

  router.get('/', (req, res) => {
    const { brand_id, status, from, to } = req.query;
    let sql = `
      SELECT s.*, b.name AS brand_name,
        (SELECT COUNT(*) FROM shipment_line_items li WHERE li.shipment_id = s.id) AS line_item_count,
        (SELECT COUNT(*) FROM shipment_documents d WHERE d.shipment_id = s.id) AS document_count
      FROM shipments s
      LEFT JOIN brands b ON b.id = s.brand_id
      WHERE 1=1
    `;
    const params = [];
    if (brand_id) { sql += ' AND s.brand_id = ?'; params.push(brand_id); }
    if (status)   { sql += ' AND s.status = ?'; params.push(status); }
    if (from)     { sql += ' AND s.arrival_date >= ?'; params.push(from); }
    if (to)       { sql += ' AND s.arrival_date <= ?'; params.push(to); }
    sql += ' ORDER BY s.created_at DESC';
    res.json(db.query(sql, params));
  });

  // ── Create shipment (header only — line items added after) ───────

  router.post('/', (req, res) => {
    const { brand_id, supplier_name, currency, order_date, arrival_date } = req.body;
    const shipment_code = nextShipmentCode();
    const result = db.run(
      `INSERT INTO shipments (shipment_code, brand_id, supplier_name, currency, order_date, arrival_date, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ordered')`,
      [shipment_code, brand_id || null, supplier_name || null, currency || 'USD', order_date || null, arrival_date || null]
    );
    const shipment = db.queryOne('SELECT * FROM shipments WHERE id = ?', [result.lastID]);
    res.status(201).json(shipment);
  });

  // ── SKU cost reference ──────────────────────────────────────────
  // One row per price point per SKU. Full history kept, never overwritten.
  // Independent of shipments — usable right away to pre-populate cost/weight
  // data before the shipment entry form exists.
  // NOTE: these literal routes must be registered before GET/PUT/DELETE '/:id'
  // below, or Express would match '/cost-reference' as an :id value instead.

  // GET latest cost/weight per product (for pre-filling forms + the reference table view)
  router.get('/cost-reference', (req, res) => {
    const { brand_id } = req.query;
    let sql = `
      SELECT p.id AS product_id, p.item_series, p.variation, p.barcode,
             b.name AS brand_name,
             r.id AS reference_id, r.effective_date, r.cost_original_currency,
             r.currency, r.weight_per_unit, r.source_shipment_id
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      LEFT JOIN sku_cost_reference r ON r.id = (
        SELECT id FROM sku_cost_reference
        WHERE product_id = p.id
        ORDER BY effective_date DESC, id DESC
        LIMIT 1
      )
      WHERE p.is_active = 1
    `;
    const params = [];
    if (brand_id) { sql += ' AND p.brand_id = ?'; params.push(brand_id); }
    sql += ' ORDER BY b.name, p.item_series, p.variation';
    res.json(db.query(sql, params));
  });

  // GET full price history for one SKU
  router.get('/cost-reference/:productId/history', (req, res) => {
    const rows = db.query(
      `SELECT * FROM sku_cost_reference WHERE product_id = ? ORDER BY effective_date DESC, id DESC`,
      [req.params.productId]
    );
    res.json(rows);
  });

  // POST add a new price point for a SKU
  router.post('/cost-reference', (req, res) => {
    const { product_id, effective_date, cost_original_currency, currency, weight_per_unit, source_shipment_id } = req.body;
    if (!product_id || !effective_date || cost_original_currency == null || !currency) {
      return res.status(400).json({ error: 'product_id, effective_date, cost_original_currency, and currency are required' });
    }
    const result = db.run(
      `INSERT INTO sku_cost_reference (product_id, effective_date, cost_original_currency, currency, weight_per_unit, source_shipment_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [product_id, effective_date, cost_original_currency, currency, weight_per_unit || null, source_shipment_id || null]
    );
    const row = db.queryOne('SELECT * FROM sku_cost_reference WHERE id = ?', [result.lastID]);
    res.status(201).json(row);
  });

  // DELETE a price point (in case of mis-entry)
  router.delete('/cost-reference/:id', (req, res) => {
    db.run('DELETE FROM sku_cost_reference WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── Variance ledger ───────────────────────────────────────────────
  // All variance entries across all shipments, in one place — this is
  // what feeds P&L (Step 5) and answers "where do I see the ledger".

  router.get('/variance', (req, res) => {
    const { brand_id, flag, from, to } = req.query;
    let sql = `
      SELECT v.*, s.shipment_code, s.brand_id, b.name AS brand_name,
             p.item_series, p.variation
      FROM cost_variance_ledger v
      JOIN shipments s ON s.id = v.shipment_id
      JOIN products p ON p.id = v.product_id
      LEFT JOIN brands b ON b.id = s.brand_id
      WHERE s.status != 'voided'
    `;
    const params = [];
    if (brand_id) { sql += ' AND s.brand_id = ?'; params.push(brand_id); }
    if (flag)     { sql += ' AND v.flag = ?'; params.push(flag); }
    if (from)     { sql += ' AND v.logged_date >= ?'; params.push(from); }
    if (to)       { sql += ' AND v.logged_date <= ?'; params.push(to); }
    sql += ' ORDER BY v.logged_date DESC, v.id DESC';
    res.json(db.query(sql, params));
  });

  // ── Document library ─────────────────────────────────────────────
  // Same note as above: literal '/documents' routes registered before '/:id'.

  router.get('/documents', (req, res) => {
    const { document_type, brand_id, from, to } = req.query;
    let sql = `
      SELECT d.id, d.document_type, d.file_name, d.uploaded_at,
             s.shipment_code, s.brand_id, b.name AS brand_name
      FROM shipment_documents d
      JOIN shipments s ON s.id = d.shipment_id
      LEFT JOIN brands b ON b.id = s.brand_id
      WHERE 1=1
    `;
    const params = [];
    if (document_type) { sql += ' AND d.document_type = ?'; params.push(document_type); }
    if (brand_id)      { sql += ' AND s.brand_id = ?'; params.push(brand_id); }
    if (from)          { sql += ' AND d.uploaded_at >= ?'; params.push(from); }
    if (to)            { sql += ' AND d.uploaded_at <= ?'; params.push(to); }
    sql += ' ORDER BY d.uploaded_at DESC';
    res.json(db.query(sql, params));
  });

  // GET single document (returns file_data for download)
  router.get('/documents/:id', (req, res) => {
    const doc = db.queryOne('SELECT * FROM shipment_documents WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  });

  router.delete('/documents/:id', (req, res) => {
    db.run('DELETE FROM shipment_documents WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── Get one shipment, with line items + variance (if costed) ─────

  router.get('/:id', (req, res) => {
    const shipment = db.queryOne(`
      SELECT s.*, b.name AS brand_name FROM shipments s
      LEFT JOIN brands b ON b.id = s.brand_id WHERE s.id = ?
    `, [req.params.id]);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

    const line_items = db.query(`
      SELECT li.*, p.item_series, p.variation, p.unit_cost AS set_cost_price
      FROM shipment_line_items li
      JOIN products p ON p.id = li.product_id
      WHERE li.shipment_id = ?
      ORDER BY li.id
    `, [req.params.id]);

    const variance = db.query(`
      SELECT * FROM cost_variance_ledger WHERE shipment_id = ? ORDER BY id
    `, [req.params.id]);

    const documents = db.query(`
      SELECT id, document_type, file_name, uploaded_at FROM shipment_documents WHERE shipment_id = ?
    `, [req.params.id]);

    res.json({ ...shipment, line_items, variance, documents });
  });

  // ── Update shipment header (cost inputs, dates, status, etc.) ─────

  router.put('/:id', (req, res) => {
    const fields = [
      'brand_id', 'supplier_name', 'currency', 'order_date', 'arrival_date',
      'received_warehouse', 'fx_rate_actual', 'fx_processing_charge', 'cashback',
      'forwarder_invoice_value', 'permit_invoice_value', 'avs_payment', 'gst_amount',
      'gst_amount_override', 'freight_apportion_method', 'notes',
    ];
    const sets = [];
    const params = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
    });
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);
    db.run(`UPDATE shipments SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json(db.queryOne('SELECT * FROM shipments WHERE id = ?', [req.params.id]));
  });

  router.delete('/:id', (req, res) => {
    db.run('DELETE FROM shipments WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── Line items ─────────────────────────────────────────────────

  router.post('/:id/line-items', (req, res) => {
    const { product_id, qty_ordered, qty_received, unit_cost_original_currency, weight_per_unit } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id is required' });
    const result = db.run(
      `INSERT INTO shipment_line_items (shipment_id, product_id, qty_ordered, qty_received, unit_cost_original_currency, weight_per_unit)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, product_id, qty_ordered || 0, qty_received || 0, unit_cost_original_currency || 0, weight_per_unit || null]
    );
    res.status(201).json(db.queryOne('SELECT * FROM shipment_line_items WHERE id = ?', [result.lastID]));
  });

  router.put('/line-items/:liId', (req, res) => {
    const fields = ['product_id', 'qty_ordered', 'qty_received', 'unit_cost_original_currency', 'weight_per_unit'];
    const sets = [];
    const params = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
    });
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.liId);
    db.run(`UPDATE shipment_line_items SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json(db.queryOne('SELECT * FROM shipment_line_items WHERE id = ?', [req.params.liId]));
  });

  router.delete('/line-items/:liId', (req, res) => {
    db.run('DELETE FROM shipment_line_items WHERE id = ?', [req.params.liId]);
    res.json({ ok: true });
  });

  // ── Status: mark received (no inventory effect yet — Step 4) ─────

  router.post('/:id/receive', (req, res) => {
    db.run(`UPDATE shipments SET status = 'received', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    res.json(db.queryOne('SELECT * FROM shipments WHERE id = ?', [req.params.id]));
  });

  // ── Void ───────────────────────────────────────────────────────────
  // Soft-void: keeps the shipment + line items + documents for audit,
  // but marks it voided and removes anything it fed downstream —
  // variance ledger rows (so it drops out of P&L/variance totals) and
  // any cost-reference price points it auto-added (so it stops
  // influencing future shipment pre-fills).

  router.post('/:id/void', (req, res) => {
    const shipment = db.queryOne('SELECT * FROM shipments WHERE id = ?', [req.params.id]);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    db.run(`UPDATE shipments SET status = 'voided', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    db.run('DELETE FROM cost_variance_ledger WHERE shipment_id = ?', [req.params.id]);
    db.run('DELETE FROM sku_cost_reference WHERE source_shipment_id = ?', [req.params.id]);
    res.json(db.queryOne('SELECT * FROM shipments WHERE id = ?', [req.params.id]));
  });

  // ── Landed cost calculation + variance ledger ─────────────────────
  // Can be re-run any time (shipment stays editable per your decision) —
  // each run replaces this shipment's variance ledger rows and recalculates
  // line item landed costs from scratch off current inputs.

  router.post('/:id/cost', (req, res) => {
    const shipment = db.queryOne('SELECT * FROM shipments WHERE id = ?', [req.params.id]);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

    const lines = db.query(`
      SELECT li.*, p.unit_cost AS set_cost_price
      FROM shipment_line_items li
      JOIN products p ON p.id = li.product_id
      WHERE li.shipment_id = ?
    `, [req.params.id]);

    if (!lines.length) return res.status(400).json({ error: 'Add at least one line item before costing' });
    if (!shipment.fx_rate_actual) return res.status(400).json({ error: 'Actual FX rate is required before costing' });

    const method = shipment.freight_apportion_method || 'value';
    if (method === 'weight' && lines.some(l => !l.weight_per_unit)) {
      return res.status(400).json({ error: 'Weight-based apportionment selected, but one or more line items are missing weight per unit' });
    }

    // Product cost per line, converted to SGD
    const withProductCost = lines.map(l => ({
      ...l,
      product_cost_sgd: (l.unit_cost_original_currency || 0) * (l.qty_received || 0) * shipment.fx_rate_actual,
      total_weight: (l.weight_per_unit || 0) * (l.qty_received || 0),
    }));

    const totalProductCostSgd = withProductCost.reduce((s, l) => s + l.product_cost_sgd, 0);
    const totalWeight = withProductCost.reduce((s, l) => s + l.total_weight, 0);

    // GST: 9% of (product cost + forwarder invoice only) — confirmed, not GST-registered, permit fees excluded.
    // Editable: if the shipment has gst_amount_override set (user manually typed and saved a value),
    // use that value as-is and don't overwrite it here.
    const gstAmount = shipment.gst_amount_override
      ? (shipment.gst_amount || 0)
      : 0.09 * (totalProductCostSgd + (shipment.forwarder_invoice_value || 0));

    // Value-based pool: always includes permit, AVS, GST, FX processing charge, minus cashback.
    // Freight joins this pool only if method === 'value'.
    const valuePool =
      (shipment.permit_invoice_value || 0) +
      (shipment.avs_payment || 0) +
      gstAmount +
      (shipment.fx_processing_charge || 0) -
      (shipment.cashback || 0) +
      (method === 'value' ? (shipment.forwarder_invoice_value || 0) : 0);

    const weightPool = method === 'weight' ? (shipment.forwarder_invoice_value || 0) : 0;

    const costedLines = withProductCost.map(l => {
      const valueShare = totalProductCostSgd > 0 ? l.product_cost_sgd / totalProductCostSgd : 0;
      const weightShare = totalWeight > 0 ? l.total_weight / totalWeight : 0;
      const sharedCost = valueShare * valuePool + weightShare * weightPool;
      const lineTotalCost = l.product_cost_sgd + sharedCost;
      const landedCostPerUnit = l.qty_received > 0 ? lineTotalCost / l.qty_received : 0;
      return { ...l, landed_cost_per_unit: landedCostPerUnit };
    });

    const totalLandedCost = totalProductCostSgd + valuePool + weightPool;
    const costedDate = req.body.costed_date || new Date().toISOString().slice(0, 10);

    // Persist: line items, shipment totals, variance ledger (replace old rows for this shipment)
    costedLines.forEach(l => {
      db.run('UPDATE shipment_line_items SET landed_cost_per_unit = ? WHERE id = ?', [l.landed_cost_per_unit, l.id]);
    });

    db.run(
      `UPDATE shipments SET gst_amount = ?, total_landed_cost = ?, status = 'costed', costed_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [gstAmount, totalLandedCost, costedDate, req.params.id]
    );

    db.run('DELETE FROM cost_variance_ledger WHERE shipment_id = ?', [req.params.id]);
    costedLines.forEach(l => {
      const setCost = l.set_cost_price || 0;
      const varianceAmount = l.landed_cost_per_unit - setCost;
      const variancePct = setCost > 0 ? (varianceAmount / setCost) * 100 : 0;
      const flag = setCost > 0 ? varianceFlag(variancePct) : 'no_reference';
      const varianceTotal = varianceAmount * (l.qty_received || 0);
      db.run(
        `INSERT INTO cost_variance_ledger (shipment_id, product_id, landed_cost, set_cost_price, variance_amount, variance_pct, variance_total, flag, logged_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.params.id, l.product_id, l.landed_cost_per_unit, setCost, varianceAmount, variancePct, varianceTotal, flag, costedDate]
      );

      // Auto-add a new cost reference price point from this shipment's actual figures,
      // skipped if unchanged from the latest entry to avoid duplicate noise.
      const latestRef = db.queryOne(
        `SELECT * FROM sku_cost_reference WHERE product_id = ? ORDER BY effective_date DESC, id DESC LIMIT 1`,
        [l.product_id]
      );
      const changed = !latestRef ||
        latestRef.cost_original_currency !== l.unit_cost_original_currency ||
        (l.weight_per_unit && latestRef.weight_per_unit !== l.weight_per_unit);
      if (changed) {
        db.run(
          `INSERT INTO sku_cost_reference (product_id, effective_date, cost_original_currency, currency, weight_per_unit, source_shipment_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [l.product_id, costedDate, l.unit_cost_original_currency, shipment.currency, l.weight_per_unit || null, req.params.id]
        );
      }
    });

    const updated = db.queryOne(`
      SELECT s.*, b.name AS brand_name FROM shipments s LEFT JOIN brands b ON b.id = s.brand_id WHERE s.id = ?
    `, [req.params.id]);
    const variance = db.query('SELECT * FROM cost_variance_ledger WHERE shipment_id = ?', [req.params.id]);
    const line_items = db.query(`
      SELECT li.*, p.item_series, p.variation, p.unit_cost AS set_cost_price
      FROM shipment_line_items li JOIN products p ON p.id = li.product_id WHERE li.shipment_id = ?
    `, [req.params.id]);

    res.json({ ...updated, line_items, variance });
  });

  // POST upload a document to a shipment (base64, same pattern as product images)
  // (placed after /:id routes is fine — this is a nested path, not ambiguous with them)
  router.post('/:shipmentId/documents', (req, res) => {
    const { document_type, file_name, file_data } = req.body;
    if (!document_type || !file_data) return res.status(400).json({ error: 'document_type and file_data are required' });
    const result = db.run(
      `INSERT INTO shipment_documents (shipment_id, document_type, file_name, file_data) VALUES (?, ?, ?, ?)`,
      [req.params.shipmentId, document_type, file_name || null, file_data]
    );
    const doc = db.queryOne('SELECT id, shipment_id, document_type, file_name, uploaded_at FROM shipment_documents WHERE id = ?', [result.lastID]);
    res.status(201).json(doc);
  });

  return router;
};


