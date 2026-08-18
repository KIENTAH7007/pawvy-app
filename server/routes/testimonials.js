const { Router } = require('express');
const { uploadBuffer, decodeDataUrl, buildImageKey, deleteObject } = require('../lib/bucket');
const { NEED_TAGS } = require('../lib/needTags');

// Shop-by-Need testimonials — staff-only CRUD (PIN-gated in server/index.js,
// same as homepage-banners and instagram-posts). The public, read-only
// version (filtered by is_active + optionally by need_tag) will live in
// routes/publicContent.js once the website's need pages are built (Phase 1)
// — this route just does plain CRUD so staff can manage all of them here,
// same split as homepage-banners/publicContent.js.
module.exports = function(db) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({
      testimonials: db.query(`
        SELECT t.*, p.item_series AS product_name, p.variation AS product_variation, b.name AS product_brand_name
        FROM testimonials t
        LEFT JOIN products p ON p.id = t.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        ORDER BY t.need_tag ASC, t.sort_order ASC, t.id ASC
      `),
    });
  });

  router.post('/', async (req, res) => {
    const { need_tag, quote, customer_handle, image_data, image_data_after, product_id, sort_order, is_active } = req.body;

    if (!need_tag || !NEED_TAGS.includes(need_tag)) {
      return res.status(400).json({ error: `need_tag is required and must be one of: ${NEED_TAGS.join(', ')}.` });
    }
    if (!quote || !quote.trim()) {
      return res.status(400).json({ error: 'A quote is required.' });
    }
    if (image_data && !image_data.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Photo must be a base64 image data URI.' });
    }
    if (image_data_after && !image_data_after.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Second (after) photo must be a base64 image data URI.' });
    }
    if (product_id) {
      const product = db.queryOne('SELECT id FROM products WHERE id = ?', [product_id]);
      if (!product) return res.status(400).json({ error: 'Linked product not found.' });
    }

    try {
      const result = db.run(`
        INSERT INTO testimonials (need_tag, quote, customer_handle, product_id, sort_order, is_active)
        VALUES (?,?,?,?,?,?)
      `, [need_tag, quote.trim(), customer_handle?.trim() || null, product_id || null, sort_order || 0, is_active === false ? 0 : 1]);

      if (image_data) {
        const { buffer, contentType, extension } = decodeDataUrl(image_data);
        const { key, url } = buildImageKey('testimonials', result.lastID, extension);
        await uploadBuffer(key, buffer, contentType);
        db.run('UPDATE testimonials SET image_url = ? WHERE id = ?', [url, result.lastID]);
      }
      // Second (after) photo is independent of the first — a testimonial
      // can be created with just one, the other added later via edit.
      if (image_data_after) {
        const a = decodeDataUrl(image_data_after);
        const { key: aKey, url: aUrl } = buildImageKey('testimonials-after', result.lastID, a.extension);
        await uploadBuffer(aKey, a.buffer, a.contentType);
        db.run('UPDATE testimonials SET image_url_after = ? WHERE id = ?', [aUrl, result.lastID]);
      }

      return res.status(201).json({ ok: true, id: result.lastID });
    } catch (err) {
      return res.status(502).json({ error: 'Image upload to storage failed: ' + err.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    const testimonial = db.queryOne('SELECT id, image_url, image_url_after FROM testimonials WHERE id = ?', [req.params.id]);
    if (!testimonial) return res.status(404).json({ error: 'Testimonial not found.' });

    const { need_tag, quote, customer_handle, image_data, image_data_after, remove_image_after, product_id, sort_order, is_active } = req.body;

    if (need_tag !== undefined && !NEED_TAGS.includes(need_tag)) {
      return res.status(400).json({ error: `need_tag must be one of: ${NEED_TAGS.join(', ')}.` });
    }
    if (quote !== undefined && !quote.trim()) {
      return res.status(400).json({ error: 'Quote cannot be blank.' });
    }
    if (image_data && !image_data.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Photo must be a base64 image data URI.' });
    }
    if (image_data_after && !image_data_after.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Second (after) photo must be a base64 image data URI.' });
    }
    if (product_id) {
      const product = db.queryOne('SELECT id FROM products WHERE id = ?', [product_id]);
      if (!product) return res.status(400).json({ error: 'Linked product not found.' });
    }

    let newImageUrl = null;
    let newImageUrlAfter = null;
    try {
      if (image_data) {
        const { buffer, contentType, extension } = decodeDataUrl(image_data);
        const { key, url } = buildImageKey('testimonials', req.params.id, extension);
        await uploadBuffer(key, buffer, contentType);
        newImageUrl = url;
        if (testimonial.image_url) {
          deleteObject(testimonial.image_url.replace(/^\/api\/uploads\//, '')).catch(() => {});
        }
      }
      if (image_data_after) {
        const a = decodeDataUrl(image_data_after);
        const { key: aKey, url: aUrl } = buildImageKey('testimonials-after', req.params.id, a.extension);
        await uploadBuffer(aKey, a.buffer, a.contentType);
        newImageUrlAfter = aUrl;
        if (testimonial.image_url_after) {
          deleteObject(testimonial.image_url_after.replace(/^\/api\/uploads\//, '')).catch(() => {});
        }
      }
    } catch (err) {
      return res.status(502).json({ error: 'Image upload to storage failed: ' + err.message });
    }

    // Explicit removal of just the "after" photo (drop back to a single-
    // image card) without needing to also replace the first photo —
    // distinct from simply not sending image_data_after, which leaves
    // whatever's already there untouched (COALESCE below).
    if (remove_image_after && testimonial.image_url_after) {
      deleteObject(testimonial.image_url_after.replace(/^\/api\/uploads\//, '')).catch(() => {});
      db.run('UPDATE testimonials SET image_url_after = NULL WHERE id = ?', [req.params.id]);
    }

    db.run(`
      UPDATE testimonials SET
        need_tag = COALESCE(?, need_tag),
        quote = COALESCE(?, quote),
        customer_handle = ?,
        image_url = COALESCE(?, image_url),
        image_url_after = COALESCE(?, image_url_after),
        product_id = ?,
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      need_tag || null,
      quote?.trim() || null,
      customer_handle !== undefined ? (customer_handle?.trim() || null) : db.queryOne('SELECT customer_handle FROM testimonials WHERE id = ?', [req.params.id]).customer_handle,
      newImageUrl,
      newImageUrlAfter,
      product_id !== undefined ? (product_id || null) : db.queryOne('SELECT product_id FROM testimonials WHERE id = ?', [req.params.id]).product_id,
      sort_order ?? null,
      typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
      req.params.id,
    ]);

    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const testimonial = db.queryOne('SELECT id, image_url, image_url_after FROM testimonials WHERE id = ?', [req.params.id]);
    if (!testimonial) return res.status(404).json({ error: 'Testimonial not found.' });
    db.run('DELETE FROM testimonials WHERE id = ?', [req.params.id]);
    if (testimonial.image_url) deleteObject(testimonial.image_url.replace(/^\/api\/uploads\//, '')).catch(() => {});
    if (testimonial.image_url_after) deleteObject(testimonial.image_url_after.replace(/^\/api\/uploads\//, '')).catch(() => {});
    res.json({ ok: true });
  });

  return router;
};
