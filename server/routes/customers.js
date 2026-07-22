const { Router } = require('express');
const {
  generateToken, upsertCustomerFromSignup, customerButtonsBalance, creditButtons,
  SIGNUP_BONUS_B, LOGIN_TOKEN_TTL_MS, SESSION_TOKEN_TTL_MS,
} = require('../lib/customers');
const { sendCustomerEmail } = require('../utils/notify');
const { baseUrl, htmlPage, buildVerifyEmail, buildLoginEmail } = require('../lib/customerEmails');
const { checkAndAwardProfileBonus } = require('../lib/profileCompletion');

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
//
// Email delivery: reuses the Gmail SMTP transport already set up for
// internal notifications (server/utils/notify.js) — see sendCustomerEmail
// there. If GMAIL_USER/GMAIL_APP_PASSWORD aren't set on Railway, sending
// silently no-ops and logs instead of failing signup — an account can
// still be created and manually verified via the Customers admin page
// (Patch 98) either way.
//
// Until the real pawvy.co website exists, the emailed link points at this
// same backend's own GET /verify-link and /login-link routes below, which
// render a small standalone confirmation page rather than trying to hand
// off to a frontend that isn't built yet. Once the website exists, the
// email template's URL should be updated to point there instead (noted
// again at the top of buildVerifyEmail/buildLoginEmail below).
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

  function baseUrl(req) {
    // Always https — Railway's public URLs always are, and reading the
    // Host header directly avoids depending on Express's `trust proxy`
    // setting (which isn't configured, and req.protocol would otherwise
    // incorrectly report 'http' behind Railway's proxy).
    return `https://${req.get('host')}`;
  }

  function htmlPage({ title, heading, body, ok }) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:-apple-system,'Segoe UI',sans-serif;background:#12151f;color:#f5f2eb;
    display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
  .card{max-width:420px;text-align:center;background:#1a1e2b;border:1px solid #2a2f40;
    border-radius:14px;padding:36px 28px;}
  h1{font-size:22px;margin:0 0 12px;color:${ok ? '#7fc93e' : '#f87171'};}
  p{font-size:14px;line-height:1.6;color:rgba(245,242,235,.75);margin:0;}
