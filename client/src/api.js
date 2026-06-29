const BASE = '/api';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  get:    (path)        => req('GET',    path),
  post:   (path, body)  => req('POST',   path, body),
  put:    (path, body)  => req('PUT',    path, body),
  patch:  (path, body)  => req('PATCH',  path, body),
  delete: (path)        => req('DELETE', path),
};

const qs = (q) => q ? '?' + new URLSearchParams(q) : '';

export const brandsApi    = { getAll: () => api.get('/brands'), create: (b) => api.post('/brands',b), update: (id,b) => api.put(`/brands/${id}`,b) };
export const productsApi  = { getAll: (q) => api.get(`/products${qs(q)}`), get: (id) => api.get(`/products/${id}`), create: (p) => api.post('/products',p), update: (id,p) => api.put(`/products/${id}`,p), delete: (id) => api.delete(`/products/${id}`) };
export const partnersApi  = { getAll: (q) => api.get(`/partners${qs(q)}`), get: (id) => api.get(`/partners/${id}`), create: (p) => api.post('/partners',p), update: (id,p) => api.put(`/partners/${id}`,p) };
export const consignmentApi = {
  partners:   ()           => api.get('/consignment/partners'),
  onHand:     (partner_id) => api.get(`/consignment/on-hand/${partner_id}`),
  placements: (partner_id) => api.get(`/consignment/placements/${partner_id}`),
  returns:    (partner_id) => api.get(`/consignment/returns/${partner_id}`),
  counts:     (partner_id) => api.get(`/consignment/counts/${partner_id}`),
  addPlacement:   (data) => api.post('/consignment/placements', data),
  deletePlacement:(id)   => api.delete(`/consignment/placements/${id}`),
  addReturn:      (data) => api.post('/consignment/returns', data),
  deleteReturn:   (id)   => api.delete(`/consignment/returns/${id}`),
  submitCount:    (data) => api.post('/consignment/counts', data),
  deleteCount:    (id)   => api.delete(`/consignment/counts/${id}`),
}; 
export const salesApi = { getAll: (q) => api.get(`/sales${qs(q)}`), summary: (q) => api.get(`/sales/summary${qs(q)}`), create: (s) => api.post('/sales',s), update: (id,s) => api.put(`/sales/${id}`,s), delete: (id) => api.delete(`/sales/${id}`), void: (id) => api.patch(`/sales/${id}/void`, {}) };
export const costsApi     = { getAll: (q) => api.get(`/costs${qs(q)}`), summary: (q) => api.get(`/costs/summary${qs(q)}`), create: (c) => api.post('/costs',c), update: (id,c) => api.put(`/costs/${id}`,c), delete: (id) => api.delete(`/costs/${id}`) };
export const inventoryApi = { getAll: (q) => api.get(`/inventory${qs(q)}`), set: (d) => api.post('/inventory/set',d), adjust: (d) => api.post('/inventory/adjust',d) };
export const reportsApi   = { pnl: (q) => api.get(`/reports/pnl${qs(q)}`), trend: (q) => api.get(`/reports/trend${qs(q)}`), partners: (q) => api.get(`/reports/partners${qs(q)}`) };
export const partnerReportApi = { top: (q) => api.get(`/reports/partners${qs(q)}`) };
export const adjApi       = { getAll: (q) => api.get(`/adjustments${qs(q)}`), create: (d) => api.post('/adjustments',d) };
export const invoicesApi  = { getAll: (q) => api.get(`/invoices${qs(q)}`), get: (id) => api.get(`/invoices/${id}`), create: (d) => api.post('/invoices',d) };

export const brandSkuApi = { detail: (q) => api.get(`/reports/brand-sku${qs(q)}`), };
