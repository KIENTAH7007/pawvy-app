const { Router } = require('express');
const { uploadBuffer, decodeDataUrl, buildImageKey, deleteObject } = require('../lib/bucket');

// Admin-editable Instagram Highlights shown on the website homepage —
// mounted at /api/instagram-posts, staff-only (covered by the PIN gate in
// server/index.js). The public, read-only version is served separately
// from routes/publicContent.js.
//
// Each entry is an uploaded image (image_data, base64 — same pattern as
// products.image_data) plus an optional destination link (link_url —
// a specific Instagram post, or the Pawvy profile; publicContent.js falls
// back to the profile URL if link_url is blank, so a click never dead-ends).
module.exports = function(db) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ posts: db.query('SELECT * FROM instagram_posts ORDER BY sort_order ASC, id ASC') });
  });

  router.post('/', async (req, res) => {
    const { image_data, link_url, sort_order, is_active } = req.body;
    if (!image_data) return res.status(400).json({ error: 'An image is required.' });
    if (!image_data.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Must be a base64 image data URI.' });
    }

    try {
      const { buffer, contentType, extension } = decodeDataUrl(image_data);
      // url NOT NULL is a leftover from the old embed-URL design (see the
      // comment on the CREATE TABLE in server/database.js) — pass '' to
      // satisfy it without exposing this historical detail to the admin UI.
      const result = db.run(`
        INSERT INTO instagram_posts (url, link_url, sort_order, is_active)
        VALUES ('', ?, ?, ?)
      `, [link_url?.trim() || null, sort_order || 0, is_active === false ? 0 : 1]);
      const { key, url } = buildImageKey('instagram', result.lastID, extension);
      await uploadBuffer(key, buffer, contentType);
      db.run('UPDATE instagram_posts SET image_url = ? WHERE id = ?', [url, result.lastID]);
      res.status(201).json({ ok: true, id: result.lastID });
    } catch (err) {
      res.status(502).json({ error: 'Image upload to storage failed: ' + err.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    const post = db.queryOne('SELECT id, image_url FROM instagram_posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const { image_data, link_url, sort_order, is_active } = req.body;
    if (image_data && !image_data.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Must be a base64 image data URI.' });
    }

    let newImageUrl = null;
    if (image_data) {
      try {
        const { buffer, contentType, extension } = decodeDataUrl(image_data);
        const { key, url } = buildImageKey('instagram', req.params.id, extension);
        await uploadBuffer(key, buffer, contentType);
        newImageUrl = url;
        if (post.image_url) deleteObject(post.image_url.replace(/^\/api\/uploads\//, '')).catch(() => {});
      } catch (err) {
        return res.status(502).json({ error: 'Image upload to storage failed: ' + err.message });
      }
    }

    db.run(`
      UPDATE instagram_posts SET
        image_url = COALESCE(?, image_url),
        link_url = COALESCE(?, link_url),
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `, [
      newImageUrl, link_url?.trim() || null, sort_order ?? null,
      typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
      req.params.id,
    ]);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const post = db.queryOne('SELECT id, image_url FROM instagram_posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    db.run('DELETE FROM instagram_posts WHERE id = ?', [req.params.id]);
    if (post.image_url) deleteObject(post.image_url.replace(/^\/api\/uploads\//, '')).catch(() => {});
    res.json({ ok: true });
  });

  return router;
};
