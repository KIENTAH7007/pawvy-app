const { Router } = require('express');

module.exports = function(db) {
  const router = Router();

  // GET sales with rich joined data + computed profit
  router.get('/', (req, res) => {
    const { market, brand_id, partner_id, channel, date_from, date_to, limit } = req.query;

    let sql = `
      SELECT
        s.*,
        p.item_series, p.variation, p.barcode,
        b.id AS brand_id, b.name AS brand_name, b.color AS brand_color,
        pt.company_name AS partner_name,
        ROUND(s.qty * s.unit_price, 2)                                        AS revenue,
        ROUND(s.qty * s.unit_cost,  2)                                        AS cogs,
        ROUND(s.qty * (s.unit_price - s.unit_cost) - s.platform_fee_amt, 2)  AS profit,
        ROUND((s.unit_price - s.unit_cost - (s.platform_fee_amt / CASE WHEN s.qty=0 THEN 1 ELSE s.qty END)) / CASE WHEN s.unit_price=0 THEN 1 ELSE s.unit_price END * 100, 1) AS margin_pct
      FROM sales s
      JOIN products  p  ON p.id  = s.product_id
      JOIN brands    b  ON b.id  = p.brand_id
      LEFT JOIN partners pt ON pt.id = s.partner_id
      WHERE 1=1
    `;
    const params = [];

    if (market)     { sql += ' AND s.market = ?';          params.push(market); }
    if (brand_id)   { sql += ' AND b.id = ?';              params.push(brand_id); }
    if (partner_id) { sql += ' AND s.partner_id = ?';      params.push(partner_id); }
    if (channel)    { sql += ' AND s.channel = ?';         params.push(channel); }
    if (date_from)  { sql += ' AND s.date >= ?';           params.push(date_from); }
    if (date_to)    { sql += ' AND s.date <= ?';           params.push(date_to); }

    sql += ' ORDER BY s.date DESC, s.created_at DESC';
    if (limit)      { sql += ' LIMIT ?'; params.push(parseInt(limit)); }

    res.json(db.query(sql, params));
  });

  // GET summary totals (for dashboard)
  router.get('/summary', (req, res) => {
    const { market, date_from, date_to } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (market)    { where += ' AND s.market = ?';  params.push(market); }
    if (date_from) { where += ' AND s.date >= ?';   params.push(date_from); }
    if (date_to)   { where += ' AND s.date <= ?';   params.push(date_to); }

    const totals = db.queryOne(`
      SELECT
        COUNT(*)                                                              AS transactions,
        COALESCE(SUM(s.qty), 0)                                             AS units_sold,
        ROUND(COALESCE(SUM(s.qty * s.unit_price), 0), 2)                   AS revenue,
        ROUND(COALESCE(SUM(s.qty * s.unit_cost),  0), 2)                   AS cogs,
        ROUND(COALESCE(SUM(s.qty * (s.unit_price - s.unit_cost) - s.platform_fee_amt), 0), 2) AS profit
      FROM sales s
      JOIN products p ON p.id = s.product_id
      ${where}
    `, params);

    // By brand
    const byBrand = db.query(`
      SELECT
        b.id, b.name, b.color,
        ROUND(SUM(s.qty * (s.unit_price - s.unit_cost) - s.platform_fee_amt), 2) AS profit,
        SUM(s.qty)                                                               AS units
      FROM sales s
      JOIN products p ON p.id = s.product_id
      JOIN brands   b ON b.id = p.brand_id
      ${where}
      GROUP BY b.id ORDER BY profit DESC
    `, params);

    // By month (last 12)
    const byMonth = db.query(`
      SELECT
        strftime('%Y-%m', s.date)                                               AS month,
        ROUND(SUM(s.qty * (s.unit_price - s.unit_cost) - s.platform_fee_amt), 2) AS profit,
        ROUND(SUM(s.qty * s.unit_price), 2)                                     AS revenue
      FROM sales s
      JOIN products p ON p.id = s.product_id
      ${where}
      GROUP BY month ORDER BY month DESC LIMIT 12
    `, params);

    res.json({ totals, byBrand, byMonth });
  });

  // GET available channels (for dropdowns)
  router.get('/channels', (req, res) => {
    const channels = db.query('SELECT DISTINCT channel FROM sales ORDER BY channel');
    res.json(channels.map(r => r.channel));
  });

  // POST record a sale
  router.post('/', (req, res) => {
    const {
      date, product_id, partner_id, channel, market,
      qty, unit_cost, unit_price,
      platform_fee_pct, notes
    } = req.body;

    if (!date || !product_id || !channel || !qty || unit_price === undefined) {
      return res.status(400).json({ error: 'date, product_id, channel, qty, unit_price are required' });
    }

    // Auto-fill unit_cost from product if not provided
    let cost = unit_cost;
    if (cost === undefined || cost === null) {
      const product = db.queryOne('SELECT unit_cost FROM products WHERE id = ?', [product_id]);
      cost = product?.unit_cost || 0;
    }

    const fee_pct  = platform_fee_pct || 0;
    const fee_amt  = parseFloat(((qty * unit_price) * (fee_pct / 100)).toFixed(2));

    const result = db.run(`
      INSERT INTO sales
        (date, product_id, partner_id, channel, market, qty, unit_cost, unit_price, platform_fee_pct, platform_fee_amt, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `, [
      date, product_id, partner_id || null, channel, market || 'SG',
      qty, cost, unit_price, fee_pct, fee_amt, notes || null
    ]);

    const sale = db.queryOne(`
      SELECT s.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color,
        ROUND(s.qty * s.unit_price, 2) AS revenue,
        ROUND(s.qty * s.unit_cost,  2) AS cogs,
        ROUND(s.qty * (s.unit_price - s.unit_cost) - s.platform_fee_amt, 2) AS profit
      FROM sales s JOIN products p ON p.id=s.product_id JOIN brands b ON b.id=p.brand_id
      WHERE s.id = ?
    `, [result.lastID]);

    res.status(201).json(sale);
  });

  // PUT update a sale
  router.put('/:id', (req, res) => {
    const { date, product_id, partner_id, channel, market, qty, unit_cost, unit_price, platform_fee_pct, notes } = req.body;
    const fee_pct = platform_fee_pct || 0;
    const fee_amt = parseFloat(((qty * unit_price) * (fee_pct / 100)).toFixed(2));

    db.run(`
      UPDATE sales SET date=?, product_id=?, partner_id=?, channel=?, market=?,
        qty=?, unit_cost=?, unit_price=?, platform_fee_pct=?, platform_fee_amt=?,
        notes=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `, [date, product_id, partner_id||null, channel, market||'SG', qty, unit_cost, unit_price, fee_pct, fee_amt, notes||null, req.params.id]);

    const sale = db.queryOne(`
      SELECT s.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color,
        ROUND(s.qty*(s.unit_price-s.unit_cost)-s.platform_fee_amt,2) AS profit
      FROM sales s JOIN products p ON p.id=s.product_id JOIN brands b ON b.id=p.brand_id
      WHERE s.id=?
    `, [req.params.id]);
    res.json(sale);
  });

  // DELETE a sale
  router.delete('/:id', (req, res) => {
    db.run('DELETE FROM sales WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
