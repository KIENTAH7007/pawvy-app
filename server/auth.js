const crypto = require('crypto');

// ── Shared PIN login for the internal Pawvy App ────────────────────
// Sessions expire at 23:59:59 Singapore time on the day they were created,
// regardless of what time login happened — a fresh PIN is required every
// calendar day (SGT), per the agreed design. Does NOT apply to /api/portal/*
// (the public Order Portal must stay reachable without any login).

function endOfTodaySGT() {
  const SGT_OFFSET_MS = 8 * 60 * 60 * 1000; // Singapore is UTC+8, no DST
  const nowSgt = new Date(Date.now() + SGT_OFFSET_MS);
  const y = nowSgt.getUTCFullYear(), m = nowSgt.getUTCMonth(), d = nowSgt.getUTCDate();
  // 23:59:59 SGT on this date == 15:59:59 UTC the same date
  return new Date(Date.UTC(y, m, d, 15, 59, 59)).toISOString();
}


// ── Staff roles (Nov 2026) ─────────────────────────────────────────
// The APP_PIN env var stays the MASTER PIN and sees everything, exactly as
// before. An optional 6-digit PIN for the "ops" (operations) role can be set
// by the master in Settings. It is stored hashed in role_pins. Ops sessions are
// limited on the SERVER (not just hidden in the menu):
//   * only the API areas below are reachable (deny by default);
//   * cost / profit fields are removed from every JSON response;
//   * restocking stock in (which sets costs) and DB download stay master-only.
const ROLES = ['ops'];
const COST_KEYS = new Set(['unit_cost', 'cost_impact', 'total_estimated_cost', 'estimated_cost',
  'set_cost', 'landed_cost', 'landed_unit_cost', 'cogs', 'profit', 'gross_profit', 'margin', 'margin_pct']);

function stripCosts(v) {
  if (Array.isArray(v)) return v.map(stripCosts);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out = {};
    for (const k of Object.keys(v)) { if (!COST_KEYS.has(k)) out[k] = stripCosts(v[k]); }
    return out;
  }
  return v;
}

