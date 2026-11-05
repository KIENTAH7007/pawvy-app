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
    if (!pinMatches(pin, correctPin)) {
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
    db.run('INSERT INTO sessions (token, expires_at) VALUES (?, ?)', [token, expiresAt]);
    // Housekeeping — drop old expired sessions so the table doesn't grow forever
    db.run("DELETE FROM sessions WHERE expires_at < datetime('now', '-7 days')");
    res.json({ token, expires_at: expiresAt });
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
    next();
  }

  function me(req, res) {
    // requireAuth already ran (mounted before this), so reaching here means valid
    const header = req.headers['authorization'] || '';
    const token = header.slice(7);
    const session = db.queryOne('SELECT * FROM sessions WHERE token = ?', [token]);
    res.json({ ok: true, expires_at: session?.expires_at });
  }

  function logout(req, res) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) db.run('DELETE FROM sessions WHERE token = ?', [token]);
    res.json({ ok: true });
  }

  return { login, requireAuth, me, logout };
};
