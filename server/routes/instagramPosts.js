const { Router } = require('express');

// Admin-editable Instagram post URLs shown on the website homepage —
// mounted at /api/instagram-posts, staff-only (covered by the PIN gate in
// server/index.js). The public, read-only version is served separately
// from routes/publicContent.js.
module.exports = function(db) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ posts: db.query('SELECT * FROM instagram_posts ORDER BY sort_order ASC, id ASC') });
  });

  router.post('/', (req, res) => {
    const { url, sort_order, is_active } = req.body;
    if (!url || !url.trim()) return res.status(400).json({ error: 'Post URL is required.' });
    if (!/^https:\/\/(www\.)?instagram\.com\//.test(url.trim())) {
      return res.status(400).json({ error: 'That doesn\'t look like an Instagram post URL.' });
    }

    const result = db.run(`
      INSERT INTO instagram_posts (url, sort_order, is_active)
      VALUES (?, ?, ?)
    `, [url.trim(), sort_order || 0, is_active === false ? 0 : 1]);

    res.status(201).json({ ok: true, id: result.lastID });
  });

  router.patch('/:id', (req, res) => {
    const post = db.queryOne('SELECT id FROM instagram_posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const { url, sort_order, is_active } = req.body;
    db.run(`
      UPDATE instagram_posts SET
        url = COALESCE(?, url),
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `, [
      url?.trim() || null, sort_order ?? null,
      typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
      req.params.id,
    ]);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const post = db.queryOne('SELECT id FROM instagram_posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    db.run('DELETE FROM instagram_posts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
