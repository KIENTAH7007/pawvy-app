const { Router } = require('express');

// Admin-editable earn-rate multiplier campaigns (e.g. "Button's Birthday
// Week", 2x) — see pawvy-buttons-spec.md Section 3. Mounted at
// /api/campaigns, staff-only (covered by the normal PIN gate in
// server/index.js — not in the public exclusion list, unlike
// /api/customers). getActiveMultiplier() in lib/buttons.js reads from this
// table at earn-calculation time; no code changes are needed to run a
// campaign, just a row here.
module.exports = function(db) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ campaigns: db.query('SELECT * FROM campaigns ORDER BY start_date DESC') });
  });

  router.post('/', (req, res) => {
    const { name, multiplier, scope, scope_value, start_date, end_date, is_active } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!multiplier || multiplier <= 0) return res.status(400).json({ error: 'Multiplier must be a positive number.' });
    if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end date are required.' });
    if (end_date < start_date) return res.status(400).json({ error: 'End date must be on or after the start date.' });

    const result = db.run(`
      INSERT INTO campaigns (name, multiplier, scope, scope_value, start_date, end_date, is_active)
      VALUES (?,?,?,?,?,?,?)
    `, [name.trim(), multiplier, scope || 'site_wide', scope_value || null, start_date, end_date, is_active === false ? 0 : 1]);

    res.status(201).json({ ok: true, id: result.lastID });
  });

  router.patch('/:id', (req, res) => {
    const campaign = db.queryOne('SELECT id FROM campaigns WHERE id = ?', [req.params.id]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });

    const { name, multiplier, scope, scope_value, start_date, end_date, is_active } = req.body;
    if (end_date && start_date && end_date < start_date) {
      return res.status(400).json({ error: 'End date must be on or after the start date.' });
    }

    db.run(`
      UPDATE campaigns SET
        name = COALESCE(?, name), multiplier = COALESCE(?, multiplier),
        scope = COALESCE(?, scope), scope_value = ?,
        start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `, [
      name?.trim() || null, multiplier || null, scope || null, scope_value ?? null,
      start_date || null, end_date || null,
      typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
      req.params.id,
    ]);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const campaign = db.queryOne('SELECT id FROM campaigns WHERE id = ?', [req.params.id]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
    db.run('DELETE FROM campaigns WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
