import React, { useState, useEffect } from 'react';
import { partnersApi, partnerAddressesApi, brandsApi } from '../api';
import { Page, Badge, Btn, Modal, FormRow, Input, Select } from '../components/ui';

const MODEL_COLORS  = { Inventory:'#f36f4a', Consignment:'#378ADD', Commission:'#7F77DD', None:'#555', Pickup:'#1D9E75' };
const TIER_CONFIG   = {
  VIP:        { color:'#F59E0B', bg:'rgba(245,158,11,.12)',  label:'⭐ VIP'       },
  Active:     { color:'#7fc93e', bg:'rgba(127,201,62,.1)',   label:'Active'        },
  'Non-active':{ color:'#888',   bg:'rgba(136,136,136,.1)',  label:'Non-active'    },
};
const DISCOUNT_LABELS = {
  standard_rebate: 'Standard rebate',
  hybrid:          'Hybrid (Pawpy model)',
  fixed_pct:       'Fixed %',
  threshold_pct:   'Threshold %',
  credit_note:     'Credit note',
  none:            'No discount',
};

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG['Active'];
  return (
    <span style={{
      fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10,
      color: cfg.color, background: cfg.bg, whiteSpace:'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

export default function Partners() {
  const [partners, setPartners] = useState([]);
  const [allBrands, setAllBrands] = useState([]);
  const [search,   setSearch]   = useState('');
  const [filterModel, setFM]    = useState('');
  const [filterTier,  setFT]    = useState('');
  const [modal,    setModal]    = useState(false);
  const [form,     setForm]     = useState({ market:'SG', discount_type:'standard_rebate', discount_value:0, discount_threshold:0, tier:'Active', brand_ids:[] });
  const [saving,   setSaving]   = useState(false);
  const [outlets,  setOutlets]  = useState([]);
  const [newOutlet, setNewOutlet] = useState({ label:'', address:'', pic_name:'', is_primary:false, region:'' });
  const [addingOutlet, setAddingOutlet] = useState(false);

  const load = () => partnersApi.getAll().then(setPartners);
  useEffect(() => { load(); }, []);
  useEffect(() => { brandsApi.getAll().then(setAllBrands); }, []);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function openEdit(p) {
    setForm({
      ...p,
      discount_type:      p.discount_type      || 'standard_rebate',
      discount_value:     p.discount_value      || 0,
      discount_threshold: p.discount_threshold  || 0,
      tier:               p.tier               || 'Active',
      brand_ids:          (p.brands || []).map(b => b.id),
    });
    setAddingOutlet(false);
    setNewOutlet({ label:'', address:'', pic_name:'', is_primary:false });
    if (p.id) partnerAddressesApi.list(p.id).then(setOutlets);
    else setOutlets([]);
    setModal(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (form.id) await partnersApi.update(form.id, form);
      else         await partnersApi.create(form);
      load(); setModal(false);
    } finally { setSaving(false); }
  }

  const visible = partners.filter(p => {
    const matchSearch = !search || p.company_name.toLowerCase().includes(search.toLowerCase());
    const matchModel  = !filterModel || p.model === filterModel;
    const matchTier   = !filterTier  || (p.tier||'Active') === filterTier;
    return matchSearch && matchModel && matchTier;
  });

  // Count by tier for the filter pills
  const tierCounts = partners.reduce((acc, p) => {
    const t = p.tier || 'Active';
    acc[t] = (acc[t]||0) + 1;
    return acc;
  }, {});

  const showDiscountValue = ['fixed_pct','threshold_pct','hybrid'].includes(form.discount_type);
  const showThreshold     = ['threshold_pct','hybrid'].includes(form.discount_type);

  return (
    <Page title="PARTNERS" subtitle={`${visible.length} of ${partners.length} partners`}
      action={<Btn onClick={() => { setForm({ market:'SG', discount_type:'standard_rebate', discount_value:0, discount_threshold:0, tier:'Active', brand_ids:[] }); setModal(true); }}>
        <span style={{fontSize:16}}>+</span> Add Partner
      </Btn>}>

      {/* Filters */}
      <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
        <Input label="Search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Partner name…" style={{width:240}}/>
        <Select label="Model" value={filterModel} onChange={e=>setFM(e.target.value)} style={{width:160}}>
          <option value="">All models</option>
          {['Inventory','Consignment','Commission','Pickup','None'].map(m=><option key={m} value={m}>{m}</option>)}
        </Select>

        {/* Tier filter pills */}
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--cream-60)',letterSpacing:.5,textTransform:'uppercase'}}>Tier</div>
          <div style={{display:'flex',gap:5}}>
            {[['','All'],['VIP','VIP'],['Active','Active'],['Non-active','Non-active']].map(([val,label])=>(
              <button key={val} onClick={()=>setFT(val)}
                style={{padding:'5px 12px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
                  border:`1px solid ${filterTier===val?'var(--orange)':'var(--border)'}`,
                  background:filterTier===val?'rgba(243,111,74,.1)':'transparent',
                  color:filterTier===val?'var(--orange)':'var(--cream-60)'}}>
                {label}
                {val && tierCounts[val] ? <span style={{marginLeft:4,opacity:.6}}>({tierCounts[val]})</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:860}}>
            <thead>
              <tr>
                {['Tier','Partner','Type','Model','Discount','Market','Region','Brands','PIC'].map(h=>(
                  <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                ))}
                <th style={{padding:'9px 12px',borderBottom:'1px solid var(--border)'}}/>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0
                ? <tr><td colSpan={10} style={{padding:40,textAlign:'center',color:'var(--cream-30)'}}>No partners found</td></tr>
                : visible.map(p => (
                  <tr key={p.id} style={{borderBottom:'1px solid rgba(245,242,235,.04)',cursor:'pointer',opacity:(p.tier||'Active')==='Non-active'?0.6:1}}
                    onClick={() => openEdit(p)}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(245,242,235,.03)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'9px 12px'}}><TierBadge tier={p.tier||'Active'}/></td>
                    <td style={{padding:'9px 12px',color:'var(--cream)',fontWeight:500}}>{p.company_name}</td>
                    <td style={{padding:'9px 12px',color:'var(--cream-60)',fontSize:11}}>{p.business_type||'—'}</td>
                    <td style={{padding:'9px 12px'}}><Badge color={MODEL_COLORS[p.model]||'#888'}>{p.model||'—'}</Badge></td>
                    <td style={{padding:'9px 12px',color:'var(--cream-60)',fontSize:11}}>
                      {DISCOUNT_LABELS[p.discount_type||'standard_rebate'] || p.discount_type}
                      {p.discount_value > 0 ? ` (${p.discount_value}%)` : ''}
                    </td>
                    <td style={{padding:'9px 12px',color:'var(--cream-60)'}}>{p.market}</td>
                    <td style={{padding:'9px 12px',color:p.region?'var(--cream-60)':'#f59e0b',fontSize:11}}>{p.region||'Not set'}</td>
                    <td style={{padding:'9px 12px',color:(p.brands?.length)?'var(--cream-60)':'#f59e0b',fontSize:11}}>
                      {p.brands?.length ? `${p.brands.length} brand${p.brands.length>1?'s':''}` : 'None set'}
                    </td>
                    <td style={{padding:'9px 12px',color:'var(--cream-60)',fontSize:11}}>{p.pic_name||'—'}</td>
                    <td style={{padding:'9px 12px'}}>
                      <Btn size="sm" variant="ghost" onClick={e=>{e.stopPropagation();openEdit(p);}}>Edit</Btn>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Add Modal */}
      <Modal open={modal} title={form.id ? 'EDIT PARTNER' : 'ADD PARTNER'} onClose={() => setModal(false)}>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <FormRow cols={2}>
            <Input label="Company Name *" value={form.company_name||''} onChange={e=>sf('company_name',e.target.value)}/>
            <Input label="Person in Charge" value={form.pic_name||''} onChange={e=>sf('pic_name',e.target.value)}/>
          </FormRow>
          <FormRow cols={3}>
            <Select label="Type" value={form.business_type||''} onChange={e=>sf('business_type',e.target.value)}>
              <option value="">—</option>
              {['Retail Shop','Grooming Salon','Trainer','Vet Clinic','Online','Other'].map(t=><option key={t} value={t}>{t}</option>)}
            </Select>
            <Select label="Model" value={form.model||''} onChange={e=>sf('model',e.target.value)}>
              <option value="">—</option>
              {['Inventory','Consignment','Commission','Pickup','None'].map(m=><option key={m} value={m}>{m}</option>)}
            </Select>
            <Select label="Market" value={form.market||'SG'} onChange={e=>sf('market',e.target.value)}>
              {['SG','MY','AU'].map(m=><option key={m} value={m}>{m}</option>)}
            </Select>
          </FormRow>
          <FormRow cols={2}>
            <Input label="Phone" value={form.phone||''} onChange={e=>sf('phone',e.target.value)}/>
            <Input label="Email" value={form.email||''} onChange={e=>sf('email',e.target.value)}/>
          </FormRow>
          <Input label="Address" value={form.address||''} onChange={e=>sf('address',e.target.value)}/>
          {outlets.length === 0 ? (
            <Select label="Region (for the public Stockist page filter)" value={form.region||''} onChange={e=>sf('region',e.target.value)}>
              <option value="">—</option>
              {['Central','East','North','North-East','West'].map(r=><option key={r} value={r}>{r}</option>)}
            </Select>
          ) : (
            <div style={{fontSize:11,color:'var(--cream-30)'}}>
              This partner has outlets recorded below — set each outlet's region individually there instead.
            </div>
          )}

          {/* Brand assignment — previously had backend storage with no UI
              exposing it at all, so this was silently never actually set
              for any real partner. Click a badge to toggle it. */}
          <div>
            <div style={{fontSize:11,fontWeight:600,color:'var(--cream-60)',letterSpacing:.5,textTransform:'uppercase',marginBottom:8}}>
              Brands Carried (for the public Stockist page)
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {allBrands.map(b=>{
                const selected = (form.brand_ids||[]).includes(b.id);
                return (
                  <button
                    key={b.id} type="button"
                    onClick={()=>sf('brand_ids', selected
                      ? (form.brand_ids||[]).filter(id=>id!==b.id)
                      : [...(form.brand_ids||[]), b.id])}
                    style={{
                      padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
                      border:`1px solid ${selected ? b.color : 'var(--border)'}`,
                      background: selected ? `${b.color}22` : 'transparent',
                      color: selected ? b.color : 'var(--cream-60)',
                    }}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          </div>

          <Input label="Notes"   value={form.notes||''}   onChange={e=>sf('notes',e.target.value)}/>

          {/* ── Partner Tier ── */}
          <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:12}}>
              Partner Tier
            </div>
            <div style={{display:'flex',gap:8}}>
              {[
                { value:'VIP',         label:'⭐ VIP',        desc:'Priority partners — ordering regularly, high revenue',       color:'#F59E0B' },
                { value:'Active',      label:'Active',         desc:'Current active partners — ordering periodically',            color:'#7fc93e' },
                { value:'Non-active',  label:'Non-active',     desc:'Dormant contacts — kept for records but not ordering',       color:'#888'    },
              ].map(opt => (
                <button key={opt.value} onClick={()=>sf('tier', opt.value)}
                  style={{flex:1,textAlign:'left',padding:'10px 12px',borderRadius:8,cursor:'pointer',
                    border:`1px solid ${(form.tier||'Active')===opt.value ? opt.color : 'var(--border)'}`,
                    background:(form.tier||'Active')===opt.value ? `${opt.color}18` : 'transparent'}}>
                  <div style={{fontSize:12,fontWeight:700,color:(form.tier||'Active')===opt.value ? opt.color : 'var(--cream)'}}>{opt.label}</div>
                  <div style={{fontSize:10,color:'var(--cream-30)',marginTop:2,lineHeight:1.4}}>{opt.desc}</div>
                </button>
              ))}
            </div>
            {(form.tier||'Active') === 'Non-active' && (
              <div style={{marginTop:8,fontSize:11,color:'#888',lineHeight:1.6}}>
                ℹ Non-active partners are hidden from partner dropdowns in Record Sale, Invoices, and other actions — they remain here for reference.
              </div>
            )}
          </div>

          {/* ── Discount Settings ── */}
          <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:12}}>
              Discount / Rebate Model
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <Select label="Discount Type" value={form.discount_type||'standard_rebate'} onChange={e=>sf('discount_type',e.target.value)}>
                <option value="standard_rebate">Standard Rebate — ≥$400 → -$12 · ≥$600 → -$30</option>
                <option value="hybrid">Hybrid (Pawpy Kisses) — std tiers + % at top</option>
                <option value="fixed_pct">Fixed % on every order (e.g. Kohepets 5%)</option>
                <option value="threshold_pct">% only if order ≥ threshold</option>
                <option value="credit_note">Credit Note model (Vanillapup)</option>
                <option value="none">No discount (use for Consignment partners)</option>
              </Select>

              {(showDiscountValue || showThreshold) && (
                <FormRow cols={showThreshold ? 2 : 1}>
                  {showDiscountValue && (
                    <Input label="Discount %" type="number" step="0.5" min="0" max="100"
                      value={form.discount_value||''}
                      onChange={e=>sf('discount_value', parseFloat(e.target.value)||0)}
                      placeholder="e.g. 5 for 5%"/>
                  )}
                  {showThreshold && (
                    <Input label="Min Order ($)" type="number" step="1" min="0"
                      value={form.discount_threshold||''}
                      onChange={e=>sf('discount_threshold', parseFloat(e.target.value)||0)}
                      placeholder="e.g. 600"/>
                  )}
                </FormRow>
              )}

              <div style={{fontSize:10,color:'var(--cream-30)',lineHeight:1.7,background:'rgba(245,242,235,.04)',borderRadius:6,padding:'8px 12px'}}>
                {form.discount_type === 'standard_rebate' && '≥$200 FOC delivery · ≥$400 -$12 rebate · ≥$600 -$30 rebate'}
                {form.discount_type === 'hybrid'          && `≥$200 FOC · ≥$400 -$12 rebate · ≥$${form.discount_threshold||600} ${form.discount_value||0}% discount`}
                {form.discount_type === 'fixed_pct'       && `${form.discount_value||0}% discount applied on every order`}
                {form.discount_type === 'threshold_pct'   && `${form.discount_value||0}% discount only when order ≥ $${form.discount_threshold||0}`}
                {form.discount_type === 'credit_note'     && '5% CN at $1,000 · +1% per $300 · capped at 8% · credited to next SOA'}
                {form.discount_type === 'none'            && 'No rebate or discount — typically used for consignment partners'}
              </div>
            </div>
          </div>

          {/* ── Billing Cycle ── */}
          <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:12}}>
              Billing Cycle
            </div>
            <div style={{display:'flex',gap:8}}>
              {[
                { value:'per_invoice', label:'Per-Invoice', desc:'Pay each invoice individually' },
                { value:'soa',         label:'Monthly SOA', desc:'Invoices consolidated into one monthly statement' },
              ].map(opt => (
                <button key={opt.value} onClick={()=>sf('billing_cycle', opt.value)}
                  style={{flex:1,textAlign:'left',padding:'10px 12px',borderRadius:8,cursor:'pointer',
                    border:`1px solid ${(form.billing_cycle||'per_invoice')===opt.value?'var(--orange)':'var(--border)'}`,
                    background:(form.billing_cycle||'per_invoice')===opt.value?'rgba(243,111,74,.08)':'transparent'}}>
                  <div style={{fontSize:12,fontWeight:700,color:(form.billing_cycle||'per_invoice')===opt.value?'var(--orange)':'var(--cream)'}}>{opt.label}</div>
                  <div style={{fontSize:10,color:'var(--cream-30)',marginTop:2,lineHeight:1.4}}>{opt.desc}</div>
                </button>
              ))}
            </div>
            <div style={{marginTop:12}}>
              <Input label="Credit term (days until overdue)" type="number" step="1"
                value={form.credit_term_days ?? 7}
                onChange={e=>sf('credit_term_days', parseInt(e.target.value)||7)}
                style={{width:160}} />
              <div style={{fontSize:10,color:'var(--cream-30)',marginTop:5,lineHeight:1.4}}>
                {form.billing_cycle === 'soa'
                  ? `This partner's monthly SOA is flagged overdue ${form.credit_term_days ?? 7} days after it's generated.`
                  : `Each invoice for this partner is flagged overdue ${form.credit_term_days ?? 7} days after it's issued.`}
                {' '}Defaults to 7 — set once here, applies to every future document automatically.
              </div>
            </div>
          </div>

          <Btn onClick={save} disabled={saving} size="lg" style={{justifyContent:'center',marginTop:4}}>
            {saving ? 'Saving…' : 'Save Partner'}
          </Btn>

          {/* ── Outlets & Delivery Addresses (only when editing existing partner) ── */}
          {form.id && (
            <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'var(--cream-30)'}}>
                  Outlets & Delivery Addresses
                </div>
                <Btn size="sm" variant="ghost" onClick={()=>setAddingOutlet(v=>!v)}>
                  {addingOutlet ? 'Cancel' : '+ Add Outlet'}
                </Btn>
              </div>

              {outlets.length === 0 && !addingOutlet && (
                <div style={{fontSize:11,color:'var(--cream-30)',paddingBottom:4}}>
                  No outlets set up. Add one to enable per-outlet invoice addressing.
                </div>
              )}

              {outlets.map(o => (
                <div key={o.id} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'10px 0',borderBottom:'1px solid rgba(245,242,235,.06)'}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:'var(--cream)',display:'flex',alignItems:'center',gap:8}}>
                      {o.label}
                      {o.is_primary ? <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:10,background:'rgba(243,111,74,.15)',color:'var(--orange)'}}>PRIMARY / HQ</span> : null}
                    </div>
                    <div style={{fontSize:11,color:'var(--cream-60)',marginTop:2,lineHeight:1.5}}>{o.address}</div>
                    {o.pic_name && <div style={{fontSize:10,color:'var(--cream-30)',marginTop:1}}>Attn: {o.pic_name}</div>}
                    <select
                      value={o.region||''}
                      onChange={async e=>{
                        const updated = {...o, region: e.target.value};
                        setOutlets(prev=>prev.map(x=>x.id===o.id?updated:x));
                        await partnerAddressesApi.update(form.id, o.id, updated);
                      }}
                      style={{marginTop:6,fontSize:10,background:'var(--navy-light)',border:`1px solid ${o.region?'var(--border)':'#f59e0b'}`,borderRadius:5,padding:'3px 6px',color:o.region?'var(--cream-60)':'#f59e0b'}}
                    >
                      <option value="">Region not set</option>
                      {['Central','East','North','North-East','West'].map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0,marginLeft:8}}>
                    {!o.is_primary && (
                      <button onClick={async()=>{ await partnerAddressesApi.update(form.id, o.id, {...o, is_primary:true}); partnerAddressesApi.list(form.id).then(setOutlets); }}
                        style={{fontSize:10,background:'none',border:'1px solid var(--border)',borderRadius:5,padding:'3px 8px',color:'var(--cream-60)',cursor:'pointer'}}>
                        Set HQ
                      </button>
                    )}
                    <button onClick={async()=>{ if(window.confirm('Remove this outlet?')){ await partnerAddressesApi.delete(form.id, o.id); partnerAddressesApi.list(form.id).then(setOutlets); } }}
                      style={{background:'none',border:'none',color:'rgba(248,113,113,.5)',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}>
                      <span style={{fontSize:13}}>×</span>
                    </button>
                  </div>
                </div>
              ))}

              {addingOutlet && (
                <div style={{background:'rgba(245,242,235,.04)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px',display:'flex',flexDirection:'column',gap:10,marginTop:8}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10}}>
                    <Input label="Label *" value={newOutlet.label} onChange={e=>setNewOutlet(p=>({...p,label:e.target.value}))} placeholder="e.g. Punggol"/>
                    <Input label="Address *" value={newOutlet.address} onChange={e=>setNewOutlet(p=>({...p,address:e.target.value}))} placeholder="314B Punggol Way, SG 822314"/>
                  </div>
                  <FormRow cols={2}>
                    <Input label="Contact Person (optional)" value={newOutlet.pic_name||''} onChange={e=>setNewOutlet(p=>({...p,pic_name:e.target.value}))} placeholder="e.g. Sarah"/>
                    <Select label="Region (for the public Stockist page)" value={newOutlet.region||''} onChange={e=>setNewOutlet(p=>({...p,region:e.target.value}))}>
                      <option value="">—</option>
                      {['Central','East','North','North-East','West'].map(r=><option key={r} value={r}>{r}</option>)}
                    </Select>
                  </FormRow>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <input type="checkbox" id="isPrimaryNew" checked={!!newOutlet.is_primary} onChange={e=>setNewOutlet(p=>({...p,is_primary:e.target.checked}))} style={{accentColor:'var(--orange)'}}/>
                    <label htmlFor="isPrimaryNew" style={{fontSize:11,color:'var(--cream-60)',cursor:'pointer'}}>Mark as Primary / HQ (used for SOA billing address)</label>
                  </div>
                  <Btn size="sm" onClick={async()=>{
                    if (!newOutlet.label || !newOutlet.address) return;
                    await partnerAddressesApi.create(form.id, newOutlet);
                    partnerAddressesApi.list(form.id).then(setOutlets);
                    setNewOutlet({ label:'', address:'', pic_name:'', is_primary:false, region:'' });
                    setAddingOutlet(false);
                  }} style={{alignSelf:'flex-start'}}>
                    Save Outlet
                  </Btn>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </Page>
  );
}
