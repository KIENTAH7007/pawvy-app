const BASE = '/api/portal';

// Two links, one portal: /order = Singapore (SGD), /order/my = Malaysia (MYR, MY wholesale prices).
// The server decides prices and the order's market from this flag; stock is the same shared stock.
export const MARKET = /\/order\/my\/?$/i.test(window.location.pathname) ? 'MY' : 'SG';
export const CURRENCY = MARKET === 'MY' ? 'MYR' : 'SGD';
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
