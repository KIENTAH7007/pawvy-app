const BASE = '/api/pos';

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export const posApi = {
  getCatalogue: () => fetch(`${BASE}/catalogue`).then(handle),
  checkout: (payload) => fetch(`${BASE}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(handle),
};
