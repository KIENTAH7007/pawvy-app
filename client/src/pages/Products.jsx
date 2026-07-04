import React, { useState, useEffect } from 'react';
import { productsApi, brandsApi } from '../api';
import { Page, Select, Input, Badge, Btn, Modal, FormRow, Divider } from '../components/ui';

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

const BRAND_COLORS = [
  '#f36f4a','#378ADD','#639922','#BA7517','#7F77DD','#1D9E75',
  '#E0445A','#F7B731','#20BF6B','#2D98DA','#8854D0','#A55EEA',
];

export default function Products() {
  const [products, setProducts] = useState([]);
  const [brands,   setBrands]   = useState([]);
  const [filterBrand, setFB]    = useState('');
  const [filterMkt,   setFM]    = useState('SG');
  const [search,   setSearch]   = useState('');
  const [showArchived, setShowArchived] = useState(false);  // Fix #2
  const [modal,    setModal]    = useState(null);  // 'add' | 'edit' | 'addBrand' | 'editBrand'
  const [form,     setForm]     = useState({});
  const [brandForm, setBrandForm] = useState({ name:'', color: BRAND_COLORS[0] });
  const [saving,   setSaving]   = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = () => {
    const q = {};
    if (filterBrand) q.brand_id = filterBrand;
    if (search)      q.search   = search;
    // Fix #2: show only active by default; show archived only when toggled
    if (!showArchived) q.active = 'true';
    productsApi.getAll(q).then(setProducts);
  };
  useEffect(() => { brandsApi.getAll().then(setBrands); }, []);
  useEffect(() => { load(); }, [filterBrand, search, showArchived]);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setSaveError('');
    if (!form.brand_id)   { setSaveError('Please select a Brand before saving.'); return; }
    if (!form.item_series){ setSaveError('Please enter an Item Series name before saving.'); return; }
    setSaving(true);
    try {
      if (modal === 'edit') await productsApi.update(form.id, form);
      else                  await productsApi.create(form);
      load(); setModal(null); setSaveError('');
    } catch(e) {
      setSaveError(`Save failed: ${e.message || 'unknown error'}`);
    } finally { setSaving(false); }
  }

  // Fix #1: Brand management
  async function saveBrand() {
    if (!brandForm.name) return;
    setSaving(true);
    try {
      if (modal === 'editBrand') {
        await brandsApi.update(brandForm.id, brandForm);
      } else {
        await brandsApi.create(brandForm);
      }
      const updated = await brandsApi.getAll();
      setBrands(updated);
      setModal(null);
      setBrandForm({ name:'', color: BRAND_COLORS[0] });
    } finally { setSaving(false); }
  }

  const mktCols = MARKET_FIELDS[filterMkt] || MARKET_FIELDS.SG;

  const activeCount   = products.filter(p => p.is_active !== 0).length;
  const archivedCount = products.filter(p => p.is_active === 0).length;

  return (
    <Page title="PRODUCTS & PRICING" subtitle={`${activeCount} active SKUs${archivedCount > 0 && showArchived ? ` + ${archivedCount} archived` : ''}`}
      action={
        <div style={{display:'flex',gap:8}}>
          <Btn variant="ghost" size="sm" onClick={() => { setBrandForm({ name:'', color: BRAND_COLORS[0] }); setModal('addBrand'); }}>
            + Add Brand
          </Btn>
          <Btn onClick={() => { setForm({ is_active:1 }); setModal('add'); }}><span style={{fontSize:16}}>+</span> Add Product</Btn>
        </div>
      }>

      {/* Filters */}
      <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
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

        {/* Fix #2: Show archived toggle */}
        <label style={{display:'flex',alignItems:'center',gap:7,paddingBottom:6,cursor:'pointer',fontSize:12,color:'var(--cream-60)'}}>
          <input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}
            style={{accentColor:'var(--orange)',width:14,height:14}}/>
          Show archived
        </label>

        <div style={{fontSize:11,color:'var(--cream-30)',paddingBottom:10}}>
          Showing <strong style={{color:'var(--cream)'}}>{filterMkt}</strong> pricing
        </div>
      </div>

      {/* Brands quick-view */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        {brands.map(b => (
          <div key={b.id} onClick={() => { setBrandForm({...b}); setModal('editBrand'); }}
            style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:20,
              border:`1px solid ${b.color}44`,cursor:'pointer',
              background:`${b.color}11`}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:b.color,display:'inline-block'}}/>
            <span style={{fontSize:11,color:b.color,fontWeight:600}}>{b.name}</span>
          </div>
        ))}
      </div>

      {/* Table */}
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
                : products.map(p => {
                  const archived = p.is_active === 0;
                  return (
                    <tr key={p.id}
                      style={{borderBottom:'1px solid rgba(245,242,235,.04)',cursor:'pointer',opacity:archived?0.55:1}}
                      onClick={() => { setForm({...p}); setModal('edit'); }}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(245,242,235,.03)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={td()}><Badge color={p.brand_color}>{p.brand_name}</Badge></td>
                      <td style={td()}>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          {p.image_data
                            ? <img src={p.image_data} alt="" style={{width:36,height:36,objectFit:'cover',borderRadius:6,flexShrink:0}}/>
                            : <div style={{width:36,height:36,borderRadius:6,background:'rgba(245,242,235,.06)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:14}}>📷</div>
                          }
                          <div>
                            {p.item_series}
                            {archived && <span style={{marginLeft:6,fontSize:9,fontWeight:700,color:'var(--cream-30)',background:'rgba(245,242,235,.08)',padding:'1px 5px',borderRadius:3}}>ARCHIVED</span>}
                          </div>
                        </div>
                      </td>
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
                  );
                })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Add / Edit Modal */}
      <Modal open={modal==='add'||modal==='edit'} title={modal==='edit'?'EDIT PRODUCT':'ADD PRODUCT'} onClose={()=>{setModal(null);setSaveError('');}} width={640}>
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

          {/* ── Product Image ── */}
          {modal === 'edit' && (
            <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:10}}>Product Image</div>
              <div style={{display:'flex',gap:14,alignItems:'flex-start',flexWrap:'wrap'}}>
                {form.image_data ? (
                  <img src={form.image_data} alt="Product" style={{width:120,height:120,objectFit:'cover',borderRadius:8,border:'1px solid var(--border)'}}/>
                ) : (
                  <div style={{width:120,height:120,borderRadius:8,border:'2px dashed var(--border)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'var(--cream-30)',fontSize:11,gap:4}}>
                    <span style={{fontSize:28}}>📷</span>
                    <span>No image</span>
                  </div>
                )}
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <label style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:7,border:'1px solid var(--border)',cursor:'pointer',fontSize:12,color:'var(--cream-60)',background:'transparent'}}>
                    <span>📁</span>
                    {form.image_data ? 'Replace Image' : 'Upload Image'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" style={{display:'none'}}
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB. Please resize and try again.'); return; }
                        const reader = new FileReader();
                        reader.onload = async ev => {
                          const data = ev.target.result;
                          await productsApi.uploadImage(form.id, data);
                          setForm(f => ({ ...f, image_data: data }));
                          load();
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {form.image_data && (
                    <button onClick={async()=>{await productsApi.deleteImage(form.id);setForm(f=>({...f,image_data:null}));load();}}
                      style={{padding:'8px 14px',borderRadius:7,border:'1px solid rgba(248,113,113,.3)',cursor:'pointer',fontSize:12,color:'#f87171',background:'transparent',textAlign:'left'}}>
                      🗑 Remove Image
                    </button>
                  )}
                  <div style={{fontSize:10,color:'var(--cream-30)',lineHeight:1.5}}>
                    JPG, PNG or WebP · max 2MB<br/>Recommended: 800×800px square
                  </div>
                </div>
              </div>
            </div>
          )}

          {saveError && (
            <div style={{background:'rgba(248,113,113,.12)',border:'1px solid rgba(248,113,113,.3)',borderRadius:7,padding:'9px 14px',fontSize:12,color:'#f87171'}}>
              ⚠ {saveError}
            </div>
          )}

          <div style={{display:'flex',gap:10,paddingTop:4}}>
            <Btn onClick={save} disabled={saving} size="lg" style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'Save Product'}</Btn>
            {modal==='edit' && (
              form.is_active !== 0
                ? <Btn variant="danger" onClick={async()=>{await productsApi.delete(form.id);load();setModal(null);}}>Archive</Btn>
                : <Btn variant="secondary" onClick={async()=>{await productsApi.update(form.id,{...form,is_active:1});load();setModal(null);}}>Restore</Btn>
            )}
          </div>
        </div>
      </Modal>

      {/* Fix #1: Brand Add / Edit Modal */}
      <Modal open={modal==='addBrand'||modal==='editBrand'}
        title={modal==='editBrand'?'EDIT BRAND':'ADD NEW BRAND'}
        onClose={()=>setModal(null)} width={420}>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <Input label="Brand Name *" value={brandForm.name||''} onChange={e=>setBrandForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Better Bone"/>
          <div>
            <div style={{fontSize:11,color:'var(--cream-60)',marginBottom:8,fontWeight:600,letterSpacing:.5,textTransform:'uppercase'}}>Brand Colour</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {BRAND_COLORS.map(c => (
                <button key={c} onClick={()=>setBrandForm(f=>({...f,color:c}))}
                  style={{width:28,height:28,borderRadius:'50%',background:c,border:brandForm.color===c?'3px solid #fff':'3px solid transparent',cursor:'pointer',outline:'none',padding:0}}/>
              ))}
              <input type="color" value={brandForm.color||'#888888'} onChange={e=>setBrandForm(f=>({...f,color:e.target.value}))}
                style={{width:28,height:28,borderRadius:'50%',border:'1px solid var(--border)',cursor:'pointer',padding:0,background:'none'}}/>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px',background:`${brandForm.color}15`,borderRadius:8}}>
            <div style={{width:24,height:24,borderRadius:'50%',background:brandForm.color||'#888'}}/>
            <span style={{color:brandForm.color||'#888',fontWeight:700,fontSize:14}}>{brandForm.name||'Brand Preview'}</span>
          </div>
          <Btn onClick={saveBrand} disabled={saving||!brandForm.name} size="lg" style={{justifyContent:'center'}}>
            {saving ? 'Saving…' : modal==='editBrand' ? 'Update Brand' : 'Add Brand'}
          </Btn>
        </div>
      </Modal>
    </Page>
  );
}

const th = (align='left') => ({
  padding:'9px 12px',textAlign:align,fontSize:9.5,fontWeight:700,
  letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',
  borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',background:'var(--navy)',
});
const td = (align='left') => ({
  padding:'9px 12px',textAlign:align,color:'var(--cream)',verticalAlign:'middle',whiteSpace:'nowrap',
});
