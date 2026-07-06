const { Router } = require('express');

// Shipments (Phase 7).
// Step 1 shipped the skeleton (tables + placeholder tab).
// Step 2 adds: SKU cost reference (original-currency cost + weight per SKU,
// independent of any shipment existing yet) and the document library.
// Shipment entry, landed cost calculator, and inventory sync are still
// upcoming steps — this file does not yet create shipments themselves.
module.exports = function(db) {
  const router = Router();

  // GET all shipments (still empty until step 3 ships shipment entry)
  router.get('/', (req, res) => {
    const shipments = db.query('SELECT * FROM shipments ORDER BY created_at DESC');
    res.json(shipments);
  });

  // ── SKU cost reference ──────────────────────────────────────────
  // One row per price point per SKU. Full history kept, never overwritten.
  // Independent of shipments — usable right away to pre-populate cost/weight
  // data before the shipment entry form exists.

  // GET latest cost/weight per product (for pre-filling forms + the reference table view)
  router.get('/cost-reference', (req, res) => {
    const rows = db.query(`
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
      ORDER BY b.name, p.item_series, p.variation
    `);
    res.json(rows);
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

  // ── Document library ─────────────────────────────────────────────
  // Documents are attached to a shipment (shipment_id required by schema),
  // so uploads become usable once step 3 ships shipment entry. This list
  // endpoint is ready now and will populate once shipments/documents exist.

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

  // POST upload a document to a shipment (base64, same pattern as product images)
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

  router.delete('/documents/:id', (req, res) => {
    db.run('DELETE FROM shipment_documents WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};

