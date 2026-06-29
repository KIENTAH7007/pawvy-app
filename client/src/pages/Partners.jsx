import React, { useState, useEffect } from 'react';
import { partnersApi } from '../api';
import { Page, Badge, Btn, Modal, FormRow, Input, Select } from '../components/ui';

const MODEL_COLORS = { Inventory:'#f36f4a', Consignment:'#378ADD', Commission:'#7F77DD', None:'#555', Pickup:'#1D9E75' };
const DISCOUNT_LABELS = {
  standard_rebate: 'Standard rebate',
  hybrid:          'Hybrid (Pawpy model)',
  fixed_pct:       'Fixed %',
  threshold_pct:   'Threshold %',
  credit_note:     'Credit note',
  none:            'No discount',
};

export default function Partners() {
  const [partners, setPartners] = useState([]);
  const [search,   setSearch]   = useState('');
  const [filterModel, setFM]    = useState('');
  const [modal,    setModal]    = useState(false);
  const [form,     setForm]     = useState({ market: 'SG', discount_type: 'standard_rebate', discount_value: 0, discount_threshold: 0 });
  const [saving,   setSaving]   = useState(false);

  const load = () => partnersApi.getAll().then(setPartners);
  useEffect(() => { load(); }, []);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function openEdit(p) {
    setForm({
      ...p,
      discount_type:      p.discount_type      || 'standard_rebate',
      discount_value:     p.discount_value      || 0,
      discount_threshold: p.discount_threshold  || 0,
    });
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
    return matchSearch && matchModel;
  });

  const showDiscountValue = ['fixed_pct', 'threshold_pct', 'hybrid'].includes(form.discount_type);
  const showThreshold     = ['threshold_pct', 'hybrid'].includes(form.discount_type);

  return (
    <Page title="PARTNERS" subtitle={`${visible.length} of ${partners.length} partners`}
      action={<Btn onClick={() => { setForm({ market:'SG', discount_type:'standard_rebate', discount_value:0, discount_threshold:0 }); setModal(true); }}>
        <span style={{fontSize:16}}>+</span> Add Partner
      </Btn>}>

      <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap'}}>
        <Input label="Search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Partner name…" style={{width:240}}/>
        <Select label="Model" value={filterModel} onChange={e=>setFM(e.target.value)} style={{width:160}}>
          <option value="">All models</option>
          {['Inventory','Consignment','Commission','Pickup','None'].map(m=><option key={m} value={m}>{m}</option>)}
        </Select>
      </div>

      <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:800}}>
            <thead>
              <tr>
                {['Partner','Type','Model','Discount','Market','PIC'].map(h=>(
                  <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                ))}
                <th style={{padding:'9px 12px',borderBottom:'1px solid var(--border)'}}/>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0
                ? <tr><td colSpan={7} style={{padding:40,textAlign:'center',color:'var(--cream-30)'}}>No partners found</td></tr>
                : visible.map(p => (
                  <tr key={p.id} style={{borderBottom:'1px solid rgba(245,242,235,.04)',cursor:'pointer'}}
                    onClick={() => openEdit(p)}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(245,242,235,.03)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'9px 12px',color:'var(--cream)',fontWeight:500}}>{p.company_name}</td>
                    <td style={{padding:'9px 12px',color:'var(--cream-60)',fontSize:11}}>{p.business_type||'—'}</td>
                    <td style={{padding:'9px 12px'}}><Badge color={MODEL_COLORS[p.model]||'#888'}>{p.model||'—'}</Badge></td>
                    <td style={{padding:'9px 12px',color:'var(--cream-60)',fontSize:11}}>
                      {DISCOUNT_LABELS[p.discount_type||'standard_rebate'] || p.discount_type}
                      {p.discount_value > 0 ? ` (${p.discount_value}%)` : ''}
                    </td>
                    <td style={{padding:'9px 12px',color:'var(--cream-60)'}}>{p.market}</td>
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
          <Input label="Notes"   value={form.notes||''}   onChange={e=>sf('notes',e.target.value)}/>

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

              {/* Helper text per type */}
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

          <Btn onClick={save} disabled={saving} size="lg" style={{justifyContent:'center',marginTop:4}}>
            {saving ? 'Saving…' : 'Save Partner'}
          </Btn>
        </div>
      </Modal>
    </Page>
  );
}
