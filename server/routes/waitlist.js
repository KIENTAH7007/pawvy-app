const { Router } = require('express');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public "Notify me when back in stock" capture — no staff PIN required
// (see server/index.js's gate exemption list), same reasoning as
// checkout.js and customers.js: real website visitors hit this, not
// logged-in staff. Staff-side visibility (counts, the email list, mark-
// notified) lives in the separate waitlistAdmin.js, mounted at a path
// that's deliberately NOT a prefix-match of this one — see index.js.
module.exports = function(db) {
  const router = Router();

  router.post('/', (req, res) => {
    const { product_id, email } = req.body;

    if (!product_id) return res.status(400).json({ error: 'product_id is required.' });
    if (!email || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const product = db.queryOne('SELECT id FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    try {
      db.run(
        'INSERT INTO product_waitlist (product_id, email) VALUES (?, ?)',
        [product_id, email.trim().toLowerCase()]
      );
    } catch (e) {
      // UNIQUE(product_id, email) violation — they already signed up for
      // this product. Not an error from the customer's point of view;
      // treat it exactly like a fresh success so the website never needs
      // special-case handling for "already on the list".
    }

    res.status(201).json({ ok: true });
  });

  return router;
};
