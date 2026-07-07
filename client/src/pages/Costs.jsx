import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { costsApi } from '../api';
import { Page, Table, Badge, Btn, Modal, FormRow, Input, Select, KpiCard, fmt } from '../components/ui';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';

const CATS = ['Marketing','Storage','Delivery','Event','Platform Fee','Packaging','Other'];
const CAT_C = { Marketing:'#f36f4a',Storage:'#378ADD',Delivery:'#1D9E75',Event:'#7F77DD','Platform Fee':'#BA7517',Packaging:'#639922',Other:'#888' };

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const f = d => d.toISOString().slice(0, 10);
  return { from: f(from), to: f(to) };
}

const TrendTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#14213d', border: '1px solid rgba(245,242,235,.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--cream-60)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#f36f4a', fontWeight: 600 }}>SGD {parseFloat(payload[0].value || 0).toFixed(2)}</div>
    </div>
  );
};

export default function Costs() {
  const [costs,setCosts]=useState([]);const [sum,setSum]=useState(null);
  const [trend, setTrend] = useState([]);
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({date:new Date().toISOString().slice(0,10),market:'SG'});
  const [saving,setSaving]=useState(false);
  const defaultRange = currentMonthRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const isCurrentMonthOnly = dateFrom === defaultRange.from && dateTo === defaultRange.to;

  const load = () => {
    const q = {};
    if (dateFrom) q.date_from = dateFrom;
    if (dateTo)   q.date_to   = dateTo;
    costsApi.getAll(q).then(setCosts);
    costsApi.summary(q).then(setSum);
  };
  useEffect(()=>{load();},[dateFrom, dateTo]);
  useEffect(()=>{costsApi.trend({months:12}).then(setTrend);},[]);

  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));
  async function save(){
    if(!form.date||!form.category||!form.description||!form.amount)return;
    setSaving(true);
    try{await costsApi.create(form);load();setModal(false);setForm({date:new Date().toISOString().slice(0,10),market:'SG'});}
    finally{setSaving(false);}
  }
  async function remove(id){
    if(!window.confirm('Delete this cost entry? This cannot be undone.'))return;
    await costsApi.delete(id);
    load();
  }
  const cols=[
    {key:'date',label:'Date',render:v=>fmt.date(v)},
    {key:'category',label:'Category',render:v=><Badge color={CAT_C[v]||'#888'}>{v}</Badge>},
    {key:'description',label:'Description'},{key:'market',label:'Mkt'},
    {key:'receipt_ref',label:'Ref',render:v=>v||'—'},
    {key:'amount',label:'Amount',align:'right',render:v=><span style={{fontWeight:700,color:'#f87171'}}>SGD {parseFloat(v).toFixed(2)}</span>},
    {key:'actions',label:'',align:'right',render:(_,row)=>(
      <button onClick={e=>{e.stopPropagation();remove(row.id);}} title="Delete"
        style={{background:'none',border:'none',color:'rgba(248,113,113,.5)',cursor:'pointer',padding:4,display:'inline-flex',alignItems:'center'}}
        onMouseEnter={e=>e.currentTarget.style.color='#f87171'}
        onMouseLeave={e=>e.currentTarget.style.color='rgba(248,113,113,.5)'}>
        <Trash2 size={13}/>
      </button>
    )},
  ];

  // Reference line: mean + 1 standard deviation of the trailing 12 months.
  // A plain average isn't a useful "alert" threshold — roughly half of all
  // months would trivially exceed it even under totally normal variation.
  // Mean + 1 SD is only crossed by months that are genuinely higher than
  // typical, which is what makes it useful as a "this month looks off" signal.
  const trendValues = trend.map(t => t.total || 0);
  const trendMean = trendValues.length ? trendValues.reduce((a,b)=>a+b,0) / trendValues.length : 0;
  const trendVariance = trendValues.length ? trendValues.reduce((a,b)=>a+Math.pow(b-trendMean,2),0) / trendValues.length : 0;
  const trendStdev = Math.sqrt(trendVariance);
  const referenceLine = trendMean + trendStdev;

  return(
    <Page title="OPERATING COSTS" subtitle="Marketing, storage, delivery, events and other expenses"
      action={<Btn onClick={()=>setModal(true)}><span style={{fontSize:16}}>+</span> Add Cost</Btn>}>

      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',marginBottom:4}}>
        <Input label="From" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{width:150}}/>
        <Input label="To"   type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   style={{width:150}}/>
        {!isCurrentMonthOnly && (
          <Btn variant="ghost" size="sm" onClick={()=>{setDateFrom(defaultRange.from);setDateTo(defaultRange.to);}}>This month</Btn>
        )}
        <Btn variant="ghost" size="sm" onClick={()=>{setDateFrom('');setDateTo('');}}>All time</Btn>
      </div>
      {isCurrentMonthOnly && (
        <div style={{ fontSize: 11, color: 'var(--cream-30)', marginBottom: 10 }}>
          Showing this month only ({defaultRange.from} to {defaultRange.to}). Adjust From/To above, or click "All time", to see other periods.
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
        <KpiCard label={isCurrentMonthOnly ? "Total This Month" : "Total (Filtered)"} value={sum?`SGD ${parseFloat(sum.total||0).toFixed(2)}`:'…'}/>
        {(sum?.byCategory||[]).slice(0,3).map(c=>(
          <KpiCard key={c.category} label={c.category} value={`SGD ${parseFloat(c.total).toFixed(2)}`}/>
        ))}
      </div>

      <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, letterSpacing: 1, color: 'var(--cream)', marginBottom: 4 }}>
          MONTHLY TREND {trend.length > 0 && `(LAST ${trend.length} MONTH${trend.length !== 1 ? 'S' : ''})`}
        </div>
        {trend.length > 1 ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--cream-30)', marginBottom: 10 }}>
              Dashed reference line = average + 1 standard deviation (SGD {referenceLine.toFixed(2)}) — a month crossing this line is
              notably higher than your typical spend, not just "above average" (which about half of all months would be anyway).
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(245,242,235,.06)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: 'rgba(245,242,235,.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(245,242,235,.4)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<TrendTip />} />
                <ReferenceLine y={referenceLine} stroke="#f87171" strokeDasharray="5 5" label={{ value: 'Reference', fill: '#f87171', fontSize: 10, position: 'insideTopRight' }} />
                <Line type="monotone" dataKey="total" name="Operating Cost" stroke="#f36f4a" strokeWidth={2.5} dot={{ r: 4, fill: '#f36f4a' }} />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 12, color: 'var(--cream-30)' }}>
            {trend.length === 1
              ? 'Only one month of cost data so far — the trend chart needs at least 2 months to draw a line. It\'ll appear automatically once next month has an entry.'
              : 'No cost data yet — add some Operating Costs entries to see the trend here.'}
          </div>
        )}
      </div>

      <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden'}}>
        <Table cols={cols} rows={costs} emptyMsg="No costs recorded in this period"/>
      </div>
      <Modal open={modal} title="ADD OPERATING COST" onClose={()=>setModal(false)}>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <FormRow cols={2}>
            <Input label="Date *" type="date" value={form.date} onChange={e=>sf('date',e.target.value)}/>
            <Select label="Category *" value={form.category||''} onChange={e=>sf('category',e.target.value)}>
              <option value="">— Select —</option>
              {CATS.map(c=><option key={c} value={c}>{c}</option>)}
            </Select>
          </FormRow>
          <Input label="Description *" value={form.description||''} onChange={e=>sf('description',e.target.value)} placeholder="e.g. Storhub July rental"/>
          <FormRow cols={3}>
            <Input label="Amount (SGD) *" type="number" step="0.01" value={form.amount||''} onChange={e=>sf('amount',e.target.value)}/>
            <Select label="Market" value={form.market||'SG'} onChange={e=>sf('market',e.target.value)}>
              {['SG','MY','AU'].map(m=><option key={m} value={m}>{m}</option>)}
            </Select>
            <Input label="Receipt Ref" value={form.receipt_ref||''} onChange={e=>sf('receipt_ref',e.target.value)} placeholder="Optional"/>
          </FormRow>
          <Btn onClick={save} disabled={saving} size="lg" style={{justifyContent:'center'}}>{saving?'Saving…':'Save Cost'}</Btn>
        </div>
      </Modal>
    </Page>
  );
}
