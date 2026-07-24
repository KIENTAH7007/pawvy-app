import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
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
  const location = useLocation();
  const navigate  = useNavigate();
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
  const [discountForm, setDiscountForm] = useState({});
  const [discountError, setDiscountError] = useState('');
  const [discountSaving, setDiscountSaving] = useState(false);

  // Pre-filled SKUs handed off from New Brand Pricing — nothing here writes to the
  // database until each one is individually reviewed and saved through the normal
  // Add Product flow below. importTotal tracks the original batch size for the
  // "X of Y" progress banner; importQueue holds what's left after the current one.
  const [importQueue, setImportQueue] = useState([]);
  const [importTotal, setImportTotal] = useState(0);

  useEffect(() => {
    const incoming = location.state?.pendingImport;
    if (incoming && incoming.length) {
      setImportTotal(incoming.length);
      setImportQueue(incoming.slice(1));
      setForm({ is_active: 1, ...incoming[0] });
      setModal('add');
      navigate(location.pathname, { replace: true, state: null }); // clear so back/refresh doesn't re-trigger
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function advanceImport() {
    if (importQueue.length > 0) {
      const [next, ...rest] = importQueue;
      setForm({ is_active: 1, ...next });
      setImportQueue(rest);
      setSaveError('');
    } else {
      setModal(null);
      setImportTotal(0);
      setSaveError('');
    }
  }

  function cancelImport() {
    setImportQueue([]);
    setImportTotal(0);
    setModal(null);
    setSaveError('');
  }

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
      load();
      if (importTotal > 0) advanceImport();
      else { setModal(null); setSaveError(''); }
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

  // Export whatever's currently in the table (respects brand/search/archived filters
  // already applied) as CSV — client-side only, no backend round-trip needed since
  // `products` already holds everything the export needs.
  function exportProductsCsv() {
    const headers = ['Brand','Item Series','Variation','Barcode','Unit Cost (SGD)',
      'Wholesale SG','Consignment SG','RRP SG','Wholesale MY','RRP MY','Wholesale AU','RRP AU',
      'Portal Order','Status','Notes'];
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = products.map(p => [
      p.brand_name, p.item_series, p.variation, p.barcode,
      p.unit_cost, p.price_wholesale_sg, p.price_consignment_sg, p.price_rrp_sg,
      p.price_wholesale_my, p.price_rrp_my, p.price_wholesale_au, p.price_rrp_au,
      p.portal_sort_order, p.is_active === 0 ? 'Archived' : 'Active', p.notes,
    ].map(esc).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pawvy-products-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Page title="PRODUCTS & PRICING" subtitle={`${activeCount} active SKUs${archivedCount > 0 && showArchived ? ` + ${archivedCount} archived` : ''}`}
      action={
        <div style={{display:'flex',gap:8}}>
          <Btn variant="ghost" size="sm" onClick={exportProductsCsv}>
            <Download size={13} /> Export CSV
          </Btn>
          <Btn variant="ghost" size="sm" onClick={() => { window.location.href = '/api/products/export-images'; }}>
            <Download size={13} /> Export Images
          </Btn>
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
                <th style={th('right')} title="Manual display order on the Order Portal — lower shows first, blank falls back to alphabetical">Portal Order</th>
                <th style={th()}/>
              </tr>
            </thead>
            <tbody>
              {products.length === 0
                ? <tr><td colSpan={6+mktCols.length} style={{padding:40,textAlign:'center',color:'var(--cream-30)'}}>No products found</td></tr>
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
                      <td style={td('right')} onClick={e => e.stopPropagation()}>
                        <input
                          type="number"
                          defaultValue={p.portal_sort_order ?? ''}
                          placeholder="—"
                          onClick={e => e.stopPropagation()}
                          onBlur={e => {
                            const val = e.target.value === '' ? null : parseInt(e.target.value);
                            productsApi.setPortalOrder(p.id, val).then(() => {
                              setProducts(prev => prev.map(pr => pr.id === p.id ? { ...pr, portal_sort_order: val } : pr));
                            });
                          }}
                          style={{
                            width: 56, textAlign: 'right', background: 'rgba(245,242,235,.05)',
                            border: '1px solid var(--border)', borderRadius: 5, color: 'var(--cream)',
                            fontSize: 12, padding: '4px 6px',
                          }}
                        />
                      </td>
                      <td style={td()}>
                        <div style={{display:'flex',gap:6}}>
                          <Btn size="sm" variant="ghost" onClick={e=>{e.stopPropagation();setForm({...p});setModal('edit');}}>Edit</Btn>
                          <Btn size="sm" variant="ghost" onClick={e=>{
                            e.stopPropagation();
                            setDiscountForm({ id: p.id, name: `${p.item_series}${p.variation ? ' — '+p.variation : ''}`, discount_pct: p.discount_pct || 0, discount_start: p.discount_start || '', discount_end: p.discount_end || '' });
                            setModal('discount');
                          }}>
                            {p.discount_pct > 0 ? <Badge color="#7fc93e">{p.discount_pct}% off</Badge> : 'Discount'}
                          </Btn>
                        </div>
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
      <Modal open={modal==='add'||modal==='edit'} title={modal==='edit'?'EDIT PRODUCT':'ADD PRODUCT'} onClose={()=>{cancelImport();}} width={640}>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {importTotal > 0 && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,
              background:'rgba(243,111,74,.1)',border:'1px solid rgba(243,111,74,.3)',borderRadius:7,padding:'9px 14px'}}>
              <span style={{fontSize:12,color:'var(--cream)'}}>
                Importing from New Brand Pricing — SKU {importTotal - importQueue.length} of {importTotal}. Brand isn't set — pick one below.
              </span>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <Btn size="sm" variant="ghost" onClick={advanceImport}>Skip</Btn>
                <Btn size="sm" variant="ghost" onClick={cancelImport}>Cancel import</Btn>
              </div>
            </div>
          )}
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

          <label style={{display:'flex',flexDirection:'column',gap:5}}>
            <span style={{fontSize:11,fontWeight:600,color:'var(--cream-60)',letterSpacing:.5,textTransform:'uppercase'}}>
              Description <span style={{textTransform:'none',fontWeight:400}}>(for the website — optional)</span>
            </span>
            <textarea
              value={form.description||''}
              onChange={e=>sf('description',e.target.value)}
              placeholder="Shown on the product's page on pawvy.co. Leave blank for now if not ready."
              rows={4}
              style={{
                background:'var(--navy-light)', border:'1px solid var(--border)',
                borderRadius:7, padding:'9px 12px', color:'var(--cream)', fontSize:13,
                outline:'none', width:'100%', fontFamily:'inherit', resize:'vertical',
              }}
            />
          </label>

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
            <Btn onClick={save} disabled={saving} size="lg" style={{flex:1,justifyContent:'center'}}>
              {saving ? 'Saving…' : (importTotal > 0 && importQueue.length > 0) ? 'Save & Next SKU' : 'Save Product'}
            </Btn>
            {modal==='edit' && (
              form.is_active !== 0
                ? <Btn variant="danger" onClick={async()=>{await productsApi.delete(form.id);load();setModal(null);}}>Archive</Btn>
                : <Btn variant="secondary" onClick={async()=>{await productsApi.update(form.id,{...form,is_active:1});load();setModal(null);}}>Restore</Btn>
            )}
          </div>
        </div>
      </Modal>

      {/* Discount modal — powers the shop's discounted-price display and
          brand-launch/campaign pricing. Backend endpoint (PATCH /:id/discount)
          has existed since Patch 104; this is the first UI for it. */}
      <Modal open={modal==='discount'} title="SET DISCOUNT" onClose={()=>setModal(null)} width={420}>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{fontSize:13,color:'var(--cream-60)'}}>{discountForm.name}</div>

          <Input
            label="Discount %"
            type="number" min="0" max="100"
            value={discountForm.discount_pct}
            onChange={e=>setDiscountForm(f=>({...f,discount_pct:e.target.value}))}
          />
          <Input
            label="Start date"
            type="date"
            value={discountForm.discount_start}
            onChange={e=>setDiscountForm(f=>({...f,discount_start:e.target.value}))}
          />
          <Input
            label="End date (leave blank for open-ended)"
            type="date"
            value={discountForm.discount_end}
            onChange={e=>setDiscountForm(f=>({...f,discount_end:e.target.value}))}
          />

          {discountError && <div style={{color:'#f87171',fontSize:12.5}}>{discountError}</div>}

          <div style={{display:'flex',gap:8,marginTop:4}}>
            <Btn disabled={discountSaving} onClick={async()=>{
              setDiscountSaving(true);
              setDiscountError('');
              try {
                await productsApi.setDiscount(discountForm.id, {
                  discount_pct: Number(discountForm.discount_pct) || 0,
                  discount_start: discountForm.discount_start || null,
                  discount_end: discountForm.discount_end || null,
                });
                await load();
                setModal(null);
              } catch (err) {
                setDiscountError(err?.message || 'Could not save discount.');
              } finally {
                setDiscountSaving(false);
              }
            }}>
              {discountSaving ? 'Saving…' : 'Save Discount'}
            </Btn>
            {discountForm.discount_pct > 0 && (
              <Btn variant="secondary" disabled={discountSaving} onClick={async()=>{
                setDiscountSaving(true);
                try {
                  await productsApi.setDiscount(discountForm.id, { discount_pct: 0, discount_start: null, discount_end: null });
                  await load();
                  setModal(null);
                } finally {
                  setDiscountSaving(false);
                }
              }}>
                Clear Discount
              </Btn>
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
