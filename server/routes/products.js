const { Router } = require('express');

module.exports = function(db) {
  const router = Router();

  // GET all products (with brand info joined)
  router.get('/', (req, res) => {
    const { brand_id, active, search } = req.query;
    let sql = `
      SELECT p.*, b.name AS brand_name, b.color AS brand_color
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      WHERE 1=1
    `;
    const params = [];

    if (brand_id) { sql += ' AND p.brand_id = ?'; params.push(brand_id); }
    if (active !== undefined) { sql += ' AND p.is_active = ?'; params.push(active === 'true' ? 1 : 0); }
    if (search) {
      sql += ' AND (p.item_series LIKE ? OR p.variation LIKE ? OR p.barcode LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY b.name, p.item_series, p.variation';
    res.json(db.query(sql, params));
  });

  // GET single product
  router.get('/:id', (req, res) => {
    const product = db.queryOne(`
      SELECT p.*, b.name AS brand_name, b.color AS brand_color
      FROM products p JOIN brands b ON b.id = p.brand_id
      WHERE p.id = ?
    `, [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  });

  // POST create product
  router.post('/', (req, res) => {
    const {
      brand_id, barcode, item_series, variation,
      unit_cost,
      price_wholesale_sg, price_consignment_sg, price_rrp_sg,
      price_wholesale_my, price_rrp_my,
      price_wholesale_au, price_rrp_au,
      notes
    } = req.body;

    if (!brand_id || !item_series) {
      return res.status(400).json({ error: 'brand_id and item_series are required' });
    }

    try {
      // Sanitize barcode: "-", "N/A", "n/a", blank → null so UNIQUE constraint isn't violated by placeholder text
      const cleanBarcode = (barcode && barcode.trim() && !['−','-','—','n/a','na','none','nil'].includes(barcode.trim().toLowerCase())) ? barcode.trim() : null;
      const result = db.run(`
        INSERT INTO products
          (brand_id, barcode, item_series, variation,
           unit_cost, price_wholesale_sg, price_consignment_sg, price_rrp_sg,
           price_wholesale_my, price_rrp_my, price_wholesale_au, price_rrp_au, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, [
        brand_id, cleanBarcode, item_series, variation || null,
        unit_cost || 0,
        price_wholesale_sg || 0, price_consignment_sg || 0, price_rrp_sg || 0,
        price_wholesale_my || 0, price_rrp_my || 0,
        price_wholesale_au || 0, price_rrp_au || 0,
        notes || null
      ]);

      const product = db.queryOne('SELECT p.*, b.name AS brand_name, b.color AS brand_color FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = ?', [result.lastID]);
      res.status(201).json(product);
    } catch (e) {
      res.status(409).json({ error: 'Barcode already exists' });
    }
  });

  // PUT update product
  router.put('/:id', (req, res) => {
    const {
      brand_id, barcode, item_series, variation,
      unit_cost,
      price_wholesale_sg, price_consignment_sg, price_rrp_sg,
      price_wholesale_my, price_rrp_my,
      price_wholesale_au, price_rrp_au,
      is_active, notes
    } = req.body;

    db.run(`
      UPDATE products SET
        brand_id = ?, barcode = ?, item_series = ?, variation = ?,
        unit_cost = ?,
        price_wholesale_sg = ?, price_consignment_sg = ?, price_rrp_sg = ?,
        price_wholesale_my = ?, price_rrp_my = ?,
        price_wholesale_au = ?, price_rrp_au = ?,
        is_active = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      brand_id, barcode, item_series, variation,
      unit_cost,
      price_wholesale_sg, price_consignment_sg, price_rrp_sg,
      price_wholesale_my, price_rrp_my,
      price_wholesale_au, price_rrp_au,
      is_active !== undefined ? is_active : 1, notes,
      req.params.id
    ]);

    const product = db.queryOne('SELECT p.*, b.name AS brand_name, b.color AS brand_color FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = ?', [req.params.id]);
    res.json(product);
  });

  // DELETE (soft delete — set inactive)
  router.delete('/:id', (req, res) => {
    db.run('UPDATE products SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── Product image (base64 stored in DB) ───────────────────────
  // POST /api/products/:id/image  — body: { image_data: "data:image/jpeg;base64,..." }
  router.post('/:id/image', (req, res) => {
    const { image_data } = req.body;
    if (!image_data) return res.status(400).json({ error: 'image_data required' });
    // Sanity-check: must be a data URI (jpeg, png, webp)
    if (!image_data.startsWith('data:image/')) return res.status(400).json({ error: 'Must be a base64 image data URI' });
    db.run('UPDATE products SET image_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [image_data, req.params.id]);
    res.json({ ok: true });
  });

  router.delete('/:id/image', (req, res) => {
    db.run('UPDATE products SET image_data = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
