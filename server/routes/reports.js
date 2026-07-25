const { Router } = require('express');

// Shared SQL helpers — channel-aware revenue & consistent profit formula
const REVENUE_SQL = `CASE WHEN s.channel IN ('Shopee','Lazada','Amazon','TikTok Shop')
  THEN s.qty * s.unit_price + COALESCE(s.shipping_charged,0)
  ELSE s.qty * s.unit_price - s.platform_fee_amt + COALESCE(s.shipping_charged,0)
END`;

const PROFIT_SQL = `s.qty * (s.unit_price - s.unit_cost) - s.platform_fee_amt
  + COALESCE(s.shipping_charged,0) - COALESCE(s.shipping_cost,0) - COALESCE(s.stripe_fee_amt,0)`;

const VOIDED_FILTER = `COALESCE(s.voided,0) = 0`;

function reportsRouter(db) {
  const router = Router();

  /* ── P&L ─────────────────────────────────────────────────────── */
  router.get('/pnl', (req, res) => {
    const { date_from, date_to, market } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'date_from and date_to required' });
    const sw = `WHERE ${VOIDED_FILTER} AND s.date BETWEEN ? AND ? ${market ? 'AND s.market=?' : ''}`;
    const cw = `WHERE date BETWEEN ? AND ? ${market ? 'AND market=?' : ''}`;
    const sp = market ? [date_from,date_to,market] : [date_from,date_to];
    const cp = market ? [date_from,date_to,market] : [date_from,date_to];

    const sales = db.queryOne(`
      SELECT ROUND(COALESCE(SUM(${REVENUE_SQL}),0),2)  AS revenue,
             ROUND(COALESCE(SUM(s.qty*s.unit_cost),0),2) AS cogs,
             ROUND(COALESCE(SUM(${PROFIT_SQL}),0),2)    AS gross_profit,
             COALESCE(SUM(s.qty),0) AS units_sold, COUNT(*) AS transactions
      FROM sales s JOIN products p ON p.id=s.product_id ${sw}
    `, sp);

    const opCosts  = db.queryOne(`SELECT ROUND(COALESCE(SUM(amount),0),2) AS total FROM operating_costs ${cw}`, cp);
    const writeoffs= db.queryOne(`SELECT ROUND(COALESCE(SUM(cost_impact),0),2) AS total FROM inventory_adjustments WHERE date BETWEEN ? AND ? AND type='Write-off'`, [date_from,date_to]);
    const opBreak  = db.query(`SELECT category, ROUND(SUM(amount),2) AS total FROM operating_costs ${cw} GROUP BY category ORDER BY total DESC`, cp);
    const writeoffBreak = db.query(`
      SELECT COALESCE(reason,'Other') AS reason, ROUND(SUM(cost_impact),2) AS total, SUM(-qty_change) AS units
      FROM inventory_adjustments
      WHERE date BETWEEN ? AND ? AND type='Write-off'
      GROUP BY COALESCE(reason,'Other') ORDER BY total DESC
    `, [date_from,date_to]);

    // Cost variance (Phase 7, Step 5) — shipment landed-cost variance vs
    // Products & Pricing's set cost, matched by costed_date (logged_date)
    // falling in this period. Sign convention: positive = favorable
    // (landed cost came in under set cost, adds profit), negative =
    // unfavorable (reduces profit) — so it's added directly here, same
    // direction as everything else in the P&L. Voided shipments are
    // excluded (their variance ledger rows are deleted on void, so this
    // exclusion is really just future-proofing). Not market-segmented —
    // shipments/procurement aren't split by market yet, since Pawvy's
    // sourcing isn't market-specific the way sales are.
    const costVariance = db.queryOne(`
      SELECT ROUND(COALESCE(SUM(v.variance_total),0),2) AS total
      FROM cost_variance_ledger v
      JOIN shipments s ON s.id = v.shipment_id
      WHERE s.status != 'voided' AND v.logged_date BETWEEN ? AND ?
    `, [date_from, date_to]);

    const byBrand = db.query(`
      SELECT b.name, b.color,
        ROUND(SUM(${REVENUE_SQL}),2) AS revenue,
        ROUND(SUM(${PROFIT_SQL}),2) AS profit,
        SUM(s.qty) AS units
      FROM sales s JOIN products p ON p.id=s.product_id JOIN brands b ON b.id=p.brand_id
      ${sw} GROUP BY b.id ORDER BY profit DESC
    `, sp);

    const net = parseFloat(((sales.gross_profit||0) - (opCosts.total||0) - (writeoffs.total||0) + (costVariance.total||0)).toFixed(2));
    res.json({
      period: { from:date_from, to:date_to, market:market||'All' },
      revenue:sales.revenue, cogs:sales.cogs, gross_profit:sales.gross_profit,
      operating_costs:opCosts.total, writeoffs:writeoffs.total, cost_variance:costVariance.total, net_profit:net,
      units_sold:sales.units_sold, transactions:sales.transactions,
      by_brand:byBrand, cost_breakdown:opBreak, writeoff_breakdown:writeoffBreak,
    });
  });

  /* ── Monthly trend ────────────────────────────────────────────── */
  router.get('/trend', (req, res) => {
    const { year, market, brand_id } = req.query;
    const y = year || new Date().getFullYear();
    const params = [`${y}-01-01`, `${y}-12-31`];
    const extra = [`AND ${VOIDED_FILTER}`];
    if (market)   { extra.push('AND s.market=?');  params.push(market); }
    if (brand_id) { extra.push('AND b.id=?');      params.push(brand_id); }

    res.json(db.query(`
      SELECT strftime('%Y-%m', s.date) AS month,
        ROUND(SUM(${REVENUE_SQL}),2) AS revenue,
        ROUND(SUM(${PROFIT_SQL}),2) AS profit,
        SUM(s.qty) AS units
      FROM sales s
      JOIN products p ON p.id=s.product_id
      JOIN brands   b ON b.id=p.brand_id
      WHERE s.date BETWEEN ? AND ? ${extra.join(' ')}
      GROUP BY month ORDER BY month
    `, params));
  });

  /* ── Brand SKU detail ─────────────────────────────────────────── */
  router.get('/brand-sku', (req, res) => {
    const { brand_id, date_from, date_to, year } = req.query;
    if (!brand_id) return res.status(400).json({ error: 'brand_id required' });
    const y  = year || new Date().getFullYear();
    const df = date_from || `${y}-01-01`;
    const dt = date_to   || `${y}-12-31`;
    const vf = `AND ${VOIDED_FILTER}`;

    const skus = db.query(`
      SELECT p.id, p.item_series, p.variation, p.unit_cost,
        SUM(s.qty) AS units,
        ROUND(SUM(${REVENUE_SQL}),2) AS revenue,
        ROUND(SUM(${PROFIT_SQL}),2) AS profit,
        ROUND(AVG(s.unit_price),2) AS avg_price,
        MAX(s.date) AS last_sale,
        COUNT(DISTINCT s.date) AS sale_days
      FROM products p
      JOIN sales s ON s.product_id = p.id
      WHERE p.brand_id = ? AND s.date BETWEEN ? AND ? ${vf}
      GROUP BY p.id ORDER BY profit DESC
    `, [brand_id, df, dt]);

    const monthlyTrend = db.query(`
      SELECT strftime('%Y-%m', s.date) AS month,
        SUM(s.qty) AS units,
        ROUND(SUM(${REVENUE_SQL}),2) AS revenue,
        ROUND(SUM(${PROFIT_SQL}),2) AS profit
      FROM sales s JOIN products p ON p.id=s.product_id
      WHERE p.brand_id = ? AND s.date BETWEEN ? AND ? ${vf}
      GROUP BY month ORDER BY month
    `, [brand_id, df, dt]);

    const channels = db.query(`
      SELECT s.channel, SUM(s.qty) AS units,
        ROUND(SUM(${PROFIT_SQL}),2) AS profit
      FROM sales s JOIN products p ON p.id=s.product_id
      WHERE p.brand_id = ? AND s.date BETWEEN ? AND ? ${vf}
      GROUP BY s.channel ORDER BY profit DESC LIMIT 8
    `, [brand_id, df, dt]);

    res.json({ skus, monthlyTrend, channels, period: { from: df, to: dt } });
  });

  /* ── Top partners ─────────────────────────────────────────────── */
  router.get('/partners', (req, res) => {
    const { date_from, date_to, market, limit } = req.query;
    const lim = parseInt(limit) || 15;
    let where = `WHERE s.partner_id IS NOT NULL AND ${VOIDED_FILTER}`;
    const p = [];
    if (date_from) { where += ' AND s.date >= ?'; p.push(date_from); }
    if (date_to)   { where += ' AND s.date <= ?'; p.push(date_to); }
    if (market)    { where += ' AND s.market = ?'; p.push(market); }

    res.json(db.query(`
      SELECT pt.company_name AS partner, pt.model, pt.business_type,
        ROUND(SUM(${REVENUE_SQL}),2) AS revenue,
        ROUND(SUM(${PROFIT_SQL}),2) AS profit,
        SUM(s.qty) AS units, COUNT(*) AS orders
      FROM sales s JOIN partners pt ON pt.id=s.partner_id
      ${where} GROUP BY s.partner_id ORDER BY profit DESC LIMIT ?
    `, [...p, lim]));
  });

  /* ── All channels (partners + B2C) for Dashboard toggle ─────── */
  router.get('/all-channels', (req, res) => {
    const { date_from, date_to, market } = req.query;
    let where = `WHERE ${VOIDED_FILTER}`;
    const p = [];
    if (date_from) { where += ' AND s.date >= ?'; p.push(date_from); }
    if (date_to)   { where += ' AND s.date <= ?'; p.push(date_to); }
    if (market)    { where += ' AND s.market = ?'; p.push(market); }

    const partnerSales = db.query(`
      SELECT pt.company_name AS name, 'Partner' AS category,
        COALESCE(pt.model,'—') AS type_label, pt.business_type,
        ROUND(SUM(${REVENUE_SQL}),2) AS revenue,
        ROUND(SUM(${PROFIT_SQL}),2)  AS profit,
        SUM(s.qty) AS units, COUNT(*) AS orders
      FROM sales s JOIN partners pt ON pt.id=s.partner_id
      ${where} AND s.partner_id IS NOT NULL
      GROUP BY s.partner_id ORDER BY profit DESC
    `, p);

    const b2cSales = db.query(`
      SELECT s.channel AS name, 'B2C' AS category,
        s.channel AS type_label, NULL AS business_type,
        ROUND(SUM(${REVENUE_SQL}),2) AS revenue,
        ROUND(SUM(${PROFIT_SQL}),2)  AS profit,
        SUM(s.qty) AS units, COUNT(*) AS orders
      FROM sales s
      ${where} AND s.partner_id IS NULL
      GROUP BY s.channel ORDER BY profit DESC
    `, p);

    const combined = [...partnerSales, ...b2cSales].sort((a,b) => (b.profit||0) - (a.profit||0));
    res.json(combined);
  });

  // GET /api/reports/upsell — Order Portal catalogue-vs-upsell comparison.
  // Scoped to APPROVED orders only, since that's when an order becomes a
  // real business outcome rather than just interest. $ amount uses each
  // product's CURRENT wholesale price as a proxy (portal_order_items only
  // stores qty, not price-at-order-time) — directionally accurate for
  // "is upsell working", not meant as an exact historical revenue figure.
  router.get('/upsell', (req, res) => {
    const rows = db.query(`
      SELECT poi.source, SUM(poi.qty) AS total_qty,
        SUM(poi.qty * COALESCE(p.price_wholesale_sg,0)) AS total_amount
      FROM portal_order_items poi
      JOIN portal_orders po ON po.id = poi.portal_order_id
      LEFT JOIN products p ON p.id = poi.product_id
      WHERE po.status = 'approved' AND po.voided_at IS NULL
      GROUP BY poi.source
    `);
    const result = { catalogue: { qty:0, amount:0 }, upsell: { qty:0, amount:0 } };
    rows.forEach(r => {
      const key = r.source === 'upsell' ? 'upsell' : 'catalogue';
      result[key] = { qty: r.total_qty || 0, amount: parseFloat((r.total_amount || 0).toFixed(2)) };
    });
    res.json(result);
  });

  // GET /api/reports/upsell/detail?source=upsell|catalogue — drill-down for
  // the Catalogue vs Upsell chart: who ordered what, and how much, under
  // that source tag. Same WHERE clause as /upsell (approved, not voided)
  // so the totals always agree with what the chart shows.
  router.get('/upsell/detail', (req, res) => {
    const { source } = req.query;
    if (source !== 'upsell' && source !== 'catalogue') {
      return res.status(400).json({ error: "source must be 'upsell' or 'catalogue'" });
    }

    const rows = db.query(`
      SELECT
        po.company_name, po.submitted_at,
        p.item_series, p.variation,
        b.name AS brand_name, b.color AS brand_color,
        poi.qty,
        COALESCE(p.price_wholesale_sg, 0) AS unit_price
      FROM portal_order_items poi
      JOIN portal_orders po ON po.id = poi.portal_order_id
      LEFT JOIN products p ON p.id = poi.product_id
      LEFT JOIN brands   b ON b.id = p.brand_id
      WHERE po.status = 'approved' AND po.voided_at IS NULL
        AND COALESCE(poi.source, 'catalogue') = ?
      ORDER BY po.submitted_at DESC
    `, [source]);

    res.json(rows.map(r => ({
      company_name: r.company_name,
      submitted_at: r.submitted_at,
      item_series: r.item_series,
      variation: r.variation,
      brand_name: r.brand_name,
      brand_color: r.brand_color,
      qty: r.qty,
      amount: parseFloat((r.qty * r.unit_price).toFixed(2)),
    })));
  });

  // GET /api/reports/channel-performance — filter Profit/Revenue/Units/Brand
  // breakdown by channel + date range. Built for monitoring a specific
  // event (channel='Event Sale', the event's date range), but works for
  // any channel — same underlying revenue/profit formulas as the rest of
  // Reports & P&L, so the numbers are consistent with everything else.
  router.get('/channel-performance', (req, res) => {
    const { channel, date_from, date_to } = req.query;
    if (!channel || !date_from || !date_to) {
      return res.status(400).json({ error: 'channel, date_from, date_to are required' });
    }

    const totals = db.queryOne(`
      SELECT
        COALESCE(SUM(s.qty), 0) AS units,
        ROUND(COALESCE(SUM(${REVENUE_SQL}), 0), 2) AS revenue,
        ROUND(COALESCE(SUM(${PROFIT_SQL}), 0), 2) AS profit,
        COUNT(*) AS transactions
      FROM sales s
      WHERE s.channel = ? AND s.date BETWEEN ? AND ? AND ${VOIDED_FILTER}
    `, [channel, date_from, date_to]);

    const byBrand = db.query(`
      SELECT b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        SUM(s.qty) AS units,
        ROUND(SUM(${REVENUE_SQL}), 2) AS revenue,
        ROUND(SUM(${PROFIT_SQL}), 2) AS profit
      FROM sales s
      JOIN products p ON p.id = s.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE s.channel = ? AND s.date BETWEEN ? AND ? AND ${VOIDED_FILTER}
      GROUP BY b.id ORDER BY profit DESC
    `, [channel, date_from, date_to]);

    res.json({
      channel, period: { from: date_from, to: date_to },
      totals: {
        units: totals?.units || 0,
        revenue: totals?.revenue || 0,
        profit: totals?.profit || 0,
        transactions: totals?.transactions || 0,
      },
      byBrand,
    });
  });

  return router;
}

module.exports = reportsRouter;
