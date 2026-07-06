import React, { useState, useEffect } from 'react';
import { shipmentsApi, brandsApi } from '../api';
import { Page, Table, Select, Input, KpiCard, Badge, fmt } from '../components/ui';

const FLAG_COLOR = { healthy: '#639922', watch: '#BA7517', risky: '#E24B4A', no_reference: '#888' };
const FLAG_LABEL = { healthy: 'Healthy', watch: 'Watch', risky: 'Risky', no_reference: 'No reference cost' };

export default function VarianceLedger() {
  const [rows, setRows] = useState([]);
  const [brands, setBrands] = useState([]);
  const [filters, setFilters] = useState({ brand_id: '', flag: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    shipmentsApi.variance(filters).then(r => { setRows(r); setLoading(false); });
  };
  useEffect(() => { load(); }, [filters.brand_id, filters.flag, filters.from, filters.to]);
  useEffect(() => { brandsApi.getAll().then(setBrands); }, []);

  const totalVariance = rows.reduce((sum, r) => sum + (r.variance_total || 0), 0);
  const riskyCount = rows.filter(r => r.flag === 'risky').length;
  const watchCount = rows.filter(r => r.flag === 'watch').length;

  return (
    <Page title="Variance ledger" subtitle="Every logged cost variance vs Products & Pricing, across all shipments — this feeds P&L as a COGS adjustment">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Entries (filtered)" value={rows.length} />
        <KpiCard label="Total variance (COGS impact)" value={`${totalVariance >= 0 ? '+' : ''}$${totalVariance.toFixed(2)}`} sub={totalVariance >= 0 ? 'Favorable — cost less than budgeted' : 'Unfavorable — cost more than budgeted'} />
        <KpiCard label="Watch" value={watchCount} />
        <KpiCard label="Risky" value={riskyCount} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Select value={filters.brand_id} onChange={e => setFilters(f => ({ ...f, brand_id: e.target.value }))} style={{ width: 160 }}>
          <option value="">All brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={filters.flag} onChange={e => setFilters(f => ({ ...f, flag: e.target.value }))} style={{ width: 140 }}>
          <option value="">All flags</option>
          <option value="healthy">Healthy</option>
          <option value="watch">Watch</option>
          <option value="risky">Risky</option>
        </Select>
        <Input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} style={{ width: 150 }} />
        <Input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} style={{ width: 150 }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)' }}>Loading…</div>
      ) : (
        <Table
          emptyMsg="No variance entries yet — these are logged automatically each time a shipment is costed."
          keyField="id"
          cols={[
            { key: 'logged_date', label: 'Date', render: v => fmt.date(v) },
            { key: 'shipment_code', label: 'Shipment' },
            { key: 'brand_name', label: 'Brand' },
            { key: 'item_series', label: 'SKU', render: (v, r) => `${v}${r.variation ? ' — ' + r.variation : ''}` },
            { key: 'landed_cost', label: 'Landed/unit', align: 'right', render: v => `$${v.toFixed(2)}` },
            { key: 'set_cost_price', label: 'Set/unit', align: 'right', render: v => `$${v.toFixed(2)}` },
            { key: 'variance_pct', label: 'Diff %', align: 'right', render: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` },
            { key: 'variance_total', label: 'Total variance ($)', align: 'right', render: v => `${v >= 0 ? '+' : ''}$${v.toFixed(2)}` },
            { key: 'flag', label: 'Flag', align: 'center', render: v => <Badge color={FLAG_COLOR[v]}>{FLAG_LABEL[v]}</Badge> },
          ]}
          rows={rows}
        />
      )}
      <div style={{ fontSize: 11, color: 'var(--cream-30)', marginTop: 10 }}>
        Sign convention: <strong>positive</strong> means the landed cost came in lower than the set cost (you paid less than budgeted — favorable, adds profit). <strong>Negative</strong> means it came in higher (unfavorable, reduces profit) — this reads the same direction as the rest of the P&L. "Total variance ($)" is the per-unit difference × quantity received for that line — that's the number that actually matters for P&L, not the per-unit rate.
      </div>
    </Page>
  );
}
