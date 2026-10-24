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
const UNSUBSCRIBE_TOKEN_TTL_MS = ONE_YEAR_MS;          // long-lived and reusable, not single-use — see below

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Unlike verify/login tokens, an unsubscribe link is meant to stay valid
// for as long as a customer keeps receiving these emails, and clicking it
// twice should just re-confirm, not error with "link already used." So
// this reuses one existing token per customer rather than minting a new
// one on every single email (which would work too, just leave a growing
// trail of valid-but-unused tokens in auth_tokens for no real benefit).
function getOrCreateUnsubscribeToken(db, customerId) {
  const existing = db.queryOne(`
    SELECT token FROM auth_tokens
    WHERE customer_id = ? AND purpose = 'unsubscribe' AND expires_at > CURRENT_TIMESTAMP
    ORDER BY created_at DESC LIMIT 1
  `, [customerId]);
  if (existing) return existing.token;

  const token = generateToken();
  db.run(`
    INSERT INTO auth_tokens (customer_id, token, purpose, expires_at)
    VALUES (?, ?, 'unsubscribe', ?)
  `, [customerId, token, new Date(Date.now() + UNSUBSCRIBE_TOKEN_TTL_MS).toISOString()]);
  return token;
}

function generateReferralCode(db) {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += REFERRAL_CODE_CHARS[Math.floor(Math.random() * REFERRAL_CODE_CHARS.length)];
    if (!db.queryOne('SELECT id FROM customers WHERE referral_code = ?', [code])
        && !db.queryOne('SELECT code FROM referral_code_aliases WHERE code = ?', [code])) return code;
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

// ── Referral codes: lookup, custom-code rules, ambassador report ──────────
const CODE_MIN = 4, CODE_MAX = 12;
// Exact-match reserved words (staff/brand/promo words nobody should own).
const RESERVED_CODES = new Set(['PAWVY', 'PAWVYSG', 'PAWVYCO', 'ADMIN', 'STAFF', 'SUPPORT', 'TEST', 'TESTING', 'FREE', 'PROMO',
  'BUTTONS', 'BUTTON', 'DISCOUNT', 'NULL', 'NONE', 'UNDEFINED', 'JOIN', 'SIGNUP', 'LOGIN', 'SHOP', 'CART', 'ACCOUNT']);
// Clearly offensive fragments — refused anywhere inside a code.
const BLOCKED_FRAGMENTS = ['FUCK', 'SHIT', 'CUNT', 'DICK', 'NIGG', 'PORN', 'RAPE', 'BITCH', 'WHORE', 'ASSHOLE', 'PUSSY'];

function normalizeCode(code) { return String(code || '').trim().toUpperCase(); }

// Current code OR an old code kept as an alias after an ambassador changed theirs.
function findReferrerByCode(db, code) {
  const c = normalizeCode(code);
  if (!c) return null;
  const direct = db.queryOne('SELECT id, name, is_ambassador FROM customers WHERE referral_code = ?', [c]);
  if (direct) return direct;
  const alias = db.queryOne('SELECT customer_id FROM referral_code_aliases WHERE code = ?', [c]);
  if (alias) return db.queryOne('SELECT id, name, is_ambassador FROM customers WHERE id = ?', [alias.customer_id]);
  return null;
}

// Rules for a CUSTOM code. customerId = the ambassador being edited (their own
// current code / old aliases don't count as "taken").
function validateCustomCode(db, rawCode, customerId) {
  const code = normalizeCode(rawCode);
  if (code.length < CODE_MIN || code.length > CODE_MAX) return { ok: false, code, error: `Code must be ${CODE_MIN}–${CODE_MAX} characters.` };
  if (!/^[A-Z0-9]+$/.test(code)) return { ok: false, code, error: 'Letters and numbers only – no spaces or symbols.' };
  if (RESERVED_CODES.has(code) || BLOCKED_FRAGMENTS.some(f => code.includes(f))) return { ok: false, code, error: 'That word is reserved. Please choose another.' };
  const clash = db.queryOne('SELECT id FROM customers WHERE referral_code = ? AND id != ?', [code, customerId || 0]);
  if (clash) return { ok: false, code, error: 'Already used by another customer.' };
  const aliasClash = db.queryOne('SELECT customer_id FROM referral_code_aliases WHERE code = ? AND customer_id != ?', [code, customerId || 0]);
  if (aliasClash) return { ok: false, code, error: 'Already used by another customer (old code).' };
  return { ok: true, code };
}

// Changes an ambassador's code. The old code is kept as an alias so links and
// posts already shared keep working. Returns { ok, code } or { ok:false, error }.
function setCustomReferralCode(db, customerId, rawCode) {
  const customer = db.queryOne('SELECT id, referral_code, is_ambassador FROM customers WHERE id = ?', [customerId]);
  if (!customer) return { ok: false, error: 'Customer not found.' };
  if (!customer.is_ambassador) return { ok: false, error: 'Only special ambassadors can have a custom code.' };
  const v = validateCustomCode(db, rawCode, customerId);
  if (!v.ok) return v;
  if (v.code === customer.referral_code) return { ok: true, code: v.code, unchanged: true };
  try {
    db.run('DELETE FROM referral_code_aliases WHERE code = ? AND customer_id = ?', [v.code, customerId]); // reclaiming one of their own old codes
    if (customer.referral_code) {
      db.run('INSERT OR IGNORE INTO referral_code_aliases (code, customer_id) VALUES (?, ?)', [customer.referral_code, customerId]);
    }
    db.run('UPDATE customers SET referral_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [v.code, customerId]);
  } catch (err) {
    return { ok: false, error: 'Could not save that code (already in use). Please try another.' };
  }
  return { ok: true, code: v.code, old_code: customer.referral_code };
}

// Ambassador performance: everyone who signed up with their code/link, whether
// they've made a first purchase, and the referral BUTTONS earned. The first
// purchase is detected by the referee's own 'referral' BUTTONS batch.
function getReferralReport(db, customerId) {
  const rows = db.query(`
    SELECT id, name, email, created_at, referral_code_used
    FROM customers WHERE referred_by_customer_id = ? ORDER BY created_at DESC
  `, [customerId]);
  const referrals = rows.map(r => {
    const b = db.queryOne(`
      SELECT status, earned_at, credited_at FROM buttons_batches
      WHERE customer_id = ? AND source = 'referral' AND status != 'voided' ORDER BY id ASC LIMIT 1
    `, [r.id]);
    return {
      id: r.id, name: r.name, email: r.email, signed_up_at: r.created_at, code_used: r.referral_code_used || null,
      purchased: !!b, purchased_at: b ? b.earned_at : null, bonus_status: b ? b.status : null,
    };
  });
  const earned = db.queryOne(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM buttons_batches
    WHERE customer_id = ? AND source = 'referral' AND status != 'voided'
  `, [customerId]).total;
  return {
    summary: { signed_up: referrals.length, purchased: referrals.filter(r => r.purchased).length, buttons_earned: earned },
    referrals,
  };
}

function isAmbassador(db, customerId) {
  if (!customerId) return false;
  const c = db.queryOne('SELECT is_ambassador FROM customers WHERE id = ?', [customerId]);
  return !!(c && c.is_ambassador);
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
  let referralCodeUsed = null;
  if (referral_code) {
    const referrer = findReferrerByCode(db, referral_code);
    if (referrer) { referredBy = referrer.id; referralCodeUsed = normalizeCode(referral_code); }
  }

  const newReferralCode = generateReferralCode(db);
  const insertResult = db.run(`
    INSERT INTO customers
      (name, address, phone, email, account_status, signup_source, referred_by_customer_id,
       referral_code, referral_code_used, pdpa_consent, pdpa_consent_text, pdpa_consent_at)
    VALUES (?,?,?,?, 'unverified', ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
  `, [name || null, address || null, phone || null, cleanEmail, source || null, referredBy, newReferralCode, referralCodeUsed, pdpa_consent_text || null]);

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
  generateToken, generateReferralCode, normalizeCode, findReferrerByCode, validateCustomCode, setCustomReferralCode, getReferralReport, isAmbassador, creditButtons, upsertCustomerFromSignup, customerButtonsBalance,
  getOrCreateUnsubscribeToken,
  SIGNUP_BONUS_B, VERIFY_TOKEN_TTL_MS, LOGIN_TOKEN_TTL_MS, SESSION_TOKEN_TTL_MS, UNSUBSCRIBE_TOKEN_TTL_MS,
};
