import React, { useState, useEffect } from 'react';
import { Download, FileText } from 'lucide-react';
import { shipmentsApi, brandsApi } from '../api';
import { Page, Table, Select, Input, fmt } from '../components/ui';

const DOC_TYPES = [
  { value: 'supplier_invoice', label: 'Supplier invoice' },
  { value: 'credit_memo',      label: 'Credit memo' },
  { value: 'forwarder_invoice',label: 'Forwarder invoice' },
  { value: 'permit_invoice',   label: 'Permit declaration' },
  { value: 'gst_record',       label: 'GST payment record' },
  { value: 'avs_record',       label: 'AVS payment record' },
];

export default function DocumentLibrary() {
  const [docs, setDocs] = useState([]);
  const [brands, setBrands] = useState([]);
  const [filters, setFilters] = useState({ document_type: '', brand_id: '' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    shipmentsApi.documents(filters).then(d => { setDocs(d); setLoading(false); });
  };
  useEffect(() => { load(); }, [filters.document_type, filters.brand_id]);
  useEffect(() => { brandsApi.getAll().then(setBrands); }, []);

  async function download(doc) {
    const full = await shipmentsApi.documentGet(doc.id);
    if (!full.file_data) return;
    const a = document.createElement('a');
    a.href = full.file_data;
    a.download = full.file_name || `${doc.document_type}.pdf`;
    a.click();
  }

  const cols = [
    { key: 'document_type', label: 'Type', render: v => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <FileText size={13} style={{ color: 'var(--cream-30)' }} />
        {DOC_TYPES.find(t => t.value === v)?.label || v}
      </span>
    )},
    { key: 'shipment_code', label: 'Shipment' },
    { key: 'brand_name', label: 'Brand' },
    { key: 'uploaded_at', label: 'Uploaded', render: v => fmt.date(v) },
    { key: '_dl', label: '', align: 'right', render: (_, r) => (
      <button onClick={() => download(r)} style={{ background: 'none', border: 'none', color: 'var(--cream-30)', cursor: 'pointer' }}>
        <Download size={15} />
      </button>
    )},
  ];

  return (
    <Page title="Document library" subtitle="Every document across all shipments, in one searchable place">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Select value={filters.document_type} onChange={e => setFilters(f => ({ ...f, document_type: e.target.value }))} style={{ width: 200 }}>
          <option value="">All document types</option>
          {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Select value={filters.brand_id} onChange={e => setFilters(f => ({ ...f, brand_id: e.target.value }))} style={{ width: 160 }}>
          <option value="">All brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)' }}>Loading…</div>
      ) : (
        <Table
          cols={cols}
          rows={docs}
          emptyMsg="No documents yet — these will appear here once shipments are entered and documents attached."
        />
      )}
    </Page>
  );
}
