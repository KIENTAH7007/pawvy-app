import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronUp, Trash2, Upload, FileText, Truck } from 'lucide-react';
import { shipmentsApi, brandsApi, productsApi } from '../api';
import { Page, Card, KpiCard, Input, Select, Btn, Badge, Table, Divider, fmt } from '../components/ui';

const CURRENCIES = ['USD', 'GBP', 'EUR', 'KRW', 'CNY', 'SGD'];
const STATUS_COLOR = { ordered: '#888', shipped: '#378ADD', received: '#BA7517', costed: '#639922' };
const DOC_TYPES = [
  { value: 'supplier_invoice', label: 'Supplier invoice' },
  { value: 'credit_memo',      label: 'Credit memo' },
  { value: 'forwarder_invoice',label: 'Forwarder invoice' },
  { value: 'permit_invoice',   label: 'Permit declaration' },
  { value: 'gst_record',       label: 'GST payment record' },
  { value: 'avs_record',       label: 'AVS payment record' },
];
const FLAG_COLOR = { healthy: '#639922', watch: '#BA7517', risky: '#E24B4A', no_reference: '#888' };
const FLAG_LABEL = { healthy: 'Healthy', watch: 'Watch', risky: 'Risky', no_reference: 'No reference cost' };

export default function Shipments() {
  const [shipments, setShipments] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null); // full shipment detail incl. line_items/variance/documents
  const [products, setProducts] = useState([]); // products for the current shipment's brand
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => shipmentsApi.getAll().then(s => { setShipments(s); setLoading(false); });
  useEffect(() => { load(); brandsApi.getAll().then(setBrands); }, []);

  async function newShipment() {
    const s = await shipmentsApi.create({ currency: 'USD' });
    await load();
    expand(s.id);
  }

  async function expand(id) {
    if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(id);
    setError('');
    const d = await shipmentsApi.get(id);
    setDetail(d);
    if (d.brand_id) productsApi.getAll({ brand_id: d.brand_id, active: true }).then(setProducts);
  }

  async function refreshDetail(id) {
    const d = await shipmentsApi.get(id);
    setDetail(d);
    load();
  }

  async function saveHeader(fields) {
    setBusy(true);
    try {
      await shipmentsApi.update(detail.id, fields);
      if (fields.brand_id) productsApi.getAll({ brand_id: fields.brand_id, active: true }).then(setProducts);
      await refreshDetail(detail.id);
    } finally { setBusy(false); }
  }

  async function addLine() {
    if (!products.length) { setError('Select a brand first, then add line items.'); return; }
    await shipmentsApi.addLineItem(detail.id, { product_id: products[0].id, qty_ordered: 0, qty_received: 0, unit_cost_original_currency: 0 });
    refreshDetail(detail.id);
  }

  async function updateLine(liId, fields) {
    await shipmentsApi.updateLineItem(liId, fields);
    refreshDetail(detail.id);
  }

  async function removeLine(liId) {
    await shipmentsApi.deleteLineItem(liId);
    refreshDetail(detail.id);
  }

  async function selectSku(li, productId) {
    // Prefill unit cost + weight from the cost reference table, if available
    const ref = await shipmentsApi.costReferenceHistory(productId);
    const latest = ref[0];
    // product_id isn't in the editable field list server-side (by design —
    // changing a line's SKU is rare enough to just delete + re-add cleanly)
    await shipmentsApi.deleteLineItem(li.id);
    await shipmentsApi.addLineItem(detail.id, {
      product_id: productId, qty_ordered: li.qty_ordered, qty_received: li.qty_received,
      unit_cost_original_currency: latest?.cost_original_currency ?? li.unit_cost_original_currency,
      weight_per_unit: latest?.weight_per_unit ?? li.weight_per_unit,
    });
    refreshDetail(detail.id);
  }

  async function markReceived() {
    setBusy(true);
    try { await shipmentsApi.markReceived(detail.id); await refreshDetail(detail.id); }
    finally { setBusy(false); }
  }

  async function calculateCost() {
    setBusy(true); setError('');
    try {
      await shipmentsApi.calculateCost(detail.id, {});
      await refreshDetail(detail.id);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function uploadDoc(documentType, file) {
    const reader = new FileReader();
    reader.onload = async () => {
      await shipmentsApi.uploadDocument(detail.id, { document_type: documentType, file_name: file.name, file_data: reader.result });
      refreshDetail(detail.id);
    };
    reader.readAsDataURL(file);
  }

  async function deleteShipment(id) {
    if (!window.confirm('Delete this shipment? This cannot be undone.')) return;
    await shipmentsApi.delete(id);
    setExpandedId(null); setDetail(null);
    load();
  }

  // ── Summary metrics ────────────────────────────────────────────
  const thisMonth = new Date().toISOString().slice(0, 7);
  const inMonth = shipments.filter(s => (s.costed_date || s.created_at || '').startsWith(thisMonth));
  const totalLanded = inMonth.reduce((sum, s) => sum + (s.total_landed_cost || 0), 0);
  const costedCount = shipments.filter(s => s.status === 'costed').length;

  return (
    <Page
      title="Shipments"
      subtitle="Supplier orders, landed cost, and cost variance"
      action={<Btn onClick={newShipment}><Plus size={14} /> New shipment</Btn>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Shipments this month" value={inMonth.length} />
        <KpiCard label="Total landed cost (month)" value={`$${totalLanded.toFixed(2)}`} />
        <KpiCard label="Shipments costed" value={costedCount} />
        <KpiCard label="Total shipments" value={shipments.length} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)' }}>Loading…</div>
      ) : shipments.length === 0 ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)', fontSize: 13 }}>No shipments yet. Click "New shipment" to start one.</div></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shipments.map(s => {
            const isOpen = expandedId === s.id;
            return (
              <Card key={s.id}>
                <div onClick={() => expand(s.id)} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {s.shipment_code}
                      <Badge color={STATUS_COLOR[s.status]}>{s.status}</Badge>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--cream-30)', marginTop: 3 }}>
                      {s.brand_name || 'No brand set'}{s.supplier_name ? ` · ${s.supplier_name}` : ''}
                      {s.arrival_date ? ` · Arrival ${fmt.date(s.arrival_date)}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cream-60)' }}>{s.line_item_count} item{s.line_item_count !== 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', minWidth: 90, textAlign: 'right' }}>
                    {s.total_landed_cost ? `$${s.total_landed_cost.toFixed(2)}` : '—'}
                  </div>
                  {isOpen ? <ChevronUp size={16} color="var(--cream-30)" /> : <ChevronDown size={16} color="var(--cream-30)" />}
                </div>

                {isOpen && detail && detail.id === s.id && (
                  <ShipmentDetailPanel
                    detail={detail}
                    brands={brands}
                    products={products}
                    busy={busy}
                    error={error}
                    onSaveHeader={saveHeader}
                    onAddLine={addLine}
                    onUpdateLine={updateLine}
                    onRemoveLine={removeLine}
                    onSelectSku={selectSku}
                    onMarkReceived={markReceived}
                    onCalculateCost={calculateCost}
                    onUploadDoc={uploadDoc}
                    onDelete={() => deleteShipment(s.id)}
                  />
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}

function ShipmentDetailPanel({
  detail, brands, products, busy, error,
  onSaveHeader, onAddLine, onUpdateLine, onRemoveLine, onSelectSku,
  onMarkReceived, onCalculateCost, onUploadDoc, onDelete,
}) {
  const [header, setHeader] = useState(detail);
  useEffect(() => { setHeader(detail); }, [detail]);

  const hf = (k, v) => setHeader(h => ({ ...h, [k]: v }));

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
      {error && (
        <div style={{ background: 'rgba(226,75,74,.1)', border: '1px solid rgba(226,75,74,.3)', color: '#E24B4A', padding: '8px 12px', borderRadius: 7, fontSize: 12 }}>
          {error}
        </div>
      )}

      <Divider label="Shipment info" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <Select label="Brand" value={header.brand_id || ''} onChange={e => hf('brand_id', e.target.value)}>
          <option value="">Select brand</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Input label="Supplier" value={header.supplier_name || ''} onChange={e => hf('supplier_name', e.target.value)} />
        <Select label="Currency" value={header.currency || 'USD'} onChange={e => hf('currency', e.target.value)}>
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select label="Warehouse (received into)" value={header.received_warehouse || 'Storhub'} disabled>
          <option>Storhub</option>
        </Select>
        <Input label="Order date" type="date" value={header.order_date || ''} onChange={e => hf('order_date', e.target.value)} />
        <Input label="Arrival date" type="date" value={header.arrival_date || ''} onChange={e => hf('arrival_date', e.target.value)} />
        <Input label="Costed date" type="date" value={header.costed_date || ''} disabled />
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <Btn size="sm" onClick={() => onSaveHeader({
            brand_id: header.brand_id || null, supplier_name: header.supplier_name,
            currency: header.currency, order_date: header.order_date, arrival_date: header.arrival_date,
          })} disabled={busy}>Save details</Btn>
        </div>
      </div>

      <Divider label="Line items" />
      {!header.brand_id && <div style={{ fontSize: 12, color: 'var(--cream-30)' }}>Select and save a brand above to add line items.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(detail.line_items || []).map(li => (
          <div key={li.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
            <Select label="SKU" value={li.product_id} onChange={e => onSelectSku(li, e.target.value)}>
              {products.map(p => <option key={p.id} value={p.id}>{p.item_series}{p.variation ? ' — ' + p.variation : ''}</option>)}
            </Select>
            <Input label="Qty ordered" type="number" value={li.qty_ordered} onChange={e => onUpdateLine(li.id, { qty_ordered: parseFloat(e.target.value) || 0 })} />
            <Input label="Qty received" type="number" value={li.qty_received} onChange={e => onUpdateLine(li.id, { qty_received: parseFloat(e.target.value) || 0 })} />
            <Input label={`Unit cost (${header.currency})`} type="number" step="0.01" value={li.unit_cost_original_currency} onChange={e => onUpdateLine(li.id, { unit_cost_original_currency: parseFloat(e.target.value) || 0 })} />
            <Input label="Weight/unit (kg)" type="number" step="0.01" value={li.weight_per_unit || ''} onChange={e => onUpdateLine(li.id, { weight_per_unit: e.target.value ? parseFloat(e.target.value) : null })} />
            <button onClick={() => onRemoveLine(li.id)} style={{ background: 'none', border: 'none', color: 'var(--cream-30)', cursor: 'pointer', padding: '8px 4px' }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      {header.brand_id && <Btn size="sm" variant="secondary" onClick={onAddLine}><Plus size={13} /> Add line item</Btn>}

      <Divider label="Cost inputs" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <Input label={`Actual FX rate (${header.currency} → SGD)`} type="number" step="0.0001" value={header.fx_rate_actual || ''} onChange={e => hf('fx_rate_actual', parseFloat(e.target.value) || null)} />
        <Input label="FX processing charge (SGD)" type="number" step="0.01" value={header.fx_processing_charge || ''} onChange={e => hf('fx_processing_charge', parseFloat(e.target.value) || 0)} />
        <Input label="Cashback (SGD)" type="number" step="0.01" value={header.cashback || ''} onChange={e => hf('cashback', parseFloat(e.target.value) || 0)} />
        <Input label="Forwarder invoice (SGD)" type="number" step="0.01" value={header.forwarder_invoice_value || ''} onChange={e => hf('forwarder_invoice_value', parseFloat(e.target.value) || 0)} />
        <Input label="Permit declaration invoice (SGD)" type="number" step="0.01" value={header.permit_invoice_value || ''} onChange={e => hf('permit_invoice_value', parseFloat(e.target.value) || 0)} />
        <Input label="AVS payment (SGD)" type="number" step="0.01" value={header.avs_payment || ''} onChange={e => hf('avs_payment', parseFloat(e.target.value) || 0)} />
        <Select label="Freight apportion method" value={header.freight_apportion_method || 'value'} onChange={e => hf('freight_apportion_method', e.target.value)}>
          <option value="value">Value-based</option>
          <option value="weight">Weight-based (requires weight/unit on every line)</option>
        </Select>
        <Input label="GST (9% of product + freight, auto)" value={header.gst_amount ? `$${header.gst_amount.toFixed(2)}` : 'Calculated on costing'} disabled />
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <Btn size="sm" onClick={() => onSaveHeader({
            fx_rate_actual: header.fx_rate_actual, fx_processing_charge: header.fx_processing_charge, cashback: header.cashback,
            forwarder_invoice_value: header.forwarder_invoice_value, permit_invoice_value: header.permit_invoice_value,
            avs_payment: header.avs_payment, freight_apportion_method: header.freight_apportion_method,
          })} disabled={busy}>Save cost inputs</Btn>
        </div>
      </div>

      <Divider label="Documents" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {DOC_TYPES.map(t => {
          const uploaded = (detail.documents || []).filter(d => d.document_type === t.value);
          return (
            <div key={t.value} style={{ border: '1px dashed var(--border)', borderRadius: 7, padding: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--cream-60)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={12} /> {t.label}
              </div>
              {uploaded.map(d => (
                <div key={d.id} style={{ fontSize: 10, color: 'var(--cream-30)', marginBottom: 2 }}>{d.file_name || 'File'} ✓</div>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--orange)', cursor: 'pointer' }}>
                <Upload size={12} /> Upload
                <input type="file" style={{ display: 'none' }} onChange={e => e.target.files[0] && onUploadDoc(t.value, e.target.files[0])} />
              </label>
            </div>
          );
        })}
      </div>

      <Divider label="Status & actions" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {header.status === 'ordered' && <Btn size="sm" variant="secondary" onClick={onMarkReceived} disabled={busy}><Truck size={13} /> Mark as received</Btn>}
        <Btn size="sm" onClick={onCalculateCost} disabled={busy}>{header.status === 'costed' ? 'Recalculate & re-cost' : 'Calculate landed cost & mark costed'}</Btn>
        <Btn size="sm" variant="secondary" onClick={onDelete} disabled={busy}><Trash2 size={13} /> Delete shipment</Btn>
      </div>
      <div style={{ fontSize: 11, color: 'var(--cream-30)' }}>
        Marking "received" does not yet update Inventory — that automatic sync is a separate upcoming step, built and tested in isolation before it touches live stock.
      </div>

      {detail.variance && detail.variance.length > 0 && (
        <>
          <Divider label="Cost variance vs Products & Pricing" />
          <Table
            cols={[
              { key: 'product_id', label: 'SKU', render: (v) => {
                const li = (detail.line_items || []).find(l => l.product_id === v);
                return li ? `${li.item_series}${li.variation ? ' — ' + li.variation : ''}` : v;
              }},
              { key: 'landed_cost', label: 'Landed cost', align: 'right', render: v => `$${v.toFixed(2)}` },
              { key: 'set_cost_price', label: 'Set cost', align: 'right', render: v => `$${v.toFixed(2)}` },
              { key: 'variance_pct', label: 'Diff', align: 'right', render: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` },
              { key: 'flag', label: 'Flag', align: 'center', render: v => <Badge color={FLAG_COLOR[v]}>{FLAG_LABEL[v]}</Badge> },
            ]}
            rows={detail.variance}
            keyField="id"
          />
          <div style={{ fontSize: 11, color: 'var(--cream-30)' }}>
            Updating Products & Pricing's cost price is a separate, manual step — head to Products & Pricing to update any SKU flagged "Risky" after checking its trend over the last few shipments.
          </div>
        </>
      )}
    </div>
  );
}
