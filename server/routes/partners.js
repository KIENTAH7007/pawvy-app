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
      address, phone, email, notes, brand_ids,
      discount_type, discount_value, discount_threshold, billing_cycle, tier
    } = req.body;
    if (!company_name) return res.status(400).json({ error: 'Company name is required' });

    const result = db.run(
      `INSERT INTO partners
        (company_name, pic_name, business_type, model, market, address, phone, email, notes,
         discount_type, discount_value, discount_threshold, billing_cycle, tier)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [company_name, pic_name||null, business_type||null, model||null, market||'SG',
       address||null, phone||null, email||null, notes||null,
       discount_type||'standard_rebate', discount_value||0, discount_threshold||0,
       billing_cycle||'per_invoice', tier||'Active']
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
      address, phone, email, notes, is_active, brand_ids,
      discount_type, discount_value, discount_threshold, billing_cycle, tier
    } = req.body;

    db.run(
      `UPDATE partners SET
        company_name=?, pic_name=?, business_type=?, model=?, market=?,
        address=?, phone=?, email=?, notes=?, is_active=?,
        discount_type=?, discount_value=?, discount_threshold=?, billing_cycle=?, tier=?
       WHERE id=?`,
      [company_name, pic_name, business_type, model, market,
       address, phone, email, notes, is_active ?? 1,
       discount_type||'standard_rebate', discount_value||0, discount_threshold||0,
       billing_cycle||'per_invoice', tier||'Active',
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

  return router;
};
