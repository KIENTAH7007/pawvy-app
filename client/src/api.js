const BASE = '/api';

async function req(method, path, body) {
  const token = localStorage.getItem('pawvy_auth_token');
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth')) {
    localStorage.removeItem('pawvy_auth_token');
    localStorage.removeItem('pawvy_auth_expires');
    window.dispatchEvent(new Event('pawvy:session-expired'));
  }
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
export const productsApi  = { getAll: (q) => api.get(`/products${qs(q)}`), get: (id) => api.get(`/products/${id}`), create: (p) => api.post('/products',p), update: (id,p) => api.put(`/products/${id}`,p), delete: (id) => api.delete(`/products/${id}`), uploadImage: (id, image_data) => api.post(`/products/${id}/image`, { image_data }), deleteImage: (id) => api.delete(`/products/${id}/image`), setPortalOrder: (id, portal_sort_order) => api.post(`/products/${id}/portal-order`, { portal_sort_order }) };
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
export const inventoryApi = {
  levels:        (q)    => api.get(`/inventory/levels${qs(q)}`),
  movements:     (product_id) => api.get(`/inventory/movements/${product_id}`),
  restock:       (data) => api.post('/inventory/restock', data),
  transfer:      (data) => api.post('/inventory/transfer', data),
  writeoff:      (data) => api.post('/inventory/writeoff', data),
  adjustment:    (data) => api.post('/inventory/adjustment', data),
  importOpening: ()     => api.post('/inventory/import-opening', {}),
};
export const forecastApi = {
  restockRecommendations: (q) => api.get(`/forecast/restock-recommendations${qs(q)}`),
};

