const { Router } = require('express');
const archiver = require('archiver');
const { withEffectivePrice } = require('../lib/pricing');
const { uploadBuffer, getObjectStream, decodeDataUrl, buildImageKey, deleteObject } = require('../lib/bucket');
const { NEED_TAGS } = require('../lib/needTags');

// need_tags is stored as a JSON array string (see database.js) so a
// product can belong to more than one need — this always hands back a
// real array to API consumers rather than making every route remember to
// parse it. Defensive fallback to [] on anything unexpected (missing
// column on a not-yet-migrated row, corrupted value, etc.) rather than
// letting a bad value 500 the whole products list.
function withParsedNeedTags(product) {
  if (!product) return product;
  let need_tags = [];
  try {
    const parsed = JSON.parse(product.need_tags || '[]');
    if (Array.isArray(parsed)) need_tags = parsed;
  } catch (e) { /* leave as [] */ }
  return { ...product, need_tags };
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
    res.json(db.query(sql, params).map(withEffectivePrice).map(withParsedNeedTags));
  });

  // ── Export all product images as a ZIP ────────────────────────────
  // Post-bucket-migration (Aug 2026): most products now have image_url
  // instead of image_data, so this fetches those straight from the
  // bucket (using the same credentials as everywhere else, not the
  // public proxy route — no need to round-trip through HTTP for a
  // server-to-bucket read). Falls back to the old base64 column for any
  // row that somehow wasn't migrated (shouldn't happen after the
  // startup migration runs, but this keeps the export working either
  // way rather than silently dropping those products from the zip).
  router.get('/export-images', async (req, res) => {
    const products = db.query(`
      SELECT p.id, p.item_series, p.variation, p.image_data, p.image_url, b.name AS brand_name
      FROM products p JOIN brands b ON b.id = p.brand_id
      WHERE (p.image_url IS NOT NULL AND p.image_url != '') OR (p.image_data IS NOT NULL AND p.image_data != '')
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

    for (const p of products) {
      let buffer, ext;
      try {
        if (p.image_url) {
          // image_url is "/api/uploads/<key>" — strip the known prefix to get the bucket key
          const key = p.image_url.replace(/^\/api\/uploads\//, '');
          const obj = await getObjectStream(key);
          const chunks = [];
          for await (const chunk of obj.Body) chunks.push(chunk);
          buffer = Buffer.concat(chunks);
          ext = (obj.ContentType || 'image/jpeg').split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        } else {
          const decoded = decodeDataUrl(p.image_data);
          buffer = decoded.buffer;
          ext = decoded.extension;
        }
      } catch {
        continue; // skip anything unreadable rather than fail the whole export
      }

      let base = `${p.brand_name}_${p.item_series}${p.variation ? '_' + p.variation : ''}`
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .replace(/_+/g, '_');
      let filename = `${base}.${ext}`;
      let n = 1;
      while (usedNames.has(filename)) { filename = `${base}_${++n}.${ext}`; } // avoid collisions from identical names
      usedNames.add(filename);

      archive.append(buffer, { name: filename });
    }

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
    res.json(withParsedNeedTags(withEffectivePrice(product)));
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
      res.status(201).json(withParsedNeedTags(product));
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
      is_active, notes, description
    } = req.body;

    db.run(`
      UPDATE products SET
        brand_id = ?, barcode = ?, item_series = ?, variation = ?,
        unit_cost = ?,
        price_wholesale_sg = ?, price_consignment_sg = ?, price_rrp_sg = ?,
        price_wholesale_my = ?, price_rrp_my = ?,
        price_wholesale_au = ?, price_rrp_au = ?,
        is_active = ?, notes = ?, description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      brand_id, barcode, item_series, variation,
      unit_cost,
      price_wholesale_sg, price_consignment_sg, price_rrp_sg,
      price_wholesale_my, price_rrp_my,
      price_wholesale_au, price_rrp_au,
      is_active !== undefined ? is_active : 1, notes, description || null,
      req.params.id
    ]);

    const product = db.queryOne('SELECT p.*, b.name AS brand_name, b.color AS brand_color FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = ?', [req.params.id]);
    res.json(withParsedNeedTags(product));
  });

  // PATCH /:id/discount — scoped discount + "New" badge management,
  // deliberately separate from the full PUT above (same reasoning as
  // sales.js's /:id/details endpoint: a narrow, purpose-built endpoint for
  // one specific thing is safer than routing every change through the full
  // product-edit form). Originally discount-only; now also handles the
  // "New" badge (is_new/new_until) since KT wanted one combined modal
  // ("Badge" button) rather than a second button in an already-long action
  // list — see the modal in client/src/pages/Products.jsx. Both groups are
  // independent of each other (a product can have either, both, or
  // neither) but share one endpoint and one Save action; the frontend
  // always sends the complete current state of both sections together
  // (same convention this endpoint already used for discount alone), so
  // there's no partial-update ambiguity to get wrong here.
  router.patch('/:id/discount', (req, res) => {
    const product = db.queryOne('SELECT id, price_rrp_sg FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const { discount_pct, discount_start, discount_end, is_new, new_until } = req.body;
    const pct = discount_pct === undefined || discount_pct === null ? 0 : Number(discount_pct);

    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'discount_pct must be a number between 0 and 100.' });
    }
    if (discount_start && discount_end && discount_end < discount_start) {
      return res.status(400).json({ error: 'discount_end must be on or after discount_start.' });
    }

    db.run(`
      UPDATE products SET
        discount_pct = ?, discount_start = ?, discount_end = ?,
        is_new = ?, new_until = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [pct, discount_start || null, discount_end || null, is_new ? 1 : 0, new_until || null, req.params.id]);

    const updated = db.queryOne(`
      SELECT p.*, b.name AS brand_name, b.color AS brand_color
      FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = ?
    `, [req.params.id]);
    res.json(withParsedNeedTags(withEffectivePrice(updated)));
  });

  // PATCH /:id/merchandising — Shop-by-Need tags, "Best for" line, and
  // Pawvy's Pick flag. Deliberately a separate endpoint from the main PUT
  // above, same reasoning as /:id/discount: these are website-facing
  // merchandising fields with nothing to do with pricing/inventory, and
  // keeping them on their own narrow endpoint means a bug here can't
  // touch the core product-edit form, and vice versa.
  router.patch('/:id/merchandising', (req, res) => {
    const product = db.queryOne('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const { need_tags, best_for, is_pawvy_pick } = req.body;

    let tagsArray = [];
    if (need_tags !== undefined) {
      if (!Array.isArray(need_tags)) {
        return res.status(400).json({ error: 'need_tags must be an array.' });
      }
      const invalid = need_tags.filter(t => !NEED_TAGS.includes(t));
      if (invalid.length) {
        return res.status(400).json({ error: `Unknown need tag(s): ${invalid.join(', ')}. Valid tags: ${NEED_TAGS.join(', ')}.` });
      }
      tagsArray = need_tags;
    } else {
      // Not included in this request — keep whatever's already stored
      // rather than silently wiping it (same convention as best_for/
      // is_pawvy_pick below).
      const current = db.queryOne('SELECT need_tags FROM products WHERE id = ?', [req.params.id]);
      try { tagsArray = JSON.parse(current.need_tags || '[]'); } catch (e) { tagsArray = []; }
    }

    db.run(`
      UPDATE products SET
        need_tags = ?, best_for = ?, is_pawvy_pick = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      JSON.stringify(tagsArray),
      best_for !== undefined ? (best_for || null) : db.queryOne('SELECT best_for FROM products WHERE id = ?', [req.params.id]).best_for,
      is_pawvy_pick !== undefined ? (is_pawvy_pick ? 1 : 0) : db.queryOne('SELECT is_pawvy_pick FROM products WHERE id = ?', [req.params.id]).is_pawvy_pick,
      req.params.id
    ]);

    const updated = db.queryOne(`
      SELECT p.*, b.name AS brand_name, b.color AS brand_color
      FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = ?
    `, [req.params.id]);
    res.json(withParsedNeedTags(withEffectivePrice(updated)));
  });

  // DELETE (soft delete — set inactive)
  // DELETE /:id/permanent — genuinely removes the product row, unlike
  // the archive-only route above. Only allowed when the SKU has zero
  // footprint in any table that represents real historical/financial
  // records — sales, invoices, orders, consignments, and inventory
  // audit trails must never silently disappear (they're what the Sales
  // Ledger, invoices, and reports are built from). If any of those exist,
  // this refuses with a breakdown of exactly what's blocking it, and the
  // right move is to archive instead (already fully supported — an
  // archived SKU already disappears from POS/Portal/website).
  //
  // Purely operational/reference state (current stock levels, restock
  // checklist line items, cost reference config — not financial records,
  // nothing the Sales Ledger or an invoice depends on) is safe to clear
  // automatically as part of the delete, so it doesn't block on those.
  //
  // Requires the SKU to already be archived first (is_active = 0) — a
  // deliberate two-step gate so a permanent delete can never happen by
  // accident on something still live.
  const PERMANENT_DELETE_BLOCKING_TABLES = [
    ['sales', 'sales record(s)'],
    ['invoice_items', 'invoice line item(s)'],
    ['website_order_items', 'website order line item(s)'],
    ['portal_order_items', 'portal order line item(s)'],
    ['shipment_line_items', 'shipment line item(s)'],
    ['consignment_items', 'consignment item(s)'],
    ['consignment_placements', 'consignment placement(s)'],
    ['consignment_returns', 'consignment return(s)'],
    ['consignment_count_items', 'consignment count item(s)'],
    ['consignment_snapshots', 'consignment snapshot(s)'],
    ['inventory_movements', 'inventory movement record(s)'],
    ['inventory_adjustments', 'inventory adjustment record(s)'],
    ['cost_variance_ledger', 'cost variance ledger entr(y/ies)'],
  ];
  const PERMANENT_DELETE_SAFE_TO_CLEAR_TABLES = ['inventory_levels', 'sku_cost_reference', 'restock_checklist_items'];

  router.delete('/:id/permanent', (req, res) => {
    const product = db.queryOne('SELECT id, is_active, item_series FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    if (product.is_active) {
      return res.status(400).json({ error: 'Archive this SKU first before permanently deleting it — a deliberate two-step so this can never happen by accident on something still live.' });
    }

    const blockers = PERMANENT_DELETE_BLOCKING_TABLES
      .map(([table, label]) => {
        const { c } = db.queryOne(`SELECT COUNT(*) as c FROM ${table} WHERE product_id = ?`, [req.params.id]);
        return c > 0 ? `${c} ${label}` : null;
      })
      .filter(Boolean);

    if (blockers.length > 0) {
      return res.status(409).json({
        error: `Can't permanently delete "${product.item_series}" — it has real history: ${blockers.join(', ')}. Archiving already removes it from POS/Portal/website; permanent delete is only for SKUs with no transaction history at all (e.g. entered by mistake).`,
        blockers,
      });
    }

    for (const table of PERMANENT_DELETE_SAFE_TO_CLEAR_TABLES) {
      db.run(`DELETE FROM ${table} WHERE product_id = ?`, [req.params.id]);
    }
    db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.run('UPDATE products SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── Product image (Railway Storage Bucket, Aug 2026) ───────────────
  // POST /api/products/:id/image — body: { image_data: "data:image/jpeg;base64,..." }
  // Client-side upload UI is unchanged (still reads the file as base64
  // and POSTs it) — only what the SERVER does with it changed: decode →
  // upload to the bucket → store the resulting proxied URL in image_url.
  // image_data itself is no longer written for new uploads.
  //
  // If this product already had an image (i.e. this is a "Replace
  // Image" rather than a first upload), the OLD bucket object is cleaned
  // up too — the new one is uploaded first and only deleted after that
  // succeeds, so a failed upload never leaves the product with no image
  // at all.
  router.post('/:id/image', async (req, res) => {
    const { image_data } = req.body;
    if (!image_data) return res.status(400).json({ error: 'image_data required' });
    if (!image_data.startsWith('data:image/')) return res.status(400).json({ error: 'Must be a base64 image data URI' });

    try {
      const existing = db.queryOne('SELECT image_url FROM products WHERE id = ?', [req.params.id]);
      const { buffer, contentType, extension } = decodeDataUrl(image_data);
      const { key, url } = buildImageKey('products', req.params.id, extension);
      await uploadBuffer(key, buffer, contentType);
      db.run('UPDATE products SET image_url = ?, image_data = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [url, req.params.id]);
      if (existing?.image_url) {
        deleteObject(existing.image_url.replace(/^\/api\/uploads\//, '')).catch(() => {});
      }
      res.json({ ok: true, image_url: url });
    } catch (err) {
      res.status(502).json({ error: 'Image upload to storage failed: ' + err.message });
    }
  });

  router.delete('/:id/image', async (req, res) => {
    const product = db.queryOne('SELECT image_url FROM products WHERE id = ?', [req.params.id]);
    db.run('UPDATE products SET image_data = NULL, image_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    // Best-effort bucket cleanup — don't fail the request if this errors,
    // the DB is already the source of truth and a stray orphaned object
    // in the bucket costs fractions of a cent, not worth blocking on.
    if (product?.image_url) {
      const key = product.image_url.replace(/^\/api\/uploads\//, '');
      deleteObject(key).catch(() => {});
    }
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
