const { Router } = require('express');
const { NEED_TAGS } = require('../lib/needTags');

// Problem-based bundles — staff-only CRUD (PIN-gated in server/index.js,
// not in the exemption prefix list there). The public, read-only version
// (with real-time computed prices from each component's current price)
// lives in routes/shop.js, same split as testimonials.js/publicContent.js.
//
// Deliberately no price or discount field anywhere in this file — Stage 1
// bundles are just a named, curated set of real products with quantities.
// The "price" a customer sees is always the live sum of the real
// component prices at read time, computed in shop.js. This means
// checkout.js (which independently re-validates every cart line's price
// and stock straight from the products table) never needs to know
// bundles exist — "Add bundle to cart" on the website just adds each
// real product to the cart individually. A real bundle discount is a
// deliberate, separate piece of future work (needs checkout.js to
// verify a claimed discount against a real bundle definition rather than
// trusting anything the client sends) — not something to bolt on here.
module.exports = function(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const bundles = db.query(`
      SELECT * FROM bundles ORDER BY sort_order ASC, id ASC
    `);
    const withProducts = bundles.map(b => ({
      ...b,
      products: db.query(`
        SELECT bp.id AS bundle_product_id, bp.product_id, bp.qty, bp.sort_order,
               p.item_series, p.variation, bd_brand.name AS brand_name
        FROM bundle_products bp
        JOIN products p ON p.id = bp.product_id
        JOIN brands bd_brand ON bd_brand.id = p.brand_id
        WHERE bp.bundle_id = ?
        ORDER BY bp.sort_order ASC, bp.id ASC
      `, [b.id]),
    }));
    res.json({ bundles: withProducts });
  });

  router.post('/', (req, res) => {
    const { name, description, need_tag, products, sort_order, is_active } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'A bundle name is required.' });
    }
    if (need_tag && !NEED_TAGS.includes(need_tag)) {
      return res.status(400).json({ error: `need_tag must be one of: ${NEED_TAGS.join(', ')}.` });
    }
    if (!Array.isArray(products) || products.length < 2) {
      return res.status(400).json({ error: 'A bundle needs at least 2 products.' });
    }
    for (const p of products) {
      if (!p.product_id || !p.qty || p.qty < 1) {
        return res.status(400).json({ error: 'Each product needs a valid product and a quantity of at least 1.' });
      }
      const exists = db.queryOne('SELECT id FROM products WHERE id = ?', [p.product_id]);
      if (!exists) return res.status(400).json({ error: `Product ${p.product_id} not found.` });
    }

    const result = db.run(`
      INSERT INTO bundles (name, description, need_tag, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?)
    `, [name.trim(), description || null, need_tag || null, sort_order || 0, is_active === false ? 0 : 1]);

    products.forEach((p, i) => {
      db.run('INSERT INTO bundle_products (bundle_id, product_id, qty, sort_order) VALUES (?, ?, ?, ?)',
        [result.lastID, p.product_id, p.qty, i]);
    });

    res.status(201).json({ ok: true, id: result.lastID });
  });

  router.patch('/:id', (req, res) => {
    const bundle = db.queryOne('SELECT id FROM bundles WHERE id = ?', [req.params.id]);
    if (!bundle) return res.status(404).json({ error: 'Bundle not found.' });

    const { name, description, need_tag, products, sort_order, is_active } = req.body;

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: 'Bundle name cannot be blank.' });
    }
    if (need_tag !== undefined && need_tag !== null && !NEED_TAGS.includes(need_tag)) {
      return res.status(400).json({ error: `need_tag must be one of: ${NEED_TAGS.join(', ')}.` });
    }
    if (products !== undefined) {
      if (!Array.isArray(products) || products.length < 2) {
        return res.status(400).json({ error: 'A bundle needs at least 2 products.' });
      }
      for (const p of products) {
        if (!p.product_id || !p.qty || p.qty < 1) {
          return res.status(400).json({ error: 'Each product needs a valid product and a quantity of at least 1.' });
        }
        const exists = db.queryOne('SELECT id FROM products WHERE id = ?', [p.product_id]);
        if (!exists) return res.status(400).json({ error: `Product ${p.product_id} not found.` });
      }
    }

    db.run(`
      UPDATE bundles SET
        name = COALESCE(?, name),
        description = ?,
        need_tag = ?,
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name?.trim() || null,
      description !== undefined ? (description || null) : db.queryOne('SELECT description FROM bundles WHERE id = ?', [req.params.id]).description,
      need_tag !== undefined ? (need_tag || null) : db.queryOne('SELECT need_tag FROM bundles WHERE id = ?', [req.params.id]).need_tag,
      sort_order ?? null,
      typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
      req.params.id,
    ]);

    // Product list, if included, fully replaces the old one — simpler
    // and less error-prone than trying to diff/patch individual rows for
    // a list this small (bundles are a handful of products, not
    // hundreds), same reasoning as how the admin form itself resends the
    // whole product list on every save rather than tracking deltas.
    if (products !== undefined) {
      db.run('DELETE FROM bundle_products WHERE bundle_id = ?', [req.params.id]);
      products.forEach((p, i) => {
        db.run('INSERT INTO bundle_products (bundle_id, product_id, qty, sort_order) VALUES (?, ?, ?, ?)',
          [req.params.id, p.product_id, p.qty, i]);
      });
    }

    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const bundle = db.queryOne('SELECT id FROM bundles WHERE id = ?', [req.params.id]);
    if (!bundle) return res.status(404).json({ error: 'Bundle not found.' });
    db.run('DELETE FROM bundle_products WHERE bundle_id = ?', [req.params.id]);
    db.run('DELETE FROM bundles WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};
