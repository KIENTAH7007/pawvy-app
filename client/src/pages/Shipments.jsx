import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronUp, Trash2, Upload, FileText, Truck, Ban, Calculator } from 'lucide-react';
import { shipmentsApi, brandsApi, productsApi } from '../api';
import { Page, Card, KpiCard, Input, Select, Btn, Badge, Table, Divider, fmt } from '../components/ui';

const CURRENCIES = ['USD', 'GBP', 'EUR', 'KRW', 'CNY', 'SGD'];
const STATUS_COLOR = { ordered: '#888', shipped: '#378ADD', received: '#BA7517', costed: '#639922', voided: '#555' };
const DOC_TYPES = [
  { value: 'supplier_invoice', label: 'Supplier invoice' },
  { value: 'credit_memo',      label: 'Credit memo' },
  { value: 'forwarder_invoice',label: 'Forwarder invoice' },
  { value: 'permit_invoice',   label: 'Permit declaration' },
  { value: 'gst_record',       label: 'GST payment record' },
  { value: 'avs_record',       label: 'AVS payment record' },
];
const FLAG_COLOR = { healthy: '#639922', watch: '#BA7517', risky: '#E24B4A', favorable: '#378ADD', verify: '#9333EA', no_reference: '#888' };
const FLAG_LABEL = { healthy: 'Healthy', watch: 'Watch', risky: 'Risky', favorable: 'Favorable', verify: 'Verify data', no_reference: 'No reference cost' };

