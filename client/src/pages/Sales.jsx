import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { salesApi, brandsApi, partnersApi } from '../api';
import { Page, Select, Input, Badge, Btn, fmt } from '../components/ui';
import { Ban } from 'lucide-react';

const MARKETPLACE = ['Shopee','Lazada','Amazon','TikTok Shop'];

export default function Sales() {
  const nav = useNavigate();
  const [sales,    setSales]    = useState([]);
  const [brands,   setBrands]   = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filters,  setFilters]  = useState({ brand_id:'', partner_id:'', date_from:'', date_to:'', market:'' });
  const [voidConfirm, setVoidConfirm] = useState(null); // sale id pending void

  useEffect(() => {
    brandsApi.getAll().then(setBrands);
    partnersApi.getAll().then(setPartners);
  }, []);

  const load = (f = filters) => {
    setLoading(true);
    const q = {};
    if (f.brand_id)   q.brand_id   = f.brand_id;
    if (f.partner_id) q.partner_id = f.partner_id;
    if (f.date_from)  q.date_from  = f.date_from;
    if (f.date_to)    q.date_to    = f.date_to;
    if (f.market)     q.market     = f.market;
    salesApi.getAll(q).then(d => { setSales(d); setLoading(false); });
  };

  useEffect(() => { load(); }, [filters]);

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const hasFilter = Object.values(filters).some(v => v !== '');

  const totals = sales.reduce((a, s) => ({
    r: a.r + (s.revenue||0), p: a.p + (s.profit||0), q: a.q + s.qty
  }), { r:0, p:0, q:0 });

  async function handleVoid(id) {
    await salesApi.void(id);
    setVoidConfirm(null);
    load();
  }

  // Discount amount shown in ledger:
  // marketplace → platform_fee_amt is a fee (show as "Fee")
  // others → platform_fee_amt is a discount (show as "Disc")
  function discountDisplay(s) {
    const amt = parseFloat(s.platform_fee_amt||0);
    if (amt === 0) {
      const sc = parseFloat(s.shipping_charged||0);
      return sc > 0 ? { label: '+Ship', amt: sc, color: '#7fc93e' } : null;
    }
    const isMarket = MARKETPLACE.includes(s.channel);
    return {
      label: isMarket ? `Fee ${parseFloat(s.platform_fee_pct||0).toFixed(0)}%` : 'Disc',
      amt,
      color: isMarket ? 'var(--cream-30)' : '#fbbf24',
    };
  }

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

      {/* Void confirmation modal */}
      {voidConfirm && (
        <div style={{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:12,padding:28,maxWidth:380,width:'90%'}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1,color:'var(--cream)',marginBottom:10}}>VOID THIS SALE?</div>
            <div style={{fontSize:12,color:'var(--cream-60)',lineHeight:1.6,marginBottom:20}}>
              The record stays in the database for audit, but will be excluded from all revenue, profit, and dashboard calculations. This cannot be undone.
            </div>
            <div style={{display:'flex',gap:10}}>
              <Btn variant="danger" onClick={() => handleVoid(voidConfirm)} style={{flex:1,justifyContent:'center'}}>
                <Ban size={13}/> Yes, Void It
              </Btn>
              <Btn variant="ghost" onClick={() => setVoidConfirm(null)} style={{flex:1,justifyContent:'center'}}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
        {loading
          ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
          : sales.length === 0
            ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No sales match filters</div>
            : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:980}}>
                  <thead>
                    <tr>
                      {['Date','Brand','Product','Channel','Partner','Mkt','Qty','List Price','Discount/Fee','Revenue','Profit',''].map(h=>(
                        <th key={h} style={{padding:'9px 10px',textAlign:['Qty','List Price','Discount/Fee','Revenue','Profit'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map(s => {
                      const disc = discountDisplay(s);
                      const isVoided = s.voided === 1;
                      const rowStyle = isVoided
                        ? {borderBottom:'1px solid rgba(245,242,235,.04)',opacity:0.4}
                        : {borderBottom:'1px solid rgba(245,242,235,.04)'};
                      return (
                        <tr key={s.id} style={rowStyle}>
                          <td style={{padding:'8px 10px',color:'var(--cream-60)',whiteSpace:'nowrap',textDecoration:isVoided?'line-through':'none'}}>
                            {fmt.date(s.date)}
                            {isVoided && <span style={{marginLeft:6,fontSize:9,fontWeight:700,color:'#f87171',background:'rgba(248,113,113,.15)',padding:'1px 5px',borderRadius:3}}>VOID</span>}
                          </td>
                          <td style={{padding:'8px 10px'}}><Badge color={s.brand_color}>{s.brand_name}</Badge></td>
                          <td style={{padding:'8px 10px',color:'var(--cream)',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {s.item_series}{s.variation ? ` · ${s.variation}` : ''}
                          </td>
                          <td style={{padding:'8px 10px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{s.channel}</td>
                          <td style={{padding:'8px 10px',color:'var(--cream-60)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.partner_name||'—'}</td>
                          <td style={{padding:'8px 10px',color:'var(--cream-30)'}}>{s.market}</td>
                          <td style={{padding:'8px 10px',textAlign:'right',color:'var(--cream)'}}>{s.qty}</td>
                          <td style={{padding:'8px 10px',textAlign:'right',color:'var(--cream-60)'}}>{fmt.sgd(s.unit_price)}</td>
                          <td style={{padding:'8px 10px',textAlign:'right'}}>
                            {disc
                              ? <span style={{color:disc.color,fontSize:11}}>
                                  {disc.label !== '+Ship' ? `− ` : '+ '}
                                  {fmt.sgd(disc.amt)}
                                  {disc.label && disc.label !== '+Ship' && <span style={{color:'var(--cream-30)',marginLeft:4,fontSize:10}}>{disc.label}</span>}
                                </span>
                              : <span style={{color:'var(--cream-30)'}}>—</span>
                            }
                          </td>
                          <td style={{padding:'8px 10px',textAlign:'right',fontWeight:600,color:'var(--cream)'}}>{fmt.sgd(s.revenue)}</td>
                          <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:s.profit>=0?'#7fc93e':'#f87171'}}>{fmt.sgd(s.profit)}</td>
                          <td style={{padding:'8px 6px',textAlign:'right'}}>
                            {!isVoided && (
                              <button onClick={() => setVoidConfirm(s.id)} title="Void this sale"
                                style={{background:'none',border:'none',color:'rgba(248,113,113,.5)',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}
                                onMouseEnter={e=>e.currentTarget.style.color='#f87171'}
                                onMouseLeave={e=>e.currentTarget.style.color='rgba(248,113,113,.5)'}>
                                <Ban size={13}/>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
        }
      </div>
    </Page>
  );
}
