const BASE = '/api/pos';

// Two links, one POS: /pos = Singapore (SGD, PayNow); /pos/my = Malaysia (MYR RRP, Touch 'n Go).
export const MARKET = /\/pos\/my\/?$/i.test(window.location.pathname) ? 'MY' : 'SG';
export const CURRENCY = MARKET === 'MY' ? 'MYR' : 'SGD';          // data code (unchanged)
export const CURRENCY_LABEL = MARKET === 'MY' ? 'RM' : 'SGD';      // what people see
const Q = MARKET === 'MY' ? '?market=MY' : '';

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export const posApi = {
  getCatalogue: () => fetch(`${BASE}/catalogue${Q}`).then(handle),
  getActiveCampaign: () => fetch(`${BASE}/active-campaign${Q}`).then(handle),
  checkout: (payload) => fetch(`${BASE}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, market: MARKET }),
  }).then(handle),
};
