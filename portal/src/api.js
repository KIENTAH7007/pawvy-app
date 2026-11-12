const BASE = '/api/portal';

// Two links, one portal: /order = Singapore (SGD), /order/my = Malaysia (MYR, MY wholesale prices).
// The server decides prices and the order's market from this flag; stock is the same shared stock.
export const MARKET = /\/order\/my\/?$/i.test(window.location.pathname) ? 'MY' : 'SG';
export const CURRENCY = MARKET === 'MY' ? 'MYR' : 'SGD';          // data code (unchanged)
export const CURRENCY_LABEL = MARKET === 'MY' ? 'RM' : 'SGD';      // what people see
// Free-delivery amount (>=): SGD 200 / MYR 600 (West Malaysia). Rebate tiers are SG only.
export const FOC_AMOUNT = MARKET === 'MY' ? 600 : 200;
export const MONEY_SYMBOL = MARKET === 'MY' ? 'RM' : '$';
const Q = MARKET === 'MY' ? '?market=MY' : '';

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export const portalApi = {
  getCatalogue: () => fetch(`${BASE}/catalogue${Q}`).then(handle),
  getTopSellers: () => fetch(`${BASE}/top-sellers${Q}`).then(handle),
  submitOrder: (payload) => fetch(`${BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, market: MARKET }),
  }).then(handle),
};
