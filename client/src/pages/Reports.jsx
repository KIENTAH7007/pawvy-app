import React, { useState } from 'react';
import { reportsApi } from '../api';
import { Page, KpiCard, Input, Select, Btn, Badge, fmt } from '../components/ui';
export default function Reports() {
  const [pnl,setPnl]=useState(null);const [loading,setL]=useState(false);
  const [from,setFrom]=useState(`${new Date().getFullYear()}-01-01`);
  const [to,setTo]=useState(new Date().toISOString().slice(0,10));
  const [market,setMkt]=useState('');
  function run(){setL(true);const q={date_from:from,date_to:to};if(market)q.market=market;reportsApi.pnl(q).then(d=>{setPnl(d);setL(false);}).catch(()=>setL(false));}
  return(
    <Page title="REPORTS & P&L" subtitle="Filter by any date range — for tax filing or business review">
      <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
        <Input label="From" type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{width:155}}/>
        <Input label="To"   type="date" value={to}   onChange={e=>setTo(e.target.value)}   style={{width:155}}/>
        <Select label="Market" value={market} onChange={e=>setMkt(e.target.value)} style={{width:120}}>
          <option value="">All markets</option>{['SG','MY','AU'].map(m=><option key={m} value={m}>{m}</option>)}
        </Select>
        <Btn onClick={run} disabled={loading} size="md">{loading?'Calculating…':'Run Report'}</Btn>
      </div>
      {pnl&&(
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
            <KpiCard label="Revenue" value={`SGD ${parseFloat(pnl.revenue).toFixed(2)}`}/>
            <KpiCard label="Gross Profit" value={`SGD ${parseFloat(pnl.gross_profit).toFixed(2)}`}/>
            <KpiCard label="Operating Costs" value={`SGD ${parseFloat(pnl.operating_costs).toFixed(2)}`}/>
            <KpiCard label="NET PROFIT" value={`SGD ${parseFloat(pnl.net_profit).toFixed(2)}`} featured trend={pnl.net_profit>=0?'Profitable':'Loss'} trendUp={pnl.net_profit>=0}/>
          </div>
          <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:20}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:1,color:'var(--cream)',marginBottom:14}}>P&L SUMMARY · {pnl.period.from} → {pnl.period.to}</div>
            {[
              {label:'Revenue',value:pnl.revenue,c:'var(--cream)'},
              {label:'− Cost of Goods Sold',value:`(${pnl.cogs})`,c:'#f87171'},
              {label:'= Gross Profit',value:pnl.gross_profit,c:'#7fc93e',bold:true},
              {label:'− Operating Costs',value:`(${pnl.operating_costs})`,c:'#f87171'},
              {label:'− Inventory Write-offs',value:`(${pnl.writeoffs})`,c:'#f87171'},
              {label:'= Net Profit',value:pnl.net_profit,c:pnl.net_profit>=0?'#7fc93e':'#f87171',bold:true,big:true},
            ].map(r=>(
              <div key={r.label} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--cream-05)'}}>
                <span style={{fontSize:r.big?13:12,color:r.bold?'var(--cream)':'var(--cream-60)',fontWeight:r.bold?700:400}}>{r.label}</span>
                <span style={{fontSize:r.big?17:13,fontFamily:r.big?"'Bebas Neue',sans-serif":'inherit',color:r.c,fontWeight:700}}>
                  SGD {parseFloat(String(r.value).replace(/[()]/g,'')).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          {pnl.by_brand?.length>0&&(
            <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:20}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:1,color:'var(--cream)',marginBottom:14}}>BY BRAND</div>
              {pnl.by_brand.map(b=>(
                <div key={b.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--cream-05)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}><Badge color={b.color}>{b.name}</Badge><span style={{fontSize:11,color:'var(--cream-30)'}}>{b.units} units</span></div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#7fc93e'}}>SGD {parseFloat(b.profit).toFixed(2)}</div>
                    <div style={{fontSize:10,color:'var(--cream-30)'}}>Rev: SGD {parseFloat(b.revenue).toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
