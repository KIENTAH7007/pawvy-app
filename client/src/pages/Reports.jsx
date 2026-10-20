import React, { useState } from 'react';
import { reportsApi } from '../api';
import FxRateCard from '../components/FxRateCard';
import { Page, KpiCard, Input, Btn, Badge } from '../components/ui';
import { localDateStr } from '../utils/dates';
export default function Reports() {
  const [pnl,setPnl]=useState(null);const [loading,setL]=useState(false);
  const [expanded,setExpanded]=useState({}); // { opex: bool, writeoffs: bool } — toggled breakdown rows
  const [from,setFrom]=useState(`${new Date().getFullYear()}-01-01`);
  const [to,setTo]=useState(localDateStr());
  const [view,setView]=useState('SG'); // SG (default) | MY | ALL | COMPARE
  const [cmp,setCmp]=useState(null);
  const cur=pnl?.currency||'SGD';
  const money=v=>`${cur} ${parseFloat(v||0).toFixed(2)}`;
  function run(){
    setL(true);setPnl(null);setCmp(null);
    const base={date_from:from,date_to:to};
    if(view==='COMPARE'){
      Promise.all([
        reportsApi.pnl({...base,market:'SG'}),
        reportsApi.pnl({...base,market:'MY'}),
        reportsApi.pnl({...base,market:'MY',as:'sgd'}),
        reportsApi.topProducts({...base,market:'SG',limit:10}),
        reportsApi.topProducts({...base,market:'MY',limit:10}),
      ]).then(([sg,my,mySgd,tpSg,tpMy])=>{setCmp({sg,my,mySgd,tpSg,tpMy});setL(false);}).catch(()=>setL(false));
      return;
    }
    const q={...base};if(view!=='ALL')q.market=view;
    reportsApi.pnl(q).then(d=>{setPnl(d);setL(false);}).catch(()=>setL(false));
  }
  return(
    <Page title="REPORTS & P&L" subtitle="Filter by any date range — for tax filing or business review">
      <FxRateCard/>
      <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
        <Input label="From" type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{width:155}}/>
        <Input label="To"   type="date" value={to}   onChange={e=>setTo(e.target.value)}   style={{width:155}}/>
        <div>
          <div style={{fontSize:10,color:'var(--cream-30)',letterSpacing:1,marginBottom:4}}>MARKET</div>
          <div style={{display:'flex',gap:4}}>
            {[['SG','SG'],['MY','MY'],['ALL','All markets'],['COMPARE','Compare']].map(([k,l])=>(
              <button key={k} onClick={()=>{setView(k);setPnl(null);setCmp(null);}}
                style={{padding:'8px 12px',borderRadius:6,border:'1px solid var(--border)',cursor:'pointer',fontSize:12,fontWeight:700,
                  background:view===k?'var(--cream)':'transparent',color:view===k?'var(--navy)':'var(--cream-60)'}}>{l}</button>
            ))}
          </div>
        </div>
        <Btn onClick={run} disabled={loading} size="md">{loading?'Calculating…':'Run Report'}</Btn>
      </div>
      {pnl&&(
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {pnl.fx_note&&<div style={{fontSize:11,color:'var(--cream-60)',background:'var(--cream-05)',borderRadius:6,padding:'8px 12px'}}>All figures in <b>SGD equivalent</b> — {pnl.fx_note}. Write-offs and shipment cost variance are SG-side items.</div>}
          {pnl.currency==='MYR'&&<div style={{fontSize:11,color:'var(--cream-60)',background:'var(--cream-05)',borderRadius:6,padding:'8px 12px'}}>Figures in <b>MYR</b>. Product cost is held in SGD and converted at the rate saved on each sale. Write-offs and cost variance sit in the SG P&L, not here.</div>}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
            <KpiCard label="Revenue" value={money(pnl.revenue)}/>
            <KpiCard label="Gross Profit" value={money(pnl.gross_profit)}/>
            <KpiCard label="Operating Costs" value={money(pnl.operating_costs)}/>
            <KpiCard label="NET PROFIT" value={money(pnl.net_profit)} featured trend={pnl.net_profit>=0?'Profitable':'Loss'} trendUp={pnl.net_profit>=0}/>
          </div>
          <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:20}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:1,color:'var(--cream)',marginBottom:14}}>P&L SUMMARY · {pnl.period.from} → {pnl.period.to}</div>
            {[
              {label:'Revenue',value:pnl.revenue,c:'var(--cream)'},
              {label:'− Cost of Goods Sold',value:`(${pnl.cogs})`,c:'#f87171'},
              {label:'= Gross Profit',value:pnl.gross_profit,c:'#7fc93e',bold:true},
              {label:'− Operating Costs',value:`(${pnl.operating_costs})`,c:'#f87171',breakdownKey:'opex',breakdown:pnl.cost_breakdown,breakdownLabelKey:'category'},
              {label:'− Inventory Write-offs',value:`(${pnl.writeoffs})`,c:'#f87171',breakdownKey:'writeoffs',breakdown:pnl.writeoff_breakdown,breakdownLabelKey:'reason'},
              {label:'± Cost Variance (Shipments)',value:pnl.cost_variance,c:pnl.cost_variance>=0?'#7fc93e':'#f87171',signed:true},
              {label:'= Net Profit',value:pnl.net_profit,c:pnl.net_profit>=0?'#7fc93e':'#f87171',bold:true,big:true},
            ].map(r=>{
              const hasBreakdown = r.breakdownKey && r.breakdown?.length>0;
              const isOpen = hasBreakdown && expanded[r.breakdownKey];
              return (
              <div key={r.label}>
                <div
                  onClick={hasBreakdown ? ()=>setExpanded(p=>({...p,[r.breakdownKey]:!p[r.breakdownKey]})) : undefined}
                  style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--cream-05)',cursor:hasBreakdown?'pointer':'default'}}
                >
                  <span style={{fontSize:r.big?13:12,color:r.bold?'var(--cream)':'var(--cream-60)',fontWeight:r.bold?700:400}}>
                    {r.label}{hasBreakdown && <span style={{fontSize:9,color:'var(--cream-30)',marginLeft:6}}>{isOpen?'▲ hide breakdown':'▼ breakdown'}</span>}
                  </span>
                  <span style={{fontSize:r.big?17:13,fontFamily:r.big?"'Bebas Neue',sans-serif":'inherit',color:r.c,fontWeight:700}}>
                    {cur} {r.signed ? `${parseFloat(r.value)>=0?'+':''}${parseFloat(r.value).toFixed(2)}` : parseFloat(String(r.value).replace(/[()]/g,'')).toFixed(2)}
                  </span>
                </div>
                {isOpen && (
                  <div style={{padding:'4px 0 8px 16px',display:'flex',flexDirection:'column',gap:4}}>
                    {r.breakdown.map(b=>(
                      <div key={b[r.breakdownLabelKey]} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--cream-60)'}}>
                        <span>{b[r.breakdownLabelKey]}{b.units!==undefined && <span style={{color:'var(--cream-30)'}}> · {b.units} unit{b.units===1?'':'s'}</span>}</span>
                        <span>{cur} {parseFloat(b.total).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </div>
          {pnl.by_brand?.length>0&&(
            <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:20}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:1,color:'var(--cream)',marginBottom:14}}>BY BRAND</div>
              {pnl.by_brand.map(b=>(
                <div key={b.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--cream-05)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}><Badge color={b.color}>{b.name}</Badge><span style={{fontSize:11,color:'var(--cream-30)'}}>{b.units} units</span></div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#7fc93e'}}>{cur} {parseFloat(b.profit).toFixed(2)}</div>
                    <div style={{fontSize:10,color:'var(--cream-30)'}}>Rev: {cur} {parseFloat(b.revenue).toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {cmp&&<Compare c={cmp} from={from} to={to}/>}
    </Page>
  );
}


/* ── Compare: SG vs MY side by side ─────────────────────────────── */
const box={background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:20};
const h={fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:1,color:'var(--cream)',marginBottom:14};
const th={fontSize:10,color:'var(--cream-30)',letterSpacing:1,textAlign:'right',padding:'6px 8px'};
const td={fontSize:12,color:'var(--cream)',textAlign:'right',padding:'8px',borderTop:'1px solid var(--cream-05)'};
const n2=v=>parseFloat(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
function Compare({c,from,to}){
  const {sg,my,mySgd,tpSg,tpMy}=c;
  const diff=(a,b)=>{const d=a-b;return `${d>=0?'+':'−'}${n2(Math.abs(d))}`;};
  const pdiff=(a,b)=>`${a-b>=0?'+':'−'}${Math.abs(a-b).toFixed(1)} pts`;
  const money=[
    ['Revenue','revenue'],['− Cost of goods sold','cogs'],['= Gross profit','gross_profit'],
    ['− Operating costs','operating_costs'],['− Inventory write-offs','writeoffs'],['± Cost variance (shipments)','cost_variance'],['= Net profit','net_profit'],
  ];
  const plain=[
    ['Units sold','units_sold',v=>parseFloat(v||0).toLocaleString(),(a,b)=>`${a-b>=0?'+':'−'}${Math.abs(a-b).toLocaleString()}`],
    ['Orders','orders',v=>parseFloat(v||0).toLocaleString(),(a,b)=>`${a-b>=0?'+':'−'}${Math.abs(a-b).toLocaleString()}`],
    ['Avg order value (SGD eq.)',null,null,null],
    ['Gross margin %','gross_margin_pct',v=>`${parseFloat(v||0).toFixed(1)}%`,pdiff],
    ['Net margin %','net_margin_pct',v=>`${parseFloat(v||0).toFixed(1)}%`,pdiff],
  ];
  const aov=(p)=>p.orders?p.revenue/p.orders:0;
  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{fontSize:11,color:'var(--cream-60)',background:'var(--cream-05)',borderRadius:6,padding:'8px 12px'}}>
        {from} → {to}. SG is in SGD, MY in MYR; "MY in SGD" converts each MY sale at the rate saved on it, so the last column compares like with like. Write-offs and cost variance are SG-side only.
      </div>
      <div style={box}>
        <div style={h}>P&L · SG vs MY</div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr><th style={{...th,textAlign:'left'}}></th><th style={th}>SG (SGD)</th><th style={th}>MY (MYR)</th><th style={th}>MY in SGD</th><th style={th}>MY − SG (SGD)</th></tr></thead>
          <tbody>
            {money.map(([l,k])=>(
              <tr key={k}><td style={{...td,textAlign:'left',color:'var(--cream-60)',fontWeight:l.startsWith('=')?700:400}}>{l}</td>
                <td style={td}>{n2(sg[k])}</td><td style={td}>{n2(my[k])}</td><td style={td}>{n2(mySgd[k])}</td>
                <td style={{...td,color:mySgd[k]-sg[k]>=0?'#7fc93e':'#f87171'}}>{diff(mySgd[k],sg[k])}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={box}>
        <div style={h}>MEASURES THAT DON'T DEPEND ON CURRENCY</div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr><th style={{...th,textAlign:'left'}}></th><th style={th}>SG</th><th style={th}>MY</th><th style={th}>MY − SG</th></tr></thead>
          <tbody>
            {plain.map(([l,k,f,d])=> k ? (
              <tr key={l}><td style={{...td,textAlign:'left',color:'var(--cream-60)'}}>{l}</td><td style={td}>{f(sg[k])}</td><td style={td}>{f(my[k])}</td><td style={td}>{d(my[k]||0,sg[k]||0)}</td></tr>
            ) : (
              <tr key={l}><td style={{...td,textAlign:'left',color:'var(--cream-60)'}}>{l}</td><td style={td}>{n2(aov(sg))}</td><td style={td}>{n2(aov(mySgd))}</td><td style={td}>{diff(aov(mySgd),aov(sg))}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <BrandList title="BY BRAND · SG" cur="SGD" rows={sg.by_brand}/>
        <BrandList title="BY BRAND · MY" cur="MYR" rows={my.by_brand}/>
        <TopList title="TOP PRODUCTS · SG" cur="SGD" rows={tpSg.rows}/>
        <TopList title="TOP PRODUCTS · MY" cur="MYR" rows={tpMy.rows}/>
      </div>
    </div>
  );
}
function BrandList({title,cur,rows}){
  return(<div style={box}><div style={h}>{title}</div>
    {(rows||[]).length===0&&<div style={{fontSize:12,color:'var(--cream-30)'}}>No sales in this period.</div>}
    {(rows||[]).map(b=>(<div key={b.name} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--cream-05)'}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}><Badge color={b.color}>{b.name}</Badge><span style={{fontSize:11,color:'var(--cream-30)'}}>{b.units} units</span></div>
      <div style={{textAlign:'right'}}><div style={{fontSize:12,fontWeight:700,color:'#7fc93e'}}>{cur} {n2(b.profit)}</div><div style={{fontSize:10,color:'var(--cream-30)'}}>Rev {n2(b.revenue)}</div></div></div>))}
  </div>);
}
function TopList({title,cur,rows}){
  return(<div style={box}><div style={h}>{title}</div>
    {(rows||[]).length===0&&<div style={{fontSize:12,color:'var(--cream-30)'}}>No sales in this period.</div>}
    {(rows||[]).map((r,i)=>(<div key={r.id} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'7px 0',borderBottom:'1px solid var(--cream-05)'}}>
      <div style={{fontSize:12,color:'var(--cream)'}}>{i+1}. {r.item_series}{r.variation?` · ${r.variation}`:''}<div style={{fontSize:10,color:'var(--cream-30)'}}>{r.brand_name}</div></div>
      <div style={{textAlign:'right',whiteSpace:'nowrap'}}><div style={{fontSize:12,fontWeight:700}}>{r.units} units</div><div style={{fontSize:10,color:'var(--cream-30)'}}>{cur} {n2(r.revenue)}</div></div></div>))}
  </div>);
}
