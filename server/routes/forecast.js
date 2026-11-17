const { Router } = require('express');
const { localDateStr } = require('../utils/dates');

const TRAILING_DAYS    = 60;   // velocity window
const LEAD_TIME_DAYS    = 45;  // ~1.5 month supplier lead time — reorder trigger point
const COVER_DAYS        = 90;  // recommend ordering enough to cover the next quarter

module.exports = function(db) {
  const router = Router();

  // ── Restock Planner step 1: stock cover by month ───────────────────
  // Real sales only (Sales Ledger incl. consignment sales; placements excluded). Stock on the way =
  // lines of shipments still 'ordered' (not yet received / voided).
  // Average = last 3 FULL calendar months; the current month is shown but not averaged.
  router.get('/stock-cover', (req, res) => {
    const { brand_id } = req.query;
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const currentMonth = months[months.length - 1];
    const avgMonths = months.slice(-4, -1); // 3 full months before the current one
    const firstDay = months[0] + '-01';

    let sql = `
      SELECT p.id AS product_id, p.item_series, p.variation,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color
      FROM products p JOIN brands b ON b.id = p.brand_id
      WHERE p.is_active = 1`;
    const params = [];
    if (brand_id) { sql += ' AND b.id = ?'; params.push(brand_id); }
    sql += ' ORDER BY b.name, p.item_series, p.variation';
    const products = db.query(sql, params);

    // Same source as the Dashboard: Sales Ledger, voided sales excluded. This includes
    // 'Consignment Sale' (invoiced at stock take) which never creates a warehouse movement.
    // All markets (SG + MY) because stock is shared. Placements are not sales, so not counted.
    const salesRows = db.query(`
      SELECT product_id, substr(date,1,7) AS ym, COALESCE(SUM(qty),0) AS units
      FROM sales
      WHERE COALESCE(voided,0) = 0 AND date >= ?
      GROUP BY product_id, ym`, [firstDay]);
    const sales = {};
    salesRows.forEach(r => { (sales[r.product_id] = sales[r.product_id] || {})[r.ym] = Math.max(0, r.units); });

    const stockRows = db.query(`SELECT product_id, location, qty FROM inventory_levels WHERE location IN ('Hougang','Mega')`);
    const stock = {};
    stockRows.forEach(r => { (stock[r.product_id] = stock[r.product_id] || {})[r.location] = r.qty || 0; });

    const wayRows = db.query(`
      SELECT li.product_id, COALESCE(SUM(li.qty_ordered),0) AS qty
      FROM shipment_line_items li JOIN shipments s ON s.id = li.shipment_id
      WHERE s.status = 'ordered' AND li.inventory_synced = 0
      GROUP BY li.product_id`);
    const onWay = {};
    wayRows.forEach(r => { onWay[r.product_id] = r.qty; });

    // Per-brand settings (Restock Planner): red = cover below the brand's lead time,
    // amber = cover below the brand's months-to-cover target. Defaults until set.
    const WEEKS_PER_MONTH = 4.345;
    const DEF_LEAD_WEEKS = 8, DEF_COVER_MONTHS = 3;
    const setMap = {};
    db.query('SELECT brand_id, lead_time_weeks, cover_months FROM brand_restock_settings').forEach(r => { setMap[r.brand_id] = r; });
    const cfg = bid => {
      const r = setMap[bid];
      const weeks = r ? r.lead_time_weeks : DEF_LEAD_WEEKS;
      const cm = r ? r.cover_months : DEF_COVER_MONTHS;
      const low = weeks / WEEKS_PER_MONTH;
      return { weeks, cover_months: cm, low, watch: Math.max(cm, low), is_default: !r };
    };
    const items = products.map(p => {
      const m = sales[p.product_id] || {};
      const monthly = months.map(ym => m[ym] || 0);
      const avg = avgMonths.reduce((s, ym) => s + (m[ym] || 0), 0) / avgMonths.length;
      const hougang = stock[p.product_id]?.Hougang || 0;
      const mega = stock[p.product_id]?.Mega || 0;
      const on_hand = hougang + mega;
      const on_the_way = onWay[p.product_id] || 0;
      const cover_months = avg > 0 ? (on_hand + on_the_way) / avg : null;
      const cover_now_months = avg > 0 ? on_hand / avg : null;
      const c = cfg(p.brand_id);
      let status;
      const soldAny = monthly.some(u => u > 0);
      if (!soldAny) status = 'no_sales';            // nothing sold in 6 months: not part of planning
      else if (avg <= 0) status = on_hand + on_the_way <= 0 ? 'out' : 'no_sales';
      else if (cover_months < c.low) status = 'low';
      else if (cover_months < c.watch) status = 'watch';
      else status = 'ok';
      return {
        ...p, hougang_qty: hougang, mega_qty: mega, on_hand, on_the_way, monthly,
        avg_per_month: parseFloat(avg.toFixed(1)),
        cover_months: cover_months === null ? null : parseFloat(cover_months.toFixed(1)),
        cover_now_months: cover_now_months === null ? null : parseFloat(cover_now_months.toFixed(1)),
        status,
      };
    });

    // Most urgent first inside each brand: lowest cover on top, no-sales SKUs last
    const rank = i => i.status === 'out' ? -1 : (i.cover_months === null ? 9999 : i.cover_months);
    items.sort((a, b) => (a.brand_name || '').localeCompare(b.brand_name || '') || rank(a) - rank(b) || (a.item_series || '').localeCompare(b.item_series || ''));

    const brandMap = {};
    items.forEach(i => {
      const b = brandMap[i.brand_id] = brandMap[i.brand_id] || {
        brand_id: i.brand_id, brand_name: i.brand_name, brand_color: i.brand_color,
        total_skus: 0, active_skus: 0, low_skus: 0, on_the_way_units: 0, shortest_cover: null,
        lead_time_weeks: cfg(i.brand_id).weeks, cover_target_months: cfg(i.brand_id).cover_months,
        low_threshold: parseFloat(cfg(i.brand_id).low.toFixed(1)), watch_threshold: parseFloat(cfg(i.brand_id).watch.toFixed(1)),
        settings_default: cfg(i.brand_id).is_default,
      };
      b.total_skus++;
      b.on_the_way_units += i.on_the_way;
      if (i.status !== 'no_sales') b.active_skus++;
      if (i.status === 'low' || i.status === 'out') b.low_skus++;
      if (i.cover_months !== null && (b.shortest_cover === null || i.cover_months < b.shortest_cover)) b.shortest_cover = i.cover_months;
    });
    const brands = Object.values(brandMap).map(b => ({
      ...b, time_to_plan: b.active_skus > 0 && b.low_skus / b.active_skus >= 0.5,
    }));

    res.json({ months, current_month: currentMonth, avg_months: avgMonths, items, brands });
  });

  router.put('/restock-settings/:brand_id', (req, res) => {
    const brandId = parseInt(req.params.brand_id, 10);
    const weeks = Number(req.body.lead_time_weeks);
    const cm = Number(req.body.cover_months);
    if (!db.queryOne('SELECT id FROM brands WHERE id = ?', [brandId])) return res.status(404).json({ error: 'Brand not found' });
    if (!(weeks > 0 && weeks <= 52)) return res.status(400).json({ error: 'Lead time must be between 1 and 52 weeks' });
    if (!(cm > 0 && cm <= 24)) return res.status(400).json({ error: 'Months to cover must be between 1 and 24' });
    const exists = db.queryOne('SELECT brand_id FROM brand_restock_settings WHERE brand_id = ?', [brandId]);
    if (exists) db.run('UPDATE brand_restock_settings SET lead_time_weeks = ?, cover_months = ?, updated_at = CURRENT_TIMESTAMP WHERE brand_id = ?', [weeks, cm, brandId]);
    else db.run('INSERT INTO brand_restock_settings (brand_id, lead_time_weeks, cover_months) VALUES (?,?,?)', [brandId, weeks, cm]);
    res.json({ brand_id: brandId, lead_time_weeks: weeks, cover_months: cm });
  });

  router.get('/restock-recommendations', (req, res) => {
    const { brand_id } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - TRAILING_DAYS);
    const sinceStr = localDateStr(since);

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
      const hougang = db.queryOne('SELECT qty FROM inventory_levels WHERE product_id=? AND location=?', [p.product_id, 'Hougang'])?.qty || 0;
      const mega    = db.queryOne('SELECT qty FROM inventory_levels WHERE product_id=? AND location=?', [p.product_id, 'Mega'])?.qty || 0;
      const warehouse_total = hougang + mega;

      // Velocity: every depletion movement (Sale + Consignment Placement) in the trailing window.
      // Unified because inventory_movements already records both as negative qty_change at Mega.
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
        hougang_qty: hougang,
        mega_qty: mega,
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

    // Brand-level rollup — the unit a distributor actually orders in (containers/pallets),
    // not individual SKUs. "X of Y SKUs need reorder" + earliest stockout signals when to
    // start paying attention to a brand; once you commit, top-up qty covers the WHOLE catalogue.
    const brandMap = {};
    result.forEach(item => {
      if (!brandMap[item.brand_id]) {
        brandMap[item.brand_id] = {
          brand_id: item.brand_id, brand_name: item.brand_name, brand_color: item.brand_color,
          total_skus: 0, needs_reorder_count: 0, earliest_days_remaining: null,
          total_recommended_qty: 0, total_estimated_cost: 0,
        };
      }
      const b = brandMap[item.brand_id];
      b.total_skus++;
      if (item.needs_reorder) b.needs_reorder_count++;
      if (item.days_remaining !== null && (b.earliest_days_remaining === null || item.days_remaining < b.earliest_days_remaining)) {
        b.earliest_days_remaining = item.days_remaining;
      }
      b.total_recommended_qty += item.recommended_qty;
      b.total_estimated_cost = parseFloat((b.total_estimated_cost + item.estimated_cost).toFixed(2));
    });

    const brands = Object.values(brandMap).sort((a, b) => {
      if (a.earliest_days_remaining === null) return 1;
      if (b.earliest_days_remaining === null) return -1;
      return a.earliest_days_remaining - b.earliest_days_remaining;
    });

    res.json({
      trailing_days: TRAILING_DAYS,
      lead_time_days: LEAD_TIME_DAYS,
      cover_days: COVER_DAYS,
      items: result,
      brands,
    });
  });

  return router;
};
