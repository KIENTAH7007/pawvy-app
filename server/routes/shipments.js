const { Router } = require('express');

// Shipments (Phase 7) — skeleton only.
// This route proves the table + routing wiring works end to end.
// Real create/read/update logic (landed cost calc, variance ledger,
// document upload, inventory sync) is built in later patches.
module.exports = function(db) {
  const router = Router();

  // GET all shipments (empty until real create logic lands)
  router.get('/', (req, res) => {
    const shipments = db.query('SELECT * FROM shipments ORDER BY created_at DESC');
    res.json(shipments);
  });

  return router;
};