export const partnerAddressesApi = {
  list:   (partner_id) => api.get(`/partners/${partner_id}/addresses`),
  create: (partner_id, data) => api.post(`/partners/${partner_id}/addresses`, data),
  update: (partner_id, addr_id, data) => api.put(`/partners/${partner_id}/addresses/${addr_id}`, data),
  delete: (partner_id, addr_id) => api.delete(`/partners/${partner_id}/addresses/${addr_id}`),
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
  resetConsignment: (partner_id) => api.delete(`/consignment/reset/${partner_id}`),
  closeMonth:     (data) => api.post('/consignment/snapshot', data),
}; 
export const salesApi = { getAll: (q) => api.get(`/sales${qs(q)}`), summary: (q) => api.get(`/sales/summary${qs(q)}`), create: (s) => api.post('/sales',s), update: (id,s) => api.put(`/sales/${id}`,s), updateDetails: (id,s) => api.patch(`/sales/${id}/details`,s), delete: (id) => api.delete(`/sales/${id}`), void: (id) => api.patch(`/sales/${id}/void`, {}) };
export const ordersApi     = { list: (q) => api.get(`/orders${qs(q)}`), get: (id) => api.get(`/orders/${id}`), update: (id,d) => api.put(`/orders/${id}`,d), approve: (id,d) => api.post(`/orders/${id}/approve`,d), reject: (id) => api.post(`/orders/${id}/reject`,{}), void: (id) => api.post(`/orders/${id}/void`,{}) };
export const costsApi     = { getAll: (q) => api.get(`/costs${qs(q)}`), summary: (q) => api.get(`/costs/summary${qs(q)}`), trend: (q) => api.get(`/costs/trend${qs(q)}`), create: (c) => api.post('/costs',c), update: (id,c) => api.put(`/costs/${id}`,c), delete: (id) => api.delete(`/costs/${id}`) };
export const reportsApi   = { pnl: (q) => api.get(`/reports/pnl${qs(q)}`), trend: (q) => api.get(`/reports/trend${qs(q)}`), partners: (q) => api.get(`/reports/partners${qs(q)}`), allChannels: (q) => api.get(`/reports/all-channels${qs(q)}`), upsell: () => api.get('/reports/upsell'), upsellDetail: (source) => api.get(`/reports/upsell/detail${qs({source})}`), channelPerformance: (q) => api.get(`/reports/channel-performance${qs(q)}`) };
export const partnerReportApi = { top: (q) => api.get(`/reports/partners${qs(q)}`) };
export const adjApi       = { getAll: (q) => api.get(`/adjustments${qs(q)}`), create: (d) => api.post('/adjustments',d) };
export const shipmentsApi = {
  getAll:   (q) => api.get(`/shipments${qs(q)}`),
  get:      (id) => api.get(`/shipments/${id}`),
  create:   (data) => api.post('/shipments', data),
  update:   (id, data) => api.put(`/shipments/${id}`, data),
  delete:   (id) => api.delete(`/shipments/${id}`),
  addLineItem:    (id, data) => api.post(`/shipments/${id}/line-items`, data),
  updateLineItem: (liId, data) => api.put(`/shipments/line-items/${liId}`, data),
  deleteLineItem: (liId) => api.delete(`/shipments/line-items/${liId}`),
  markReceived: (id) => api.post(`/shipments/${id}/receive`, {}),
  voidShipment: (id) => api.post(`/shipments/${id}/void`, {}),
  calculateCost: (id, data) => api.post(`/shipments/${id}/cost`, data || {}),
  previewCost:  (id, overrides) => api.post(`/shipments/${id}/preview`, { overrides: overrides || {} }),
  uploadDocument: (id, data) => api.post(`/shipments/${id}/documents`, data),
  deleteDocument: (docId) => api.delete(`/shipments/documents/${docId}`),
  costReference:        (q)     => api.get(`/shipments/cost-reference${qs(q)}`),
  costReferenceHistory: (pid)   => api.get(`/shipments/cost-reference/${pid}/history`),
  addCostReference:     (data)  => api.post('/shipments/cost-reference', data),
  deleteCostReference:  (id)    => api.delete(`/shipments/cost-reference/${id}`),
  documents:       (q)  => api.get(`/shipments/documents${qs(q)}`),
  documentGet:     (id) => api.get(`/shipments/documents/${id}`),
  documentDelete:  (id) => api.delete(`/shipments/documents/${id}`),
  variance:        (q)  => api.get(`/shipments/variance${qs(q)}`),
  trends:          (q)  => api.get(`/shipments/trends${qs(q)}`),
};

export const brandSkuApi = { detail: (q) => api.get(`/reports/brand-sku${qs(q)}`), };
export const customerAdminApi = {
  getAll: () => api.get('/customer-admin/customers'),
  get: (id) => api.get(`/customer-admin/customers/${id}`),
  resendVerify: (id) => api.post(`/customer-admin/customers/${id}/resend-verify`, {}),
  awardStamp: (id, body) => api.post(`/customer-admin/customers/${id}/stamp`, body),
  delete: (id) => api.delete(`/customer-admin/customers/${id}`),
};
export const restockApi = {
  getAll:  (q) => api.get(`/restock${qs(q)}`),
  get:     (id) => api.get(`/restock/${id}`),
  create:  (data) => api.post('/restock', data),
  update:  (id, data) => api.put(`/restock/${id}`, data),
  delete:  (id) => api.delete(`/restock/${id}`),
  addItem: (id, data) => api.post(`/restock/${id}/items`, data),
  addItemsBulk: (id, items) => api.post(`/restock/${id}/items/bulk`, { items }),
  updateItem: (itemId, data) => api.put(`/restock/items/${itemId}`, data),
  deleteItem: (itemId) => api.delete(`/restock/items/${itemId}`),
  suggestions: () => api.get('/restock/suggestions'),
  complete: (id) => api.post(`/restock/${id}/complete`, {}),
};

export const authApi = {
  login:  (pin) => api.post('/auth/login', { pin }),
  logout: ()    => api.post('/auth/logout', {}),
  me:     ()    => api.get('/auth/me'),
};

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
