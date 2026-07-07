// costs.js
const { Router } = require('express');
module.exports = function costsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { category, market, date_from, date_to } = req.query;
    let sql = 'SELECT * FROM operating_costs WHERE 1=1';
    const params = [];
    if (category)  { sql += ' AND category = ?';  params.push(category); }
    if (market)    { sql += ' AND market = ?';     params.push(market); }
    if (date_from) { sql += ' AND date >= ?';      params.push(date_from); }
    if (date_to)   { sql += ' AND date <= ?';      params.push(date_to); }
    sql += ' ORDER BY date DESC';
    res.json(db.query(sql, params));
  });

  router.get('/summary', (req, res) => {
    const { date_from, date_to, market } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (date_from) { where += ' AND date >= ?'; params.push(date_from); }
    if (date_to)   { where += ' AND date <= ?'; params.push(date_to); }
    if (market)    { where += ' AND market = ?'; params.push(market); }

    const total  = db.queryOne(`SELECT ROUND(COALESCE(SUM(amount),0),2) AS total FROM operating_costs ${where}`, params);
    const byCat  = db.query(`SELECT category, ROUND(SUM(amount),2) AS total FROM operating_costs ${where} GROUP BY category ORDER BY total DESC`, params);
    res.json({ total: total.total, byCategory: byCat });
  });

  // Monthly totals for the trend chart — defaults to the trailing 12 months.
  router.get('/trend', (req, res) => {
    const months = parseInt(req.query.months) || 12;
    const rows = db.query(`
      SELECT strftime('%Y-%m', date) AS month, ROUND(SUM(amount), 2) AS total
      FROM operating_costs
      GROUP BY month
      ORDER BY month DESC
      LIMIT ?
    `, [months]);
    res.json(rows.reverse()); // chronological order for charting
  });

  router.post('/', (req, res) => {
    const { date, category, description, amount, market, receipt_ref } = req.body;
    if (!date || !category || !description || !amount) {
      return res.status(400).json({ error: 'date, category, description, amount are required' });
    }
    const result = db.run(
      'INSERT INTO operating_costs (date, category, description, amount, market, receipt_ref) VALUES (?,?,?,?,?,?)',
      [date, category, description, amount, market||'SG', receipt_ref||null]
    );
    res.status(201).json(db.queryOne('SELECT * FROM operating_costs WHERE id = ?', [result.lastID]));
  });

  router.put('/:id', (req, res) => {
    const { date, category, description, amount, market, receipt_ref } = req.body;
    db.run('UPDATE operating_costs SET date=?,category=?,description=?,amount=?,market=?,receipt_ref=? WHERE id=?',
      [date, category, description, amount, market, receipt_ref, req.params.id]);
    res.json(db.queryOne('SELECT * FROM operating_costs WHERE id = ?', [req.params.id]));
  });

  router.delete('/:id', (req, res) => {
    db.run('DELETE FROM operating_costs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
