const { Router } = require('express');

module.exports = function(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { model, market, type, active_only } = req.query;
    let sql = "SELECT * FROM partners WHERE 1=1";
    const params = [];
    if (model)       { sql += ' AND model = ?';         params.push(model); }
    if (market)      { sql += ' AND market = ?';        params.push(market); }
    if (type)        { sql += ' AND business_type = ?'; params.push(type); }
    // active_only=true excludes Non-active partners — used by all selection dropdowns
    if (active_only === 'true') { sql += " AND COALESCE(tier,'Active') != 'Non-active'"; }
    // VIP first, then Active, then Non-active; alphabetical within each group
    sql += " ORDER BY CASE COALESCE(tier,'Active') WHEN 'VIP' THEN 1 WHEN 'Active' THEN 2 ELSE 3 END, company_name";
    res.json(db.query(sql, params));
  });

  router.get('/:id', (req, res) => {
    const partner = db.queryOne('SELECT * FROM partners WHERE id = ?', [req.params.id]);
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    const brands = db.query(`
      SELECT b.* FROM brands b
      JOIN partner_brands pb ON pb.brand_id = b.id
      WHERE pb.partner_id = ?
    `, [req.params.id]);
    res.json({ ...partner, brands });
  });

  router.post('/', (req, res) => {
    const {
      company_name, pic_name, business_type, model, market,
      address, phone, email, notes, brand_ids, region,
      discount_type, discount_value, discount_threshold, billing_cycle, tier, credit_term_days
    } = req.body;
    if (!company_name) return res.status(400).json({ error: 'Company name is required' });

    const result = db.run(
      `INSERT INTO partners
        (company_name, pic_name, business_type, model, market, address, phone, email, notes, region,
         discount_type, discount_value, discount_threshold, billing_cycle, tier, credit_term_days)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [company_name, pic_name||null, business_type||null, model||null, market||'SG',
       address||null, phone||null, email||null, notes||null, region||null,
       discount_type||'standard_rebate', discount_value||0, discount_threshold||0,
       billing_cycle||'per_invoice', tier||'Active', parseInt(credit_term_days)||7]
    );

    if (brand_ids?.length) {
      brand_ids.forEach(bid => {
        db.run('INSERT OR IGNORE INTO partner_brands (partner_id, brand_id) VALUES (?,?)', [result.lastID, bid]);
      });
    }

    res.status(201).json(db.queryOne('SELECT * FROM partners WHERE id = ?', [result.lastID]));
  });

  router.put('/:id', (req, res) => {
    const {
      company_name, pic_name, business_type, model, market,
      address, phone, email, notes, is_active, brand_ids, region,
      discount_type, discount_value, discount_threshold, billing_cycle, tier, credit_term_days
    } = req.body;

    db.run(
      `UPDATE partners SET
        company_name=?, pic_name=?, business_type=?, model=?, market=?,
        address=?, phone=?, email=?, notes=?, is_active=?, region=?,
        discount_type=?, discount_value=?, discount_threshold=?, billing_cycle=?, tier=?, credit_term_days=?
       WHERE id=?`,
      [company_name, pic_name||null, business_type||null, model||null, market||'SG',
       address||null, phone||null, email||null, notes||null, is_active ?? 1, region||null,
       discount_type||'standard_rebate', discount_value||0, discount_threshold||0,
       billing_cycle||'per_invoice', tier||'Active', parseInt(credit_term_days)||7,
       req.params.id]
    );

    if (brand_ids !== undefined) {
      db.run('DELETE FROM partner_brands WHERE partner_id = ?', [req.params.id]);
      brand_ids.forEach(bid => {
        db.run('INSERT OR IGNORE INTO partner_brands (partner_id, brand_id) VALUES (?,?)', [req.params.id, bid]);
      });
    }

    res.json(db.queryOne('SELECT * FROM partners WHERE id = ?', [req.params.id]));
  });

  // ── Outlet addresses ─────────────────────────────────────────────
  router.get('/:id/addresses', (req, res) => {
    res.json(db.query(
      'SELECT * FROM partner_addresses WHERE partner_id = ? ORDER BY is_primary DESC, sort_order ASC, id ASC',
      [req.params.id]
    ));
  });

  router.post('/:id/addresses', (req, res) => {
    const { label, address, pic_name, phone, is_primary } = req.body;
    if (!label || !address) return res.status(400).json({ error: 'label and address required' });
    // If setting as primary, unset any existing primary for this partner
    if (is_primary) db.run('UPDATE partner_addresses SET is_primary = 0 WHERE partner_id = ?', [req.params.id]);
    const r = db.run(
      'INSERT INTO partner_addresses (partner_id, label, address, pic_name, phone, is_primary) VALUES (?,?,?,?,?,?)',
      [req.params.id, label, address, pic_name||null, phone||null, is_primary ? 1 : 0]
    );
    res.status(201).json({ id: r.lastID, ok: true });
  });

  router.put('/:id/addresses/:addr_id', (req, res) => {
    const { label, address, pic_name, phone, is_primary } = req.body;
    if (is_primary) db.run('UPDATE partner_addresses SET is_primary = 0 WHERE partner_id = ?', [req.params.id]);
    db.run(
      'UPDATE partner_addresses SET label=?, address=?, pic_name=?, phone=?, is_primary=? WHERE id=? AND partner_id=?',
      [label, address, pic_name||null, phone||null, is_primary ? 1 : 0, req.params.addr_id, req.params.id]
    );
    res.json({ ok: true });
  });

  router.delete('/:id/addresses/:addr_id', (req, res) => {
    db.run('DELETE FROM partner_addresses WHERE id = ? AND partner_id = ?', [req.params.addr_id, req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
