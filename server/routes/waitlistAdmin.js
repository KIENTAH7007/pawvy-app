const { Router } = require('express');

// Staff-only waitlist visibility — PIN-gated (this path does NOT match
// any prefix in server/index.js's public-exemption list, unlike
// /api/waitlist above). Separate mount point, same split pattern as
// customers.js (public) / customerAdmin.js (staff), so the public submit
// endpoint's mount point can never accidentally expose this data.
module.exports = function(db) {
  const router = Router();

  // Counts per product — used by the Products & Pricing page to show a
  // small badge on each row without joining this onto the main products
  // list query (kept deliberately separate, same reasoning as the
  // merchandising/discount endpoints being their own thing).
  router.get('/counts', (req, res) => {
    res.json({
      counts: db.query(`
        SELECT product_id, COUNT(*) AS count
        FROM product_waitlist
        WHERE notified_at IS NULL
        GROUP BY product_id
      `),
    });
  });

  // Full list for one product — shown when staff click the badge.
  router.get('/:productId', (req, res) => {
    const product = db.queryOne('SELECT id, item_series, variation FROM products WHERE id = ?', [req.params.productId]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    res.json({
      product,
      entries: db.query(
        'SELECT id, email, notified_at, created_at FROM product_waitlist WHERE product_id = ? ORDER BY created_at ASC',
        [req.params.productId]
      ),
    });
  });

  // Manual "mark notified" — no automatic restock email exists yet (see
  // database.js's comment on this table), so for now this is just a way
  // for staff to track who they've already reached out to by hand,
  // without that entry cluttering the /counts badge (which only counts
  // notified_at IS NULL) or the follow-up list.
  router.patch('/:id/notify', (req, res) => {
    const entry = db.queryOne('SELECT id FROM product_waitlist WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ error: 'Waitlist entry not found.' });
    db.run('UPDATE product_waitlist SET notified_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const entry = db.queryOne('SELECT id FROM product_waitlist WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ error: 'Waitlist entry not found.' });
    db.run('DELETE FROM product_waitlist WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
