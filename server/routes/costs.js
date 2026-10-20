// costs.js
const { Router } = require('express');
const money = require('../lib/money');
const fxLib = require('../lib/fx');

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

    // One market → its own currency; All → SGD equivalent (MY ÷ the rate saved on each cost)
    const OPEX = money.opex(money.modeFor(req.query));
    const total  = db.queryOne(`SELECT ROUND(COALESCE(SUM(${OPEX}),0),2) AS total FROM operating_costs ${where}`, params);
    const byCat  = db.query(`SELECT category, ROUND(SUM(${OPEX}),2) AS total FROM operating_costs ${where} GROUP BY category ORDER BY total DESC`, params);
    res.json({ total: total.total, byCategory: byCat, currency: money.currencyFor(req.query) });
  });

  // Monthly totals for the trend chart — defaults to the trailing 12 months.
  router.get('/trend', (req, res) => {
    const months = parseInt(req.query.months) || 12;
    const OPEX = money.opex(money.modeFor(req.query));
    const mkt = req.query.market;
    const rows = db.query(`
      SELECT strftime('%Y-%m', date) AS month, ROUND(SUM(${OPEX}), 2) AS total
      FROM operating_costs
      ${mkt ? 'WHERE market = ?' : ''}
      GROUP BY month
      ORDER BY month DESC
      LIMIT ?
    `, mkt ? [mkt, months] : [months]);
    res.json(rows.reverse()); // chronological order for charting
  });

  router.post('/', (req, res) => {
    const { date, category, description, amount, market, receipt_ref } = req.body;
    if (!date || !category || !description || !amount) {
      return res.status(400).json({ error: 'date, category, description, amount are required' });
    }
    // MY costs are typed in MYR; the rate for the cost's own date is saved on the row.
    const mkt = market || 'SG';
    let st;
    try { st = fxLib.stamp(db, mkt, date); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
    const result = db.run(
      'INSERT INTO operating_costs (date, category, description, amount, market, receipt_ref, currency, fx_rate) VALUES (?,?,?,?,?,?,?,?)',
      [date, category, description, amount, mkt, receipt_ref||null, st.currency, st.fx_rate]
    );
    res.status(201).json(db.queryOne('SELECT * FROM operating_costs WHERE id = ?', [result.lastID]));
  });

  router.put('/:id', (req, res) => {
    const { date, category, description, amount, market, receipt_ref } = req.body;
    const mkt = market || 'SG';
    const old = db.queryOne('SELECT market, date, fx_rate FROM operating_costs WHERE id=?', [req.params.id]);
    let st;
    try {
      st = (old && old.market === mkt && old.date === date && (mkt !== 'MY' || old.fx_rate))
        ? { currency: mkt === 'MY' ? 'MYR' : 'SGD', fx_rate: mkt === 'MY' ? old.fx_rate : null }
        : fxLib.stamp(db, mkt, date);
    } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
    db.run('UPDATE operating_costs SET date=?,category=?,description=?,amount=?,market=?,receipt_ref=?,currency=?,fx_rate=? WHERE id=?',
      [date, category, description, amount, mkt, receipt_ref, st.currency, st.fx_rate, req.params.id]);
    res.json(db.queryOne('SELECT * FROM operating_costs WHERE id = ?', [req.params.id]));
  });

  router.delete('/:id', (req, res) => {
    db.run('DELETE FROM operating_costs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
