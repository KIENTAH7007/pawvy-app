const { Router } = require('express');
const { uploadBuffer, decodeDataUrl, buildImageKey, deleteObject } = require('../lib/bucket');
const { optimizeForWeb } = require('../lib/imageOptimize');
const { optimizeExistingImages } = require('../lib/optimizeExisting');

// Saves one banner image: resized + compressed for the web (desktop 1920px,
// tablet 1200px, mobile 800px wide). If that actually changed the file, the
// untouched original is also kept in the bucket under '<folder>-original/'.
async function storeBannerImage(folder, id, dataUrl, maxWidth) {
  const orig = decodeDataUrl(dataUrl);
  const opt = await optimizeForWeb(orig.buffer, orig.contentType, { maxWidth });
  const { key, url } = buildImageKey(folder, id, opt.extension);
  await uploadBuffer(key, opt.buffer, opt.contentType);
  if (opt.changed) {
    const o = buildImageKey(`${folder}-original`, id, orig.extension);
    uploadBuffer(o.key, orig.buffer, orig.contentType).catch(() => {});
  }
  return url;
}

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

  // One-time (safe to re-run) tidy-up of images uploaded before optimising
  // existed: banners (all three sizes) and Instagram highlights. Originals
  // stay in the bucket; each page just gets pointed at a lighter copy.
  router.post('/optimize-existing', async (req, res) => {
    try {
      res.json(await optimizeExistingImages(db));
    } catch (err) {
      res.status(500).json({ error: 'Optimise failed: ' + err.message });
    }
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

      const url = await storeBannerImage('banners', result.lastID, image_data, 1920);
      db.run('UPDATE homepage_banners SET image_url = ? WHERE id = ?', [url, result.lastID]);

      // Both optional on create — a banner with just the desktop image
      // still works fine everywhere (falls back to it, see
      // publicContent.js), staff can add the device-specific versions
      // whenever they're ready.
      if (image_data_mobile) {
        const mUrl = await storeBannerImage('banners-mobile', result.lastID, image_data_mobile, 800);
        db.run('UPDATE homepage_banners SET image_url_mobile = ? WHERE id = ?', [mUrl, result.lastID]);
      }
      if (image_data_tablet) {
        const tUrl = await storeBannerImage('banners-tablet', result.lastID, image_data_tablet, 1200);
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
        newImageUrl = await storeBannerImage('banners', req.params.id, image_data, 1920);
        if (banner.image_url) {
          deleteObject(banner.image_url.replace(/^\/api\/uploads\//, '')).catch(() => {});
        }
      }
      // Each image is independent — replacing one never touches the others.
      if (image_data_mobile) {
        newImageUrlMobile = await storeBannerImage('banners-mobile', req.params.id, image_data_mobile, 800);
        if (banner.image_url_mobile) {
          deleteObject(banner.image_url_mobile.replace(/^\/api\/uploads\//, '')).catch(() => {});
        }
      }
      if (image_data_tablet) {
        newImageUrlTablet = await storeBannerImage('banners-tablet', req.params.id, image_data_tablet, 1200);
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
