const { Router } = require('express');

// Admin-editable ticker messages for the website's homepage marquee —
// campaigns, event/booth announcements, or any other free text KT wants
// scrolling across the site. Mounted at /api/ticker-messages, staff-only
// (covered by the normal PIN gate in server/index.js). The public,
// read-only version of this data is served separately from
// routes/publicContent.js (mounted outside the PIN gate) — this router is
// only for managing the list, never read directly by the website.
module.exports = function(db) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ messages: db.query('SELECT * FROM ticker_messages ORDER BY sort_order ASC, id ASC') });
  });

  router.post('/', (req, res) => {
    const { text, sort_order, is_active } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message text is required.' });

    const result = db.run(`
      INSERT INTO ticker_messages (text, sort_order, is_active)
      VALUES (?, ?, ?)
    `, [text.trim(), sort_order || 0, is_active === false ? 0 : 1]);

    res.status(201).json({ ok: true, id: result.lastID });
  });

  router.patch('/:id', (req, res) => {
    const message = db.queryOne('SELECT id FROM ticker_messages WHERE id = ?', [req.params.id]);
    if (!message) return res.status(404).json({ error: 'Message not found.' });

    const { text, sort_order, is_active } = req.body;
    db.run(`
      UPDATE ticker_messages SET
        text = COALESCE(?, text),
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `, [
      text?.trim() || null, sort_order ?? null,
      typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
      req.params.id,
    ]);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const message = db.queryOne('SELECT id FROM ticker_messages WHERE id = ?', [req.params.id]);
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    db.run('DELETE FROM ticker_messages WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
