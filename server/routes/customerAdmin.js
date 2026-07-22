const { Router } = require('express');
const { generateToken, customerButtonsBalance, VERIFY_TOKEN_TTL_MS } = require('../lib/customers');

// Internal, staff-only view into the customer database — mounted at
// /api/customer-admin (deliberately NOT under /api/customers, so it stays
// covered by the normal staff PIN gate in server/index.js rather than
// falling under the public-facing exclusion meant for pawvy.co visitors).
//
// Exists for two reasons right now:
//   1. Lets staff actually see that a signup (from POS or, later, the
//      website) went through, without needing direct database access.
//   2. Stands in for the email service that doesn't exist yet — staff can
//      pull a customer's pending verify link here and send it manually
//      (e.g. via WhatsApp) until real transactional email is wired up.
module.exports = function(db) {
  const router = Router();

  // GET /api/customer-admin/customers — list, most recent first.
  router.get('/customers', (req, res) => {
    const rows = db.query(`
      SELECT id, name, email, phone, address, account_status, referral_code,
             referred_by_customer_id, signup_source, created_at
      FROM customers ORDER BY created_at DESC
    `);
    const withBalances = rows.map(c => ({ ...c, buttons_balance: customerButtonsBalance(db, c.id) }));
    res.json({ customers: withBalances });
  });

  // GET /api/customer-admin/customers/:id — single record, including any
  // still-valid pending verify/login link (for manual testing/sending).
  router.get('/customers/:id', (req, res) => {
    const customer = db.queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const pendingToken = db.queryOne(`
      SELECT token, purpose, expires_at FROM auth_tokens
      WHERE customer_id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC LIMIT 1
    `, [customer.id]);

    res.json({
      customer: { ...customer, buttons_balance: customerButtonsBalance(db, customer.id) },
      pending_token: pendingToken || null,
    });
  });

  // POST /api/customer-admin/customers/:id/resend-verify — issues a fresh
  // verify token (invalidating any older unused one, so there's only ever
  // one valid link at a time) and returns it directly. There's nowhere to
  // email it to yet, so this is meant to be copy-pasted — either straight
  // into a POST /api/customers/verify call for testing, or sent to the
  // customer manually as a stopgap.
  router.post('/customers/:id/resend-verify', (req, res) => {
    const customer = db.queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    db.run(`
      UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP
      WHERE customer_id = ? AND purpose = 'verify' AND used_at IS NULL
    `, [customer.id]);

    const token = generateToken();
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS).toISOString();
    db.run(`INSERT INTO auth_tokens (customer_id, token, purpose, expires_at) VALUES (?,?,'verify',?)`,
      [customer.id, token, expiresAt]);

    res.json({ ok: true, token, expires_at: expiresAt });
  });

  return router;
};
