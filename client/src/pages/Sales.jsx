import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { salesApi, brandsApi, partnersApi } from '../api';
import { Page, Select, Input, Badge, Btn, fmt } from '../components/ui';

export default function Sales() {
  const nav = useNavigate();
  const [sales,    setSales]    = useState([]);
  const [brands,   setBrands]   = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filters,  setFilters]  = useState({ brand_id:'', partner_id:'', date_from:'', date_to:'', market:'' });

  useEffect(() => {
    brandsApi.getAll().then(setBrands);
    partnersApi.getAll().then(setPartners);
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = {};
    if (filters.brand_id)   q.brand_id   = filters.brand_id;
    if (filters.partner_id) q.partner_id = filters.partner_id;
    if (filters.date_from)  q.date_from  = filters.date_from;
    if (filters.date_to)    q.date_to    = filters.date_to;
    if (filters.market)     q.market     = filters.market;
    salesApi.getAll(q).then(d => { setSales(d); setLoading(false); });
  }, [filters]);

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const hasFilter = Object.values(filters).some(v => v !== '');
  const totals = sales.reduce((a, s) => ({
    r: a.r + (s.revenue||0), p: a.p + (s.profit||0), q: a.q + s.qty
  }), { r:0, p:0, q:0 });

  return (
    <Page title="SALES LEDGER" subtitle={`${sales.length} transactions`}
      action={<Btn onClick={() => nav('/sales/record')}><span style={{fontSize:16}}>+</span> Record Sale</Btn>}>

      {/* Filters */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}}>
        <Select label="Brand" value={filters.brand_id} onChange={e=>setF('brand_id',e.target.value)} style={{width:155}}>
          <option value="">All brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select label="Partner" value={filters.partner_id} onChange={e=>setF('partner_id',e.target.value)} style={{width:200}}>
          <option value="">All partners</option>
          {partners.map(p => <option key={p.id} value={p.id}>{p.company_name}</option>)}
        </Select>
        <Select label="Market" value={filters.market} onChange={e=>setF('market',e.target.value)} style={{width:100}}>
          <option value="">All</option>
          {['SG','MY','AU'].map(m => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Input label="From" type="date" value={filters.date_from} onChange={e=>setF('date_from',e.target.value)} style={{width:150}}/>
        <Input label="To"   type="date" value={filters.date_to}   onChange={e=>setF('date_to',e.target.value)}   style={{width:150}}/>
        {hasFilter && <Btn variant="ghost" size="sm" onClick={()=>setFilters({brand_id:'',partner_id:'',date_from:'',date_to:'',market:''})}>Clear</Btn>}
      </div>

      {/* Totals bar */}
      {!loading && sales.length > 0 && (
        <div style={{display:'flex',gap:24,background:'var(--navy)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 16px',fontSize:12}}>
          <span style={{color:'var(--cream-30)'}}>Units: <strong style={{color:'var(--cream)'}}>{totals.q}</strong></span>
          <span style={{color:'var(--cream-30)'}}>Revenue: <strong style={{color:'var(--cream)'}}>SGD {totals.r.toFixed(2)}</strong></span>
          <span style={{color:'var(--cream-30)'}}>Gross Profit: <strong style={{color:'#7fc93e'}}>SGD {totals.p.toFixed(2)}</strong></span>
        </div>
      )}

      {/* Table — scrollable */}
      <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
        {loading
          ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
          : sales.length === 0
            ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No sales match filters</div>
            : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:900}}>
                  <thead>
                    <tr>
                      {['Date','Brand','Product','Variation','Channel','Partner','Mkt','Qty','Price','Revenue','Profit'].map(h=>(
                        <th key={h} style={{padding:'9px 12px',textAlign:['Qty','Price','Revenue','Profit'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map(s => (
                      <tr key={s.id} style={{borderBottom:'1px solid rgba(245,242,235,.04)'}}>
                        <td style={{padding:'8px 12px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{fmt.date(s.date)}</td>
                        <td style={{padding:'8px 12px'}}><Badge color={s.brand_color}>{s.brand_name}</Badge></td>
                        <td style={{padding:'8px 12px',color:'var(--cream)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.item_series}</td>
                        <td style={{padding:'8px 12px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{s.variation||'—'}</td>
                        <td style={{padding:'8px 12px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{s.channel}</td>
                        <td style={{padding:'8px 12px',color:'var(--cream-60)',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.partner_name||'—'}</td>
                        <td style={{padding:'8px 12px',color:'var(--cream-30)'}}>{s.market}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',color:'var(--cream)'}}>{s.qty}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',color:'var(--cream-60)'}}>{fmt.sgd(s.unit_price)}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontWeight:600,color:'var(--cream)'}}>{fmt.sgd(s.revenue)}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:s.profit>=0?'#7fc93e':'#f87171'}}>{fmt.sgd(s.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      </div>
    </Page>
  );
}
