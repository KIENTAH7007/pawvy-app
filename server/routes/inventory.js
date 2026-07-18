const { Router } = require('express');
const fs = require('fs');
const path = require('path');

module.exports = function(db, consignmentRouter) {
  const router = Router();

  // ── Internal helpers ────────────────────────────────────────────
  function getLevel(product_id, location) {
    return db.queryOne('SELECT qty FROM inventory_levels WHERE product_id=? AND location=?', [product_id, location])?.qty || 0;
  }

  function setLevel(product_id, location, qty) {
    const existing = db.queryOne('SELECT id FROM inventory_levels WHERE product_id=? AND location=?', [product_id, location]);
    if (existing) db.run('UPDATE inventory_levels SET qty=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [qty, existing.id]);
    else db.run('INSERT INTO inventory_levels (product_id, location, qty) VALUES (?,?,?)', [product_id, location, qty]);
  }

  // Records a movement AND keeps inventory_levels in sync. Exposed for sales.js / consignment.js to call.
  function recordMovement({ date, product_id, location, type, qty_change, reference, notes }) {
    db.run(
      'INSERT INTO inventory_movements (date, product_id, location, type, qty_change, reference, notes) VALUES (?,?,?,?,?,?,?)',
      [date, product_id, location, type, qty_change, reference || null, notes || null]
    );
    const current = getLevel(product_id, location);
    setLevel(product_id, location, current + qty_change);
  }
  router._recordMovement = recordMovement; // exposed for sales.js / consignment.js hooks

  // Aggregate consignment on-hand across ALL partners, grouped by product
  function getGlobalConsignmentOnHand() {
    if (!consignmentRouter?._getOnHand || !consignmentRouter?._getConsignmentPartnerIds) return {};
    const map = {};
    const partnerIds = consignmentRouter._getConsignmentPartnerIds();
    for (const pid of partnerIds) {
      const items = consignmentRouter._getOnHand(pid);
      items.forEach(item => {
        map[item.product_id] = (map[item.product_id] || 0) + Math.max(0, item.on_hand || 0);
      });
    }
    return map;
  }

  // ── GET stock levels (warehouse + consignment) ──────────────────
  router.get('/levels', (req, res) => {
    const { brand_id } = req.query;
    let sql = `
      SELECT p.id AS product_id, p.item_series, p.variation, p.barcode, p.unit_cost,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color
      FROM products p JOIN brands b ON b.id = p.brand_id
      WHERE p.is_active = 1
    `;
    const params = [];
    if (brand_id) { sql += ' AND b.id = ?'; params.push(brand_id); }
    sql += ' ORDER BY b.name, p.item_series, p.variation';
    const products = db.query(sql, params);

    const consignmentMap = getGlobalConsignmentOnHand();

    const result = products.map(p => {
      const storhub = getLevel(p.product_id, 'Storhub');
      const home    = getLevel(p.product_id, 'Home');
      const warehouse_total = storhub + home;
      const consignment_qty = consignmentMap[p.product_id] || 0;
      return {
        ...p,
        storhub_qty: storhub,
        home_qty: home,
        warehouse_total,
        consignment_qty,
        total_stock: warehouse_total + consignment_qty,
      };
    });
    res.json(result);
  });

  // ── GET movement history for one SKU ────────────────────────────
  router.get('/movements/:product_id', (req, res) => {
    const movements = db.query(`
      SELECT * FROM inventory_movements WHERE product_id = ? ORDER BY date DESC, id DESC
    `, [req.params.product_id]);
    const writeoffs = db.query(`
      SELECT id, date, 'Write-off' AS type, qty_change, location, reason AS notes, created_at
      FROM inventory_adjustments WHERE product_id = ? AND type = 'Write-off' ORDER BY date DESC, id DESC
    `, [req.params.product_id]);
    const combined = [...movements, ...writeoffs].sort((a,b) => (b.date.localeCompare(a.date)) || (b.id - a.id));
    res.json(combined);
  });

  // ── POST restock (always lands at Storhub) ──────────────────────
  router.post('/restock', (req, res) => {
    const { product_id, qty, unit_cost, date, notes } = req.body;
    if (!product_id || !qty || qty <= 0) return res.status(400).json({ error: 'product_id and qty (>0) required' });
    const d = date || new Date().toISOString().slice(0,10);
    recordMovement({ date: d, product_id, location: 'Storhub', type: 'Restock In', qty_change: parseInt(qty), notes });
    if (unit_cost !== undefined && unit_cost !== '') {
      db.run('UPDATE products SET unit_cost = ? WHERE id = ?', [parseFloat(unit_cost), product_id]);
    }
    res.status(201).json({ ok: true, storhub_qty: getLevel(product_id, 'Storhub') });
  });

  // ── POST transfer between Storhub <-> Home ──────────────────────
  router.post('/transfer', (req, res) => {
    const { product_id, qty, direction, date, notes } = req.body;
    if (!product_id || !qty || qty <= 0 || !direction) return res.status(400).json({ error: 'product_id, qty (>0), direction required' });
    const d = date || new Date().toISOString().slice(0,10);
    const q = parseInt(qty);
    if (direction === 'storhub_to_home') {
      recordMovement({ date: d, product_id, location: 'Storhub', type: 'Transfer Out', qty_change: -q, notes });
      recordMovement({ date: d, product_id, location: 'Home', type: 'Transfer In', qty_change: q, notes });
    } else if (direction === 'home_to_storhub') {
      recordMovement({ date: d, product_id, location: 'Home', type: 'Transfer Out', qty_change: -q, notes });
      recordMovement({ date: d, product_id, location: 'Storhub', type: 'Transfer In', qty_change: q, notes });
    } else {
      return res.status(400).json({ error: 'direction must be storhub_to_home or home_to_storhub' });
    }
    res.status(201).json({ ok: true, storhub_qty: getLevel(product_id, 'Storhub'), home_qty: getLevel(product_id, 'Home') });
  });

  // ── POST write-off ───────────────────────────────────────────────
  router.post('/writeoff', (req, res) => {
    const { product_id, location, qty, reason, date, notes } = req.body;
    if (!product_id || !location || !qty || qty <= 0) return res.status(400).json({ error: 'product_id, location, qty (>0) required' });
    const d = date || new Date().toISOString().slice(0,10);
    const q = parseInt(qty);
    const product = db.queryOne('SELECT unit_cost FROM products WHERE id = ?', [product_id]);
    const cost_impact = parseFloat(((product?.unit_cost || 0) * q).toFixed(2));

    db.run(
      'INSERT INTO inventory_adjustments (date, product_id, type, qty_change, reason, cost_impact, notes, location) VALUES (?,?,?,?,?,?,?,?)',
      [d, product_id, 'Write-off', -q, reason || 'Other', cost_impact, notes || null, location]
    );
    const current = getLevel(product_id, location);
    setLevel(product_id, location, Math.max(0, current - q));

    res.status(201).json({ ok: true, cost_impact, new_qty: getLevel(product_id, location) });
  });

  // ── POST manual adjustment (set exact qty, logs delta) ──────────
  router.post('/adjustment', (req, res) => {
    const { product_id, location, actual_qty, notes } = req.body;
    if (!product_id || !location || actual_qty === undefined) return res.status(400).json({ error: 'product_id, location, actual_qty required' });
    const current = getLevel(product_id, location);
    const target  = parseInt(actual_qty);
    const delta   = target - current;
    if (delta !== 0) {
      const d = new Date().toISOString().slice(0,10);
      recordMovement({ date: d, product_id, location, type: 'Adjustment', qty_change: delta, notes: notes || `Corrected from ${current} to ${target}` });
    }
    res.status(201).json({ ok: true, qty: getLevel(product_id, location), delta });
  });

  // ── POST one-time opening stock import ──────────────────────────
  router.post('/import-opening', (req, res) => {
    const dataPath = path.join(__dirname, '..', 'data', 'opening_stock_2026.json');
    if (!fs.existsSync(dataPath)) return res.status(404).json({ error: 'Opening stock dataset not found' });
    const rows = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    const today = new Date().toISOString().slice(0,10);
    const matched = [];
    const unmatched = [];
    const skipped = [];

    for (const row of rows) {
      // Skip if this product already has an Opening Stock movement (idempotent — won't double-import)
      let product = null;
      if (row.barcode) {
        product = db.queryOne('SELECT id, item_series FROM products WHERE barcode = ?', [row.barcode]);
      }
      if (!product) {
        // Fallback: match by brand + item_series + variation
        product = db.queryOne(`
          SELECT p.id, p.item_series FROM products p JOIN brands b ON b.id = p.brand_id
          WHERE b.name = ? AND p.item_series = ? AND COALESCE(p.variation,'') = COALESCE(?,'')
        `, [row.brand, row.item_series, row.variation || '']);
      }

      if (!product) {
        unmatched.push({ barcode: row.barcode, item_series: row.item_series, variation: row.variation, brand: row.brand });
        continue;
      }

      const alreadyImported = db.queryOne(
        `SELECT id FROM inventory_movements WHERE product_id = ? AND type = 'Opening Stock' LIMIT 1`,
        [product.id]
      );
      if (alreadyImported) {
        skipped.push({ product_id: product.id, item_series: product.item_series });
        continue;
      }

      if (row.storhub_qty > 0) recordMovement({ date: today, product_id: product.id, location: 'Storhub', type: 'Opening Stock', qty_change: row.storhub_qty, notes: '2026 baseline import' });
      else setLevel(product.id, 'Storhub', 0);

      if (row.home_qty > 0) recordMovement({ date: today, product_id: product.id, location: 'Home', type: 'Opening Stock', qty_change: row.home_qty, notes: '2026 baseline import' });
      else setLevel(product.id, 'Home', 0);

      matched.push({ product_id: product.id, item_series: product.item_series, storhub_qty: row.storhub_qty, home_qty: row.home_qty });
    }

    res.json({ matched_count: matched.length, unmatched_count: unmatched.length, skipped_count: skipped.length, matched, unmatched, skipped });
  });

  return router;
};
