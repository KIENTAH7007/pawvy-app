const crypto = require('crypto');

// Shared helpers for creating/crediting customer accounts — used by both
// the POS checkout flow (server/routes/pos.js) and the customer-facing
// signup/auth endpoints (server/routes/customers.js), so there's exactly
// one place that knows how a customer account and its signup bonus get
// created, regardless of which channel triggered it. See
// pawvy-buttons-spec.md for the full agreed rules this implements.

const REFERRAL_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids misreads when read aloud or handwritten
const SIGNUP_BONUS_B = 150;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const VERIFY_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14-day link window, per the agreed event-signup flow
const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;             // short-lived, single-use
const SESSION_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day logged-in session

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateReferralCode(db) {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += REFERRAL_CODE_CHARS[Math.floor(Math.random() * REFERRAL_CODE_CHARS.length)];
    if (!db.queryOne('SELECT id FROM customers WHERE referral_code = ?', [code])) return code;
  }
  throw new Error('Could not generate a unique referral code after 10 attempts.');
}

// Credits a BUTTONS batch. status='credited' means immediately spendable —
// used here only for the flat signup bonus, which isn't tied to any one
// transaction (see BUTTONS spec Section 4). status='pending' is for
// purchase-contingent B; a later patch's 7-day-hold job flips those to
// 'credited' once the refund window passes, or deletes them if refunded.
function creditButtons(db, { customer_id, amount, source, source_type = null, source_id = null, status = 'pending' }) {
  if (!amount || amount <= 0) return null;
  const nowIso = new Date().toISOString();
  const creditedAt = status === 'credited' ? nowIso : null;
  const expiresAt = status === 'credited' ? new Date(Date.now() + ONE_YEAR_MS).toISOString() : null;
  const result = db.run(`
    INSERT INTO buttons_batches
      (customer_id, amount, remaining, source, source_type, source_id, status, credited_at, expires_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `, [customer_id, amount, amount, source, source_type, source_id, status, creditedAt, expiresAt]);
  return result.lastID;
}

// Creates a new customer account, or — if the email already has one —
// refreshes basic contact details without touching verification status or
// re-issuing the signup bonus. Called from:
//   - POS checkout, whenever a customer types an email + ticks consent
//   - the website's self-signup endpoint (server/routes/customers.js)
// `source` is just an attribution label ('event' | 'website' | ...) for
// reporting — the verification mechanism (magic link) is identical either
// way. Only when it becomes *spendable* differs, per BUTTONS spec Section 4,
// and that falls out naturally from POS never allowing redemption at all —
// nothing extra needs to be stored here for that.
function upsertCustomerFromSignup(db, { email, name, phone, address, pdpa_consent_text, source, referral_code }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error('email is required');

  const existing = db.queryOne('SELECT * FROM customers WHERE lower(email) = ?', [cleanEmail]);
  if (existing) {
    db.run(`
      UPDATE customers SET
        name = COALESCE(?, name), phone = COALESCE(?, phone), address = COALESCE(?, address),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name || null, phone || null, address || null, existing.id]);
    return { customer_id: existing.id, isNew: false, account_status: existing.account_status };
  }

  // A referral code that doesn't match anything is ignored rather than
  // rejected — a mistyped code shouldn't block someone from signing up.
  let referredBy = null;
  if (referral_code) {
    const referrer = db.queryOne('SELECT id FROM customers WHERE referral_code = ?', [referral_code.trim().toUpperCase()]);
    if (referrer) referredBy = referrer.id;
  }

  const newReferralCode = generateReferralCode(db);
  const insertResult = db.run(`
    INSERT INTO customers
      (name, address, phone, email, account_status, signup_source, referred_by_customer_id,
       referral_code, pdpa_consent, pdpa_consent_text, pdpa_consent_at)
    VALUES (?,?,?,?, 'unverified', ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
  `, [name || null, address || null, phone || null, cleanEmail, source || null, referredBy, newReferralCode, pdpa_consent_text || null]);

  const customerId = insertResult.lastID;

  // The 150B signup bonus is intentionally NOT credited here. It's granted
  // only once verification succeeds (see server/routes/customers.js
  // /verify and /login/verify) — crediting it at signup would let it sit
  // as a phantom liability on accounts that never actually confirm their
  // email (expired link, typo, unattended POS signup at an event, etc.).

  const verifyToken = generateToken();
  db.run(`
    INSERT INTO auth_tokens (customer_id, token, purpose, expires_at)
    VALUES (?, ?, 'verify', ?)
  `, [customerId, verifyToken, new Date(Date.now() + VERIFY_TOKEN_TTL_MS).toISOString()]);

  return {
    customer_id: customerId, isNew: true, account_status: 'unverified',
    verify_token: verifyToken, referral_code: newReferralCode,
  };
}

function customerButtonsBalance(db, customerId) {
  const row = db.queryOne(`
    SELECT COALESCE(SUM(remaining), 0) AS balance
    FROM buttons_batches
    WHERE customer_id = ? AND status = 'credited'
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  `, [customerId]);
  return row?.balance || 0;
}

module.exports = {
  generateToken, generateReferralCode, creditButtons, upsertCustomerFromSignup, customerButtonsBalance,
  SIGNUP_BONUS_B, VERIFY_TOKEN_TTL_MS, LOGIN_TOKEN_TTL_MS, SESSION_TOKEN_TTL_MS,
};
