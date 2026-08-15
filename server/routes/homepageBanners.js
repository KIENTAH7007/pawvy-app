const { Router } = require('express');
const { uploadBuffer, decodeDataUrl, buildImageKey, deleteObject } = require('../lib/bucket');

// Admin-editable homepage takeover banner (the "Wild Balance"-style new
// brand announcement) — mounted at /api/homepage-banners, staff-only
// (covered by the PIN gate in server/index.js). The public, read-only
// version is served separately from routes/publicContent.js, which also
// applies the start_date/end_date/is_active check — this route just does
// plain CRUD, no date filtering, so KT can see and edit past/future/
// inactive entries here too, not just whatever happens to be live right
// now on the website.
module.exports = function(db) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ banners: db.query('SELECT * FROM homepage_banners ORDER BY sort_order ASC, id ASC') });
  });

  router.post('/', async (req, res) => {
    const { image_data, image_data_mobile, image_data_tablet, headline, link_url, start_date, end_date, is_active, sort_order, show_caption } = req.body;
    if (!image_data) return res.status(400).json({ error: 'A desktop image is required.' });
    if (!image_data.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Must be a base64 image data URI.' });
    }
    if (image_data_mobile && !image_data_mobile.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Mobile image must be a base64 image data URI.' });
    }
    if (image_data_tablet && !image_data_tablet.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Tablet image must be a base64 image data URI.' });
    }
    if (start_date && end_date && end_date < start_date) {
      return res.status(400).json({ error: 'End date must be on or after start date.' });
    }

    try {
      const result = db.run(`
        INSERT INTO homepage_banners (headline, link_url, start_date, end_date, is_active, sort_order, show_caption)
        VALUES (?,?,?,?,?,?,?)
      `, [headline?.trim() || null, link_url?.trim() || null, start_date || null, end_date || null, is_active ? 1 : 0, sort_order || 0, show_caption === false ? 0 : 1]);

      const { buffer, contentType, extension } = decodeDataUrl(image_data);
      const { key, url } = buildImageKey('banners', result.lastID, extension);
      await uploadBuffer(key, buffer, contentType);
      db.run('UPDATE homepage_banners SET image_url = ? WHERE id = ?', [url, result.lastID]);

      // Both optional on create — a banner with just the desktop image
      // still works fine everywhere (falls back to it, see
      // publicContent.js), staff can add the device-specific versions
      // whenever they're ready.
      if (image_data_mobile) {
        const m = decodeDataUrl(image_data_mobile);
        const { key: mKey, url: mUrl } = buildImageKey('banners-mobile', result.lastID, m.extension);
        await uploadBuffer(mKey, m.buffer, m.contentType);
        db.run('UPDATE homepage_banners SET image_url_mobile = ? WHERE id = ?', [mUrl, result.lastID]);
      }
      if (image_data_tablet) {
        const t = decodeDataUrl(image_data_tablet);
        const { key: tKey, url: tUrl } = buildImageKey('banners-tablet', result.lastID, t.extension);
        await uploadBuffer(tKey, t.buffer, t.contentType);
        db.run('UPDATE homepage_banners SET image_url_tablet = ? WHERE id = ?', [tUrl, result.lastID]);
      }

      return res.status(201).json({ ok: true, id: result.lastID });
    } catch (err) {
      return res.status(502).json({ error: 'Image upload to storage failed: ' + err.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    const banner = db.queryOne('SELECT id, image_url, image_url_mobile, image_url_tablet FROM homepage_banners WHERE id = ?', [req.params.id]);
    if (!banner) return res.status(404).json({ error: 'Banner not found.' });

    const { image_data, image_data_mobile, image_data_tablet, headline, link_url, start_date, end_date, is_active, sort_order, show_caption } = req.body;
    if (image_data && !image_data.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Must be a base64 image data URI.' });
    }
    if (image_data_mobile && !image_data_mobile.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Mobile image must be a base64 image data URI.' });
    }
    if (image_data_tablet && !image_data_tablet.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Tablet image must be a base64 image data URI.' });
    }
    if (start_date && end_date && end_date < start_date) {
      return res.status(400).json({ error: 'End date must be on or after start date.' });
    }

    let newImageUrl = null;
    let newImageUrlMobile = null;
    let newImageUrlTablet = null;
    try {
      if (image_data) {
        const { buffer, contentType, extension } = decodeDataUrl(image_data);
        const { key, url } = buildImageKey('banners', req.params.id, extension);
        await uploadBuffer(key, buffer, contentType);
        newImageUrl = url;
        if (banner.image_url) {
          deleteObject(banner.image_url.replace(/^\/api\/uploads\//, '')).catch(() => {});
        }
      }
      // Each image is independent — replacing one never touches the others.
      if (image_data_mobile) {
        const m = decodeDataUrl(image_data_mobile);
        const { key: mKey, url: mUrl } = buildImageKey('banners-mobile', req.params.id, m.extension);
        await uploadBuffer(mKey, m.buffer, m.contentType);
        newImageUrlMobile = mUrl;
        if (banner.image_url_mobile) {
          deleteObject(banner.image_url_mobile.replace(/^\/api\/uploads\//, '')).catch(() => {});
        }
      }
      if (image_data_tablet) {
        const t = decodeDataUrl(image_data_tablet);
        const { key: tKey, url: tUrl } = buildImageKey('banners-tablet', req.params.id, t.extension);
        await uploadBuffer(tKey, t.buffer, t.contentType);
        newImageUrlTablet = tUrl;
        if (banner.image_url_tablet) {
          deleteObject(banner.image_url_tablet.replace(/^\/api\/uploads\//, '')).catch(() => {});
        }
      }
    } catch (err) {
      return res.status(502).json({ error: 'Image upload to storage failed: ' + err.message });
    }

    db.run(`
      UPDATE homepage_banners SET
        image_url = COALESCE(?, image_url),
        image_url_mobile = COALESCE(?, image_url_mobile),
        image_url_tablet = COALESCE(?, image_url_tablet),
        headline = COALESCE(?, headline),
        link_url = COALESCE(?, link_url),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        is_active = COALESCE(?, is_active),
        sort_order = COALESCE(?, sort_order),
        show_caption = COALESCE(?, show_caption)
      WHERE id = ?
    `, [
      newImageUrl, newImageUrlMobile, newImageUrlTablet, headline?.trim() || null, link_url?.trim() || null,
      start_date || null, end_date || null,
      typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
      sort_order ?? null,
      typeof show_caption === 'boolean' ? (show_caption ? 1 : 0) : null,
      req.params.id,
    ]);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const banner = db.queryOne('SELECT id, image_url, image_url_mobile, image_url_tablet FROM homepage_banners WHERE id = ?', [req.params.id]);
    if (!banner) return res.status(404).json({ error: 'Banner not found.' });
    db.run('DELETE FROM homepage_banners WHERE id = ?', [req.params.id]);
    if (banner.image_url) deleteObject(banner.image_url.replace(/^\/api\/uploads\//, '')).catch(() => {});
    if (banner.image_url_mobile) deleteObject(banner.image_url_mobile.replace(/^\/api\/uploads\//, '')).catch(() => {});
    if (banner.image_url_tablet) deleteObject(banner.image_url_tablet.replace(/^\/api\/uploads\//, '')).catch(() => {});
    res.json({ ok: true });
  });

  return router;
};
