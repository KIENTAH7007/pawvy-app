import React, { useState, useEffect } from 'react';
import { Plus, History, Trash2 } from 'lucide-react';
import { shipmentsApi } from '../api';
import { Page, Table, Btn, Modal, FormRow, Input, Select, Badge, fmt } from '../components/ui';

const CURRENCIES = ['USD', 'GBP', 'EUR', 'KRW', 'CNY', 'SGD'];

export default function CostReference() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(null);   // row being added-to
  const [historyModal, setHistoryModal] = useState(null); // row being viewed
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ effective_date: new Date().toISOString().slice(0, 10), currency: 'USD' });
  const [saving, setSaving] = useState(false);

  const load = () => shipmentsApi.costReference().then(r => { setRows(r); setLoading(false); });
  useEffect(() => { load(); }, []);

  function openAdd(row) {
    setForm({
      effective_date: new Date().toISOString().slice(0, 10),
      currency: row.currency || 'USD',
      weight_per_unit: row.weight_per_unit ?? '',
    });
    setAddModal(row);
  }

  async function openHistory(row) {
    setHistoryModal(row);
    const h = await shipmentsApi.costReferenceHistory(row.product_id);
    setHistory(h);
  }

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.cost_original_currency || !form.currency || !form.effective_date) return;
    setSaving(true);
    try {
      await shipmentsApi.addCostReference({
        product_id: addModal.product_id,
        effective_date: form.effective_date,
        cost_original_currency: parseFloat(form.cost_original_currency),
        currency: form.currency,
        weight_per_unit: form.weight_per_unit ? parseFloat(form.weight_per_unit) : null,
      });
      setAddModal(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function removeHistoryRow(id) {
    if (!window.confirm('Delete this price point? This cannot be undone.')) return;
    await shipmentsApi.deleteCostReference(id);
    const h = await shipmentsApi.costReferenceHistory(historyModal.product_id);
    setHistory(h);
    load();
  }

  const cols = [
    { key: 'brand_name', label: 'Brand' },
    { key: 'item_series', label: 'SKU', render: (v, r) => `${v}${r.variation ? ' — ' + r.variation : ''}` },
    { key: 'cost_original_currency', label: 'Supplier cost', render: (v, r) => v != null ? `${v.toFixed(2)} ${r.currency}` : <span style={{ color: 'var(--cream-30)' }}>Not set</span> },
    { key: 'weight_per_unit', label: 'Weight/unit', render: v => v != null ? `${v} kg` : '—' },
    { key: 'effective_date', label: 'As of', render: v => v ? fmt.date(v) : '—' },
    { key: '_actions', label: '', align: 'right', render: (_, r) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn size="sm" variant="secondary" onClick={() => openHistory(r)}><History size={13} /></Btn>
        <Btn size="sm" onClick={() => openAdd(r)}><Plus size={13} /> Add price point</Btn>
      </div>
    )},
  ];

  return (
    <Page title="Cost reference" subtitle="Original supplier cost and weight per SKU — pre-fills the shipment entry form">
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)' }}>Loading…</div>
      ) : (
        <Table cols={cols} rows={rows} keyField="product_id" emptyMsg="No products found" />
      )}

      <Modal open={!!addModal} title={addModal ? `Add price point — ${addModal.item_series}${addModal.variation ? ' / ' + addModal.variation : ''}` : ''} onClose={() => setAddModal(null)}>
        <FormRow>
          <Input label="Effective date" type="date" value={form.effective_date} onChange={e => sf('effective_date', e.target.value)} />
          <Select label="Currency" value={form.currency} onChange={e => sf('currency', e.target.value)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </FormRow>
        <FormRow>
          <Input label="Supplier cost (original currency)" type="number" step="0.01" value={form.cost_original_currency || ''} onChange={e => sf('cost_original_currency', e.target.value)} />
          <Input label="Weight per unit (kg, optional)" type="number" step="0.01" value={form.weight_per_unit || ''} onChange={e => sf('weight_per_unit', e.target.value)} />
        </FormRow>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn variant="secondary" onClick={() => setAddModal(null)}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save price point'}</Btn>
        </div>
      </Modal>

      <Modal open={!!historyModal} title={historyModal ? `Price history — ${historyModal.item_series}${historyModal.variation ? ' / ' + historyModal.variation : ''}` : ''} onClose={() => setHistoryModal(null)} width={620}>
        <Table
          emptyMsg="No price points recorded yet"
          keyField="id"
          cols={[
            { key: 'effective_date', label: 'Date', render: v => fmt.date(v) },
            { key: 'cost_original_currency', label: 'Cost', render: (v, r) => `${v.toFixed(2)} ${r.currency}` },
            { key: 'weight_per_unit', label: 'Weight/unit', render: v => v != null ? `${v} kg` : '—' },
            { key: 'source_shipment_id', label: 'Source', render: v => v ? <Badge color="#378ADD">Shipment #{v}</Badge> : <Badge color="#888">Manual entry</Badge> },
            { key: '_del', label: '', align: 'right', render: (_, r) => (
              <button onClick={() => removeHistoryRow(r.id)} style={{ background: 'none', border: 'none', color: 'var(--cream-30)', cursor: 'pointer' }}>
                <Trash2 size={14} />
              </button>
            )},
          ]}
          rows={history}
        />
      </Modal>
    </Page>
  );
}
