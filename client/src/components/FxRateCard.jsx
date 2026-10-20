import React, { useEffect, useState } from 'react';
import { fxApi } from '../api';
import { Btn, Input } from './ui';

// MYR-per-SGD exchange rate: fetched automatically every day; a manual rate
// for a date always wins over the automatic one. Changing it never alters
// sales/costs already recorded — each keeps the rate saved when it was entered.
export default function FxRateCard() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => fxApi.get().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  async function act(fn, okMsg) {
    setBusy(true); setMsg('');
    try { await fn(); setMsg(okMsg); setRate(''); await load(); }
    catch (e) { setMsg(e.message || 'Something went wrong'); }
    finally { setBusy(false); }
  }
  const cur = data?.current;
  return (
    <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'10px 16px'}}>
      <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        <span style={{fontSize:11,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)'}}>Exchange rate</span>
        <span style={{fontSize:13,color:'var(--cream)',fontWeight:700}}>
          {cur ? `1 SGD = ${parseFloat(cur.myr_per_sgd).toFixed(4)} MYR` : 'No rate yet'}
        </span>
        {cur && <span style={{fontSize:11,color:'var(--cream-30)'}}>{cur.source === 'manual' ? 'manual' : 'automatic'} · {cur.date}</span>}
        <button onClick={() => setOpen(o => !o)} style={{background:'none',border:'none',color:'var(--orange)',cursor:'pointer',fontSize:11}}>{open ? 'Hide' : 'Change / history'}</button>
      </div>
      {open && (
        <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
            <Input label="Manual rate for today (MYR per 1 SGD)" type="number" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} style={{width:230}}/>
            <Btn size="sm" disabled={busy || !rate} onClick={() => act(() => fxApi.set({ myr_per_sgd: rate }), 'Manual rate saved for today.')}>Save manual rate</Btn>
            <Btn size="sm" variant="ghost" disabled={busy} onClick={() => act(() => fxApi.refresh(), 'Rate refreshed.')}>Fetch latest now</Btn>
          </div>
          <div style={{fontSize:11,color:'var(--cream-30)'}}>
            The rate is fetched automatically each day. A manual rate for a date overrides the automatic one. Sales and costs already recorded keep the rate they were saved with — changing the rate only affects new entries.
          </div>
          {msg && <div style={{fontSize:11,color:'var(--cream-60)'}}>{msg}</div>}
          {data?.history?.length > 0 && (
            <div style={{maxHeight:140,overflowY:'auto',fontSize:11,color:'var(--cream-60)'}}>
              {data.history.map(h => (
                <div key={h.date} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid var(--cream-05)'}}>
                  <span>{h.date}</span><span>{parseFloat(h.myr_per_sgd).toFixed(4)}</span><span style={{color:'var(--cream-30)'}}>{h.source === 'manual' ? 'manual' : 'auto'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
