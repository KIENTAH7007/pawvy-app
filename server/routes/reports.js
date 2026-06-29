const { Router } = require('express');

function reportsRouter(db) {
  const router = Router();

  /* ── P&L ─────────────────────────────────────────────────────── */
  router.get('/pnl', (req, res) => {
    const { date_from, date_to, market } = req.query;
    if (!date_from || !date_to) return res.status(400).json({ error: 'date_from and date_to required' });
    const sw = `WHERE s.date BETWEEN ? AND ? ${market ? 'AND s.market=?' : ''}`;
    const cw = `WHERE date BETWEEN ? AND ? ${market ? 'AND market=?' : ''}`;
    const sp = market ? [date_from,date_to,market] : [date_from,date_to];
    const cp = market ? [date_from,date_to,market] : [date_from,date_to];
    const sales = db.queryOne(`
      SELECT ROUND(COALESCE(SUM(s.qty*s.unit_price),0),2) AS revenue,
             ROUND(COALESCE(SUM(s.qty*s.unit_cost),0),2)  AS cogs,
             ROUND(COALESCE(SUM(s.qty*(s.unit_price-s.unit_cost)-s.platform_fee_amt),0),2) AS gross_profit,
             COALESCE(SUM(s.qty),0) AS units_sold, COUNT(*) AS transactions
      FROM sales s JOIN products p ON p.id=s.product_id ${sw}
    `, sp);
    const opCosts  = db.queryOne(`SELECT ROUND(COALESCE(SUM(amount),0),2) AS total FROM operating_costs ${cw}`, cp);
    const writeoffs= db.queryOne(`SELECT ROUND(COALESCE(SUM(cost_impact),0),2) AS total FROM inventory_adjustments WHERE date BETWEEN ? AND ? AND type='Write-off'`, [date_from,date_to]);
    const opBreak  = db.query(`SELECT category, ROUND(SUM(amount),2) AS total FROM operating_costs ${cw} GROUP BY category ORDER BY total DESC`, cp);
    const byBrand  = db.query(`
      SELECT b.name, b.color,
        ROUND(SUM(s.qty*s.unit_price),2) AS revenue,
        ROUND(SUM(s.qty*(s.unit_price-s.unit_cost)-s.platform_fee_amt),2) AS profit,
        SUM(s.qty) AS units
      FROM sales s JOIN products p ON p.id=s.product_id JOIN brands b ON b.id=p.brand_id
      ${sw} GROUP BY b.id ORDER BY profit DESC
    `, sp);
    const net = parseFloat((sales.gross_profit - opCosts.total - writeoffs.total).toFixed(2));
    res.json({ period:{from:date_from,to:date_to,market:market||'All'},
      revenue:sales.revenue, cogs:sales.cogs, gross_profit:sales.gross_profit,
      operating_costs:opCosts.total, writeoffs:writeoffs.total, net_profit:net,
      units_sold:sales.units_sold, transactions:sales.transactions,
      by_brand:byBrand, cost_breakdown:opBreak });
  });

  /* ── Monthly trend ────────────────────────────────────────────── */
  router.get('/trend', (req, res) => {
    const { year, market, brand_id } = req.query;
    const y = year || new Date().getFullYear();
    const params = [`${y}-01-01`, `${y}-12-31`];
    const extra  = [];
    if (market)   extra.push('AND s.market=?')  && params.push(market);
    if (brand_id) extra.push('AND b.id=?')      && params.push(brand_id);
    res.json(db.query(`
      SELECT strftime('%Y-%m', s.date) AS month,
        ROUND(SUM(s.qty*s.unit_price),2) AS revenue,
        ROUND(SUM(s.qty*(s.unit_price-s.unit_cost)-s.platform_fee_amt),2) AS profit,
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

    // Per-SKU summary
    const skus = db.query(`
      SELECT p.id, p.item_series, p.variation, p.unit_cost,
        SUM(s.qty) AS units,
        ROUND(SUM(s.qty*s.unit_price),2) AS revenue,
        ROUND(SUM(s.qty*(s.unit_price-s.unit_cost)),2) AS profit,
        ROUND(AVG(s.unit_price),2) AS avg_price,
        MAX(s.date) AS last_sale,
        COUNT(DISTINCT s.date) AS sale_days
      FROM products p
      JOIN sales s ON s.product_id = p.id
      WHERE p.brand_id = ? AND s.date BETWEEN ? AND ?
      GROUP BY p.id
      ORDER BY profit DESC
    `, [brand_id, df, dt]);

    // Monthly trend for this brand
    const monthlyTrend = db.query(`
      SELECT strftime('%Y-%m', s.date) AS month,
        SUM(s.qty) AS units,
        ROUND(SUM(s.qty*s.unit_price),2) AS revenue,
        ROUND(SUM(s.qty*(s.unit_price-s.unit_cost)),2) AS profit
      FROM sales s
      JOIN products p ON p.id=s.product_id
      WHERE p.brand_id = ? AND s.date BETWEEN ? AND ?
      GROUP BY month ORDER BY month
    `, [brand_id, df, dt]);

    // Top channels for this brand
    const channels = db.query(`
      SELECT s.channel, SUM(s.qty) AS units,
        ROUND(SUM(s.qty*(s.unit_price-s.unit_cost)),2) AS profit
      FROM sales s JOIN products p ON p.id=s.product_id
      WHERE p.brand_id = ? AND s.date BETWEEN ? AND ?
      GROUP BY s.channel ORDER BY profit DESC LIMIT 8
    `, [brand_id, df, dt]);

    res.json({ skus, monthlyTrend, channels, period: { from: df, to: dt } });
  });

  /* ── Top partners ─────────────────────────────────────────────── */
  router.get('/partners', (req, res) => {
    const { date_from, date_to, market, limit } = req.query;
    const lim = parseInt(limit) || 15;
    let where = 'WHERE s.partner_id IS NOT NULL';
    const p = [];
    if (date_from) { where += ' AND s.date >= ?'; p.push(date_from); }
    if (date_to)   { where += ' AND s.date <= ?'; p.push(date_to); }
    if (market)    { where += ' AND s.market = ?'; p.push(market); }
    res.json(db.query(`
      SELECT pt.company_name AS partner, pt.model, pt.business_type,
        ROUND(SUM(s.qty*s.unit_price),2) AS revenue,
        ROUND(SUM(s.qty*(s.unit_price-s.unit_cost)),2) AS profit,
        SUM(s.qty) AS units, COUNT(*) AS orders
      FROM sales s JOIN partners pt ON pt.id=s.partner_id
      ${where} GROUP BY s.partner_id ORDER BY profit DESC LIMIT ?
    `, [...p, lim]));
  });

  return router;
}

module.exports = reportsRouter;
