const BASE = '/api/portal';

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export const portalApi = {
  getCatalogue: () => fetch(`${BASE}/catalogue`).then(handle),
  submitOrder: (payload) => fetch(`${BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(handle),
};
