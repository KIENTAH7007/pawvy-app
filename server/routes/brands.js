const { Router } = require('express');

module.exports = function(db) {
  const router = Router();

  // GET all brands
  router.get('/', (req, res) => {
    const brands = db.query('SELECT * FROM brands ORDER BY name');
    res.json(brands);
  });

  // POST create brand
  router.post('/', (req, res) => {
    const { name, color, notes, hidden_on_website } = req.body;
    if (!name) return res.status(400).json({ error: 'Brand name is required' });
    try {
      const result = db.run(
        'INSERT INTO brands (name, color, notes, hidden_on_website) VALUES (?, ?, ?, ?)',
        [name, color || '#888888', notes || null, hidden_on_website ? 1 : 0]
      );
      const brand = db.queryOne('SELECT * FROM brands WHERE id = ?', [result.lastID]);
      res.status(201).json(brand);
    } catch (e) {
      res.status(409).json({ error: 'Brand name already exists' });
    }
  });

  // PUT update brand
  router.put('/:id', (req, res) => {
    const { name, color, notes, hidden_on_website } = req.body;
    db.run(
      'UPDATE brands SET name = ?, color = ?, notes = ?, hidden_on_website = ? WHERE id = ?',
      [name, color, notes, hidden_on_website ? 1 : 0, req.params.id]
    );
    const brand = db.queryOne('SELECT * FROM brands WHERE id = ?', [req.params.id]);
    res.json(brand);
  });

  return router;
};
