import React, { useState, useEffect } from 'react';
import { Download, FileText } from 'lucide-react';
import { shipmentsApi, brandsApi } from '../api';
import { Page, Table, Select, Input, fmt } from '../components/ui';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';

const DOC_TYPES = [
  { value: 'supplier_invoice', label: 'Supplier invoice' },
  { value: 'credit_memo',      label: 'Credit memo' },
  { value: 'forwarder_invoice',label: 'Forwarder invoice' },
  { value: 'permit_invoice',   label: 'Permit declaration' },
  { value: 'gst_record',       label: 'GST payment record' },
  { value: 'avs_record',       label: 'AVS payment record' },
];

// Same tooltip style used on the Dashboard, kept local since it isn't exported from there.
const Tip = ({ active, payload, label, unit }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#14213d', border: '1px solid rgba(245,242,235,.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--cream-60)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#7fc93e', fontWeight: 600 }}>
          {p.name}: {p.value >= 0 && p.payload?.signed ? '+' : ''}{parseFloat(p.value || 0).toFixed(2)}{unit || ''}
          {p.payload?.currency ? ` (${p.payload.currency})` : ''}
        </div>
      ))}
    </div>
  );
};

function TrendCharts({ trends }) {
  if (!trends.length) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-30)', fontSize: 12, background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        No costed shipments yet — trends will appear here once a few shipments have gone through "Calculate landed cost & mark costed".
      </div>
    );
  }

  const freightData = trends.map(t => ({
    label: t.shipment_code,
    freight: t.forwarder_invoice_value || 0,
    freight_per_kg: t.total_weight > 0 ? (t.forwarder_invoice_value || 0) / t.total_weight : null,
  }));
  const fxData = trends.map(t => ({ label: t.shipment_code, rate: t.fx_rate_actual || 0, currency: t.currency }));
  const varianceData = trends.map(t => ({ label: t.shipment_code, variance: t.variance_total_sum || 0, signed: true }));

  const chartBox = { background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 };
  const chartTitle = { fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, letterSpacing: 1, color: 'var(--cream)', marginBottom: 10 };
  const axisTick = { fill: 'rgba(245,242,235,.4)', fontSize: 10 };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
      <div style={chartBox}>
        <div style={chartTitle}>FREIGHT COST PER SHIPMENT</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={freightData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
            <Tooltip content={<Tip unit=" SGD" />} />
            <Bar dataKey="freight" name="Freight" fill="#378ADD" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 10, color: 'var(--cream-30)', marginTop: 6 }}>Only shipments with weight data show a meaningful $/kg — check per-shipment detail for that figure.</div>
      </div>

      <div style={chartBox}>
        <div style={chartTitle}>FX RATE PER SHIPMENT</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={fxData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip />} />
            <Line type="monotone" dataKey="rate" name="FX rate" stroke="#f36f4a" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 10, color: 'var(--cream-30)', marginTop: 6 }}>Mixed currencies show on one scale — filter by brand above if comparing rates across different currencies.</div>
      </div>

      <div style={chartBox}>
        <div style={chartTitle}>COST VARIANCE PER SHIPMENT</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={varianceData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
            <Tooltip content={<Tip unit=" SGD" />} />
            <Bar dataKey="variance" name="Variance" radius={[4, 4, 0, 0]}>
              {varianceData.map((d, i) => <Cell key={i} fill={d.variance >= 0 ? '#7fc93e' : '#f87171'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 10, color: 'var(--cream-30)', marginTop: 6 }}>Green = favorable (landed under set cost). Red = unfavorable (landed over set cost).</div>
      </div>
    </div>
  );
}

export default function DocumentLibrary() {
  const [docs, setDocs] = useState([]);
  const [trends, setTrends] = useState([]);
  const [brands, setBrands] = useState([]);
  const [filters, setFilters] = useState({ document_type: '', brand_id: '' });
  const [loading, setLoading] = useState(true);
  const [trendsLoading, setTrendsLoading] = useState(true);

  const load = () => {
    setLoading(true);
    shipmentsApi.documents(filters).then(d => { setDocs(d); setLoading(false); });
  };
  const loadTrends = () => {
    setTrendsLoading(true);
    shipmentsApi.trends(filters.brand_id ? { brand_id: filters.brand_id } : {}).then(t => { setTrends(t); setTrendsLoading(false); });
  };
  useEffect(() => { load(); }, [filters.document_type, filters.brand_id]);
  useEffect(() => { loadTrends(); }, [filters.brand_id]);
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
    <Page title="Document library" subtitle="Cost & FX trends, plus every document across all shipments in one searchable place">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Select value={filters.brand_id} onChange={e => setFilters(f => ({ ...f, brand_id: e.target.value }))} style={{ width: 160 }}>
          <option value="">All brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </div>

      {trendsLoading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--cream-30)', marginBottom: 20 }}>Loading trends…</div>
      ) : (
        <TrendCharts trends={trends} />
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Select value={filters.document_type} onChange={e => setFilters(f => ({ ...f, document_type: e.target.value }))} style={{ width: 200 }}>
          <option value="">All document types</option>
          {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
