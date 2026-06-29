import React, { useState, useEffect } from 'react';
import { costsApi } from '../api';
import { Page, Table, Badge, Btn, Modal, FormRow, Input, Select, KpiCard, fmt } from '../components/ui';
const CATS = ['Marketing','Storage','Delivery','Event','Platform Fee','Packaging','Other'];
const CAT_C = { Marketing:'#f36f4a',Storage:'#378ADD',Delivery:'#1D9E75',Event:'#7F77DD','Platform Fee':'#BA7517',Packaging:'#639922',Other:'#888' };
export default function Costs() {
  const [costs,setCosts]=useState([]);const [sum,setSum]=useState(null);
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({date:new Date().toISOString().slice(0,10),market:'SG'});
  const [saving,setSaving]=useState(false);
  const load=()=>{costsApi.getAll().then(setCosts);costsApi.summary().then(setSum);};
  useEffect(()=>{load();},[]);
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));
  async function save(){
    if(!form.date||!form.category||!form.description||!form.amount)return;
    setSaving(true);
    try{await costsApi.create(form);load();setModal(false);setForm({date:new Date().toISOString().slice(0,10),market:'SG'});}
    finally{setSaving(false);}
  }
  const cols=[
    {key:'date',label:'Date',render:v=>fmt.date(v)},
    {key:'category',label:'Category',render:v=><Badge color={CAT_C[v]||'#888'}>{v}</Badge>},
    {key:'description',label:'Description'},{key:'market',label:'Mkt'},
    {key:'receipt_ref',label:'Ref',render:v=>v||'—'},
    {key:'amount',label:'Amount',align:'right',render:v=><span style={{fontWeight:700,color:'#f87171'}}>SGD {parseFloat(v).toFixed(2)}</span>},
  ];
  return(
    <Page title="OPERATING COSTS" subtitle="Marketing, storage, delivery, events and other expenses"
      action={<Btn onClick={()=>setModal(true)}><span style={{fontSize:16}}>+</span> Add Cost</Btn>}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
        <KpiCard label="Total All Time" value={sum?`SGD ${parseFloat(sum.total||0).toFixed(2)}`:'…'}/>
        {(sum?.byCategory||[]).slice(0,3).map(c=>(
          <KpiCard key={c.category} label={c.category} value={`SGD ${parseFloat(c.total).toFixed(2)}`}/>
        ))}
      </div>
      <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden'}}>
        <Table cols={cols} rows={costs} emptyMsg="No costs recorded yet"/>
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
