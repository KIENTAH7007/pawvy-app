const { Router } = require('express');

// Staff-only view of submitted enquiries. Mounted at /api/enquiry-admin
// (singular "enquiry," matching the exact same convention as
// customer-admin.js vs customers.js) — this naming is deliberate, not
// arbitrary: /api/enquiries-admin would have been WRONG, since
// '/enquiries-admin'.startsWith('/enquiries') is true, meaning it would
// have been accidentally caught by the /enquiries public-route exclusion
// in server/index.js's PIN gate and exposed this staff-only route
// publicly. Verified this directly with a real string test before
// choosing the mount path, not assumed.
module.exports = function(db) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ enquiries: db.query('SELECT * FROM enquiries ORDER BY created_at DESC') });
  });

  router.post('/:id/mark-replied', (req, res) => {
    const enquiry = db.queryOne('SELECT id FROM enquiries WHERE id = ?', [req.params.id]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found.' });
    db.run('UPDATE enquiries SET replied = 1 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
