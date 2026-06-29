import React, { useState, useEffect } from 'react';
import { productsApi, brandsApi } from '../api';
import { Page, Select, Input, Badge, Btn, Modal, FormRow, Divider, fmt } from '../components/ui';

const MARKET_FIELDS = {
  SG: [
    { key:'unit_cost',           label:'Unit Cost (SGD)' },
    { key:'price_wholesale_sg',  label:'Wholesale (SGD)' },
    { key:'price_consignment_sg',label:'Consignment (SGD)' },
    { key:'price_rrp_sg',        label:'RRP (SGD)' },
  ],
  MY: [
    { key:'unit_cost',          label:'Unit Cost (SGD)' },
    { key:'price_wholesale_my', label:'Wholesale (MYR)' },
    { key:'price_rrp_my',       label:'RRP (MYR)' },
  ],
  AU: [
    { key:'unit_cost',          label:'Unit Cost (SGD)' },
    { key:'price_wholesale_au', label:'Wholesale (AUD)' },
    { key:'price_rrp_au',       label:'RRP (AUD)' },
  ],
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [brands,   setBrands]   = useState([]);
  const [filterBrand, setFB]    = useState('');
  const [filterMkt,   setFM]    = useState('SG');
  const [search,   setSearch]   = useState('');
  const [modal,    setModal]    = useState(null);
  const [form,     setForm]     = useState({});
  const [saving,   setSaving]   = useState(false);

  const load = () => {
    const q = {};
    if (filterBrand) q.brand_id = filterBrand;
    if (search)      q.search   = search;
    productsApi.getAll(q).then(setProducts);
  };
  useEffect(() => { brandsApi.getAll().then(setBrands); }, []);
  useEffect(() => { load(); }, [filterBrand, search]);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.brand_id || !form.item_series) return;
    setSaving(true);
    try {
      if (modal === 'edit') await productsApi.update(form.id, form);
      else                  await productsApi.create(form);
      load(); setModal(null);
    } finally { setSaving(false); }
  }

  const mktCols = MARKET_FIELDS[filterMkt] || MARKET_FIELDS.SG;

  const currencyLabel = { SG:'SGD', MY:'MYR', AU:'AUD' }[filterMkt];

  return (
    <Page title="PRODUCTS & PRICING" subtitle={`${products.length} SKUs`}
      action={<Btn onClick={() => { setForm({ is_active:1 }); setModal('add'); }}><span style={{fontSize:16}}>+</span> Add Product</Btn>}>

      {/* Filters */}
      <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
        {/* Market selector — prominent */}
        <div style={{display:'flex',gap:4}}>
          {['SG','MY','AU'].map(m => (
            <button key={m} onClick={() => setFM(m)}
              style={{padding:'6px 14px',borderRadius:6,border:'1px solid var(--border)',cursor:'pointer',fontSize:12,fontWeight:700,
                background: filterMkt===m ? 'var(--orange)' : 'var(--navy)',
                color: filterMkt===m ? '#fff' : 'var(--cream-60)'}}>
              {m}
            </button>
          ))}
        </div>
        <Select label="Brand" value={filterBrand} onChange={e=>setFB(e.target.value)} style={{width:170}}>
          <option value="">All brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Input label="Search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, variation, barcode…" style={{width:220}}/>
        <div style={{fontSize:11,color:'var(--cream-30)',paddingBottom:10}}>
          Showing <strong style={{color:'var(--cream)'}}>{filterMkt}</strong> pricing columns
        </div>
      </div>

      {/* Table — scrollable */}
      <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:700}}>
            <thead>
              <tr>
                <th style={th()}>Brand</th>
                <th style={th()}>Item Series</th>
                <th style={th()}>Variation</th>
                <th style={th()}>Barcode</th>
                {mktCols.map(c => <th key={c.key} style={th('right')}>{c.label}</th>)}
                <th style={th()}/>
              </tr>
            </thead>
            <tbody>
              {products.length === 0
                ? <tr><td colSpan={5+mktCols.length} style={{padding:40,textAlign:'center',color:'var(--cream-30)'}}>No products found</td></tr>
                : products.map(p => (
                  <tr key={p.id} style={{borderBottom:'1px solid rgba(245,242,235,.04)',cursor:'pointer'}}
                    onClick={() => { setForm({...p}); setModal('edit'); }}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(245,242,235,.03)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={td()}><Badge color={p.brand_color}>{p.brand_name}</Badge></td>
                    <td style={td()}>{p.item_series}</td>
                    <td style={{...td(),color:'var(--cream-60)'}}>{p.variation||'—'}</td>
                    <td style={{...td(),color:'var(--cream-60)',fontSize:11}}>{p.barcode||'—'}</td>
                    {mktCols.map(c => (
                      <td key={c.key} style={{...td('right'),color: c.key==='unit_cost'?'var(--cream-30)':'var(--cream)'}}>
                        {parseFloat(p[c.key]||0)>0 ? `${parseFloat(p[c.key]).toFixed(2)}` : '—'}
                      </td>
                    ))}
                    <td style={td()}>
                      <Btn size="sm" variant="ghost" onClick={e=>{e.stopPropagation();setForm({...p});setModal('edit');}}>Edit</Btn>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal open={!!modal} title={modal==='edit'?'EDIT PRODUCT':'ADD PRODUCT'} onClose={()=>setModal(null)} width={640}>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <FormRow cols={2}>
            <Select label="Brand *" value={form.brand_id||''} onChange={e=>sf('brand_id',e.target.value)}>
              <option value="">— Select brand —</option>
              {brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            <Input label="Item Series *" value={form.item_series||''} onChange={e=>sf('item_series',e.target.value)} placeholder="e.g. 4108 GiGwi Plush Friendz"/>
          </FormRow>
          <FormRow cols={2}>
            <Input label="Variation" value={form.variation||''} onChange={e=>sf('variation',e.target.value)} placeholder="e.g. Dinosaur Backpack, 100g"/>
            <Input label="Barcode" value={form.barcode||''} onChange={e=>sf('barcode',e.target.value)} placeholder="Optional"/>
          </FormRow>

          <Divider label="SG Pricing (SGD)"/>
          <FormRow cols={4}>
            <Input label="Unit Cost"   type="number" step="0.01" value={form.unit_cost||''}            onChange={e=>sf('unit_cost',e.target.value)}            placeholder="0.00"/>
            <Input label="Wholesale"   type="number" step="0.01" value={form.price_wholesale_sg||''}   onChange={e=>sf('price_wholesale_sg',e.target.value)}   placeholder="0.00"/>
            <Input label="Consignment" type="number" step="0.01" value={form.price_consignment_sg||''} onChange={e=>sf('price_consignment_sg',e.target.value)} placeholder="0.00"/>
            <Input label="RRP"         type="number" step="0.01" value={form.price_rrp_sg||''}         onChange={e=>sf('price_rrp_sg',e.target.value)}         placeholder="0.00"/>
          </FormRow>

          <Divider label="MY Pricing (MYR)"/>
          <FormRow cols={2}>
            <Input label="Wholesale MY" type="number" step="0.01" value={form.price_wholesale_my||''} onChange={e=>sf('price_wholesale_my',e.target.value)} placeholder="0.00"/>
            <Input label="RRP MY"       type="number" step="0.01" value={form.price_rrp_my||''}       onChange={e=>sf('price_rrp_my',e.target.value)}       placeholder="0.00"/>
          </FormRow>

          <Divider label="AU Pricing (AUD)"/>
          <FormRow cols={2}>
            <Input label="Wholesale AU" type="number" step="0.01" value={form.price_wholesale_au||''} onChange={e=>sf('price_wholesale_au',e.target.value)} placeholder="0.00"/>
            <Input label="RRP AU"       type="number" step="0.01" value={form.price_rrp_au||''}       onChange={e=>sf('price_rrp_au',e.target.value)}       placeholder="0.00"/>
          </FormRow>

          <Input label="Notes" value={form.notes||''} onChange={e=>sf('notes',e.target.value)} placeholder="Optional"/>
          <div style={{display:'flex',gap:10,paddingTop:4}}>
            <Btn onClick={save} disabled={saving} size="lg" style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'Save Product'}</Btn>
            {modal==='edit' && (
              <Btn variant="danger" onClick={async()=>{await productsApi.delete(form.id);load();setModal(null);}}>Archive</Btn>
            )}
          </div>
        </div>
      </Modal>
    </Page>
  );
}

// Style helpers
const th = (align='left') => ({
  padding:'9px 12px',textAlign:align,fontSize:9.5,fontWeight:700,
  letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',
  borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:'var(--navy)',
});
const td = (align='left') => ({
  padding:'9px 12px',textAlign:align,color:'var(--cream)',verticalAlign:'middle',whiteSpace:'nowrap',
});
