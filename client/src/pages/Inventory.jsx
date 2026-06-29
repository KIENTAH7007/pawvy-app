import React, { useState, useEffect } from 'react';
import { inventoryApi, brandsApi } from '../api';
import { Page, Table, Badge, Select, fmt } from '../components/ui';
export default function Inventory() {
  const [rows,setRows]=useState([]);const [brands,setBrands]=useState([]);const [fb,setFb]=useState('');
  const load=()=>inventoryApi.getAll(fb?{brand_id:fb}:{}).then(setRows);
  useEffect(()=>{brandsApi.getAll().then(setBrands);},[]);
  useEffect(()=>{load();},[fb]);
  const cols=[
    {key:'brand_name',label:'Brand',render:(v,r)=><Badge color={r.brand_color}>{v}</Badge>},
    {key:'item_series',label:'Product'},{key:'variation',label:'Variation',render:v=>v||'—'},
    {key:'location',label:'Location'},{key:'partner_name',label:'Partner',render:v=>v||'—'},
    {key:'qty',label:'Qty',align:'right',render:v=><span style={{fontWeight:700,color:v<=0?'#f87171':v<=5?'#fbbf24':'#7fc93e'}}>{v}</span>},
    {key:'updated_at',label:'Updated',render:v=>fmt.date(v)},
  ];
  return(
    <Page title="INVENTORY" subtitle="Stock levels by product and location">
      <div style={{display:'flex',gap:10}}>
        <Select label="Brand" value={fb} onChange={e=>setFb(e.target.value)} style={{width:180}}>
          <option value="">All brands</option>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </div>
      <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden'}}>
        <Table cols={cols} rows={rows} emptyMsg="No inventory records yet — add products and set stock levels"/>
      </div>
    </Page>
  );
}
