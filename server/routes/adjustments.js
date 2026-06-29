const { Router } = require('express');

// Inventory adjustments (write-offs, corrections, purchases)
function adjustmentsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { type, product_id, date_from, date_to } = req.query;
    let sql = `
      SELECT ia.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color
      FROM inventory_adjustments ia
      JOIN products p ON p.id = ia.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE 1=1
    `;
    const params = [];
    if (type)       { sql += ' AND ia.type = ?';       params.push(type); }
    if (product_id) { sql += ' AND ia.product_id = ?'; params.push(product_id); }
    if (date_from)  { sql += ' AND ia.date >= ?';      params.push(date_from); }
    if (date_to)    { sql += ' AND ia.date <= ?';      params.push(date_to); }
    sql += ' ORDER BY ia.date DESC';
    res.json(db.query(sql, params));
  });

  router.post('/', (req, res) => {
    const { date, product_id, type, qty_change, reason, notes } = req.body;
    if (!date || !product_id || !type || qty_change === undefined) {
      return res.status(400).json({ error: 'date, product_id, type, qty_change required' });
    }

    // Auto-calculate cost_impact for write-offs
    let cost_impact = 0;
    if (type === 'Write-off') {
      const product = db.queryOne('SELECT unit_cost FROM products WHERE id = ?', [product_id]);
      cost_impact = parseFloat((Math.abs(qty_change) * (product?.unit_cost || 0)).toFixed(2));
    }

    const result = db.run(
      'INSERT INTO inventory_adjustments (date, product_id, type, qty_change, reason, cost_impact, notes) VALUES (?,?,?,?,?,?,?)',
      [date, product_id, type, qty_change, reason||null, cost_impact, notes||null]
    );

    // Also adjust the inventory quantity
    if (type !== 'Recount') {
      db.run(`
        UPDATE inventory SET qty = MAX(0, qty + ?), updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ? AND location = 'Storhub'
      `, [qty_change, product_id]);
    }

    res.status(201).json(db.queryOne('SELECT * FROM inventory_adjustments WHERE id = ?', [result.lastID]));
  });

  router.delete('/:id', (req, res) => {
    db.run('DELETE FROM inventory_adjustments WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
}

// Invoices
function invoicesRouter(db) {
  const router = Router();

  const generateInvoiceNumber = (type) => {
    const prefix = type === 'Invoice' ? 'INV' : type === 'Delivery Order' ? 'DO' : type === 'SOA' ? 'SOA' : 'BS';
    const date   = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const last   = db.queryOne(`SELECT invoice_number FROM invoices WHERE type=? ORDER BY created_at DESC LIMIT 1`, [type]);
    const seq    = last ? (parseInt(last.invoice_number.slice(-4)) + 1) : 1;
    return `${prefix}-${date}-${String(seq).padStart(4,'0')}`;
  };

  router.get('/', (req, res) => {
    const { type, status, partner_id } = req.query;
    let sql = `
      SELECT i.*, pt.company_name AS partner_name
      FROM invoices i LEFT JOIN partners pt ON pt.id = i.partner_id WHERE 1=1
    `;
    const params = [];
    if (type)       { sql += ' AND i.type = ?';       params.push(type); }
    if (status)     { sql += ' AND i.status = ?';     params.push(status); }
    if (partner_id) { sql += ' AND i.partner_id = ?'; params.push(partner_id); }
    sql += ' ORDER BY i.date DESC';
    res.json(db.query(sql, params));
  });

  router.get('/:id', (req, res) => {
    const invoice = db.queryOne(`
      SELECT i.*, pt.company_name AS partner_name, pt.address AS partner_address
      FROM invoices i LEFT JOIN partners pt ON pt.id = i.partner_id WHERE i.id = ?
    `, [req.params.id]);
    if (!invoice) return res.status(404).json({ error: 'Not found' });

    const items = db.query(`
      SELECT ii.*, p.item_series, p.variation, b.name AS brand_name
      FROM invoice_items ii
      LEFT JOIN products p ON p.id = ii.product_id
      LEFT JOIN brands   b ON b.id = p.brand_id
      WHERE ii.invoice_id = ?
    `, [req.params.id]);

    res.json({ ...invoice, items });
  });

  router.post('/', (req, res) => {
    const { type, partner_id, date, due_date, market, currency, discount, notes, items } = req.body;
    const invoice_number = generateInvoiceNumber(type || 'Invoice');

    const subtotal = (items || []).reduce((s, it) => s + (it.qty * it.unit_price), 0);
    const total    = parseFloat((subtotal - (discount || 0)).toFixed(2));

    const result = db.run(
      'INSERT INTO invoices (invoice_number, type, partner_id, date, due_date, market, currency, subtotal, discount, total, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [invoice_number, type||'Invoice', partner_id||null, date, due_date||null, market||'SG', currency||'SGD', subtotal, discount||0, total, notes||null]
    );

    (items || []).forEach(it => {
      db.run(
        'INSERT INTO invoice_items (invoice_id, product_id, description, qty, unit_price, line_total) VALUES (?,?,?,?,?,?)',
        [result.lastID, it.product_id||null, it.description||null, it.qty, it.unit_price, it.qty * it.unit_price]
      );
    });

    const invoice = db.queryOne('SELECT * FROM invoices WHERE id = ?', [result.lastID]);
    res.status(201).json(invoice);
  });

  router.put('/:id/status', (req, res) => {
    db.run('UPDATE invoices SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    res.json({ ok: true });
  });

  return router;
}

module.exports = adjustmentsRouter;
module.exports.invoicesRouter = invoicesRouter;
