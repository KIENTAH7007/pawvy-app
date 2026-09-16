// Hougang -> Mega restock suggestion engine. Single source of truth,
// shared by:
//   - GET /api/restock/suggestions (the "Add suggested transfers" button)
//   - server/jobs/autoRestock.js (auto-populates a checklist daily)
// Extracted out of routes/restock.js specifically so there's exactly one
// implementation of this logic rather than three slightly-different copies
// accumulating across features that all care about "what's low at Mega".

const { localDateStr } = require('./dates');

const TRAILING_DAYS = 60;            // velocity window, same as Restock Forecasting
const LOW_HOME_DAYS = 14;            // trigger: Mega has less than this many days of cover left
const TARGET_HOME_COVER_DAYS = 30;   // suggested transfer brings Mega up to this many days of cover
const NO_VELOCITY_DEFAULT_QTY = 10;  // fallback suggestion when Mega is at 0 but no recent sales data exists

function getLevel(db, product_id, location) {
  return db.queryOne('SELECT qty FROM inventory_levels WHERE product_id=? AND location=?', [product_id, location])?.qty || 0;
}

function computeSuggestions(db) {
  const since = new Date();
  since.setDate(since.getDate() - TRAILING_DAYS);
  const sinceStr = localDateStr(since);

  const products = db.query(`
    SELECT p.id AS product_id, p.item_series, p.variation, b.name AS brand_name
    FROM products p JOIN brands b ON b.id = p.brand_id
    WHERE p.is_active = 1
    ORDER BY b.name, p.item_series, p.variation
  `);

  const suggestions = [];
  products.forEach(p => {
    const hougang = getLevel(db, p.product_id, 'Hougang');
    if (hougang <= 0) return; // nothing available to transfer

    const mega = getLevel(db, p.product_id, 'Mega');
    const depleted = db.queryOne(`
      SELECT COALESCE(SUM(-qty_change), 0) AS total
      FROM inventory_movements
      WHERE product_id = ? AND location = 'Mega' AND qty_change < 0 AND date >= ?
        AND type IN ('Sale', 'Consignment Placement')
    `, [p.product_id, sinceStr])?.total || 0;

    const dailyVelocity = depleted / TRAILING_DAYS;
    let reason = null, suggestedQty = 0, daysRemaining = null;

    if (dailyVelocity > 0) {
      daysRemaining = Math.floor(mega / dailyVelocity);
      if (daysRemaining < LOW_HOME_DAYS) {
        reason = 'low_stock';
        suggestedQty = Math.min(hougang, Math.max(1, Math.ceil(dailyVelocity * TARGET_HOME_COVER_DAYS) - mega));
      }
    } else if (mega <= 0) {
      reason = 'out_of_stock';
      suggestedQty = Math.min(hougang, NO_VELOCITY_DEFAULT_QTY);
    }

    if (reason && suggestedQty > 0) {
      suggestions.push({
        product_id: p.product_id, item_series: p.item_series, variation: p.variation, brand_name: p.brand_name,
        mega_qty: mega, hougang_qty: hougang, daily_velocity: parseFloat(dailyVelocity.toFixed(3)),
        days_remaining: daysRemaining, reason, suggested_qty: suggestedQty,
      });
    }
  });

  // Out-of-stock items first (most urgent), then by lowest Mega qty
  suggestions.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === 'out_of_stock' ? -1 : 1;
    return a.mega_qty - b.mega_qty;
  });
  return suggestions;
}

module.exports = { computeSuggestions };