export default function Shipments() {
  const [shipments, setShipments] = useState([]);
  const [brands, setBrands] = useState([]);
  const [filters, setFilters] = useState({ brand_id: '', from: '', to: '' });
  const [statusGroup, setStatusGroup] = useState('not_completed'); // 'all' | 'not_completed' | 'done'
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null); // full shipment detail incl. line_items/variance/documents
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [monthVariance, setMonthVariance] = useState(0);

  const load = () => shipmentsApi.getAll(filters).then(s => { setShipments(s); setLoading(false); });
  useEffect(() => { load(); }, [filters.brand_id, filters.from, filters.to]);
  useEffect(() => {
    brandsApi.getAll().then(setBrands);
    const thisMonth = new Date().toISOString().slice(0, 7);
    shipmentsApi.variance({ from: `${thisMonth}-01`, to: `${thisMonth}-31` }).then(rows => {
      setMonthVariance(rows.reduce((sum, r) => sum + (r.variance_total || 0), 0));
    });
  }, []);

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
  }

  async function refreshDetail(id) {
    const d = await shipmentsApi.get(id);
    setDetail(d);
    load();
  }

  // Lighter refresh used only when line item SHAPE changes in a way the
  // caller can't easily patch locally (kept for future use, currently unused
  // now that add/remove/select all merge their responses directly).
  async function refreshDetailOnly(id) {
    const d = await shipmentsApi.get(id);
    setDetail(d);
  }

  async function saveHeader(fields) {
    setBusy(true);
    try {
      await shipmentsApi.update(detail.id, fields);
      await refreshDetail(detail.id);
    } finally { setBusy(false); }
  }

  // No follow-up GET — the POST response already contains the created row.
  // The caller (child) shows an optimistic placeholder immediately and
  // swaps in this real row once it resolves, so the click feels instant.
  async function addLine(productId) {
    return shipmentsApi.addLineItem(detail.id, { product_id: productId, qty_ordered: 0, qty_received: 0, unit_cost_original_currency: 0 });
  }

  // Saves a single line item's field(s) on blur (not on every keystroke — that
  // was the original cause of fast typing getting scrambled). This now just
  // does the PUT and returns the updated row directly, with NO follow-up
  // GET at all — the previous version chained a PUT + 2 GETs per single field
  // blur, which is what made the tab feel sluggish. The caller merges the
  // returned row into its own local state.
  async function commitLine(liId, fields) {
    return shipmentsApi.updateLineItem(liId, fields);
  }

  // No follow-up GET — the caller removes the row from local state immediately
  // and this just fires the DELETE in the background.
  async function removeLine(liId) {
    return shipmentsApi.deleteLineItem(liId);
  }

  async function selectSku(li, productId) {
    // Prefill unit cost + weight from the cost reference table, if available.
    // Updates the SAME line item id in place (no delete+recreate) — that
    // delete+recreate approach was what caused rows to jump to the bottom
    // and made it look like editing one row changed a different one.
    // Also no follow-up GET here, same reasoning as commitLine above —
    // the PUT response already has everything the row needs.
    const ref = await shipmentsApi.costReferenceHistory(productId);
    const latest = ref[0];
    return shipmentsApi.updateLineItem(li.id, {
      product_id: productId,
      unit_cost_original_currency: latest?.cost_original_currency ?? li.unit_cost_original_currency,
      weight_per_unit: latest?.weight_per_unit ?? li.weight_per_unit,
    });
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

  // Pure what-if — no state changes here at all, the child owns its own
  // preview UI and busy/error state for this.
  async function previewCost(id, overrides) {
    return shipmentsApi.previewCost(id, overrides);
  }

  async function uploadDoc(documentType, file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await shipmentsApi.uploadDocument(detail.id, { document_type: documentType, file_name: file.name, file_data: reader.result });
        await refreshDetail(detail.id);
      } catch (e) {
        setError(e.message || 'Upload failed. The file may be too large.');
      }
    };
    reader.onerror = () => setError('Could not read the selected file.');
    reader.readAsDataURL(file);
  }

  async function deleteDoc(docId) {
    if (!window.confirm('Remove this uploaded document? You can upload a replacement afterward.')) return;
    try {
      await shipmentsApi.deleteDocument(docId);
      await refreshDetail(detail.id);
    } catch (e) {
      setError(e.message || 'Failed to remove document.');
    }
  }

  async function voidShipment(id) {
    if (!window.confirm('Void this shipment? It will be removed from the variance ledger and stop feeding Cost Reference, but the record itself stays for audit.')) return;
    await shipmentsApi.voidShipment(id);
    await refreshDetail(id);
  }

  async function deleteShipment(id) {
    if (!window.confirm('Permanently delete this shipment? This cannot be undone. If you just want to back it out of reports while keeping a record, use Void instead.')) return;
    await shipmentsApi.delete(id);
    setExpandedId(null); setDetail(null);
    load();
  }

  // ── Summary metrics ────────────────────────────────────────────
  const active = shipments.filter(s => s.status !== 'voided');
  const thisMonth = new Date().toISOString().slice(0, 7);
  const inMonth = active.filter(s => (s.arrival_date || s.created_at || '').startsWith(thisMonth));
  const costedCount = active.filter(s => s.status === 'costed').length;

  // "Done" = costed or voided (nothing more to do). "Not completed" = still
  // somewhere in ordered/shipped/received. Defaults to Not Completed so the
  // list focuses on what still needs attention.
  const isDone = s => s.status === 'costed' || s.status === 'voided';
  const visible = shipments.filter(s => {
    if (statusGroup === 'all') return true;
    if (statusGroup === 'done') return isDone(s);
    return !isDone(s);
  });
  const notCompletedCount = shipments.filter(s => !isDone(s)).length;
  const doneCount = shipments.filter(isDone).length;

  return (
    <Page
      title="Shipments"
      subtitle="Supplier orders, landed cost, and cost variance"
      action={<Btn onClick={newShipment}><Plus size={14} /> New shipment</Btn>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Shipments this month" value={inMonth.length} />
        <KpiCard
          label="Cost variance (month)"
          value={`${monthVariance >= 0 ? '+' : ''}$${monthVariance.toFixed(2)}`}
          sub={monthVariance >= 0 ? 'Favorable — costing less than set price' : 'Unfavorable — costing more than set price'}
        />
        <KpiCard label="Shipments costed" value={costedCount} />
        <KpiCard label="Total shipments" value={active.length} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[
          { key: 'not_completed', label: `Not completed (${notCompletedCount})` },
          { key: 'done', label: `Done (${doneCount})` },
          { key: 'all', label: 'All' },
        ].map(t => (
          <button key={t.key} onClick={() => setStatusGroup(t.key)} style={{
            padding: '6px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${statusGroup === t.key ? 'var(--orange)' : 'var(--border)'}`,
            background: statusGroup === t.key ? 'rgba(243,111,74,.12)' : 'transparent',
            color: statusGroup === t.key ? 'var(--orange)' : 'var(--cream-60)',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Select value={filters.brand_id} onChange={e => setFilters(f => ({ ...f, brand_id: e.target.value }))} style={{ width: 180 }}>
          <option value="">All brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} style={{ width: 160 }} placeholder="From" />
        <Input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} style={{ width: 160 }} placeholder="To" />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)', fontSize: 13 }}>No shipments match these filters.</div></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map(s => {
            const isOpen = expandedId === s.id;
            return (
              <Card key={s.id} style={s.status === 'voided' ? { opacity: 0.55 } : undefined}>
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
                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <div style={{ fontSize: 9.5, color: 'var(--cream-30)', textTransform: 'uppercase', letterSpacing: .5 }}>Landed cost</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>
                      {s.total_landed_cost ? `$${s.total_landed_cost.toFixed(2)}` : '—'}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={16} color="var(--cream-30)" /> : <ChevronDown size={16} color="var(--cream-30)" />}
                </div>

                {isOpen && detail && detail.id === s.id && (
                  <ShipmentDetailPanel
                    detail={detail}
                    brands={brands}
                    busy={busy}
                    error={error}
                    onSaveHeader={saveHeader}
                    onAddLine={addLine}
                    onCommitLine={commitLine}
                    onRemoveLine={removeLine}
                    onSelectSku={selectSku}
                    onMarkReceived={markReceived}
                    onCalculateCost={calculateCost}
                    onPreviewCost={previewCost}
                    onUploadDoc={uploadDoc}
                    onDeleteDoc={deleteDoc}
                    onVoid={() => voidShipment(s.id)}
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
  detail, brands, busy, error,
  onSaveHeader, onAddLine, onCommitLine, onRemoveLine, onSelectSku,
  onMarkReceived, onCalculateCost, onPreviewCost, onUploadDoc, onDeleteDoc, onVoid, onDelete,
}) {
  const [header, setHeader] = useState(detail);
  const [lines, setLines] = useState(detail.line_items || []);
  const [gstOverride, setGstOverride] = useState(!!detail.gst_amount_override);
  const [localError, setLocalError] = useState('');
  const [products, setProducts] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Re-sync from server truth whenever the parent refreshes detail (add/remove
  // line, SKU change, cost calc, header save, etc.) — but NOT on every keystroke,
  // since qty/cost/weight fields below only push to the server on blur.
  useEffect(() => { setHeader(detail); setLines(detail.line_items || []); setGstOverride(!!detail.gst_amount_override); setPreview(null); }, [detail]);

  // Refetch the SKU list whenever the LIVE brand selection changes — including
  // before "Save details" is clicked. This is the fix for the bug where the
  // SKU dropdown kept showing a previous shipment's brand: it was only
  // refetching after a save, so an unsaved brand change had no effect on it.
  useEffect(() => {
    if (header.brand_id) {
      productsApi.getAll({ brand_id: header.brand_id, active: true }).then(setProducts);
    } else {
      setProducts([]);
    }
  }, [header.brand_id]);

  const hf = (k, v) => setHeader(h => ({ ...h, [k]: v }));
  const isVoided = header.status === 'voided';

  function setLineField(liId, field, value) {
    setLines(ls => ls.map(l => l.id === liId ? { ...l, [field]: value } : l));
  }

  async function commitLineField(li, field, value) {
    const updated = await onCommitLine(li.id, { [field]: value });
    if (updated) setLines(ls => ls.map(l => l.id === li.id ? { ...l, ...updated } : l));
  }

  async function runQuickCalc() {
    setPreviewBusy(true); setPreviewError(''); setPreview(null);
    try {
      // Send whatever is currently typed in Cost Inputs, saved or not — the
      // whole point is testing a what-if scenario without needing to save
      // first. Line items themselves are already saved as you type them
      // (per the existing auto-save-on-blur design), so no override needed there.
      const overrides = {
        fx_rate_actual: header.fx_rate_actual, fx_processing_charge: header.fx_processing_charge,
        cashback: header.cashback, forwarder_invoice_value: header.forwarder_invoice_value,
        permit_invoice_value: header.permit_invoice_value, avs_payment: header.avs_payment,
        freight_apportion_method: header.freight_apportion_method,
        gst_amount: gstOverride ? header.gst_amount : undefined,
        gst_amount_override: gstOverride ? 1 : 0,
      };
      const result = await onPreviewCost(detail.id, overrides);
      setPreview(result);
    } catch (e) {
      setPreviewError(e.message);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleSelectSku(li, productId) {
    // Update the dropdown instantly — don't wait on the network for the
    // visible selection to change. The cost/weight prefill from Cost
    // Reference (which does need a lookup) merges in a moment later.
    setLineField(li.id, 'product_id', productId);
    try {
      const updated = await onSelectSku(li, productId);
      if (updated) setLines(ls => ls.map(l => l.id === li.id ? { ...l, ...updated } : l));
    } catch (e) {
      // Background save failed — leave the dropdown as selected but surface
      // nothing destructive; next full refresh (e.g. after costing) will
      // reconcile if it never actually saved.
    }
  }

  async function handleAddLine() {
    if (!products.length) { setLocalError('Products for this brand are still loading — try again in a moment.'); return; }
    setLocalError('');
    // Show the new row immediately with a temporary id, then swap in the
    // real server row once the save resolves — this is what makes it feel
    // as instant as Record Sale instead of waiting ~1s for a round trip.
    const tempId = `temp-${Date.now()}`;
    const placeholder = { id: tempId, product_id: products[0].id, qty_ordered: 0, qty_received: 0, unit_cost_original_currency: 0, weight_per_unit: null };
    setLines(ls => [...ls, placeholder]);
    try {
      const created = await onAddLine(products[0].id);
      setLines(ls => ls.map(l => l.id === tempId ? created : l));
    } catch (e) {
      setLines(ls => ls.filter(l => l.id !== tempId));
    }
  }

  async function handleRemoveLine(liId) {
    const backup = lines;
    setLines(ls => ls.filter(l => l.id !== liId));
    if (String(liId).startsWith('temp-')) return; // never persisted — nothing to delete server-side
    try {
      await onRemoveLine(liId);
    } catch (e) {
      setLines(backup); // save failed — restore so it's not silently lost
    }
  }

  const colWidths = '2fr 1fr 1fr 1fr 1fr auto';

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
      {error && (
        <div style={{ background: 'rgba(226,75,74,.1)', border: '1px solid rgba(226,75,74,.3)', color: '#E24B4A', padding: '8px 12px', borderRadius: 7, fontSize: 12 }}>
          {error}
        </div>
      )}
      {localError && (
        <div style={{ background: 'rgba(226,75,74,.1)', border: '1px solid rgba(226,75,74,.3)', color: '#E24B4A', padding: '8px 12px', borderRadius: 7, fontSize: 12 }}>
          {localError}
        </div>
      )}
      {isVoided && (
        <div style={{ background: 'rgba(150,150,150,.1)', border: '1px solid var(--border)', color: 'var(--cream-60)', padding: '8px 12px', borderRadius: 7, fontSize: 12 }}>
          This shipment is voided — it's excluded from the variance ledger and no longer feeds Cost Reference. Kept here for audit only.
        </div>
      )}

      <Divider label="Shipment info" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <Select label="Brand" value={header.brand_id || ''} onChange={e => hf('brand_id', e.target.value)} disabled={isVoided}>
          <option value="">Select brand</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Input label="Supplier" value={header.supplier_name || ''} onChange={e => hf('supplier_name', e.target.value)} disabled={isVoided} />
        <Select label="Currency" value={header.currency || 'USD'} onChange={e => hf('currency', e.target.value)} disabled={isVoided}>
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select label="Warehouse (received into)" value={header.received_warehouse || 'Storhub'} disabled>
          <option>Storhub</option>
        </Select>
        <Input label="Order date" type="date" value={header.order_date || ''} onChange={e => hf('order_date', e.target.value)} disabled={isVoided} />
        <Input label="Arrival date" type="date" value={header.arrival_date || ''} onChange={e => hf('arrival_date', e.target.value)} disabled={isVoided} />
        <Input label="Costed date" type="date" value={header.costed_date || ''} disabled />
        {!isVoided && (
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Btn size="sm" onClick={() => onSaveHeader({
              brand_id: header.brand_id || null, supplier_name: header.supplier_name,
              currency: header.currency, order_date: header.order_date, arrival_date: header.arrival_date,
            })} disabled={busy}>Save details</Btn>
          </div>
        )}
      </div>

      <Divider label="Line items" />
      {!header.brand_id && <div style={{ fontSize: 12, color: 'var(--cream-30)' }}>Select and save a brand above to add line items.</div>}
      {lines.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: colWidths, gap: 8, fontSize: 10, fontWeight: 600, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--cream-30)' }}>
          <div>SKU</div><div>Qty ordered</div><div>Qty received</div><div>Unit cost ({header.currency})</div><div>Weight/unit (kg)</div><div></div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {lines.map(li => (
          <div key={li.id}>
            <div style={{ display: 'grid', gridTemplateColumns: colWidths, gap: 8, alignItems: 'center' }}>
              <Select value={li.product_id} onChange={e => handleSelectSku(li, e.target.value)} disabled={isVoided}>
                {products.map(p => <option key={p.id} value={p.id}>{p.item_series}{p.variation ? ' — ' + p.variation : ''}</option>)}
              </Select>
              <Input type="number" value={li.qty_ordered}
                onChange={e => setLineField(li.id, 'qty_ordered', e.target.value)}
                onBlur={e => commitLineField(li, 'qty_ordered', parseFloat(e.target.value) || 0)}
                disabled={isVoided} />
              <Input type="number" value={li.qty_received}
                onChange={e => setLineField(li.id, 'qty_received', e.target.value)}
                onBlur={e => commitLineField(li, 'qty_received', parseFloat(e.target.value) || 0)}
                disabled={isVoided} />
              <Input type="number" step="0.01" value={li.unit_cost_original_currency}
                onChange={e => setLineField(li.id, 'unit_cost_original_currency', e.target.value)}
                onBlur={e => commitLineField(li, 'unit_cost_original_currency', parseFloat(e.target.value) || 0)}
                disabled={isVoided} />
              <Input type="number" step="0.01" value={li.weight_per_unit ?? ''}
                onChange={e => setLineField(li.id, 'weight_per_unit', e.target.value)}
                onBlur={e => commitLineField(li, 'weight_per_unit', e.target.value ? parseFloat(e.target.value) : null)}
                disabled={isVoided} />
              {!isVoided && (
                <button onClick={() => handleRemoveLine(li.id)} style={{ background: 'none', border: 'none', color: 'var(--cream-30)', cursor: 'pointer', padding: '8px 4px' }}><Trash2 size={14} /></button>
              )}
            </div>
            {!li.unit_cost_original_currency && li.qty_ordered > 0 && (
              <div style={{ fontSize: 10.5, color: '#BA7517', marginTop: 3, paddingLeft: 2 }}>
                ⚠ Unit cost is $0 — this line will land at $0.00 and show a large false "Verify data" flag until filled in.
              </div>
            )}
          </div>
        ))}
      </div>
      {header.brand_id && !isVoided && <Btn size="sm" variant="secondary" onClick={handleAddLine}><Plus size={13} /> Add line item</Btn>}

      <Divider label="Cost inputs" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <Input label={`Actual FX rate (${header.currency} → SGD)`} type="number" step="0.0001" value={header.fx_rate_actual || ''} onChange={e => hf('fx_rate_actual', parseFloat(e.target.value) || null)} disabled={isVoided} />
        <Input label="FX processing charge (SGD)" type="number" step="0.01" value={header.fx_processing_charge || ''} onChange={e => hf('fx_processing_charge', parseFloat(e.target.value) || 0)} disabled={isVoided} />
        <Input label="Cashback (SGD)" type="number" step="0.01" value={header.cashback || ''} onChange={e => hf('cashback', parseFloat(e.target.value) || 0)} disabled={isVoided} />
        <Input label="Forwarder invoice (SGD)" type="number" step="0.01" value={header.forwarder_invoice_value || ''} onChange={e => hf('forwarder_invoice_value', parseFloat(e.target.value) || 0)} disabled={isVoided} />
        <Input label="Permit declaration invoice (SGD)" type="number" step="0.01" value={header.permit_invoice_value || ''} onChange={e => hf('permit_invoice_value', parseFloat(e.target.value) || 0)} disabled={isVoided} />
        <Input label="AVS payment (SGD)" type="number" step="0.01" value={header.avs_payment || ''} onChange={e => hf('avs_payment', parseFloat(e.target.value) || 0)} disabled={isVoided} />
        <Select label="Freight apportion method" value={header.freight_apportion_method || 'value'} onChange={e => hf('freight_apportion_method', e.target.value)} disabled={isVoided}>
          <option value="value">Value-based</option>
          <option value="weight">Weight-based (requires weight/unit on every line)</option>
        </Select>
        <div>
          <Input
            label="GST (9% of product + freight)"
            type="number" step="0.01"
            value={gstOverride ? (header.gst_amount ?? '') : (header.costed_date ? header.gst_amount ?? '' : '')}
            placeholder={!gstOverride && !header.costed_date ? 'Auto-calculated once costed' : ''}
            onChange={e => hf('gst_amount', parseFloat(e.target.value) || 0)}
            disabled={isVoided || !gstOverride}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--cream-30)', marginTop: 4 }}>
            <input type="checkbox" checked={gstOverride} disabled={isVoided} onChange={e => setGstOverride(e.target.checked)} />
            Manually override (default: auto-calculated on costing)
          </label>
        </div>
        {!isVoided && (
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Btn size="sm" onClick={() => onSaveHeader({
              fx_rate_actual: header.fx_rate_actual, fx_processing_charge: header.fx_processing_charge, cashback: header.cashback,
              forwarder_invoice_value: header.forwarder_invoice_value, permit_invoice_value: header.permit_invoice_value,
              avs_payment: header.avs_payment, freight_apportion_method: header.freight_apportion_method,
              gst_amount: header.gst_amount, gst_amount_override: gstOverride ? 1 : 0,
            })} disabled={busy}>Save cost inputs</Btn>
          </div>
        )}
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
                <div key={d.id} style={{ fontSize: 10, color: 'var(--cream-30)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name || 'File'} ✓</span>
                  {!isVoided && (
                    <button
                      type="button"
                      onClick={() => onDeleteDoc(d.id)}
                      title="Remove document"
                      style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-30)', display: 'flex', alignItems: 'center' }}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
              {!isVoided && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--orange)', cursor: 'pointer' }}>
                  <Upload size={12} /> Upload
                  <input type="file" style={{ display: 'none' }} onChange={e => e.target.files[0] && onUploadDoc(t.value, e.target.files[0])} />
                </label>
              )}
            </div>
          );
        })}
      </div>

      <Divider label="Status & actions" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!isVoided && header.status === 'ordered' && <Btn size="sm" variant="secondary" onClick={onMarkReceived} disabled={busy}><Truck size={13} /> Mark as received</Btn>}
        {!isVoided && <Btn size="sm" onClick={onCalculateCost} disabled={busy}>{header.status === 'costed' ? 'Recalculate & re-cost' : 'Calculate landed cost & mark costed'}</Btn>}
        {!isVoided && <Btn size="sm" variant="secondary" onClick={runQuickCalc} disabled={previewBusy}><Calculator size={13} /> {previewBusy ? 'Calculating…' : 'Quick calculation'}</Btn>}
        {!isVoided && <Btn size="sm" variant="secondary" onClick={onVoid} disabled={busy}><Ban size={13} /> Void shipment</Btn>}
        <Btn size="sm" variant="secondary" onClick={onDelete} disabled={busy}><Trash2 size={13} /> Delete permanently</Btn>
      </div>
      {!isVoided && (
        <div style={{ fontSize: 11, color: 'var(--cream-30)' }}>
          Marking "received" adds Qty Received for each line item to Storhub in Inventory, tagged with this shipment's code for audit trail. This only happens once per line — editing Qty Received afterward won't re-sync automatically; use Inventory's Write-off/Adjust functions for corrections. "Quick calculation" is a what-if preview only — it doesn't save anything, change status, or touch the variance ledger. It calculates using Qty Ordered (not Qty Received), since it's meant for planning before anything has arrived.
        </div>
      )}

      {previewError && (
        <div style={{ background: 'rgba(226,75,74,.1)', border: '1px solid rgba(226,75,74,.3)', color: '#E24B4A', padding: '8px 12px', borderRadius: 7, fontSize: 12 }}>
          {previewError}
        </div>
      )}

      {preview && (
        <div style={{ border: '1px dashed var(--orange)', borderRadius: 9, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--orange)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calculator size={13} /> Quick calculation — preview only, nothing saved
            </div>
            <div style={{ fontSize: 12, color: 'var(--cream-60)' }}>
              Est. landed cost: <strong style={{ color: 'var(--cream)' }}>${preview.total_landed_cost.toFixed(2)}</strong>
              {' · '}Est. GST: ${preview.gst_amount.toFixed(2)}
            </div>
          </div>
          <Table
            cols={[
              { key: 'product_id', label: 'SKU', render: (v) => {
                const li = lines.find(l => l.product_id === v);
                return li ? `${li.item_series || ''}${li.variation ? ' — ' + li.variation : ''}`.trim() || `#${v}` : `#${v}`;
              }},
              { key: 'landed_cost', label: 'Est. landed/unit', align: 'right', render: v => `$${v.toFixed(2)}` },
              { key: 'set_cost_price', label: 'Set/unit', align: 'right', render: v => `$${v.toFixed(2)}` },
              { key: 'variance_pct', label: 'Diff %', align: 'right', render: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` },
              { key: 'variance_total', label: 'Est. total variance ($)', align: 'right', render: v => `${v >= 0 ? '+' : ''}$${v.toFixed(2)}` },
              { key: 'flag', label: 'Flag', align: 'center', render: v => <Badge color={FLAG_COLOR[v]}>{FLAG_LABEL[v]}</Badge> },
            ]}
            rows={preview.variance}
            keyField="product_id"
          />
          <div style={{ fontSize: 11, color: 'var(--cream-30)', marginTop: 8 }}>
            Try adjusting quantities (Qty Ordered is what's used here) or the cost inputs above, then click "Quick calculation" again — nothing here is saved until you click "Calculate landed cost & mark costed" for real.
          </div>
        </div>
      )}

      {detail.variance && detail.variance.length > 0 && (
        <>
          <Divider label="Cost variance vs Products & Pricing" />
          <Table
            cols={[
              { key: 'product_id', label: 'SKU', render: (v) => {
                const li = (detail.line_items || []).find(l => l.product_id === v);
                return li ? `${li.item_series}${li.variation ? ' — ' + li.variation : ''}` : v;
              }},
              { key: 'landed_cost', label: 'Landed/unit', align: 'right', render: v => `$${v.toFixed(2)}` },
              { key: 'set_cost_price', label: 'Set/unit', align: 'right', render: v => `$${v.toFixed(2)}` },
              { key: 'variance_pct', label: 'Diff %', align: 'right', render: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` },
              { key: 'variance_total', label: 'Total variance ($)', align: 'right', render: v => `${v >= 0 ? '+' : ''}$${v.toFixed(2)}` },
              { key: 'flag', label: 'Flag', align: 'center', render: v => <Badge color={FLAG_COLOR[v]}>{FLAG_LABEL[v]}</Badge> },
            ]}
            rows={detail.variance}
            keyField="id"
          />
          <div style={{ fontSize: 11, color: 'var(--cream-30)' }}>
            Positive = landed cost came in lower than set cost (favorable, adds profit). Negative = came in higher (unfavorable, reduces profit) — this reads the same direction as the rest of the P&L. Flags are asymmetric on purpose: unfavorable variance escalates Healthy → Watch → Risky as it gets worse, since that's real margin erosion needing attention. Favorable variance is just "Favorable" — good news, no action needed — unless it's implausibly large (past +50%), which almost always means a missing or wrong input (like a $0 unit cost) rather than genuine savings, so that gets flagged "Verify data" instead. "Total variance ($)" — per-unit diff × qty received — is the number that feeds P&L; the per-unit diff alone isn't, since it ignores quantity. Updating Products & Pricing's cost price is a separate, manual step.
          </div>
        </>
      )}
    </div>
  );
}
