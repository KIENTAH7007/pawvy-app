// Shared date-string helpers (Aug 2026)
//
// Every page that needed a "today" or "this month" default used
// `new Date().toISOString().slice(0, 10)` (or `.slice(0, 7)` for a
// month). That's broken for Singapore: .toISOString() first converts
// to UTC, and Singapore is UTC+8 — so any time between midnight and
// 8am SGT, it silently returns YESTERDAY's date instead of today's.
// For month-boundary math (like Sales Ledger's "last day of this
// month"), the same UTC conversion shifts the date back a day
// regardless of time of day, since the boundary itself is built at
// local midnight.
//
// These helpers build the string from the Date object's own local
// components instead, so they're never affected by the UTC offset.
// Pawvy operates in Singapore, so "local" here means SGT for anyone
// actually using the app from Singapore — this doesn't force UTC+8
// for a browser in a different timezone, it just stops silently
// converting through UTC and back, which was the actual bug.

export function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localMonthStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Start and end of the current calendar month, as local date strings —
// replaces the currentMonthRange() function that used to be duplicated
// (with the same bug) in both Sales.jsx and Costs.jsx.
export function currentMonthRange(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: localDateStr(from), to: localDateStr(to) };
}
