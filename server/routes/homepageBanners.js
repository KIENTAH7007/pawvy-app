const { Router } = require('express');

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
    res.json({ banners: db.query('SELECT * FROM homepage_banners ORDER BY id DESC') });
  });

  router.post('/', (req, res) => {
    const { image_data, headline, link_url, start_date, end_date, is_active } = req.body;
    if (!image_data) return res.status(400).json({ error: 'An image is required.' });
    if (!image_data.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Must be a base64 image data URI.' });
    }
    if (start_date && end_date && end_date < start_date) {
      return res.status(400).json({ error: 'End date must be on or after start date.' });
    }

    const result = db.run(`
      INSERT INTO homepage_banners (image_data, headline, link_url, start_date, end_date, is_active)
      VALUES (?,?,?,?,?,?)
    `, [image_data, headline?.trim() || null, link_url?.trim() || null, start_date || null, end_date || null, is_active ? 1 : 0]);

    res.status(201).json({ ok: true, id: result.lastID });
  });

  router.patch('/:id', (req, res) => {
    const banner = db.queryOne('SELECT id FROM homepage_banners WHERE id = ?', [req.params.id]);
    if (!banner) return res.status(404).json({ error: 'Banner not found.' });

    const { image_data, headline, link_url, start_date, end_date, is_active } = req.body;
    if (image_data && !image_data.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Must be a base64 image data URI.' });
    }
    if (start_date && end_date && end_date < start_date) {
      return res.status(400).json({ error: 'End date must be on or after start date.' });
    }

    db.run(`
      UPDATE homepage_banners SET
        image_data = COALESCE(?, image_data),
        headline = COALESCE(?, headline),
        link_url = COALESCE(?, link_url),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `, [
      image_data || null, headline?.trim() || null, link_url?.trim() || null,
      start_date || null, end_date || null,
      typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
      req.params.id,
    ]);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const banner = db.queryOne('SELECT id FROM homepage_banners WHERE id = ?', [req.params.id]);
    if (!banner) return res.status(404).json({ error: 'Banner not found.' });
    db.run('DELETE FROM homepage_banners WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
