const { Router } = require('express');

// Restock Checklist — staged Storhub <-> Home transfer prep.
// The checklist itself is just a staging list; completing it calls the
// exact same movement-recording function that the existing manual
// Transfer function and Shipment inventory sync already use, tagged with
// a reference back to the checklist for audit trail. No new
// inventory-writing logic — this is a UI/workflow layer in front of
// logic that's already tested in production.
module.exports = function(db, inventoryRouter) {
  const router = Router();

  const TRAILING_DAYS = 60;            // velocity window, same as Restock Forecasting
  const LOW_HOME_DAYS = 14;            // trigger: Home has less than this many days of cover left
  const TARGET_HOME_COVER_DAYS = 30;   // suggested transfer brings Home up to this many days of cover
  const NO_VELOCITY_DEFAULT_QTY = 10;  // fallback suggestion when Home is at 0 but no recent sales data exists

  function getLevel(product_id, location) {
    return db.queryOne('SELECT qty FROM inventory_levels WHERE product_id=? AND location=?', [product_id, location])?.qty || 0;
  }

  // ── List + create ──────────────────────────────────────────────

  router.get('/', (req, res) => {
    const { status } = req.query;
    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM restock_checklist_items WHERE checklist_id = c.id) AS item_count,
        (SELECT COUNT(*) FROM restock_checklist_items WHERE checklist_id = c.id AND checked = 1) AS checked_count
      FROM restock_checklists c
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND c.status = ?'; params.push(status); }
    sql += ' ORDER BY c.created_at DESC';
    res.json(db.query(sql, params));
  });

  router.post('/', (req, res) => {
    const { label, direction } = req.body;
    const result = db.run(
      `INSERT INTO restock_checklists (label, direction, status) VALUES (?, ?, 'draft')`,
      [label || null, direction === 'home_to_storhub' ? 'home_to_storhub' : 'storhub_to_home']
    );
    res.status(201).json(db.queryOne('SELECT * FROM restock_checklists WHERE id = ?', [result.lastID]));
  });

  // ── Suggested transfers (Storhub -> Home only) ────────────────────
  // Reuses the same trailing-60-day velocity concept as Restock
  // Forecasting, but asks a different question: not "when to reorder
  // from the supplier" but "what's running low specifically at Home
  // while Storhub still has stock to cover it". Registered before /:id
  // since it's a literal single-segment route.
  router.get('/suggestions', (req, res) => {
    const since = new Date();
    since.setDate(since.getDate() - TRAILING_DAYS);
    const sinceStr = since.toISOString().slice(0, 10);

    const products = db.query(`
      SELECT p.id AS product_id, p.item_series, p.variation, b.name AS brand_name
      FROM products p JOIN brands b ON b.id = p.brand_id
      WHERE p.is_active = 1
      ORDER BY b.name, p.item_series, p.variation
    `);

    const suggestions = [];
    products.forEach(p => {
      const storhub = getLevel(p.product_id, 'Storhub');
      if (storhub <= 0) return; // nothing available to transfer

      const home = getLevel(p.product_id, 'Home');
      const depleted = db.queryOne(`
        SELECT COALESCE(SUM(-qty_change), 0) AS total
        FROM inventory_movements
        WHERE product_id = ? AND location = 'Home' AND qty_change < 0 AND date >= ?
          AND type IN ('Sale', 'Consignment Placement')
      `, [p.product_id, sinceStr])?.total || 0;

      const dailyVelocity = depleted / TRAILING_DAYS;
      let reason = null, suggestedQty = 0, daysRemaining = null;

      if (dailyVelocity > 0) {
        daysRemaining = Math.floor(home / dailyVelocity);
        if (daysRemaining < LOW_HOME_DAYS) {
          reason = 'low_stock';
          suggestedQty = Math.min(storhub, Math.max(1, Math.ceil(dailyVelocity * TARGET_HOME_COVER_DAYS) - home));
        }
      } else if (home <= 0) {
        reason = 'out_of_stock';
        suggestedQty = Math.min(storhub, NO_VELOCITY_DEFAULT_QTY);
      }

      if (reason && suggestedQty > 0) {
        suggestions.push({
          product_id: p.product_id, item_series: p.item_series, variation: p.variation, brand_name: p.brand_name,
          home_qty: home, storhub_qty: storhub, daily_velocity: parseFloat(dailyVelocity.toFixed(3)),
          days_remaining: daysRemaining, reason, suggested_qty: suggestedQty,
        });
      }
    });

    // Out-of-stock items first (most urgent), then by lowest Home qty
    suggestions.sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === 'out_of_stock' ? -1 : 1;
      return a.home_qty - b.home_qty;
    });
    res.json(suggestions);
  });

  // ── Single checklist detail ───────────────────────────────────────

  router.get('/:id', (req, res) => {
    const checklist = db.queryOne('SELECT * FROM restock_checklists WHERE id = ?', [req.params.id]);
    if (!checklist) return res.status(404).json({ error: 'Checklist not found' });
    const items = db.query(`
      SELECT ci.*, p.item_series, p.variation, b.name AS brand_name
      FROM restock_checklist_items ci
      JOIN products p ON p.id = ci.product_id
      LEFT JOIN brands b ON b.id = p.brand_id
      WHERE ci.checklist_id = ?
      ORDER BY ci.id
    `, [req.params.id]);
    res.json({ ...checklist, items });
  });

  router.put('/:id', (req, res) => {
    const fields = ['label', 'direction', 'status'];
    const sets = [];
    const params = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
    });
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    db.run(`UPDATE restock_checklists SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json(db.queryOne('SELECT * FROM restock_checklists WHERE id = ?', [req.params.id]));
  });

  router.delete('/:id', (req, res) => {
    db.run('DELETE FROM restock_checklists WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  // ── Items ──────────────────────────────────────────────────────

  router.post('/:id/items', (req, res) => {
    const { product_id, qty_planned } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id is required' });
    const result = db.run(
      `INSERT INTO restock_checklist_items (checklist_id, product_id, qty_planned) VALUES (?, ?, ?)`,
      [req.params.id, product_id, qty_planned || 0]
    );
    res.status(201).json(db.queryOne(`
      SELECT ci.*, p.item_series, p.variation, b.name AS brand_name
      FROM restock_checklist_items ci JOIN products p ON p.id = ci.product_id LEFT JOIN brands b ON b.id = p.brand_id
      WHERE ci.id = ?
    `, [result.lastID]));
  });

  // Bulk-add — used by the "Add suggested transfers" action to insert
  // several picked suggestions in one call rather than one request per item.
  router.post('/:id/items/bulk', (req, res) => {
    const { items } = req.body; // [{ product_id, qty_planned }]
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items array required' });
    items.forEach(it => {
      db.run(`INSERT INTO restock_checklist_items (checklist_id, product_id, qty_planned) VALUES (?, ?, ?)`,
        [req.params.id, it.product_id, it.qty_planned || 0]);
    });
    const all = db.query(`
      SELECT ci.*, p.item_series, p.variation, b.name AS brand_name
      FROM restock_checklist_items ci JOIN products p ON p.id = ci.product_id LEFT JOIN brands b ON b.id = p.brand_id
      WHERE ci.checklist_id = ? ORDER BY ci.id
    `, [req.params.id]);
    res.status(201).json(all);
  });

  router.put('/items/:itemId', (req, res) => {
    const fields = ['qty_planned', 'qty_taken', 'checked'];
    const sets = [];
    const params = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
    });
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.itemId);
    db.run(`UPDATE restock_checklist_items SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json(db.queryOne(`
      SELECT ci.*, p.item_series, p.variation, b.name AS brand_name
      FROM restock_checklist_items ci JOIN products p ON p.id = ci.product_id LEFT JOIN brands b ON b.id = p.brand_id
      WHERE ci.id = ?
    `, [req.params.itemId]));
  });

  router.delete('/items/:itemId', (req, res) => {
    db.run('DELETE FROM restock_checklist_items WHERE id = ?', [req.params.itemId]);
    res.json({ ok: true });
  });

  // ── Complete: commit checked items as real inventory transfers ────
  // Reuses the exact same recordMovement function the manual Transfer
  // function already uses — same 'Transfer Out'/'Transfer In' types, so
  // it shows up in inventory movement history identically to a manual
  // transfer, just tagged with a reference back to this checklist.
  router.post('/:id/complete', (req, res) => {
    const checklist = db.queryOne('SELECT * FROM restock_checklists WHERE id = ?', [req.params.id]);
    if (!checklist) return res.status(404).json({ error: 'Checklist not found' });

    const items = db.query('SELECT * FROM restock_checklist_items WHERE checklist_id = ? AND checked = 1', [req.params.id]);
    if (!items.length) return res.status(400).json({ error: 'No checked items to transfer — check off what you took first' });

    const fromLoc = checklist.direction === 'home_to_storhub' ? 'Home' : 'Storhub';
    const toLoc   = checklist.direction === 'home_to_storhub' ? 'Storhub' : 'Home';
    const today = new Date().toISOString().slice(0, 10);
    const reference = checklist.label || `Checklist #${checklist.id}`;
    const transferred = [];

    if (inventoryRouter?._recordMovement) {
      items.forEach(it => {
        const qty = (it.qty_taken != null ? it.qty_taken : it.qty_planned) || 0;
        if (qty <= 0) return;
        inventoryRouter._recordMovement({ date: today, product_id: it.product_id, location: fromLoc, type: 'Transfer Out', qty_change: -qty, reference, notes: `Restock checklist #${checklist.id}` });
        inventoryRouter._recordMovement({ date: today, product_id: it.product_id, location: toLoc, type: 'Transfer In', qty_change: qty, reference, notes: `Restock checklist #${checklist.id}` });
        transferred.push({ product_id: it.product_id, qty });
      });
    }

    db.run(`UPDATE restock_checklists SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    res.json({ ok: true, transferred, checklist: db.queryOne('SELECT * FROM restock_checklists WHERE id = ?', [req.params.id]) });
  });

  return router;
};
