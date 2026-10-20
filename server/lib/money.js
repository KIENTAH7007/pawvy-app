// Currency-aware SQL fragments — single source of truth for revenue / COGS /
// profit across sales.js and reports.js (Malaysia market, Oct 2026).
//
// Storage model: every sale row is stored in ITS OWN market currency
// (SG → SGD, MY → MYR) — unit_price, platform_fee_amt, shipping_*,
// stripe_fee_amt. unit_cost is ALWAYS SGD (product cost). `fx_rate` on the
// row is MYR per 1 SGD, saved when the sale was recorded.
//
// Two modes:
//   'native' — figures in the row's own currency. Only meaningful when the
//              query is limited to ONE market. Cost is converted to the
//              market currency: MY cost = unit_cost × fx_rate.
//   'sgd'    — everything converted to SGD equivalent (MY price-side
//              figures ÷ fx_rate; cost stays as-is). Used for "All markets"
//              and for the "MY in SGD" column on Compare.
// SG rows have fx_rate NULL → factor 1, so SG numbers never change.
const MARKETPLACE = `('Shopee','Lazada','Amazon','TikTok Shop')`;

// Conversion factor for a row (MYR per SGD for MY rows, 1 for everything else)
const FX = `(CASE WHEN s.market='MY' THEN COALESCE(s.fx_rate,1) ELSE 1 END)`;

const REV_NATIVE = `(CASE WHEN s.channel IN ${MARKETPLACE}
  THEN s.qty * s.unit_price + COALESCE(s.shipping_charged,0)
  ELSE s.qty * s.unit_price - s.platform_fee_amt + COALESCE(s.shipping_charged,0)
END)`;

// everything that is in the sale's own currency, net of costs other than product cost
const PRICE_SIDE = `(s.qty * s.unit_price - s.platform_fee_amt
  + COALESCE(s.shipping_charged,0) - COALESCE(s.shipping_cost,0) - COALESCE(s.stripe_fee_amt,0))`;

function revenue(mode)  { return mode === 'sgd' ? `(${REV_NATIVE} / ${FX})` : REV_NATIVE; }
function cogs(mode)     { return mode === 'sgd' ? `(s.qty * s.unit_cost)` : `(s.qty * s.unit_cost * ${FX})`; }
function profit(mode)   {
  return mode === 'sgd'
    ? `(${PRICE_SIDE} / ${FX} - s.qty * s.unit_cost)`
    : `(${PRICE_SIDE} - s.qty * s.unit_cost * ${FX})`;
}
// Operating costs: row currency in `amount`, fx saved for MY rows.
const OPEX_FX = `(CASE WHEN market='MY' THEN COALESCE(fx_rate,1) ELSE 1 END)`;
function opex(mode)     { return mode === 'sgd' ? `(amount / ${OPEX_FX})` : `amount`; }

// Decide the mode from a request: one market chosen → native in that market's
// currency (unless as=sgd is asked for); no market ("All") → SGD equivalent.
function modeFor(query) {
  const { market, as } = query || {};
  if (!market) return 'sgd';
  return String(as || '').toLowerCase() === 'sgd' ? 'sgd' : 'native';
}
function currencyFor(query) {
  const { market, as } = query || {};
  if (!market) return 'SGD';
  if (String(as || '').toLowerCase() === 'sgd') return 'SGD';
  return market === 'MY' ? 'MYR' : 'SGD';
}

module.exports = { FX, REV_NATIVE, PRICE_SIDE, revenue, cogs, profit, opex, modeFor, currencyFor, MARKETPLACE };
