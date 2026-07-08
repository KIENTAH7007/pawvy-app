import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { consignmentApi } from '../api';
import { Page, Btn, Badge } from '../components/ui';

export default function Reconciliation() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    consignmentApi.reconciliation().then(d => { setData(d); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  return (
    <Page
      title="Consignment Data Check"
      subtitle="Read-only — compares consignment placement/return ledger totals against inventory movement totals, per SKU. Nothing here writes or changes any data."
      action={<Btn variant="secondary" onClick={load}><RefreshCw size={14} /> Refresh</Btn>}
    >
      {loading || !data ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)' }}>Checking…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--cream-30)', marginBottom: 6 }}>SKUs checked</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--cream)' }}>{data.checked_products}</div>
            </div>
            <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--cream-30)', marginBottom: 6 }}>Mismatches found</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: data.mismatches_found > 0 ? '#f87171' : '#7fc93e' }}>{data.mismatches_found}</div>
            </div>
          </div>

          {data.mismatches_found === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#7fc93e', fontSize: 13, background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8 }}>
              No mismatches — every consignment placement and return has a matching inventory movement record.
            </div>
          ) : (
            <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: 'rgba(245,242,235,.05)' }}>
                  {['Brand','Product','Placed: Ledger','Placed: Inventory','Placed Diff','Returned: Ledger','Returned: Inventory','Return Diff'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: h==='Brand'||h==='Product' ? 'left' : 'right', fontSize: 9.5, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--cream-30)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {data.mismatches.map(m => (
                    <tr key={m.product_id} style={{ borderBottom: '1px solid rgba(245,242,235,.04)' }}>
                      <td style={{ padding: '8px 10px' }}><Badge color="#888">{m.brand_name}</Badge></td>
                      <td style={{ padding: '8px 10px', color: 'var(--cream)' }}>{m.item_series}{m.variation ? ' · ' + m.variation : ''}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--cream-60)' }}>{m.placed_ledger_total}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--cream-60)' }}>{m.placed_inventory_moved}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: m.placement_diff !== 0 ? '#f87171' : '#7fc93e' }}>
                        {m.placement_diff !== 0 ? (m.placement_diff > 0 ? '+' : '') + m.placement_diff : '✓'}
                        {m.placement_diff !== 0 && <AlertTriangle size={11} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--cream-60)' }}>{m.returned_ledger_total}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--cream-60)' }}>{m.returned_inventory_moved}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: m.return_diff !== 0 ? '#f87171' : '#7fc93e' }}>
                        {m.return_diff !== 0 ? (m.return_diff > 0 ? '+' : '') + m.return_diff : '✓'}
                        {m.return_diff !== 0 && <AlertTriangle size={11} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--cream-30)', marginTop: 14, lineHeight: 1.6 }}>
            <strong>How to read this:</strong> "Ledger" = total recorded on the Consignment side (placements or returns, across all partners, for that SKU). "Inventory" = total reflected in Inventory's movement history for that SKU. These should always match exactly. A positive diff means the ledger recorded more than Inventory shows (Inventory is under-counting — movements are missing). A negative diff means Inventory shows more than the ledger (Inventory is over-counting — likely leftover/orphaned movements). Once you've confirmed which SKUs and by how much, use Inventory's existing "Adjust" function to correct the physical stock level for each affected SKU to match reality.
          </div>
        </>
      )}
    </Page>
  );
}
