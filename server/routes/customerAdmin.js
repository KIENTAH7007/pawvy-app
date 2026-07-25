const { Router } = require('express');
const { generateToken, customerButtonsBalance, VERIFY_TOKEN_TTL_MS } = require('../lib/customers');
const { sendCustomerEmail, sendTestEmail } = require('../utils/notify');
const { baseUrl, buildVerifyEmail } = require('../lib/customerEmails');
const { awardStamp, getStampCount } = require('../lib/stampCard');

// Internal, staff-only view into the customer database — mounted at
// /api/customer-admin (deliberately NOT under /api/customers, so it stays
// covered by the normal staff PIN gate in server/index.js rather than
// falling under the public-facing exclusion meant for pawvy.co visitors).
//
// Exists for two reasons:
//   1. Lets staff actually see that a signup (from POS or, later, the
//      website) went through, without needing direct database access.
//   2. Gives staff a manual "resend" button — real email now sends
//      automatically on signup, but this covers the case where it didn't
//      arrive (spam filter, typo caught after the fact, etc.), and still
//      falls back to returning the raw token/link if email genuinely
//      isn't configured on this deployment.
module.exports = function(db) {
  const router = Router();

  // GET /api/customer-admin/customers — list, most recent first.
  router.get('/customers', (req, res) => {
    const rows = db.query(`
      SELECT id, name, email, phone, address, account_status, referral_code,
             referred_by_customer_id, signup_source, created_at, profile_bonus_claimed
      FROM customers ORDER BY created_at DESC
    `);
    const withBalances = rows.map(c => ({
      ...c,
      buttons_balance: customerButtonsBalance(db, c.id),
      stamp_count: getStampCount(db, c.id),
    }));
    res.json({ customers: withBalances });
  });

  // GET /api/customer-admin/customers/:id — single record, including pet
  // profile, any still-valid pending verify/login link (for manual
  // testing/sending), and the full BUTTONS ledger. Deliberately kept
  // separate from the list endpoint above — pet/consent/ledger detail is
  // too much to cram into table columns for every row, so it only loads
  // here, when staff actually opens one customer's detail view.
  router.get('/customers/:id', (req, res) => {
    const customer = db.queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const pet = db.queryOne('SELECT * FROM customer_pets WHERE customer_id = ? AND is_primary = 1 LIMIT 1', [customer.id]);

    const pendingToken = db.queryOne(`
      SELECT token, purpose, expires_at FROM auth_tokens
      WHERE customer_id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC LIMIT 1
    `, [customer.id]);

    // Full BUTTONS history — including still-pending (7-day hold) batches,
    // which the Customers list's headline balance deliberately excludes
    // (that balance only ever counts status='credited'). Surfacing pending
    // batches here answers "why hasn't my B credited yet" without adding a
    // second, easily-misread number to the main list. Most recent first,
    // capped at 100 rows — plenty for any real account, protects against
    // an unbounded response for a very old/active one.
    const buttonsLedger = db.query(`
      SELECT id, amount, remaining, source, source_type, source_id, status,
             earned_at, credited_at, expires_at
      FROM buttons_batches
      WHERE customer_id = ?
      ORDER BY earned_at DESC
      LIMIT 100
    `, [customer.id]);

    res.json({
      customer: { ...customer, buttons_balance: customerButtonsBalance(db, customer.id) },
      pet: pet || null,
      pending_token: pendingToken || null,
      buttons_ledger: buttonsLedger,
    });
  });

  // POST /api/customer-admin/customers/:id/resend-verify — issues a fresh
  // verify token (invalidating any older unused one, so there's only ever
  // one valid link at a time), sends it as a real email if Gmail is
  // configured, and always returns the token too — either as a fallback
  // (email not configured) or just for staff visibility/manual testing.
  router.post('/customers/:id/resend-verify', async (req, res) => {
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

    let sent = false;
    if (customer.email) {
      const { subject, text, html } = buildVerifyEmail(baseUrl(req), customer, token);
      sent = await sendCustomerEmail(customer.email, subject, text, html);
    }

    res.json({ ok: true, token, expires_at: expiresAt, email_sent: sent });
  });

  // POST /api/customer-admin/test-email — sends a bare test email and
  // returns the result, including the raw Gmail error if it fails,
  // directly in the response. Exists purely for debugging the connection
  // quickly — faster than triggering a real resend and digging through
  // Railway logs each time. Body: { to: "someone@example.com" }
  router.post('/test-email', async (req, res) => {
    const { to } = req.body;
    if (!to || !to.trim()) return res.status(400).json({ error: 'to is required.' });

    const start = Date.now();
    try {
      await sendTestEmail(to.trim());
      res.json({ ok: true, sent: true, elapsed_ms: Date.now() - start });
    } catch (err) {
      res.status(500).json({
        ok: false, sent: false, elapsed_ms: Date.now() - start,
        error: err.message, code: err.code || null, command: err.command || null,
      });
    }
  });

  // POST /api/customer-admin/customers/:id/stamp — staff manually awards a
  // stamp after checking the customer's tagged social post (see spec
  // Section 5.5 — verification is manual by design, not automated).
  // Enforces the 7-stamps/week cap and auto-credits 100B every 5th stamp.
  // Body: { approved_by?: "staff name", note?: "link to the post" }
  router.post('/customers/:id/stamp', (req, res) => {
    const customer = db.queryOne('SELECT id FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    try {
      const result = awardStamp(db, {
        customerId: customer.id,
        approvedBy: req.body.approved_by || null,
        note: req.body.note || null,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      if (err.code === 'WEEKLY_CAP_REACHED') return res.status(400).json({ error: err.message });
      throw err;
    }
  });

  // DELETE /api/customer-admin/customers/:id — permanently removes a
  // customer account. Foreign keys cascade (confirmed PRAGMA foreign_keys
  // = ON in database.js), so pets, auth tokens, and BUTTONS batches/
  // redemptions tied to this customer are cleaned up automatically. Mainly
  // exists right now for test-account cleanup (e.g. recycling a personal
  // email during testing) — worth revisiting once this needs to satisfy a
  // real customer-initiated deletion request (see the PDPA data-request
  // procedure doc: real requests should go through that documented process,
  // not just this button, since actual sales/tax records must be retained
  // regardless of what gets deleted here).
  router.delete('/customers/:id', (req, res) => {
    const customer = db.queryOne('SELECT id FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    db.run('DELETE FROM customers WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
};

