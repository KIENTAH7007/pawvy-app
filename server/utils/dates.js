// Shared date-string helpers (Aug 2026) — server-side counterpart to
// client/src/utils/dates.js. Same bug, same fix: `new Date()
// .toISOString().slice(0, 10)` looks correct but silently returns
// YESTERDAY's date for any request made between midnight and 8am SGT,
// because .toISOString() converts to UTC first and Singapore is
// UTC+8. Confirmed empirically — see the delivery README for the
// before/after test.
//
// This is for "what SGT calendar day is it right now" business logic
// (invoice numbering, discount windows, restock dates, order dates,
// etc.) — NOT for timestamps recording an exact moment (token
// expiry, credited_at, session expiry), which should keep using real
// UTC ISO strings via new Date().toISOString() as before. Those are
// unaffected by this bug since they're stored/compared as full
// instants, not truncated to a calendar date.

function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function localMonthStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

module.exports = { localDateStr, localMonthStr };