</style></head>
<body><div class="card"><h1>${heading}</h1><p>${body}</p></div></body></html>`;
  }

  // ── Shared verification logic (used by both the JSON POST endpoints,
  // for a future website, and the GET landing pages below, for direct
  // email link clicks before that website exists) ──────────────────────
  function completeToken(token, purpose) {
    const record = db.queryOne(`
      SELECT * FROM auth_tokens
      WHERE token = ? AND purpose = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `, [token, purpose]);
    if (!record) return { ok: false, error: 'This link is invalid or has expired. Please request a new one.' };

    db.run('UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [record.id]);

    const customerBefore = db.queryOne('SELECT * FROM customers WHERE id = ?', [record.customer_id]);
    const wasUnverified = customerBefore?.account_status !== 'verified';
    db.run(`
      UPDATE customers SET account_status = 'verified', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND account_status != 'verified'
    `, [record.customer_id]);

    // 150B signup bonus is granted on first successful verification, not
    // at signup — see the note in upsertCustomerFromSignup() for why.
    // Guarded by wasUnverified so re-verifying an already-verified account
    // (e.g. a staff "New login link" click) never re-grants it.
    if (wasUnverified) {
      creditButtons(db, { customer_id: record.customer_id, amount: SIGNUP_BONUS_B, source: 'signup', status: 'credited' });
    }

    const customer = db.queryOne('SELECT * FROM customers WHERE id = ?', [record.customer_id]);
    return { ok: true, customer, session_token: issueSession(customer.id), wasUnverified };
  }

  // POST /api/customers/signup
  // Called either directly by the future website (self-signup) or
  // server-side from POS checkout when a customer opts in with an email.
  router.post('/signup', async (req, res) => {
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

    const customer = db.queryOne('SELECT * FROM customers WHERE id = ?', [result.customer_id]);
    const { subject, text, html } = buildVerifyEmail(baseUrl(req), customer, result.verify_token);
    const sent = await sendCustomerEmail(email.trim(), subject, text, html);

    const response = {
      ok: true, isNew: true, customer_id: result.customer_id,
      account_status: 'unverified', referral_code: result.referral_code, email_sent: sent,
    };
    // Fallback only when email genuinely couldn't be sent (no Gmail creds
    // configured) — never expose the token alongside a real sent email.
    if (!sent) response.verify_token_DEV_ONLY = result.verify_token;
    res.status(201).json(response);
  });

  // POST /api/customers/verify — completes signup via the magic link
  // (JSON endpoint, for a future website's own verify page to call).
  router.post('/verify', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token.' });
    const result = completeToken(token, 'verify');
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, session_token: result.session_token, customer: customerPublicView(result.customer) });
  });

  // GET /api/customers/verify-link — the actual link clicked from the
  // emailed message. Renders a standalone confirmation page directly,
  // since there's no website yet to hand off to.
  router.get('/verify-link', (req, res) => {
    const result = completeToken(req.query.token, 'verify');
    if (!result.ok) {
      return res.status(400).send(htmlPage({ title: 'Pawvy — Link invalid', heading: 'Link invalid or expired', body: result.error, ok: false }));
    }
    const balance = customerButtonsBalance(db, result.customer.id);
    res.send(htmlPage({
      title: 'Pawvy — Account verified',
      heading: "You're verified! 🐾",
      body: `Welcome to Pawvy, ${result.customer.name || ''}. Your account is active with <strong>${balance} BUTTONS</strong> ready to use once pawvy.co launches.`,
      ok: true,
    }));
  });

  // POST /api/customers/login — request a login link.
  // Always returns the same generic message regardless of whether the
  // email is registered, so this can't be used to probe which emails have
  // accounts.
  router.post('/login', async (req, res) => {
    const { email } = req.body;
    if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required.' });

    const customer = db.queryOne('SELECT * FROM customers WHERE lower(email) = ?', [email.trim().toLowerCase()]);
    const genericResponse = { ok: true, message: 'If this email is registered, a login link has been sent.' };
    if (!customer) return res.json(genericResponse);

    const token = generateToken();
    db.run(`INSERT INTO auth_tokens (customer_id, token, purpose, expires_at) VALUES (?,?,'login',?)`,
      [customer.id, token, new Date(Date.now() + LOGIN_TOKEN_TTL_MS).toISOString()]);

    const { subject, text, html } = buildLoginEmail(baseUrl(req), customer, token);
    const sent = await sendCustomerEmail(customer.email, subject, text, html);

    if (!sent && process.env.NODE_ENV !== 'production') {
      return res.json({ ...genericResponse, login_token_DEV_ONLY: token });
    }
    res.json(genericResponse);
  });

  // POST /api/customers/login/verify — completes a login via the magic
  // link (JSON endpoint, for a future website to call).
  router.post('/login/verify', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token.' });
    const result = completeToken(token, 'login');
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, session_token: result.session_token, customer: customerPublicView(result.customer) });
  });

  // GET /api/customers/login-link — the actual link clicked from the
  // emailed message. Same standalone-confirmation approach as verify-link.
  router.get('/login-link', (req, res) => {
    const result = completeToken(req.query.token, 'login');
    if (!result.ok) {
      return res.status(400).send(htmlPage({ title: 'Pawvy — Link invalid', heading: 'Link invalid or expired', body: result.error, ok: false }));
    }
    res.send(htmlPage({
      title: 'Pawvy — Logged in',
      heading: "You're logged in! 🐾",
      body: `Welcome back, ${result.customer.name || ''}. Once pawvy.co launches, logging in there will feel just like this.`,
      ok: true,
    }));
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

  // GET /api/customers/me — profile + BUTTONS balance + primary pet.
  // Doubles as an end-to-end smoke test that signup → verify → session
  // actually works.
  router.get('/me', requireCustomerAuth, (req, res) => {
    const customer = db.queryOne('SELECT * FROM customers WHERE id = ?', [req.customerId]);
    if (!customer) return res.status(404).json({ error: 'Account not found.' });
    const pet = db.queryOne('SELECT * FROM customer_pets WHERE customer_id = ? AND is_primary = 1 LIMIT 1', [customer.id]);
    res.json({
      ok: true,
      customer: customerPublicView(customer),
      pet: pet || null,
      buttons_balance: customerButtonsBalance(db, customer.id),
    });
  });

  // PATCH /api/customers/me — update basic profile fields. Free-text
  // typo fixes are always allowed here, same as everything else — only
  // the profile_bonus_claimed FLAG is immutable through this endpoint
  // (checkAndAwardProfileBonus only ever sets it, editing other fields
  // afterward can't unset or re-trigger it).
  router.patch('/me', requireCustomerAuth, (req, res) => {
    const { name, phone, address, instagram_handle, preferred_contact_channel } = req.body;
    db.run(`
      UPDATE customers SET
        name = COALESCE(?, name), phone = COALESCE(?, phone), address = COALESCE(?, address),
        instagram_handle = COALESCE(?, instagram_handle),
        preferred_contact_channel = COALESCE(?, preferred_contact_channel),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name || null, phone || null, address || null, instagram_handle || null, preferred_contact_channel || null, req.customerId]);

    const bonusResult = checkAndAwardProfileBonus(db, req.customerId);
    const customer = db.queryOne('SELECT * FROM customers WHERE id = ?', [req.customerId]);
    res.json({ ok: true, customer: customerPublicView(customer), profile_bonus: bonusResult });
  });

  // PUT /api/customers/me/pet — creates or updates the customer's primary
  // pet in one call (there's only ever one right now — see the multi-pet
  // note after Patch 96 — so this always targets is_primary=1, creating it
  // if it doesn't exist yet rather than requiring a separate create step).
  router.put('/me/pet', requireCustomerAuth, (req, res) => {
    const { name, breed, weight, birthday, allergies, favorite_item, chew_power } = req.body;
    const existing = db.queryOne('SELECT id FROM customer_pets WHERE customer_id = ? AND is_primary = 1', [req.customerId]);

    if (existing) {
      db.run(`
        UPDATE customer_pets SET
          name = COALESCE(?, name), breed = COALESCE(?, breed), weight = COALESCE(?, weight),
          birthday = COALESCE(?, birthday), allergies = COALESCE(?, allergies),
          favorite_item = COALESCE(?, favorite_item), chew_power = COALESCE(?, chew_power),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [name || null, breed || null, weight ?? null, birthday || null, allergies || null, favorite_item || null, chew_power || null, existing.id]);
    } else {
      db.run(`
        INSERT INTO customer_pets (customer_id, name, breed, weight, birthday, allergies, favorite_item, chew_power, is_primary)
        VALUES (?,?,?,?,?,?,?,?,1)
      `, [req.customerId, name || null, breed || null, weight ?? null, birthday || null, allergies || null, favorite_item || null, chew_power || null]);
    }

    const bonusResult = checkAndAwardProfileBonus(db, req.customerId);
    const pet = db.queryOne('SELECT * FROM customer_pets WHERE customer_id = ? AND is_primary = 1', [req.customerId]);
    res.json({ ok: true, pet, profile_bonus: bonusResult });
  });

  router._requireCustomerAuth = requireCustomerAuth;
  return router;
};
