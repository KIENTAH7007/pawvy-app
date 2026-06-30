const { Router } = require('express');

const TRAILING_DAYS    = 60;   // velocity window
const LEAD_TIME_DAYS    = 45;  // ~1.5 month supplier lead time — reorder trigger point
const COVER_DAYS        = 90;  // recommend ordering enough to cover the next quarter

module.exports = function(db) {
  const router = Router();

  router.get('/restock-recommendations', (req, res) => {
    const { brand_id } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - TRAILING_DAYS);
    const sinceStr = since.toISOString().slice(0,10);

    let sql = `
      SELECT p.id AS product_id, p.item_series, p.variation, p.unit_cost,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color
      FROM products p JOIN brands b ON b.id = p.brand_id
      WHERE p.is_active = 1
    `;
    const params = [];
    if (brand_id) { sql += ' AND b.id = ?'; params.push(brand_id); }
    sql += ' ORDER BY b.name, p.item_series, p.variation';
    const products = db.query(sql, params);

    const result = products.map(p => {
      const storhub = db.queryOne('SELECT qty FROM inventory_levels WHERE product_id=? AND location=?', [p.product_id, 'Storhub'])?.qty || 0;
      const home    = db.queryOne('SELECT qty FROM inventory_levels WHERE product_id=? AND location=?', [p.product_id, 'Home'])?.qty || 0;
      const warehouse_total = storhub + home;

      // Velocity: every depletion movement (Sale + Consignment Placement) in the trailing window.
      // Unified because inventory_movements already records both as negative qty_change at Home.
      const depleted = db.queryOne(`
        SELECT COALESCE(SUM(-qty_change), 0) AS total
        FROM inventory_movements
        WHERE product_id = ? AND qty_change < 0 AND date >= ?
          AND type IN ('Sale', 'Consignment Placement')
      `, [p.product_id, sinceStr])?.total || 0;

      const daily_velocity = parseFloat((depleted / TRAILING_DAYS).toFixed(3));
      const days_remaining = daily_velocity > 0 ? Math.floor(warehouse_total / daily_velocity) : null;
      const needs_reorder  = daily_velocity > 0 ? days_remaining < LEAD_TIME_DAYS : (warehouse_total === 0);
      const recommended_qty = daily_velocity > 0
        ? Math.max(0, Math.ceil(daily_velocity * COVER_DAYS) - warehouse_total)
        : 0;

      return {
        ...p,
        storhub_qty: storhub,
        home_qty: home,
        warehouse_total,
        daily_velocity,
        days_remaining,
        needs_reorder,
        recommended_qty,
        estimated_cost: parseFloat((recommended_qty * (p.unit_cost||0)).toFixed(2)),
      };
    });

    // Sort: needing reorder first, soonest to run out at top
    result.sort((a, b) => {
      if (a.needs_reorder !== b.needs_reorder) return a.needs_reorder ? -1 : 1;
      if (a.days_remaining === null) return 1;
      if (b.days_remaining === null) return -1;
      return a.days_remaining - b.days_remaining;
    });

    res.json({
      trailing_days: TRAILING_DAYS,
      lead_time_days: LEAD_TIME_DAYS,
      cover_days: COVER_DAYS,
      items: result,
    });
  });

  return router;
};
