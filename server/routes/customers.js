const { Router } = require('express');
const {
  generateToken, upsertCustomerFromSignup, customerButtonsBalance,
  LOGIN_TOKEN_TTL_MS, SESSION_TOKEN_TTL_MS,
} = require('../lib/customers');

// Customer-facing account endpoints for pawvy.co. Mounted publicly —
// excluded from the internal staff PIN gate in server/index.js, same as
// /api/portal and /api/pos, since real website visitors need to reach
// these with no staff login at all.
//
// Auth model: magic-link only, no passwords (see BUTTONS/website planning
// notes for why). Three token purposes share the `auth_tokens` table:
//   'verify'  — completes a brand-new signup (event or self-signup)
//   'login'   — a returning customer's magic login link
//   'session' — the long-lived bearer token issued after either succeeds
module.exports = function(db) {
  const router = Router();

  function customerPublicView(c) {
    return {
      id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address,
      account_status: c.account_status, referral_code: c.referral_code,
      instagram_handle: c.instagram_handle, preferred_contact_channel: c.preferred_contact_channel,
      profile_bonus_claimed: !!c.profile_bonus_claimed,
    };
  }

  function issueSession(customerId) {
    const token = generateToken();
    db.run(`INSERT INTO auth_tokens (customer_id, token, purpose, expires_at) VALUES (?,?,'session',?)`,
      [customerId, token, new Date(Date.now() + SESSION_TOKEN_TTL_MS).toISOString()]);
    return token;
  }

  // POST /api/customers/signup
  // Called either directly by the future website (self-signup) or
  // server-side from POS checkout when a customer opts in with an email.
  router.post('/signup', (req, res) => {
    const { email, name, phone, address, pdpa_consent, pdpa_consent_text, source, referral_code } = req.body;
    if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required.' });
    if (!pdpa_consent) return res.status(400).json({ error: 'PDPA consent is required to create an account.' });

    const result = upsertCustomerFromSignup(db, {
      email, name, phone, address, pdpa_consent_text, source: source || 'website', referral_code,
    });

    if (!result.isNew) {
      return res.status(200).json({
        ok: true, isNew: false, account_status: result.account_status,
        message: 'An account with this email already exists.',
      });
    }

    // TEMPORARY — real email delivery isn't built yet (pending the EDM
    // service decision noted in the website planning doc). Returning the
    // verify token directly so signup→verify→session can be tested
    // end-to-end before that's wired up.
    // ⚠️ REMOVE verify_token_DEV_ONLY once real email sending exists —
    // shipping this as-is would let anyone self-verify any email address.
    res.status(201).json({
      ok: true, isNew: true, customer_id: result.customer_id,
      account_status: 'unverified', referral_code: result.referral_code,
      verify_token_DEV_ONLY: result.verify_token,
    });
  });

  // POST /api/customers/verify — completes signup via the magic link.
  router.post('/verify', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token.' });

    const record = db.queryOne(`
      SELECT * FROM auth_tokens
      WHERE token = ? AND purpose = 'verify' AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `, [token]);
    if (!record) return res.status(400).json({ error: 'This link is invalid or has expired. Please request a new one.' });

    db.run('UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [record.id]);
    db.run("UPDATE customers SET account_status = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [record.customer_id]);

    const customer = db.queryOne('SELECT * FROM customers WHERE id = ?', [record.customer_id]);
    res.json({ ok: true, session_token: issueSession(customer.id), customer: customerPublicView(customer) });
  });

  // POST /api/customers/login — request a login link.
  // Always returns the same generic message regardless of whether the
  // email is registered, so this can't be used to probe which emails have
  // accounts.
  router.post('/login', (req, res) => {
    const { email } = req.body;
    if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required.' });

    const customer = db.queryOne('SELECT * FROM customers WHERE lower(email) = ?', [email.trim().toLowerCase()]);
    const genericResponse = { ok: true, message: 'If this email is registered, a login link has been sent.' };

    if (!customer) return res.json(genericResponse);

    const token = generateToken();
    db.run(`INSERT INTO auth_tokens (customer_id, token, purpose, expires_at) VALUES (?,?,'login',?)`,
      [customer.id, token, new Date(Date.now() + LOGIN_TOKEN_TTL_MS).toISOString()]);

    // TEMPORARY — same email-service dependency as /signup above.
    console.log(`[DEV] Login link for ${customer.email}: token=${token}`);
    if (process.env.NODE_ENV !== 'production') {
      return res.json({ ...genericResponse, login_token_DEV_ONLY: token });
    }
    res.json(genericResponse);
  });

  // POST /api/customers/login/verify — completes a login via the magic link.
  router.post('/login/verify', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token.' });

    const record = db.queryOne(`
      SELECT * FROM auth_tokens
      WHERE token = ? AND purpose = 'login' AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `, [token]);
    if (!record) return res.status(400).json({ error: 'This link is invalid or has expired. Please request a new one.' });

    db.run('UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [record.id]);
    // Successfully clicking a login link proves email ownership just as
    // much as the dedicated verify link does — so an account that was
    // still unverified (e.g. created at an event) becomes verified the
    // moment they log in this way, without needing a separate step.
    db.run(`
      UPDATE customers SET account_status = 'verified', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND account_status != 'verified'
    `, [record.customer_id]);

    const customer = db.queryOne('SELECT * FROM customers WHERE id = ?', [record.customer_id]);
    res.json({ ok: true, session_token: issueSession(customer.id), customer: customerPublicView(customer) });
  });

  // Auth guard for any endpoint requiring a logged-in customer — used by
  // /me below, and available for future patches (profile edits, order
  // history, BUTTONS redemption) to import and reuse.
  function requireCustomerAuth(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not logged in.' });

    const record = db.queryOne(`
      SELECT * FROM auth_tokens WHERE token = ? AND purpose = 'session' AND expires_at > CURRENT_TIMESTAMP
    `, [token]);
    if (!record) return res.status(401).json({ error: 'Session expired or invalid — please log in again.' });

    req.customerId = record.customer_id;
    next();
  }

  // POST /api/customers/logout
  router.post('/logout', requireCustomerAuth, (req, res) => {
    const token = (req.headers['authorization'] || '').slice(7);
    db.run('DELETE FROM auth_tokens WHERE token = ?', [token]);
    res.json({ ok: true });
  });

  // GET /api/customers/me — profile + BUTTONS balance. Doubles as an
  // end-to-end smoke test that signup → verify → session actually works.
  router.get('/me', requireCustomerAuth, (req, res) => {
    const customer = db.queryOne('SELECT * FROM customers WHERE id = ?', [req.customerId]);
    if (!customer) return res.status(404).json({ error: 'Account not found.' });
    res.json({
      ok: true,
      customer: customerPublicView(customer),
      buttons_balance: customerButtonsBalance(db, customer.id),
    });
  });

  router._requireCustomerAuth = requireCustomerAuth;
  return router;
};
