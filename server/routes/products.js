const { Router } = require('express');
const archiver = require('archiver');

// Computes whether a product's discount is active *today* and what the
// resulting effective price is. discount_pct/start/end are plain columns
// (Patch 96) — this is the one place that turns them into something a
// caller (internal reports, or the future website) can use directly
// without re-deriving the date-window logic itself. An open-ended
// discount (no end date) is allowed by leaving discount_end null.
function withEffectivePrice(product) {
  const today = new Date().toISOString().slice(0, 10);
  const hasDiscount = product.discount_pct > 0
    && (!product.discount_start || product.discount_start <= today)
    && (!product.discount_end || product.discount_end >= today);

  return {
    ...product,
    is_discount_active: hasDiscount,
    effective_price_rrp_sg: hasDiscount
      ? Math.round(product.price_rrp_sg * (1 - product.discount_pct / 100) * 100) / 100
      : product.price_rrp_sg,
  };
}

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
    res.json(db.query(sql, params).map(withEffectivePrice));
  });

  // ── Export all product images as a ZIP ────────────────────────────
  // Reads image_data (base64) directly from the live database this is
  // running against — this only works meaningfully on the real deployed
  // app, since that's where actual uploaded images live. Registered as a
  // literal route before /:id so it isn't swallowed by that pattern.
  router.get('/export-images', (req, res) => {
    const products = db.query(`
      SELECT p.id, p.item_series, p.variation, p.image_data, b.name AS brand_name
      FROM products p JOIN brands b ON b.id = p.brand_id
      WHERE p.image_data IS NOT NULL AND p.image_data != ''
      ORDER BY b.name, p.item_series, p.variation
    `);

    if (!products.length) {
      return res.status(404).json({ error: 'No product images found to export.' });
    }

    res.attachment('pawvy_product_images.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);

    const usedNames = new Set();
    products.forEach(p => {
      const match = /^data:image\/(\w+);base64,(.+)$/.exec(p.image_data);
      if (!match) return; // skip malformed entries rather than fail the whole export
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const buffer = Buffer.from(match[2], 'base64');

      let base = `${p.brand_name}_${p.item_series}${p.variation ? '_' + p.variation : ''}`
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .replace(/_+/g, '_');
      let filename = `${base}.${ext}`;
      let n = 1;
      while (usedNames.has(filename)) { filename = `${base}_${++n}.${ext}`; } // avoid collisions from identical names
      usedNames.add(filename);

      archive.append(buffer, { name: filename });
    });

    archive.finalize();
  });

  // GET single product
  router.get('/:id', (req, res) => {
    const product = db.queryOne(`
      SELECT p.*, b.name AS brand_name, b.color AS brand_color
      FROM products p JOIN brands b ON b.id = p.brand_id
      WHERE p.id = ?
    `, [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(withEffectivePrice(product));
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

  // PATCH /:id/discount — scoped discount management, deliberately separate
  // from the full PUT above (same reasoning as sales.js's /:id/details
  // endpoint: a narrow, purpose-built endpoint for one specific thing is
  // safer than routing every discount change through the full product-edit
  // form, and lets a future campaign/brand-launch admin UI manage discounts
  // without needing every other product field). Powers both campaign
  // discounts and brand-launch discounts described in the BUTTONS spec —
  // the website reads discount_pct/is_discount_active/effective_price_rrp_sg
  // (see withEffectivePrice above) rather than storing its own pricing.
  router.patch('/:id/discount', (req, res) => {
    const product = db.queryOne('SELECT id, price_rrp_sg FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const { discount_pct, discount_start, discount_end } = req.body;
    const pct = discount_pct === undefined || discount_pct === null ? 0 : Number(discount_pct);

    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'discount_pct must be a number between 0 and 100.' });
    }
    if (discount_start && discount_end && discount_end < discount_start) {
      return res.status(400).json({ error: 'discount_end must be on or after discount_start.' });
    }

    db.run(`
      UPDATE products SET discount_pct = ?, discount_start = ?, discount_end = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [pct, discount_start || null, discount_end || null, req.params.id]);

    const updated = db.queryOne(`
      SELECT p.*, b.name AS brand_name, b.color AS brand_color
      FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = ?
    `, [req.params.id]);
    res.json(withEffectivePrice(updated));
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

  // ── Portal display order (Phase 6) ─────────────────────────────
  // POST /api/products/:id/portal-order — body: { portal_sort_order: number|null }
  // Controls manual ordering within a brand on the public Order Portal.
  // Lower numbers show first; null falls back to alphabetical.
  router.post('/:id/portal-order', (req, res) => {
    const { portal_sort_order } = req.body;
    const val = (portal_sort_order === '' || portal_sort_order === null || portal_sort_order === undefined)
      ? null : parseInt(portal_sort_order);
    db.run('UPDATE products SET portal_sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [val, req.params.id]);
    res.json({ ok: true, portal_sort_order: val });
  });

  return router;
};
