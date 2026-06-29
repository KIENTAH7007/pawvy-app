const { Router } = require('express');
module.exports = function(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { brand_id, location } = req.query;
    let sql = `
      SELECT i.*, p.item_series, p.variation, p.barcode, b.name AS brand_name, b.color AS brand_color,
             pt.company_name AS partner_name
      FROM inventory i
      JOIN products p  ON p.id = i.product_id
      JOIN brands   b  ON b.id = p.brand_id
      LEFT JOIN partners pt ON pt.id = i.partner_id
      WHERE p.is_active = 1
    `;
    const params = [];
    if (brand_id)  { sql += ' AND b.id = ?';        params.push(brand_id); }
    if (location)  { sql += ' AND i.location = ?';  params.push(location); }
    sql += ' ORDER BY b.name, p.item_series, p.variation, i.location';
    res.json(db.query(sql, params));
  });

  // Upsert stock level
  router.post('/set', (req, res) => {
    const { product_id, location, partner_id, qty } = req.body;
    if (!product_id || !location || qty === undefined) {
      return res.status(400).json({ error: 'product_id, location, qty required' });
    }
    const pid = partner_id || null;
    const existing = db.queryOne(
      'SELECT id FROM inventory WHERE product_id=? AND location=? AND COALESCE(partner_id,0)=COALESCE(?,0)',
      [product_id, location, pid]
    );
    if (existing) {
      db.run('UPDATE inventory SET qty=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [qty, existing.id]);
    } else {
      db.run('INSERT INTO inventory (product_id, location, partner_id, qty) VALUES (?,?,?,?)', [product_id, location, pid, qty]);
    }
    res.json({ ok: true });
  });

  // Adjust stock (add/subtract)
  router.post('/adjust', (req, res) => {
    const { product_id, location, partner_id, delta } = req.body;
    const pid = partner_id || null;
    const existing = db.queryOne(
      'SELECT id, qty FROM inventory WHERE product_id=? AND location=? AND COALESCE(partner_id,0)=COALESCE(?,0)',
      [product_id, location, pid]
    );
    const newQty = Math.max(0, (existing?.qty || 0) + delta);
    if (existing) {
      db.run('UPDATE inventory SET qty=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [newQty, existing.id]);
    } else {
      db.run('INSERT INTO inventory (product_id, location, partner_id, qty) VALUES (?,?,?,?)', [product_id, location, pid, Math.max(0, delta)]);
    }
    res.json({ ok: true, qty: newQty });
  });

  return router;
};
