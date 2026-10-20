const { Router } = require('express');
const fx = require('../lib/fx');

module.exports = function fxRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const current = fx.getRateForDate(db, fx.todaySG());
    const history = db.query('SELECT date, myr_per_sgd, source FROM fx_rates ORDER BY date DESC LIMIT 60');
    res.json({ current, history });
  });

  // Manual override for a date (default today). Existing MY records are NOT changed.
  router.post('/', (req, res) => {
    try {
      const date = req.body.date || fx.todaySG();
      fx.setRate(db, date, req.body.myr_per_sgd, 'manual');
      fx.backfillMissing(db);
      res.status(201).json(fx.getRateForDate(db, date));
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  router.post('/refresh', async (req, res) => {
    const out = await fx.fetchAndStore(db);
    res.status(out.error ? 502 : 200).json({ ...out, current: fx.getRateForDate(db, fx.todaySG()) });
  });

  // Remove a manual/auto row (e.g. a typo) — past records keep their saved rate.
  router.delete('/:date', (req, res) => {
    db.run('DELETE FROM fx_rates WHERE date = ?', [req.params.date]);
    res.json({ ok: true });
  });

  return router;
};
