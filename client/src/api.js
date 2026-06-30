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
export const invoicesApi = {
  list:            (q)    => api.get(`/invoices${qs(q)}`),
  get:             (id)   => api.get(`/invoices/${id}`),
  uninvoiced:      (partner_id, q) => api.get(`/invoices/uninvoiced/${partner_id}${qs(q)}`),
  availableForDO:  (partner_id, q) => api.get(`/invoices/available-for-do/${partner_id}${qs(q)}`),
  generateInvoice: (data) => api.post('/invoices/generate-invoice', data),
  generateDO:      (data) => api.post('/invoices/generate-do', data),
  soaPreview:      (partner_id, q) => api.get(`/invoices/soa-preview/${partner_id}${qs(q)}`),
  generateSOA:     (data) => api.post('/invoices/generate-soa', data),
  markPaid:        (id)   => api.patch(`/invoices/${id}/pay`, {}),
  markUnpaid:      (id)   => api.patch(`/invoices/${id}/unpay`, {}),
  monitoring:      ()     => api.get('/invoices/monitoring'),
  delete:          (id)   => api.delete(`/invoices/${id}`),
};
export const consignmentApi = {
  partners:       ()           => api.get('/consignment/partners'),
  onHand:         (partner_id) => api.get(`/consignment/on-hand/${partner_id}`),
  placements:     (partner_id) => api.get(`/consignment/placements/${partner_id}`),
  returns:        (partner_id) => api.get(`/consignment/returns/${partner_id}`),
  counts:         (partner_id) => api.get(`/consignment/counts/${partner_id}`),
  snapshots:      (partner_id) => api.get(`/consignment/snapshots/${partner_id}`),
  addPlacement:   (data) => api.post('/consignment/placements', data),
  deletePlacement:(id)   => api.delete(`/consignment/placements/${id}`),
  addReturn:      (data) => api.post('/consignment/returns', data),
  deleteReturn:   (id)   => api.delete(`/consignment/returns/${id}`),
  submitCount:    (data) => api.post('/consignment/counts', data),
  deleteCount:    (id)   => api.delete(`/consignment/counts/${id}`),
  closeMonth:     (data) => api.post('/consignment/snapshot', data),
}; 
export const salesApi = { getAll: (q) => api.get(`/sales${qs(q)}`), summary: (q) => api.get(`/sales/summary${qs(q)}`), create: (s) => api.post('/sales',s), update: (id,s) => api.put(`/sales/${id}`,s), delete: (id) => api.delete(`/sales/${id}`), void: (id) => api.patch(`/sales/${id}/void`, {}) };
export const costsApi     = { getAll: (q) => api.get(`/costs${qs(q)}`), summary: (q) => api.get(`/costs/summary${qs(q)}`), create: (c) => api.post('/costs',c), update: (id,c) => api.put(`/costs/${id}`,c), delete: (id) => api.delete(`/costs/${id}`) };
export const inventoryApi = { getAll: (q) => api.get(`/inventory${qs(q)}`), set: (d) => api.post('/inventory/set',d), adjust: (d) => api.post('/inventory/adjust',d) };
export const reportsApi   = { pnl: (q) => api.get(`/reports/pnl${qs(q)}`), trend: (q) => api.get(`/reports/trend${qs(q)}`), partners: (q) => api.get(`/reports/partners${qs(q)}`), allChannels: (q) => api.get(`/reports/all-channels${qs(q)}`) };
export const partnerReportApi = { top: (q) => api.get(`/reports/partners${qs(q)}`) };
export const adjApi       = { getAll: (q) => api.get(`/adjustments${qs(q)}`), create: (d) => api.post('/adjustments',d) };

export const brandSkuApi = { detail: (q) => api.get(`/reports/brand-sku${qs(q)}`), };

// ── Sequential document number generator (localStorage counter per day) ──
// CS-YYYYMMDD-001, INV-YYYYMMDD-001, DO-YYYYMMDD-001 etc.
export function makeDocNum(prefix = 'CS') {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const key = `docnum_${prefix}_${ymd}`;
  const current = parseInt(localStorage.getItem(key) || '0');
  const next = current + 1;
  localStorage.setItem(key, String(next));
  return `${prefix}-${ymd}-${String(next).padStart(3,'0')}`;
}
