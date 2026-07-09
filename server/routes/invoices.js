const { Router } = require('express');

module.exports = function(db) {
  const router = Router();

  // ── Document number generator (server-side sequence per type+day) ──
  function generateDocNumber(type) {
    const prefix = type === 'Invoice' ? 'INV' : type === 'Delivery Order' ? 'DO' : type === 'SOA' ? 'SOA' : 'DOC';
    const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const last  = db.queryOne(
      `SELECT invoice_number FROM invoices WHERE type=? AND invoice_number LIKE ? ORDER BY id DESC LIMIT 1`,
      [type, `${prefix}-${today}-%`]
    );
    const seq = last ? (parseInt(last.invoice_number.split('-')[2]) + 1) : 1;
    return `${prefix}-${today}-${String(seq).padStart(3,'0')}`;
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0,10);
  }

  // ── Vanillapup CN tier calculation ──────────────────────────────
  function calcVanillapupCN(partner_id, periodStart, periodEnd) {
    const row = db.queryOne(`
      SELECT COALESCE(SUM(qty * unit_price - platform_fee_amt), 0) AS total
      FROM sales
      WHERE partner_id = ? AND COALESCE(voided,0) = 0
        AND date >= ? AND date <= ?
    `, [partner_id, periodStart, periodEnd]);
    const subtotal = row?.total || 0;
    if (subtotal < 1000) return { subtotal, pct: 0, amount: 0 };
    const addPct = Math.min(Math.floor((subtotal - 1000) / 300), 3);
    const pct = Math.min(5 + addPct, 8);
    return { subtotal, pct, amount: parseFloat((subtotal * pct / 100).toFixed(2)) };
  }

  // ── GET sales not yet invoiced (for Generate Invoice picker) ────
  router.get('/uninvoiced/:partner_id', (req, res) => {
    const { date_from, date_to } = req.query;
    let sql = `
      SELECT s.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color
      FROM sales s
      JOIN products p ON p.id = s.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE s.partner_id = ? AND s.invoice_id IS NULL AND COALESCE(s.voided,0) = 0
    `;
    const params = [req.params.partner_id];
    if (date_from) { sql += ' AND s.date >= ?'; params.push(date_from); }
    if (date_to)   { sql += ' AND s.date <= ?'; params.push(date_to); }
    sql += ' ORDER BY s.date DESC';
    res.json(db.query(sql, params));
  });

  // ── GET sales not yet on a DO (for Generate DO picker) ──────────
  router.get('/available-for-do/:partner_id', (req, res) => {
    const { date_from, date_to } = req.query;
    let sql = `
      SELECT s.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color
      FROM sales s
      JOIN products p ON p.id = s.product_id
      JOIN brands   b ON b.id = p.brand_id
      WHERE s.partner_id = ? AND s.do_id IS NULL AND COALESCE(s.voided,0) = 0
    `;
    const params = [req.params.partner_id];
    if (date_from) { sql += ' AND s.date >= ?'; params.push(date_from); }
    if (date_to)   { sql += ' AND s.date <= ?'; params.push(date_to); }
    sql += ' ORDER BY s.date DESC';
    res.json(db.query(sql, params));
  });

  // ── GET list of invoices/DOs/SOAs ───────────────────────────────
  router.get('/', (req, res) => {
    const { type, status, partner_id, date_from, date_to } = req.query;
    let sql = `
      SELECT i.*, pt.company_name AS partner_name, pt.billing_cycle,
        CASE WHEN i.status = 'Unpaid' AND i.due_date < date('now') THEN 1 ELSE 0 END AS is_overdue
      FROM invoices i LEFT JOIN partners pt ON pt.id = i.partner_id WHERE 1=1
    `;
    const params = [];
    if (type)       { sql += ' AND i.type = ?';       params.push(type); }
    if (status)     { sql += ' AND i.status = ?';     params.push(status); }
    if (partner_id) { sql += ' AND i.partner_id = ?'; params.push(partner_id); }
    if (date_from)  { sql += ' AND i.date >= ?';      params.push(date_from); }
    if (date_to)    { sql += ' AND i.date <= ?';      params.push(date_to); }
    sql += ' ORDER BY i.date DESC, i.id DESC';
    res.json(db.query(sql, params));
  });

  // ── GET monitoring / AR dashboard ───────────────────────────────
  router.get('/monitoring', (req, res) => {
    const perInvoice = db.query(`
      SELECT i.*, pt.company_name AS partner_name,
        CASE WHEN i.status = 'Unpaid' AND i.due_date < date('now') THEN 1 ELSE 0 END AS is_overdue,
        CAST((julianday('now') - julianday(i.due_date)) AS INTEGER) AS days_overdue
      FROM invoices i JOIN partners pt ON pt.id = i.partner_id
      WHERE i.type = 'Invoice' AND COALESCE(pt.billing_cycle,'per_invoice') != 'soa'
      ORDER BY i.status = 'Unpaid' DESC, i.due_date ASC
    `);
    const soa = db.query(`
      SELECT i.*, pt.company_name AS partner_name,
        CASE WHEN i.status = 'Unpaid' AND i.due_date < date('now') THEN 1 ELSE 0 END AS is_overdue,
        CAST((julianday('now') - julianday(i.due_date)) AS INTEGER) AS days_overdue
      FROM invoices i JOIN partners pt ON pt.id = i.partner_id
      WHERE i.type = 'SOA'
      ORDER BY i.status = 'Unpaid' DESC, i.due_date ASC
    `);
    res.json({ perInvoice, soa });
  });

  // ── GET single invoice/DO/SOA with items ────────────────────────
  router.get('/:id', (req, res) => {
    const invoice = db.queryOne(`
      SELECT i.*, pt.company_name AS partner_name, pt.address AS partner_address,
        pt.pic_name, pt.phone, pt.email AS partner_email,
        pa.label AS outlet_label, pa.address AS outlet_address,
        pa.pic_name AS outlet_pic, pa.phone AS outlet_phone
      FROM invoices i
      LEFT JOIN partners pt ON pt.id = i.partner_id
      LEFT JOIN partner_addresses pa ON pa.id = i.outlet_address_id
      WHERE i.id = ?
    `, [req.params.id]);
    if (!invoice) return res.status(404).json({ error: 'Not found' });

    const items = db.query(`
      SELECT ii.*, p.item_series, p.variation, b.name AS brand_name, b.color AS brand_color
      FROM invoice_items ii
      LEFT JOIN products p ON p.id = ii.product_id
      LEFT JOIN brands   b ON b.id = p.brand_id
      WHERE ii.invoice_id = ?
      ORDER BY ii.id ASC
    `, [req.params.id]);

    res.json({ ...invoice, items });
  });

  // ── POST generate Invoice from selected sale rows ───────────────
  router.post('/generate-invoice', (req, res) => {
    const { partner_id, sale_ids, notes, invoice_date, outlet_address_id } = req.body;
    if (!partner_id || !sale_ids?.length) return res.status(400).json({ error: 'partner_id and sale_ids required' });

    const sales = db.query(`
      SELECT s.*, p.item_series, p.variation, b.name AS brand_name
      FROM sales s JOIN products p ON p.id = s.product_id JOIN brands b ON b.id = p.brand_id
      WHERE s.id IN (${sale_ids.map(()=>'?').join(',')}) AND s.partner_id = ? AND s.invoice_id IS NULL
    `, [...sale_ids, partner_id]);

    if (sales.length === 0) return res.status(400).json({ error: 'No eligible sales found (already invoiced or mismatched partner)' });

    const subtotal = sales.reduce((s, row) => s + row.qty * row.unit_price, 0);
    const discount = sales.reduce((s, row) => s + (row.platform_fee_amt || 0), 0);
    const shipping = sales.reduce((s, row) => s + (row.shipping_charged || 0), 0);
    const total    = parseFloat((subtotal - discount + shipping).toFixed(2));

    // Defaults to today (standard practice: invoice date = when issued), but can be
    // explicitly back-dated by the user to match the underlying order date if preferred.
    const issueDate = invoice_date || new Date().toISOString().slice(0,10);
    const due_date  = addDays(issueDate, 7);
    const invoice_number = generateDocNumber('Invoice');

    const result = db.run(`
      INSERT INTO invoices (invoice_number, type, partner_id, date, due_date, market, currency, subtotal, discount, shipping, total, status, notes, outlet_address_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [invoice_number, 'Invoice', partner_id, issueDate, due_date, sales[0].market||'SG', 'SGD',
        parseFloat(subtotal.toFixed(2)), parseFloat(discount.toFixed(2)), parseFloat(shipping.toFixed(2)), total, 'Unpaid', notes||null, outlet_address_id||null]);

    const invoiceId = result.lastID;

    sales.forEach(row => {
      db.run(
        'INSERT INTO invoice_items (invoice_id, product_id, description, qty, unit_price, line_total) VALUES (?,?,?,?,?,?)',
        [invoiceId, row.product_id, `${row.brand_name} ${row.item_series}${row.variation?' · '+row.variation:''}`, row.qty, row.unit_price, parseFloat((row.qty*row.unit_price).toFixed(2))]
      );
      db.run('UPDATE sales SET invoice_id = ? WHERE id = ?', [invoiceId, row.id]);
    });

    res.status(201).json({ ...db.queryOne('SELECT * FROM invoices WHERE id = ?', [invoiceId]), items_count: sales.length });
  });

  // ════════════════════════════════════════════════════════════════
  // TEMPORARY — one-off correction for invoices generated before
  // patch 70 (fixed cash rebate rounding drift / hybrid sub-tier NaN).
  // Recomputes each linked sale's platform_fee_amt using the same
  // reconciliation logic as the fixed Record Sale, then updates the
  // invoice's cached discount/total to match. Touches ONLY
  // sales.platform_fee_amt and invoices.discount/total — never qty,
  // product_id, or any inventory table, so it's safe to run without
  // affecting stock counts.
  // Requested for removal once no longer needed — safe to delete this
  // whole route (and the matching UI button in Invoices.jsx) in a
  // future patch.
  // ────────────────────────────────────────────────────────────────
  router.post('/:id/recalculate-discount', (req, res) => {
    const invoice = db.queryOne('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.type !== 'Invoice') return res.status(400).json({ error: 'Only applies to Invoice documents, not DO/SOA' });

    const salesRows = db.query(
      `SELECT * FROM sales WHERE invoice_id = ? AND COALESCE(voided,0) = 0`,
      [invoice.id]
    );
    if (salesRows.length === 0) return res.status(400).json({ error: 'No linked sales found for this invoice' });

    const partner = db.queryOne('SELECT * FROM partners WHERE id = ?', [invoice.partner_id]);
    const subtotal = salesRows.reduce((s, r) => s + r.qty * r.unit_price, 0);

    // Mirrors calcDiscount() in client/src/pages/RecordSale.jsx — same tiers.
    function calcDiscount(p, sub) {
      const dt = p?.discount_type || 'standard_rebate';
      const dv = parseFloat(p?.discount_value) || 0;
      const thresh = parseFloat(p?.discount_threshold) || 0;
      if (dt === 'fixed_pct') return { amount: parseFloat((sub * dv / 100).toFixed(2)), pct: dv };
      if (dt === 'threshold_pct') return sub >= thresh ? { amount: parseFloat((sub * dv / 100).toFixed(2)), pct: dv } : { amount: 0 };
      if (dt === 'hybrid') {
        if (sub >= thresh) return { amount: parseFloat((sub * dv / 100).toFixed(2)), pct: dv };
        if (sub >= 400) return { amount: 12 };
        return { amount: 0 };
      }
      if (dt === 'credit_note') return { amount: 0 }; // CN never stored in platform_fee_amt
      if (dt === 'standard_rebate') {
        if (sub >= 600) return { amount: 30 };
        if (sub >= 400) return { amount: 12 };
        return { amount: 0 };
      }
      return { amount: 0 };
    }

    const discount = calcDiscount(partner, subtotal);
    const oldDiscountTotal = parseFloat(salesRows.reduce((s, r) => s + (r.platform_fee_amt || 0), 0).toFixed(2));

    // Same reconciliation as the fixed computePerLineDiscountAmts() in Record Sale.
    const isPercentage = discount.pct !== undefined && discount.pct !== null;
    const perLine = {};
    if (discount.amount === 0 || subtotal === 0) {
      salesRows.forEach(r => { perLine[r.id] = 0; });
    } else if (isPercentage) {
      salesRows.forEach(r => {
        perLine[r.id] = parseFloat((r.qty * r.unit_price * (discount.pct / 100)).toFixed(2));
      });
    } else {
      const eligible = salesRows.filter(r => r.qty * r.unit_price > 0);
      let running = 0;
      eligible.forEach((r, i) => {
        if (i === eligible.length - 1) {
          perLine[r.id] = parseFloat((discount.amount - running).toFixed(2));
        } else {
          const share = (r.qty * r.unit_price) / subtotal;
          const amt = parseFloat((discount.amount * share).toFixed(2));
          perLine[r.id] = amt;
          running += amt;
        }
      });
      salesRows.forEach(r => { if (!(r.id in perLine)) perLine[r.id] = 0; });
    }

    salesRows.forEach(r => {
      db.run('UPDATE sales SET platform_fee_amt = ? WHERE id = ?', [perLine[r.id], r.id]);
    });

    const newDiscountTotal = parseFloat(Object.values(perLine).reduce((s, v) => s + v, 0).toFixed(2));
    const shipping = invoice.shipping || 0;
    const newTotal = parseFloat((subtotal - newDiscountTotal + shipping).toFixed(2));
    db.run('UPDATE invoices SET discount = ?, total = ? WHERE id = ?', [newDiscountTotal, newTotal, invoice.id]);

    res.json({
      ok: true,
      invoice_number: invoice.invoice_number,
      lines_updated: salesRows.length,
      before: { discount: oldDiscountTotal, total: invoice.total },
      after:  { discount: newDiscountTotal, total: newTotal },
    });
  });
  // ════════════════════════════════════════════════════════════════
  // END TEMPORARY recalculate-discount route
  // ════════════════════════════════════════════════════════════════


  router.post('/generate-do', (req, res) => {
    const { partner_id, sale_ids, notes, do_date, outlet_address_id } = req.body;
    if (!partner_id || !sale_ids?.length) return res.status(400).json({ error: 'partner_id and sale_ids required' });

    const sales = db.query(`
      SELECT s.*, p.item_series, p.variation, b.name AS brand_name
      FROM sales s JOIN products p ON p.id = s.product_id JOIN brands b ON b.id = p.brand_id
      WHERE s.id IN (${sale_ids.map(()=>'?').join(',')}) AND s.partner_id = ? AND s.do_id IS NULL
    `, [...sale_ids, partner_id]);

    if (sales.length === 0) return res.status(400).json({ error: 'No eligible sales found (already on a DO or mismatched partner)' });

    const issueDate = do_date || new Date().toISOString().slice(0,10);
    const do_number = generateDocNumber('Delivery Order');

    const result = db.run(`
      INSERT INTO invoices (invoice_number, type, partner_id, date, market, currency, subtotal, discount, shipping, total, status, notes, outlet_address_id)
      VALUES (?,?,?,?,?,?,0,0,0,0,?,?,?)
    `, [do_number, 'Delivery Order', partner_id, issueDate, sales[0].market||'SG', 'SGD', 'Issued', notes||null, outlet_address_id||null]);

    const doId = result.lastID;

    sales.forEach(row => {
      db.run(
        'INSERT INTO invoice_items (invoice_id, product_id, description, qty, unit_price, line_total) VALUES (?,?,?,?,?,?)',
        [doId, row.product_id, `${row.brand_name} ${row.item_series}${row.variation?' · '+row.variation:''}`, row.qty, row.unit_price, parseFloat((row.qty*row.unit_price).toFixed(2))]
      );
      db.run('UPDATE sales SET do_id = ? WHERE id = ?', [doId, row.id]);
    });

    res.status(201).json({ ...db.queryOne('SELECT * FROM invoices WHERE id = ?', [doId]), items_count: sales.length });
  });

  // ── GET SOA preview (dry-run, no save) ──────────────────────────
  router.get('/soa-preview/:partner_id', (req, res) => {
    const { period_start, period_end } = req.query;
    if (!period_start || !period_end) return res.status(400).json({ error: 'period_start and period_end required' });

    const partner = db.queryOne('SELECT * FROM partners WHERE id = ?', [req.params.partner_id]);
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const invoicesInPeriod = db.query(`
      SELECT * FROM invoices
      WHERE partner_id = ? AND type = 'Invoice' AND date >= ? AND date <= ? AND included_in_soa_id IS NULL
      ORDER BY date ASC
    `, [req.params.partner_id, period_start, period_end]);

    let cn = { subtotal: 0, pct: 0, amount: 0 };
    if (partner.discount_type === 'credit_note') {
      // CN is earned from PRIOR period's order total, credited in THIS SOA
      const priorStart = new Date(period_start); priorStart.setMonth(priorStart.getMonth()-1);
      const priorEnd    = new Date(period_end);   priorEnd.setMonth(priorEnd.getMonth()-1);
      cn = calcVanillapupCN(req.params.partner_id, priorStart.toISOString().slice(0,10), priorEnd.toISOString().slice(0,10));
    }

    const subtotal = invoicesInPeriod.reduce((s,i) => s + (i.total||0), 0);
    const total = parseFloat((subtotal - cn.amount).toFixed(2));

    res.json({ partner, invoices: invoicesInPeriod, cn, subtotal: parseFloat(subtotal.toFixed(2)), total });
  });

  // ── POST generate SOA ────────────────────────────────────────────
  router.post('/generate-soa', (req, res) => {
    const { partner_id, period_start, period_end, period_label, notes } = req.body;
    if (!partner_id || !period_start || !period_end) return res.status(400).json({ error: 'partner_id, period_start, period_end required' });

    const partner = db.queryOne('SELECT * FROM partners WHERE id = ?', [partner_id]);
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const invoicesInPeriod = db.query(`
      SELECT * FROM invoices
      WHERE partner_id = ? AND type = 'Invoice' AND date >= ? AND date <= ? AND included_in_soa_id IS NULL
      ORDER BY date ASC
    `, [partner_id, period_start, period_end]);

    let cn = { subtotal: 0, pct: 0, amount: 0 };
    if (partner.discount_type === 'credit_note') {
      const priorStart = new Date(period_start); priorStart.setMonth(priorStart.getMonth()-1);
      const priorEnd    = new Date(period_end);   priorEnd.setMonth(priorEnd.getMonth()-1);
      cn = calcVanillapupCN(partner_id, priorStart.toISOString().slice(0,10), priorEnd.toISOString().slice(0,10));
    }

    const subtotal = parseFloat(invoicesInPeriod.reduce((s,i) => s + (i.total||0), 0).toFixed(2));
    const total = parseFloat((subtotal - cn.amount).toFixed(2));

    const issueDate = new Date().toISOString().slice(0,10);
    const due_date  = addDays(issueDate, 7);
    const soa_number = generateDocNumber('SOA');

    const result = db.run(`
      INSERT INTO invoices (invoice_number, type, partner_id, date, due_date, market, currency, subtotal, discount, shipping, total, status, notes, period_start, period_end)
      VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)
    `, [soa_number, 'SOA', partner_id, issueDate, due_date, partner.market||'SG', 'SGD',
        subtotal, cn.amount, total, 'Unpaid', notes||null, period_start, period_end]);

    const soaId = result.lastID;

    // CN credit line goes FIRST (per requirement: "appears as first-line credit")
    if (cn.amount > 0) {
      db.run(
        'INSERT INTO invoice_items (invoice_id, product_id, description, qty, unit_price, line_total) VALUES (?,?,?,?,?,?)',
        [soaId, null, `Credit Note — ${cn.pct}% on prior month orders (SGD ${cn.subtotal.toFixed(2)})`, 1, -cn.amount, -cn.amount]
      );
    }

    invoicesInPeriod.forEach(inv => {
      db.run(
        'INSERT INTO invoice_items (invoice_id, product_id, description, qty, unit_price, line_total) VALUES (?,?,?,?,?,?)',
        [soaId, null, `${inv.invoice_number} (${inv.date})`, 1, inv.total, inv.total]
      );
      db.run('UPDATE invoices SET included_in_soa_id = ? WHERE id = ?', [soaId, inv.id]);
    });

    res.status(201).json({ ...db.queryOne('SELECT * FROM invoices WHERE id = ?', [soaId]), invoices_included: invoicesInPeriod.length, cn });
  });

  // ── PATCH mark paid / unpaid ─────────────────────────────────────
  router.patch('/:id/pay', (req, res) => {
    db.run("UPDATE invoices SET status='Paid', paid_date=date('now') WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  });
  router.patch('/:id/unpay', (req, res) => {
    db.run("UPDATE invoices SET status='Unpaid', paid_date=NULL WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  });

  // ── DELETE void invoice/DO/SOA (unlinks underlying sales) ───────
  router.delete('/:id', (req, res) => {
    const invoice = db.queryOne('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: 'Not found' });

    if (invoice.type === 'Invoice') db.run('UPDATE sales SET invoice_id = NULL WHERE invoice_id = ?', [req.params.id]);
    if (invoice.type === 'Delivery Order') db.run('UPDATE sales SET do_id = NULL WHERE do_id = ?', [req.params.id]);
    if (invoice.type === 'SOA') db.run('UPDATE invoices SET included_in_soa_id = NULL WHERE included_in_soa_id = ?', [req.params.id]);

    db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [req.params.id]);
    db.run('DELETE FROM invoices WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
