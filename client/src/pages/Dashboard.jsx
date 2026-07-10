import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, TrendingUp, Package, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { salesApi, reportsApi, partnerReportApi, brandsApi, brandSkuApi } from '../api';
import { KpiCard, Btn, Badge, fmt } from '../components/ui';

const MONTH_LABELS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function thisMonth() {
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0');
  return { from:`${y}-${m}-01`, to:`${y}-${m}-31`, label:now.toLocaleString('default',{month:'long',year:'numeric'}) };
}
function thisYear() {
  const y = new Date().getFullYear();
  return { from:`${y}-01-01`, to:`${y}-12-31` };
}

const Tip = ({ active, payload, label, prefix = 'SGD ' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:'#14213d',border:'1px solid rgba(245,242,235,.15)',borderRadius:8,padding:'10px 14px',fontSize:12}}>
      <div style={{color:'var(--cream-60)',marginBottom:4}}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{color:p.color||'#7fc93e',fontWeight:600}}>
          {p.name}: {prefix}{parseFloat(p.value||0).toFixed(0)}
        </div>
      ))}
    </div>
  );
};

/* ── Brand Drill-Down Panel ───────────────────────────────────── */
function BrandDetail({ brand, year, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    brandSkuApi.detail({ brand_id: brand.id, year }).then(d => { setData(d); setLoading(false); });
  }, [brand.id, year]);

  const trendData = (data?.monthlyTrend || []).map(r => ({
    month: MONTH_LABELS[parseInt(r.month?.slice(5) || '0')],
    profit: parseFloat(r.profit || 0),
    units:  parseInt(r.units || 0),
  }));

  return (
    <div style={{background:'var(--navy)',border:`1px solid ${brand.color}44`,borderRadius:'var(--radius)',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',background:`${brand.color}11`}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{width:10,height:10,borderRadius:'50%',background:brand.color,display:'inline-block'}}/>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1,color:'var(--cream)'}}>{brand.name.toUpperCase()} · BRAND ANALYSIS</span>
          <span style={{fontSize:11,color:'var(--cream-30)'}}>{year}</span>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--cream-60)',cursor:'pointer',fontSize:18,lineHeight:1}}>✕</button>
      </div>

      {loading ? (
        <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading brand data…</div>
      ) : (
        <div style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>
          {/* Monthly trend for this brand */}
          {trendData.length > 0 && (
            <div>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:10}}>Monthly Profit Trend</div>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={trendData} margin={{top:0,right:8,left:0,bottom:0}}>
                  <XAxis dataKey="month" tick={{fill:'rgba(245,242,235,.4)',fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:'rgba(245,242,235,.4)',fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v>=1000?(v/1000).toFixed(0)+'k':v}`}/>
                  <Tooltip content={<Tip/>}/>
                  <Bar dataKey="profit" name="Profit" radius={[3,3,0,0]}>
                    {trendData.map((_,i) => (
                      <Cell key={i} fill={brand.color} fillOpacity={i===trendData.length-1?1:.55}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top channels */}
          {data?.channels?.length > 0 && (
            <div>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:8}}>Top Channels</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {data.channels.map(c => (
                  <div key={c.channel} style={{background:'rgba(245,242,235,.06)',borderRadius:6,padding:'4px 10px',fontSize:11}}>
                    <span style={{color:'var(--cream-60)'}}>{c.channel}</span>
                    <span style={{color:'#7fc93e',fontWeight:700,marginLeft:8}}>SGD {parseFloat(c.profit).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SKU table */}
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:8}}>
              SKU Performance ({data?.skus?.length || 0} products)
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:500}}>
                <thead>
                  <tr>
                    {['Product / SKU','Units','Revenue','Profit','Last Sale','Sale Days'].map(h=>(
                      <th key={h} style={{padding:'7px 10px',textAlign:['Units','Revenue','Profit','Sale Days'].includes(h)?'right':'left',fontSize:9,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.skus || []).map(s => (
                    <tr key={s.id} style={{borderBottom:'1px solid rgba(245,242,235,.04)'}}>
                      <td style={{padding:'8px 10px',color:'var(--cream)',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        <div>{s.item_series}</div>
                        {s.variation && <div style={{fontSize:10,color:'var(--cream-30)',marginTop:1}}>{s.variation}</div>}
                      </td>
                      <td style={{padding:'8px 10px',textAlign:'right',color:'var(--cream)'}}>{s.units}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',color:'var(--cream)',fontWeight:600}}>{fmt.sgd(s.revenue)}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:'#7fc93e'}}>{fmt.sgd(s.profit)}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',color:'var(--cream-30)',fontSize:10}}>{fmt.date(s.last_sale)}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',color:'var(--cream-30)'}}>{s.sale_days}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Dashboard ───────────────────────────────────────────── */
export default function Dashboard() {
  const nav = useNavigate();
  const [summary,     setSummary]     = useState(null);
  const [trend,       setTrend]       = useState([]);
  const [partners,    setPartners]    = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const [b2cMode,     setB2cMode]     = useState(false);
  const [brands,      setBrands]      = useState([]);
  const [selectedBrand, setSelected] = useState(null); // { id, name, color }
  const [loading,     setLoading]     = useState(true);
  const [upsell,      setUpsell]      = useState(null);
  const period  = thisMonth();
  const year    = thisYear();
  const curYear = new Date().getFullYear();

  useEffect(() => {
    Promise.all([
      salesApi.summary({ date_from:period.from, date_to:period.to }),
      reportsApi.trend({ year: curYear }),
      partnerReportApi.top({ date_from:year.from, date_to:year.to, limit:10 }),
      brandsApi.getAll(),
      reportsApi.allChannels({ date_from:year.from, date_to:year.to }),
    ]).then(([sum, tr, pts, br, ac]) => {
      setSummary(sum); setTrend(tr); setPartners(pts); setBrands(br); setAllChannels(ac); setLoading(false);
    }).catch(() => setLoading(false));
    reportsApi.upsell().then(setUpsell).catch(() => {});
  }, []);

  const trendData = trend.map(r => ({
    month:   MONTH_LABELS[parseInt(r.month?.slice(5) || '0')],
    profit:  parseFloat(r.profit  || 0),
    revenue: parseFloat(r.revenue || 0),
  }));

  return (
    <div style={{display:'flex',flexDirection:'column',gap:18}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1.5,color:'var(--cream)'}}>DASHBOARD</h1>
          <div style={{fontSize:11,color:'var(--cream-30)',marginTop:3}}>{period.label} · Singapore</div>
        </div>
        <Btn onClick={()=>nav('/sales/record')} size="md"><PlusCircle size={14}/> Record Sale</Btn>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
        <KpiCard label={`${period.label} Profit`} featured
          value={loading?'…':`SGD ${parseFloat(summary?.totals?.profit||0).toFixed(2)}`}
          sub="gross, excl. operating costs"/>
        <KpiCard label="Revenue (month)"
          value={loading?'…':`SGD ${parseFloat(summary?.totals?.revenue||0).toFixed(2)}`}
          sub={`${summary?.totals?.transactions||0} transactions`}/>
        <KpiCard label="Units Sold (month)"
          value={loading?'…':String(summary?.totals?.units_sold||0)}
          sub="across all brands"/>
        <KpiCard label="Active Partners"
          value={loading?'…':String(partners.length||0)}
          sub="ranked by YTD profit"/>
      </div>

      {/* Brand selector row */}
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:11,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)'}}>Brand Analysis:</span>
        <button onClick={()=>setSelected(null)}
          style={{padding:'5px 14px',borderRadius:20,border:`1px solid ${!selectedBrand?'var(--orange)':'var(--border)'}`,cursor:'pointer',fontSize:11,fontWeight:600,
            background:!selectedBrand?'rgba(243,111,74,.12)':'transparent',color:!selectedBrand?'var(--orange)':'var(--cream-60)'}}>
          Overview
        </button>
        {brands.map(b => (
          <button key={b.id} onClick={()=>setSelected(selectedBrand?.id===b.id ? null : b)}
            style={{padding:'5px 14px',borderRadius:20,border:`1px solid ${selectedBrand?.id===b.id?b.color:'var(--border)'}`,cursor:'pointer',fontSize:11,fontWeight:600,
              background:selectedBrand?.id===b.id?`${b.color}22`:'transparent',color:selectedBrand?.id===b.id?b.color:'var(--cream-60)',
              display:'flex',alignItems:'center',gap:5}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:b.color}}/>
            {b.name}
          </button>
        ))}
      </div>

      {/* Brand drill-down OR overview */}
      {selectedBrand ? (
        <BrandDetail brand={selectedBrand} year={curYear} onClose={()=>setSelected(null)}/>
      ) : (
        <>
          {/* Overview: trend + brand bars */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            {/* Monthly trend */}
            <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
              <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:1,color:'var(--cream)'}}>MONTHLY PROFIT · {curYear}</span>
                <span style={{fontSize:10,color:'var(--cream-30)'}}>Click a brand above to filter</span>
              </div>
              <div style={{padding:'16px 8px 8px'}}>
                {loading ? <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
                : trendData.length === 0 ? <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No data yet</div>
                : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={trendData} margin={{top:0,right:16,left:0,bottom:0}}>
                      <XAxis dataKey="month" tick={{fill:'rgba(245,242,235,.4)',fontSize:11}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:'rgba(245,242,235,.4)',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v>=1000?(v/1000).toFixed(0)+'k':v}`}/>
                      <Tooltip content={<Tip/>}/>
                      <Bar dataKey="profit" name="Profit" radius={[4,4,0,0]}>
                        {trendData.map((_,i) => (
                          <Cell key={i} fill={i===trendData.length-1?'#f36f4a':'rgba(243,111,74,.45)'}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Brand bars */}
            <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
              <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:1,color:'var(--cream)'}}>
                  BRANDS · {period.label.split(' ')[0].toUpperCase()}
                </span>
                <span style={{fontSize:10,color:'var(--cream-30)'}}>Click brand name for SKU detail</span>
              </div>
              <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:11}}>
                {loading ? <div style={{color:'var(--cream-30)',fontSize:12}}>Loading…</div>
                : (summary?.byBrand||[]).length === 0 ? <div style={{color:'var(--cream-30)',fontSize:12}}>No data this month</div>
                : (summary.byBrand||[]).map(b => {
                    const max = summary.byBrand[0]?.profit || 1;
                    const pct = Math.max(4, Math.round((b.profit/max)*100));
                    const brand = brands.find(br => br.name === b.name);
                    return (
                      <div key={b.id} style={{cursor:'pointer'}} onClick={()=>setSelected(brand||b)}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,alignItems:'center'}}>
                          <span style={{fontSize:10,fontWeight:700,color:'var(--cream)',display:'flex',alignItems:'center',gap:6}}>
                            <span style={{width:7,height:7,borderRadius:'50%',background:b.color,display:'inline-block'}}/>
                            {b.name}
                          </span>
                          <span style={{fontSize:10,color:'var(--cream-30)',display:'flex',alignItems:'center',gap:6}}>
                            SGD {parseFloat(b.profit||0).toFixed(2)} · {b.units}u
                            <ChevronRight size={11} style={{color:'var(--cream-30)'}}/>
                          </span>
                        </div>
                        <div style={{height:5,background:'var(--cream-10)',borderRadius:3,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct}%`,background:b.color,borderRadius:3,transition:'width .4s'}}/>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </div>
          </div>

          {/* Top Partners / All Channels table */}
          <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:1,color:'var(--cream)'}}>
                {b2cMode ? 'ALL CHANNELS · YTD PROFIT RANKING' : 'TOP PARTNERS · YTD PROFIT RANKING'}
              </span>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:10,color:'var(--cream-30)'}}>Jan – {new Date().toLocaleString('default',{month:'short'})} {curYear}</span>
                <div style={{display:'flex',borderRadius:6,overflow:'hidden',border:'1px solid var(--border)'}}>
                  {[['Partners','false'],['All Channels','true']].map(([label,val])=>(
                    <button key={val} onClick={()=>setB2cMode(val==='true')}
                      style={{padding:'4px 10px',fontSize:10,fontWeight:700,border:'none',cursor:'pointer',
                        background: String(b2cMode)===val ? 'var(--orange)' : 'var(--navy-light)',
                        color: String(b2cMode)===val ? '#fff' : 'var(--cream-30)',
                        transition:'all .15s'}}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              {loading ? <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
              : (b2cMode ? allChannels : partners).length === 0
                ? <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No data yet</div>
                : (
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr>
                        {['#', b2cMode?'Channel / Partner':'Partner', 'Type', b2cMode?'Category':'Model', 'Units','Revenue','Profit'].map(h=>(
                          <th key={h} style={{padding:'8px 14px',textAlign:['#','Units','Revenue','Profit'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(b2cMode ? allChannels : partners).map((p,i) => (
                        <tr key={p.name||p.partner} style={{borderBottom:'1px solid var(--cream-05)'}}>
                          <td style={{padding:'9px 14px',color:'var(--cream-30)',textAlign:'right',fontSize:11}}>{i+1}</td>
                          <td style={{padding:'9px 14px',color:'var(--cream)',fontWeight:500}}>{p.name||p.partner}</td>
                          <td style={{padding:'9px 14px',color:'var(--cream-60)',fontSize:11}}>{p.business_type||'—'}</td>
                          <td style={{padding:'9px 14px'}}>
                            {b2cMode && p.category==='B2C'
                              ? <Badge color="#378ADD">{p.type_label||p.channel||'B2C'}</Badge>
                              : <Badge color={p.model==='Consignment'?'#378ADD':p.model==='Commission'?'#7F77DD':'#f36f4a'}>{p.model||p.type_label||'—'}</Badge>
                            }
                          </td>
                          <td style={{padding:'9px 14px',color:'var(--cream)',textAlign:'right'}}>{p.units}</td>
                          <td style={{padding:'9px 14px',color:'var(--cream)',textAlign:'right',fontWeight:600}}>SGD {parseFloat(p.revenue||0).toFixed(2)}</td>
                          <td style={{padding:'9px 14px',color:'#7fc93e',textAlign:'right',fontWeight:700}}>SGD {parseFloat(p.profit||0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          </div>

          {/* Order Portal: Catalogue vs Upsell effectiveness */}
          {upsell && (upsell.catalogue.qty > 0 || upsell.upsell.qty > 0) && (
            <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
              <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
                <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:1,color:'var(--cream)'}}>
                  ORDER PORTAL · CATALOGUE VS UPSELL
                </span>
                <span style={{fontSize:10,color:'var(--cream-30)',marginLeft:8}}>Approved orders only</span>
              </div>
              <div style={{padding:'16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:8}}>Units Ordered</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={[
                      { name:'Catalogue', qty: upsell.catalogue.qty },
                      { name:'Upsell',    qty: upsell.upsell.qty },
                    ]} margin={{top:0,right:8,left:0,bottom:0}}>
                      <XAxis dataKey="name" tick={{fill:'rgba(245,242,235,.5)',fontSize:11}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:'rgba(245,242,235,.4)',fontSize:10}} axisLine={false} tickLine={false}/>
                      <Tooltip content={<Tip prefix=""/>}/>
                      <Bar dataKey="qty" name="Units" radius={[4,4,0,0]}>
                        <Cell fill="rgba(243,111,74,.45)"/>
                        <Cell fill="#f36f4a"/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:8}}>Estimated Amount (SGD)</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={[
                      { name:'Catalogue', amount: upsell.catalogue.amount },
                      { name:'Upsell',    amount: upsell.upsell.amount },
                    ]} margin={{top:0,right:8,left:0,bottom:0}}>
                      <XAxis dataKey="name" tick={{fill:'rgba(245,242,235,.5)',fontSize:11}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:'rgba(245,242,235,.4)',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v>=1000?(v/1000).toFixed(0)+'k':v}`}/>
                      <Tooltip content={<Tip/>}/>
                      <Bar dataKey="amount" name="Amount" radius={[4,4,0,0]}>
                        <Cell fill="rgba(127,201,62,.45)"/>
                        <Cell fill="#7fc93e"/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{padding:'0 16px 14px',fontSize:10,color:'var(--cream-30)',lineHeight:1.4}}>
                Amount uses each product's current wholesale price as an estimate — directional, not an exact historical figure.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