// Is this request allowed for the ops role? `p` is the path after /api, no query.
function opsAllowed(method, p) {
  const m = method.toUpperCase();
  const get = m === 'GET';
  if (p === '/auth/me' || p === '/auth/logout') return true;
  if (/^\/(orders|restock|consignment|customer-admin|enquiry-admin)(\/|$)/.test(p)) return true;
  if (/^\/inventory(\/|$)/.test(p)) return !(m === 'POST' && /^\/inventory\/(restock|import-opening)\/?$/.test(p));
  if (/^\/forecast(\/|$)/.test(p)) return get || (m === 'PUT' && /^\/forecast\/restock-settings\/\d+$/.test(p));
  if (get && /^\/brands\/?$/.test(p)) return true;
  if (get && /^\/products(\/\d+)?\/?$/.test(p)) return true;
  if (get && /^\/partners(\/\d+(\/addresses)?)?\/?$/.test(p)) return true;
  return false;
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPinHash(pin, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const a = crypto.scryptSync(String(pin || ''), salt, 32);
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

module.exports = function(db) {
  // In-memory brute-force guards. Reset on server restart — acceptable for a
  // 4-digit PIN meant to keep casual/automated guessing out.
  //   1) Per IP: 5 wrong PINs from one address -> that address is locked 15 min.
  //   2) Global: 10 wrong PINs from ANYONE within 15 min -> PIN login is paused
  //      for everybody for 15 min. This is what stops an attacker who rotates
  //      addresses; with 10,000 possible PINs it caps guessing at ~960/day.
  //      Trade-off: someone hammering wrong PINs can briefly lock staff out too.
  const failedAttempts = new Map();
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 15 * 60 * 1000;
  const GLOBAL_MAX_FAILS = 10;
  const GLOBAL_WINDOW_MS = 15 * 60 * 1000;
  let globalFails = [];          // timestamps of recent wrong PINs (any address)
  let globalLockedUntil = 0;

  // The visitor controls the FIRST entries of X-Forwarded-For (they can send any
  // value), but Railway's proxy appends the address it actually saw as the LAST
  // entry — that is the only one we can trust.
  function clientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      const parts = String(xff).split(',').map(x => x.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
    return req.ip || req.connection?.remoteAddress || 'unknown';
  }

  function pinMatches(given, correct) {
    const a = Buffer.from(String(given || ''));
    const b = Buffer.from(String(correct));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function login(req, res) {
    const now = Date.now();
    if (now < globalLockedUntil) {
      const waitMin = Math.ceil((globalLockedUntil - now) / 60000);
      return res.status(429).json({ error: `Too many incorrect PIN attempts. Login is paused — try again in ${waitMin} minute(s).` });
    }
    const ip = clientIp(req);
    const attempt = failedAttempts.get(ip);
    if (attempt?.lockedUntil && now < attempt.lockedUntil) {
      const waitMin = Math.ceil((attempt.lockedUntil - now) / 60000);
      return res.status(429).json({ error: `Too many incorrect attempts. Try again in ${waitMin} minute(s).` });
    }

    const correctPin = process.env.APP_PIN;
    if (!correctPin) {
      return res.status(500).json({ error: 'APP_PIN is not set on the server yet — set it in Railway environment variables.' });
    }

    const { pin } = req.body;
    let role = null;
    if (pinMatches(pin, correctPin)) role = 'master';
    else if (/^\d{6}$/.test(String(pin || ''))) {
      const rows = db.query('SELECT role, pin_hash FROM role_pins');
      const hit = rows.find(r => verifyPinHash(pin, r.pin_hash));
      if (hit) role = hit.role;
    }
    if (!role) {
      globalFails = globalFails.filter(t => now - t < GLOBAL_WINDOW_MS);
      globalFails.push(now);
      if (globalFails.length >= GLOBAL_MAX_FAILS) { globalLockedUntil = now + LOCKOUT_MS; globalFails = []; }
      if (failedAttempts.size > 5000) failedAttempts.clear();
      const prev = failedAttempts.get(ip) || { count: 0 };
      prev.count += 1;
      if (prev.count >= MAX_ATTEMPTS) {
        failedAttempts.set(ip, { count: 0, lockedUntil: now + LOCKOUT_MS });
      } else {
        failedAttempts.set(ip, prev);
      }
      return res.status(401).json({ error: 'Incorrect PIN.' });
    }

    failedAttempts.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = endOfTodaySGT();
    db.run('INSERT INTO sessions (token, expires_at, role) VALUES (?, ?, ?)', [token, expiresAt, role]);
    // Housekeeping — drop old expired sessions so the table doesn't grow forever
    db.run("DELETE FROM sessions WHERE expires_at < datetime('now', '-7 days')");
    res.json({ token, expires_at: expiresAt, role });
  }

  function requireAuth(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not logged in.' });

    const session = db.queryOne('SELECT * FROM sessions WHERE token = ?', [token]);
    if (!session) return res.status(401).json({ error: 'Session not found — please log in again.' });
    if (new Date(session.expires_at) < new Date()) {
      db.run('DELETE FROM sessions WHERE token = ?', [token]);
      return res.status(401).json({ error: 'Session expired — please log in again.' });
    }
    req.role = session.role || 'master';
    if (req.role !== 'master') {
      const p = req.originalUrl.split('?')[0].replace(/^\/api/, '');
      if (!opsAllowed(req.method, p)) {
        return res.status(403).json({ error: 'Your login does not have access to this.' });
      }
      const origJson = res.json.bind(res);
      res.json = (body) => origJson(stripCosts(body));
    }
    next();
  }

  function masterOnly(req, res, next) {
    if (req.role !== 'master') return res.status(403).json({ error: 'Only the master PIN can do this.' });
    next();
  }

  // GET /api/auth/roles — which role PINs are set (never returns the PINs)
  function listRoles(req, res) {
    const rows = db.query('SELECT role, updated_at FROM role_pins');
    const out = {};
    ROLES.forEach(r => { const row = rows.find(x => x.role === r); out[r] = { is_set: !!row, updated_at: row?.updated_at || null }; });
    res.json(out);
  }
  // PUT /api/auth/roles/:role  { pin } — set / change a role PIN (6 digits)
  function setRolePin(req, res) {
    const role = req.params.role;
    if (!ROLES.includes(role)) return res.status(404).json({ error: 'Unknown role.' });
    const pin = String(req.body?.pin || '');
    if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: 'The PIN must be exactly 6 digits.' });
    if (pinMatches(pin, process.env.APP_PIN || '')) return res.status(400).json({ error: 'Choose a PIN different from the master PIN.' });
    for (const r of db.query('SELECT role, pin_hash FROM role_pins WHERE role != ?', [role])) {
      if (verifyPinHash(pin, r.pin_hash)) return res.status(400).json({ error: 'That PIN is already used by another role.' });
    }
    db.run('DELETE FROM role_pins WHERE role = ?', [role]);
    db.run("INSERT INTO role_pins (role, pin_hash, updated_at) VALUES (?, ?, datetime('now'))", [role, hashPin(pin)]);
    db.run('DELETE FROM sessions WHERE role = ?', [role]);   // sign out anyone on the old PIN
    res.json({ ok: true });
  }
  // DELETE /api/auth/roles/:role — turn the role off
  function clearRolePin(req, res) {
    const role = req.params.role;
    if (!ROLES.includes(role)) return res.status(404).json({ error: 'Unknown role.' });
    db.run('DELETE FROM role_pins WHERE role = ?', [role]);
    db.run('DELETE FROM sessions WHERE role = ?', [role]);
    res.json({ ok: true });
  }

  function me(req, res) {
    // requireAuth already ran (mounted before this), so reaching here means valid
    const header = req.headers['authorization'] || '';
    const token = header.slice(7);
    const session = db.queryOne('SELECT * FROM sessions WHERE token = ?', [token]);
    res.json({ ok: true, expires_at: session?.expires_at, role: session?.role || 'master' });
  }

  function logout(req, res) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) db.run('DELETE FROM sessions WHERE token = ?', [token]);
    res.json({ ok: true });
  }

  return { login, requireAuth, masterOnly, me, logout, listRoles, setRolePin, clearRolePin };
};
