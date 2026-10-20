// Exchange rate service — MYR per 1 SGD (Malaysia market, Oct 2026).
//
// • A daily cron stores one rate per day (source 'auto:<provider>').
// • A manual rate (source 'manual') for a date is never overwritten by the
//   auto-fetch, and wins for that date.
// • Every MY sale / MY operating cost saves the rate for ITS OWN date at the
//   time it is recorded → later rate changes never alter past records.
// • If the provider fails, the last known rate is simply kept and used.
const PROVIDERS = [
  { name: 'open.er-api.com', url: 'https://open.er-api.com/v6/latest/SGD',
    pick: j => j && j.rates && j.rates.MYR },
  { name: 'frankfurter.app', url: 'https://api.frankfurter.app/latest?from=SGD&to=MYR',
    pick: j => j && j.rates && j.rates.MYR },
];

function todaySG() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
}

// Rate to use for a date: the latest rate on/before it, else the earliest rate after it.
function getRateForDate(db, date) {
  const d = date || todaySG();
  const row = db.queryOne('SELECT date, myr_per_sgd, source FROM fx_rates WHERE date <= ? ORDER BY date DESC LIMIT 1', [d])
           || db.queryOne('SELECT date, myr_per_sgd, source FROM fx_rates ORDER BY date ASC LIMIT 1');
  return row || null;
}

function setRate(db, date, rate, source) {
  const r = parseFloat(rate);
  if (!(r > 0.5 && r < 20)) throw Object.assign(new Error('Rate looks wrong (expected MYR per 1 SGD, roughly 2–5)'), { status: 400 });
  db.run('INSERT OR REPLACE INTO fx_rates (date, myr_per_sgd, source) VALUES (?,?,?)', [date, Math.round(r * 1e6) / 1e6, source]);
}

async function fetchAndStore(db, fetchImpl = globalThis.fetch) {
  const date = todaySG();
  const existing = db.queryOne('SELECT source FROM fx_rates WHERE date = ?', [date]);
  if (existing && existing.source === 'manual') return { skipped: 'manual rate set for today' };
  for (const p of PROVIDERS) {
    try {
      const res = await fetchImpl(p.url, { signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rate = parseFloat(p.pick(await res.json()));
      if (!(rate > 0.5 && rate < 20)) throw new Error('implausible rate ' + rate);
      setRate(db, date, rate, 'auto:' + p.name);
      backfillMissing(db);
      return { date, rate, provider: p.name };
    } catch (e) {
      console.error(`⚠️  FX fetch via ${p.name} failed: ${e.message}`);
    }
  }
  return { error: 'all providers failed — keeping last known rate' };
}

// Rate to stamp on a new record. SG → null (not needed). MY → rate for the date,
// or a 400 telling KT to set one if the table is empty.
function stamp(db, market, date) {
  if (market !== 'MY') return { currency: 'SGD', fx_rate: null };
  const r = getRateForDate(db, date);
  if (!r) throw Object.assign(new Error('No MYR exchange rate yet — set one under Settings → Exchange rate (MYR per 1 SGD), then try again.'), { status: 400 });
  return { currency: 'MYR', fx_rate: r.myr_per_sgd };
}

// Any MY row recorded without a rate (legacy/test data, or entered before the
// first rate existed) gets the rate for its own date.
function backfillMissing(db) {
  for (const t of ['sales', 'operating_costs']) {
    const dates = db.query(`SELECT DISTINCT date FROM ${t} WHERE market='MY' AND fx_rate IS NULL`);
    for (const { date } of dates) {
      const r = getRateForDate(db, date);
      if (r) db.run(`UPDATE ${t} SET fx_rate=?, currency='MYR' WHERE market='MY' AND fx_rate IS NULL AND date=?`, [r.myr_per_sgd, date]);
    }
  }
}

module.exports = { getRateForDate, setRate, fetchAndStore, stamp, backfillMissing, todaySG };
