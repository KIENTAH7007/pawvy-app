import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, RotateCcw, Search, Trash2, CheckCircle, AlertCircle, FileText, Archive } from 'lucide-react';
import { consignmentApi, productsApi, brandsApi } from '../api';
import { Page, Card, Select, Input, Btn, Badge, Modal } from '../components/ui';
import { sgd, pawvyHeaderHtml, pawvyAddressBlockHtml, pawvyFooterHtml, openPdfWindow } from '../utils/pawvyPdf';

const today = () => new Date().toISOString().slice(0,10);

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener('resize',h); return ()=>window.removeEventListener('resize',h); }, []);
  return m;
}

// ── PDF: Pawvy-branded consignment list ────────────────────────────
function generateConsignmentPDF(partner, items, docNum) {
  const date = new Date().toLocaleDateString('en-SG', { day:'numeric', month:'long', year:'numeric' });
  // Include a row if there's current stock OR any activity since the last
  // Close Month (placed/returned/invoiced) — this way a SKU that was placed
  // and fully returned within the same period (net zero on-hand) still shows
  // up on the very next print, documenting that it happened. It naturally
  // drops off later prints once a new period starts with no further activity.
  const activeItems = items.filter(i =>
    i.on_hand > 0 || (i.placed_since||0) > 0 || (i.returned_since||0) > 0 || (i.invoiced_since||0) > 0
  );
  const totalValue  = activeItems.reduce((s,i) => s + i.on_hand * (i.consignment_price||0), 0);

  const rows = activeItems.map((i, idx) => `
    <tr style="background:${idx%2===0?'#fff':'#f8f9fc'}">
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0">${i.brand_name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;font-weight:600">${i.item_series}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;color:#666">${i.variation||'—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right">${i.placed_since||0}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right;color:#c0392b">${i.returned_since||0}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right;color:#27ae60">${i.invoiced_since||0}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right;font-weight:700;font-size:14px">${i.on_hand}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right">${parseFloat(i.consignment_price||0).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right;font-weight:600">${(i.on_hand*(i.consignment_price||0)).toFixed(2)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Consignment List – ${partner.company_name}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#1a1a2e; background:#fff; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body>

  ${pawvyHeaderHtml('CONSIGNMENT LIST', date)}
  ${pawvyAddressBlockHtml(partner, docNum)}

  <!-- Table -->
  <div style="padding:24px 32px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#14213d">
          <th style="padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px;letter-spacing:.5px">Brand</th>
          <th style="padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px">Product</th>
          <th style="padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px">Variation</th>
          <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Placed</th>
          <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Returned</th>
          <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Invoiced</th>
          <th style="padding:10px 12px;text-align:right;color:#f36f4a;font-weight:700;font-size:11px">On Hand</th>
          <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Price (SGD)</th>
          <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Value (SGD)</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="9" style="padding:20px;text-align:center;color:#888">No active consignment stock</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Totals -->
  <div style="padding:0 32px 24px;display:flex;justify-content:flex-end">
    <div style="width:280px">
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #ddd;font-size:12px;color:#555">
        <span>Total Items On Hand</span><span style="font-weight:600">${activeItems.reduce((s,i)=>s+i.on_hand,0)} units</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #14213d;margin-top:4px">
        <span style="font-size:14px;font-weight:700;color:#14213d">Total Consignment Value</span>
        <span style="font-size:14px;font-weight:700;color:#14213d">SGD ${totalValue.toFixed(2)}</span>
      </div>
    </div>
  </div>

  <!-- Notes -->
  <div style="padding:0 32px 8px;font-size:10px;color:#888;line-height:1.8">
    <div>* Price is in SGD</div>
    <div>¹ All products are verified and received by consignee</div>
  </div>

  <!-- Liability clause -->
  <div style="margin:0 32px 24px;padding:12px 16px;border:1px solid #e8ecf0;border-left:3px solid #14213d;background:#f8f9fc;font-size:10px;color:#444;line-height:1.6">
    <strong style="color:#14213d">Consignee Liability:</strong> The Consignee is solely liable for inventory safety.
    Items with physical damage or tampered, unsealed packaging will be deemed sold, requiring full payout to the Consignor.
  </div>

  ${pawvyFooterHtml()}
  </body></html>`;

  openPdfWindow(html);
}

// ── Generate sequential doc number (localStorage counter per day) ──
function makeDocNum(prefix = 'CS') {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const key = `docnum_${prefix}_${ymd}`;
  const current = parseInt(localStorage.getItem(key) || '0');
  const next = current + 1;
  localStorage.setItem(key, String(next));
  return `${prefix}-${ymd}-${String(next).padStart(3,'0')}`;
}

// ── Place Stock Modal ──────────────────────────────────────────────
function PlaceStockModal({ open, onClose, partnerId, onSaved }) {
  const [date, setDate]         = useState(today());
  const [products, setProducts] = useState([]);
  const [brands, setBrands]     = useState([]);
  const [lines, setLines]       = useState([{ brand_id:'', product_id:'', qty:'' }]);
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  // UNCONTROLLED refs — browser manages value internally, no React state interference.
  // This is the only reliable fix for the "can't edit price" issue across all browsers/mobile.
  const priceRefs = useRef({});
  const costRefs  = useRef({});

  useEffect(() => {
    if (open) {
      setDate(today());
      setLines([{ brand_id:'', product_id:'', qty:'' }]);
      setNotes(''); setError('');
      priceRefs.current = {};
      costRefs.current  = {};
      Promise.all([
        productsApi.getAll({ active:'true' }),
        brandsApi.getAll(),
      ]).then(([prods, brnds]) => { setProducts(prods); setBrands(brnds); });
    }
  }, [open]);

  function selectBrand(idx, brandId) {
    setLines(prev => prev.map((l,i) => i===idx ? { ...l, brand_id: brandId, product_id: '' } : l));
    if (priceRefs.current[idx]) priceRefs.current[idx].value = '';
    if (costRefs.current[idx])  costRefs.current[idx].value  = '';
  }

  function selectProduct(idx, productId) {
    setLines(prev => prev.map((l,i) => i===idx ? { ...l, product_id: productId } : l));
    const prod = products.find(p => String(p.id) === String(productId));
    if (!prod) return;
    // Direct DOM mutation — auto-fills ONLY when field is currently empty, never overwrites
    if (priceRefs.current[idx] && !priceRefs.current[idx].value) {
      priceRefs.current[idx].value = String(prod.price_consignment_sg || '');
    }
    if (costRefs.current[idx] && !costRefs.current[idx].value) {
      costRefs.current[idx].value = String(prod.unit_cost || '');
    }
  }

  function addLine() {
    setLines(prev => [...prev, { brand_id:'', product_id:'', qty:'' }]);
  }

  function removeLine(idx) {
    setLines(prev => prev.filter((_,i) => i!==idx));
    delete priceRefs.current[idx];
    delete costRefs.current[idx];
  }

  async function save() {
    const valid = lines
      .map((l, i) => ({
        ...l,
        qtyNum: parseInt(l.qty) || 0,
        price:  parseFloat(priceRefs.current[i]?.value) || 0,
        cost:   parseFloat(costRefs.current[i]?.value)  || 0,
      }))
      .filter(l => l.product_id && l.qtyNum > 0);
    if (!valid.length) { setError('Add at least one product with qty > 0.'); return; }
    setSaving(true); setError('');
    try {
      for (const l of valid) {
        await consignmentApi.addPlacement({
          partner_id: partnerId, product_id: l.product_id,
          date, qty: l.qtyNum,
          consignment_price: l.price,
          unit_cost: l.cost,
          notes: notes || null,
        });
      }
      onSaved();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} title="PLACE STOCK" onClose={onClose} width={780}>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <Input label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:180}}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.4fr 55px 120px 95px 28px',gap:8,padding:'0 2px'}}>
          {['Brand','Product / SKU','Qty','Consign Price','Unit Cost',''].map(h=>(
            <div key={h} style={{fontSize:9,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)'}}>{h}</div>
          ))}
        </div>
        {lines.map((line, idx) => {
          const filtered = line.brand_id
            ? products.filter(p => String(p.brand_id) === String(line.brand_id))
            : products;
          return (
            <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1.4fr 55px 120px 95px 28px',gap:8,alignItems:'flex-start'}}>
              {/* Brand filter */}
              <Select value={line.brand_id} onChange={e=>selectBrand(idx, e.target.value)}>
                <option value="">All brands</option>
                {brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
              {/* Product filtered by brand */}
              <Select value={line.product_id} onChange={e=>selectProduct(idx, e.target.value)}>
                <option value="">— Select SKU —</option>
                {filtered.map(p=>(
                  <option key={p.id} value={p.id}>{p.item_series}{p.variation?' · '+p.variation:''}</option>
                ))}
              </Select>
              <Input type="number" min="1" value={line.qty}
                onChange={e=>setLines(prev=>prev.map((l,i)=>i===idx?{...l,qty:e.target.value}:l))}
                placeholder="0"/>
              {/* UNCONTROLLED price — browser owns the value, user can always type freely */}
              <input type="text" inputMode="decimal"
                ref={el => { if (el) priceRefs.current[idx] = el; }}
                placeholder="0.00"
                style={{background:'var(--navy-light)',border:'1px solid var(--orange)',borderRadius:7,padding:'9px 12px',color:'var(--cream)',fontSize:13,outline:'none',width:'100%'}}
              />
              {/* UNCONTROLLED cost */}
              <input type="text" inputMode="decimal"
                ref={el => { if (el) costRefs.current[idx] = el; }}
                placeholder="0.00"
                style={{background:'var(--navy-light)',border:'1px solid var(--border)',borderRadius:7,padding:'9px 12px',color:'var(--cream)',fontSize:13,outline:'none',width:'100%'}}
              />
              <button onClick={()=>removeLine(idx)} disabled={lines.length===1}
                style={{background:'none',border:'none',color:'rgba(248,113,113,.6)',cursor:'pointer',padding:'8px 0',display:'flex',alignItems:'center'}}>
                <Trash2 size={14}/>
              </button>
            </div>
          );
        })}
        <div style={{fontSize:10,color:'var(--orange)'}}>✏ Consign Price has orange border — tap and type to override freely</div>
        <Btn size="sm" variant="ghost" onClick={addLine}><Plus size={12}/> Add product</Btn>
        <Input label="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Restocking visit July"/>
        {error && <div style={{color:'#f87171',fontSize:12,padding:'6px 0'}}>{error}</div>}
        <div style={{display:'flex',gap:10,paddingTop:4}}>
          <Btn onClick={save} disabled={saving} size="lg" style={{flex:1,justifyContent:'center'}}>
            {saving ? 'Saving…' : <><Plus size={14}/> Confirm Placement</>}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}
// ── Record Return Modal ────────────────────────────────────────────
function ReturnModal({ open, onClose, partnerId, onHandItems, onSaved }) {
  const [date, setDate]     = useState(today());
  const [lines, setLines]   = useState([{ product_id:'', qty:'' }]);
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (open) { setDate(today()); setLines([{ product_id:'', qty:'' }]); setNotes(''); setError(''); }
  }, [open]);

  function updateLine(idx, key, val) {
    setLines(prev => { const n=[...prev]; n[idx]={...n[idx],[key]:val}; return n; });
  }

  // Fix #2: max qty = on_hand for selected product
  function maxQty(product_id) {
    return onHandItems.find(i => String(i.product_id)===String(product_id))?.on_hand || 0;
  }

  async function save() {
    const valid = lines.filter(l => l.product_id && parseInt(l.qty) > 0);
    if (!valid.length) { setError('Add at least one product line with qty > 0.'); return; }
    // Fix #2: validate qty doesn't exceed on-hand
    const overQty = valid.find(l => parseInt(l.qty) > maxQty(l.product_id));
    if (overQty) {
      const oh = maxQty(overQty.product_id);
      setError(`Qty exceeds on-hand stock (max ${oh}). Please check and correct.`);
      return;
    }
    setSaving(true); setError('');
    try {
      for (const l of valid) {
        await consignmentApi.addReturn({ partner_id: partnerId, product_id: l.product_id, date, qty: parseInt(l.qty), notes: notes||null });
      }
      onSaved();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} title="RECORD RETURN" onClose={onClose} width={500}>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <Input label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:180}}/>
        <div style={{display:'grid',gridTemplateColumns:'2fr 100px 28px',gap:8,padding:'0 2px'}}>
          {['Product (on hand)','Qty Returned'].map(h=>(
            <div key={h} style={{fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)'}}>{h}</div>
          ))}
          <div/>
        </div>
        {lines.map((line, idx) => {
          const max = maxQty(line.product_id);
          return (
            <div key={idx} style={{display:'grid',gridTemplateColumns:'2fr 100px 28px',gap:8,alignItems:'flex-start'}}>
              <Select value={line.product_id} onChange={e=>updateLine(idx,'product_id',e.target.value)}>
                <option value="">— Select product —</option>
                {onHandItems.filter(i=>i.on_hand>0).map(p=>(
                  <option key={p.product_id} value={p.product_id}>
                    {p.brand_name} · {p.item_series}{p.variation?' · '+p.variation:''} (on hand: {p.on_hand})
                  </option>
                ))}
              </Select>
              <div>
                {/* Fix #2: max attribute caps input at on-hand qty */}
                <Input type="number" min="1" max={max||undefined} value={line.qty}
                  onChange={e=>updateLine(idx,'qty',Math.min(parseInt(e.target.value)||0,max||9999).toString())}
                  placeholder="0"/>
                {line.product_id && max > 0 && (
                  <div style={{fontSize:10,color:'var(--cream-30)',marginTop:2,paddingLeft:2}}>max {max}</div>
                )}
              </div>
              <button onClick={()=>setLines(l=>l.filter((_,i)=>i!==idx))} disabled={lines.length===1}
                style={{background:'none',border:'none',color:'rgba(248,113,113,.6)',cursor:'pointer',padding:'8px 0',display:'flex',alignItems:'center'}}>
                <Trash2 size={14}/>
              </button>
            </div>
          );
        })}
        <Btn size="sm" variant="ghost" onClick={()=>setLines(l=>[...l,{product_id:'',qty:''}])}>
          <Plus size={12}/> Add product
        </Btn>
        <Input label="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Damaged, unsold stock"/>
        {error && <div style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',borderRadius:6,padding:'8px 12px',color:'#f87171',fontSize:12}}>{error}</div>}
        <div style={{display:'flex',gap:10,paddingTop:4}}>
          <Btn onClick={save} disabled={saving} size="lg" style={{flex:1,justifyContent:'center'}}>
            {saving ? 'Saving…' : <><RotateCcw size={14}/> Confirm Return</>}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Stock Count Modal ──────────────────────────────────────────────
function StockCountModal({ open, onClose, partnerId, onHandItems, onSaved }) {
  const [date, setDate]     = useState(today());
  const [notes, setNotes]   = useState('');
  const [counts, setCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError]   = useState('');

  useEffect(() => { if (open) { setDate(today()); setNotes(''); setCounts({}); setResult(null); setError(''); } }, [open]);

  const activeItems = onHandItems.filter(i => i.on_hand >= 0);
  const allFilled   = activeItems.length > 0 && activeItems.every(i => counts[i.product_id] !== undefined && counts[i.product_id] !== '');

  const discrepancies = activeItems.map(item => {
    const counted = parseInt(counts[item.product_id] ?? '');
    return { ...item, counted: isNaN(counted)?null:counted, discrepancy: isNaN(counted)?null:Math.max(0,item.on_hand-counted) };
  });
  const totalDisc    = discrepancies.reduce((s,d) => s+(d.discrepancy||0), 0);
  const totalInvoice = discrepancies.reduce((s,d) => s+(d.discrepancy||0)*(d.consignment_price||0), 0);

  async function submit() {
    if (!allFilled) { setError('Please fill in physical count for every product.'); return; }
    setSaving(true); setError('');
    try {
      const items = activeItems.map(i => ({ product_id: i.product_id, qty_counted: parseInt(counts[i.product_id])||0 }));
      const res = await consignmentApi.submitCount({ partner_id: partnerId, date, notes: notes||null, items });
      setResult(res);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (result) return (
    <Modal open={open} title="COUNT COMPLETE" onClose={()=>{onSaved();onClose();}} width={440}>
      <div style={{display:'flex',flexDirection:'column',gap:14,alignItems:'center',padding:'10px 0'}}>
        <CheckCircle size={48} color="#7fc93e"/>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:'var(--cream)',letterSpacing:1}}>Count Submitted</div>
        {result.lines_invoiced > 0
          ? <div style={{background:'rgba(127,201,62,.1)',border:'1px solid rgba(127,201,62,.3)',borderRadius:8,padding:'14px 20px',textAlign:'center',width:'100%'}}>
              <div style={{fontSize:11,color:'#7fc93e',marginBottom:4}}>Invoice Generated</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:'#7fc93e',letterSpacing:1}}>{sgd(result.invoice_total)}</div>
              <div style={{fontSize:10,color:'var(--cream-30)',marginTop:4}}>Sale records created in ledger</div>
            </div>
          : <div style={{padding:'14px 20px',textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No discrepancy — stock matches system count ✓</div>
        }
        <Btn onClick={()=>{onSaved();onClose();}} size="lg" style={{width:'100%',justifyContent:'center'}}>Done</Btn>
      </div>
    </Modal>
  );

  return (
    <Modal open={open} title="STOCK COUNT" onClose={onClose} width={700}>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <Input label="Count Date" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:180}}/>
          <Input label="Notes" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Monthly count June 2026" style={{flex:1}}/>
        </div>
        {activeItems.length === 0
          ? <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No active consignment stock to count.</div>
          : <>
              <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:420,overflowY:'auto',paddingRight:4}}>
                {discrepancies.map(item=>(
                  <div key={item.product_id} style={{
                    border:`1px solid ${counts[item.product_id]!==undefined&&counts[item.product_id]!==''?'rgba(243,111,74,.35)':'var(--border)'}`,
                    borderRadius:8, padding:'10px 12px', background:'rgba(245,242,235,.02)',
                  }}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:8}}>
                      <Badge color={item.brand_color}>{item.brand_name}</Badge>
                      <div style={{flex:1,minWidth:0,fontSize:13,color:'var(--cream)',fontWeight:600,lineHeight:1.35}}>
                        {item.item_series}{item.variation?' · '+item.variation:''}
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                      <div style={{fontSize:11,color:'var(--cream-30)'}}>On hand: <strong style={{color:'var(--cream)'}}>{item.on_hand}</strong></div>
                      <input type="number" min="0" value={counts[item.product_id]??''}
                        onChange={e=>setCounts(p=>({...p,[item.product_id]:e.target.value}))}
                        placeholder="Physical count"
                        style={{flex:'1 1 100px',minWidth:100,background:'var(--navy-light)',border:`1px solid ${counts[item.product_id]!==undefined&&counts[item.product_id]!==''?'var(--orange)':'var(--border)'}`,borderRadius:6,padding:'8px 10px',color:'var(--cream)',fontSize:13,textAlign:'right',outline:'none'}}/>
                      <div style={{fontSize:12,fontWeight:700,color:item.discrepancy===null?'var(--cream-30)':item.discrepancy>0?'#fbbf24':'#7fc93e',minWidth:44,textAlign:'right'}}>
                        {item.discrepancy===null?'—':item.discrepancy>0?`−${item.discrepancy}`:'✓ 0'}
                      </div>
                      {item.discrepancy>0 && <div style={{fontSize:11,color:'var(--cream-60)'}}>{sgd(item.discrepancy*item.consignment_price)}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{background:'rgba(245,242,235,.04)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 16px',display:'flex',gap:24,flexWrap:'wrap'}}>
                <span style={{fontSize:12,color:'var(--cream-30)'}}>Discrepancy: <strong style={{color:totalDisc>0?'#fbbf24':'#7fc93e'}}>{totalDisc} units</strong></span>
                <span style={{fontSize:12,color:'var(--cream-30)'}}>To invoice: <strong style={{color:'var(--orange)'}}>{sgd(totalInvoice)}</strong></span>
              </div>
            </>
        }
        {error && <div style={{display:'flex',gap:8,background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',borderRadius:7,padding:'10px 14px',color:'#f87171',fontSize:12}}><AlertCircle size={14} style={{flexShrink:0,marginTop:1}}/>{error}</div>}
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={submit} disabled={saving||!allFilled} size="lg" style={{flex:1,justifyContent:'center'}}>
            {saving?'Submitting…':<><Search size={14}/> Submit Count & Invoice</>}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Close Month Modal (#4) ─────────────────────────────────────────
function CloseMonthModal({ open, onClose, partnerId, onHandItems, onSaved }) {
  const [date, setDate]         = useState(today());
  const [periodLabel, setPeriod] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth()-0);
    return d.toLocaleString('default',{month:'long',year:'numeric'});
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => { if (open) { setDate(today()); setDone(false); setError(''); } }, [open]);

  async function submit() {
    setSaving(true); setError('');
    try {
      await consignmentApi.closeMonth({ partner_id: partnerId, date, period_label: periodLabel });
      setDone(true);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (done) return (
    <Modal open={open} title="MONTH CLOSED" onClose={()=>{onSaved();onClose();}} width={420}>
      <div style={{display:'flex',flexDirection:'column',gap:14,alignItems:'center',padding:'10px 0'}}>
        <Archive size={40} color="#7fc93e"/>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:'var(--cream)',letterSpacing:1}}>Period Snapshot Saved</div>
        <div style={{fontSize:12,color:'var(--cream-60)',textAlign:'center',lineHeight:1.7}}>
          On-hand quantities for <strong style={{color:'var(--cream)'}}>{periodLabel}</strong> have been snapshotted.<br/>
          The counter resets — next period starts fresh from today's on-hand.
        </div>
        <Btn onClick={()=>{onSaved();onClose();}} size="lg" style={{width:'100%',justifyContent:'center'}}>Done</Btn>
      </div>
    </Modal>
  );

  return (
    <Modal open={open} title="CLOSE MONTH" onClose={onClose} width={500}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.3)',borderRadius:8,padding:'12px 14px',fontSize:12,color:'#fbbf24',lineHeight:1.7}}>
          ⚠ <strong>Before closing:</strong> make sure you have already done the stock count and issued the invoice for this period. Closing the month locks current on-hand as the new baseline for next period.
        </div>
        <Input label="Period Label (for your records)" value={periodLabel} onChange={e=>setPeriod(e.target.value)} placeholder="e.g. June 2026"/>
        <Input label="Snapshot Date" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:180}}/>

        <div style={{border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          <div style={{padding:'8px 14px',background:'rgba(245,242,235,.04)',fontSize:10,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)'}}>
            On-hand to be snapshotted ({onHandItems.filter(i=>i.on_hand>0).length} SKUs)
          </div>
          <div style={{maxHeight:180,overflowY:'auto'}}>
            {onHandItems.filter(i=>i.on_hand>0).map(item=>(
              <div key={item.product_id} style={{display:'flex',justifyContent:'space-between',padding:'8px 14px',borderBottom:'1px solid rgba(245,242,235,.04)',fontSize:12}}>
                <span style={{color:'var(--cream-60)'}}>{item.brand_name} · {item.item_series}{item.variation?' · '+item.variation:''}</span>
                <span style={{fontWeight:700,color:'var(--cream)'}}>{item.on_hand} units</span>
              </div>
            ))}
            {onHandItems.filter(i=>i.on_hand>0).length === 0 && (
              <div style={{padding:20,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No active stock to snapshot</div>
            )}
          </div>
        </div>

        {error && <div style={{color:'#f87171',fontSize:12}}>{error}</div>}
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={submit} disabled={saving||onHandItems.filter(i=>i.on_hand>0).length===0} size="lg"
            style={{flex:1,justifyContent:'center',background:'rgba(251,191,36,.15)',color:'#fbbf24',border:'1px solid rgba(251,191,36,.4)'}}>
            {saving?'Saving…':<><Archive size={14}/> Confirm Close Month</>}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Consignment Page ──────────────────────────────────────────
export default function Consignment() {
  const isMobile = useIsMobile();
  const [partners, setPartners]         = useState([]);
  const [partnerId, setPartnerId]       = useState('');
  const [onHand, setOnHand]             = useState([]);
  const [partner, setPartner]           = useState(null);
  const [counts, setCounts]             = useState([]);
  const [placements, setPlacements]     = useState([]);
  const [returns, setReturns]           = useState([]);
  const [snapshots, setSnapshots]       = useState([]);
  const [loading, setLoading]           = useState(false);
  const [tab, setTab]                   = useState('summary');
  const [modal, setModal]               = useState(null);

  useEffect(() => {
    consignmentApi.partners().then(data => {
      setPartners(data);
      if (data.length > 0) setPartnerId(String(data[0].id));
    });
  }, []);

  const loadPartnerData = useCallback(async pid => {
    if (!pid) return;
    setLoading(true);
    const [oh, cnts, plac, rets, snaps] = await Promise.all([
      consignmentApi.onHand(pid),
      consignmentApi.counts(pid),
      consignmentApi.placements(pid),
      consignmentApi.returns(pid),
      consignmentApi.snapshots(pid),
    ]);
    setPartner(oh.partner);
    setOnHand(oh.items);
    setCounts(cnts);
    setPlacements(plac);
    setReturns(rets);
    setSnapshots(snaps);
    setLoading(false);
  }, []);

  useEffect(() => { if (partnerId) loadPartnerData(partnerId); }, [partnerId]);

  const totalValue    = onHand.reduce((s,i) => s + Math.max(0,i.on_hand)*(i.consignment_price||0), 0);
  const totalUnits    = onHand.reduce((s,i) => s + Math.max(0,i.on_hand), 0);
  const totalInvoiced = onHand.reduce((s,i) => s + (i.invoiced_since||0), 0);
  const lastSnapshot  = snapshots[0];

  return (
    <Page title="CONSIGNMENT" subtitle="Track stock placed at consignment partners">
      <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
        <Select label="Consignment Partner" value={partnerId} onChange={e=>setPartnerId(e.target.value)} style={{width:260}}>
          <option value="">— Select partner —</option>
          {partners.map(p=><option key={p.id} value={p.id}>{p.company_name}</option>)}
        </Select>
        {partners.length === 0 && (
          <div style={{fontSize:12,color:'#fbbf24',paddingBottom:8}}>⚠ No consignment partners. Set a partner's model to "Consignment" in Partners tab.</div>
        )}
        {lastSnapshot && (
          <div style={{fontSize:11,color:'var(--cream-30)',paddingBottom:8}}>
            Last closed: <strong style={{color:'var(--cream)'}}>{lastSnapshot.label}</strong>
            <span style={{color:'var(--cream-30)',marginLeft:6}}>· Showing activity since {lastSnapshot.date}</span>
          </div>
        )}
      </div>

      {partnerId && (
        <>
          {/* Actions */}
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <Btn onClick={()=>setModal('place')}><Plus size={14}/> Place Stock</Btn>
            <Btn onClick={()=>setModal('count')} variant="secondary"><Search size={14}/> Stock Count</Btn>
            <Btn onClick={()=>setModal('return')} variant="ghost"><RotateCcw size={14}/> Record Return</Btn>
            <div style={{flex:1}}/>
            <Btn variant="ghost" onClick={()=>setModal('close')} style={{color:'#fbbf24',borderColor:'rgba(251,191,36,.3)'}}>
              <Archive size={14}/> Close Month
            </Btn>
            <Btn variant="ghost" onClick={()=>generateConsignmentPDF(partner||{company_name:'Partner'}, onHand, makeDocNum())}>
              <FileText size={14}/> Print List
            </Btn>
          </div>

          {/* KPIs */}
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'repeat(4,1fr)',gap:10}}>
            {[
              { label: lastSnapshot ? 'On Hand (Current Period)' : 'On Hand Units', value: totalUnits, color:'var(--cream)' },
              { label:'Consignment Value', value:`SGD ${totalValue.toFixed(2)}`, color:'var(--orange)' },
              { label:'Units Invoiced (Period)', value: totalInvoiced, color:'#7fc93e' },
              { label:'Active SKUs', value: onHand.filter(i=>i.on_hand>0).length, color:'var(--cream-60)' },
            ].map(k=>(
              <div key={k.label} style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:8,padding:'14px 16px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:6}}>{k.label}</div>
                <div style={{fontSize:22,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1,color:k.color}}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{display:'flex',gap:2,borderBottom:'1px solid var(--border)'}}>
            {[['summary','On-Hand Summary'],['history','Activity Log'],['periods','Period History']].map(([key,label])=>(
              <button key={key} onClick={()=>setTab(key)}
                style={{padding:'8px 16px',fontSize:12,fontWeight:600,border:'none',cursor:'pointer',background:'none',
                  color:tab===key?'var(--orange)':'var(--cream-30)',borderBottom:`2px solid ${tab===key?'var(--orange)':'transparent'}`,marginBottom:-1}}>
                {label}
              </button>
            ))}
          </div>

          {loading ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>

          : tab === 'summary' ? (
            <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
              {onHand.length === 0
                ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No stock placed yet. Use "Place Stock" to add your first consignment batch.</div>
                : <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:720}}>
                      <thead><tr>
                        {['Brand','Product',lastSnapshot?'Placed (Period)':'Total Placed',lastSnapshot?'Invoiced (Period)':'Invoiced',lastSnapshot?'Returned (Period)':'Returned','On Hand','Price','Value'].map(h=>(
                          <th key={h} style={{padding:'9px 12px',textAlign:['Placed (Period)','Total Placed','Invoiced (Period)','Invoiced','Returned (Period)','Returned','On Hand','Price','Value'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {onHand.map(item=>(
                          <tr key={item.product_id} style={{borderBottom:'1px solid rgba(245,242,235,.04)'}}>
                            <td style={{padding:'9px 12px'}}><Badge color={item.brand_color}>{item.brand_name}</Badge></td>
                            <td style={{padding:'9px 12px',color:'var(--cream)'}}>{item.item_series}{item.variation?' · '+item.variation:''}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{item.placed_since||0}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',color:'#7fc93e'}}>{item.invoiced_since||0}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{item.returned_since||0}</td>
                            <td style={{padding:'9px 12px',textAlign:'right'}}>
                              <span style={{fontWeight:700,fontSize:14,color:item.on_hand>0?'var(--cream)':item.on_hand===0?'var(--cream-30)':'#f87171'}}>{item.on_hand}</span>
                            </td>
                            <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{sgd(item.consignment_price)}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',fontWeight:700,color:'var(--orange)'}}>{sgd(Math.max(0,item.on_hand)*(item.consignment_price||0))}</td>
                          </tr>
                        ))}
                        <tr style={{borderTop:'2px solid var(--border)'}}>
                          <td colSpan={5} style={{padding:'10px 12px',fontWeight:700,color:'var(--cream-30)',fontSize:11}}>TOTAL</td>
                          <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'var(--cream)'}}>{totalUnits}</td>
                          <td/>
                          <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'var(--orange)'}}>{sgd(totalValue)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
              }
            </div>

          ) : tab === 'history' ? (
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {/* Danger zone — clear ALL consignment history for this partner */}
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button onClick={async () => {
                  if (!window.confirm(`⚠ This will permanently delete ALL consignment history for this partner (placements, returns, counts, snapshots) and void related sales. Use only to clear test data. Continue?`)) return;
                  await consignmentApi.resetConsignment(partnerId);
                  loadPartnerData(partnerId);
                }} style={{fontSize:11,color:'rgba(248,113,113,.6)',background:'none',border:'1px solid rgba(248,113,113,.3)',borderRadius:6,padding:'5px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:5}}
                  onMouseEnter={e=>{e.currentTarget.style.color='#f87171';e.currentTarget.style.borderColor='rgba(248,113,113,.6)';}}
                  onMouseLeave={e=>{e.currentTarget.style.color='rgba(248,113,113,.6)';e.currentTarget.style.borderColor='rgba(248,113,113,.3)';}}>
                  <Trash2 size={12}/> Clear All Consignment History
                </button>
              </div>
              {/* Counts */}
              <Card title={`STOCK COUNTS (${counts.length})`}>
                {counts.length === 0
                  ? <div style={{padding:'20px 16px',fontSize:12,color:'var(--cream-30)'}}>No stock counts yet.</div>
                  : counts.map(c=>(
                    <div key={c.id} style={{borderBottom:'1px solid rgba(245,242,235,.05)',padding:'12px 16px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                        <div>
                          <span style={{fontSize:12,fontWeight:700,color:'var(--cream)'}}>{c.date}</span>
                          {c.notes && <span style={{fontSize:11,color:'var(--cream-30)',marginLeft:10}}>{c.notes}</span>}
                        </div>
                        <div style={{display:'flex',gap:10,alignItems:'center'}}>
                          {c.invoice_amount>0 && <span style={{fontSize:12,fontWeight:700,color:'#7fc93e'}}>Invoice: {sgd(c.invoice_amount)}</span>}
                          {c.total_discrepancy===0 && <span style={{fontSize:11,color:'var(--cream-30)'}}>No discrepancy</span>}
                          <button onClick={async()=>{if(window.confirm('Void this count and its invoiced sales?')){await consignmentApi.deleteCount(c.id);loadPartnerData(partnerId);}}}
                            style={{background:'none',border:'none',color:'rgba(248,113,113,.5)',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}} title="Void count">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        {c.items?.map(i=>(
                          <div key={i.product_id} style={{fontSize:10,background:'rgba(245,242,235,.06)',borderRadius:4,padding:'3px 8px',color:i.qty_discrepancy>0?'#fbbf24':'var(--cream-30)'}}>
                            {i.item_series}{i.variation?' · '+i.variation:''}: counted {i.qty_counted} / on-hand {i.qty_on_hand}
                            {i.qty_discrepancy>0 && ` → −${i.qty_discrepancy} invoiced`}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                }
              </Card>

              {/* Placements */}
              <Card title={`PLACEMENTS (${placements.length})`}>
                {placements.length === 0
                  ? <div style={{padding:'20px 16px',fontSize:12,color:'var(--cream-30)'}}>No placements recorded.</div>
                  : <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead><tr>
                          {['Date','Brand','Product','Qty','Consign Price','Notes',''].map(h=>(
                            <th key={h} style={{padding:'8px 12px',textAlign:['Qty','Consign Price'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)'}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {placements.map(p=>(
                            <tr key={p.id} style={{borderBottom:'1px solid rgba(245,242,235,.04)'}}>
                              <td style={{padding:'8px 12px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{p.date}</td>
                              <td style={{padding:'8px 12px'}}><Badge color={p.brand_color}>{p.brand_name}</Badge></td>
                              <td style={{padding:'8px 12px',color:'var(--cream)'}}>{p.item_series}{p.variation?' · '+p.variation:''}</td>
                              <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:'var(--cream)'}}>{p.qty}</td>
                              <td style={{padding:'8px 12px',textAlign:'right',color:'var(--cream-60)'}}>{sgd(p.consignment_price)}</td>
                              <td style={{padding:'8px 12px',color:'var(--cream-30)',fontSize:11}}>{p.notes||'—'}</td>
                              <td style={{padding:'8px 12px'}}>
                                <button onClick={async()=>{if(window.confirm('Remove this placement?')){await consignmentApi.deletePlacement(p.id);loadPartnerData(partnerId);}}}
                                  style={{background:'none',border:'none',color:'rgba(248,113,113,.5)',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}>
                                  <Trash2 size={13}/>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                }
              </Card>

              {/* Returns */}
              <Card title={`RETURNS (${returns.length})`}>
                {returns.length === 0
                  ? <div style={{padding:'20px 16px',fontSize:12,color:'var(--cream-30)'}}>No returns recorded.</div>
                  : <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead><tr>
                          {['Date','Brand','Product','Qty','Notes',''].map(h=>(
                            <th key={h} style={{padding:'8px 12px',textAlign:['Qty'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)'}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {returns.map(r=>(
                            <tr key={r.id} style={{borderBottom:'1px solid rgba(245,242,235,.04)'}}>
                              <td style={{padding:'8px 12px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{r.date}</td>
                              <td style={{padding:'8px 12px'}}><Badge color={r.brand_color}>{r.brand_name}</Badge></td>
                              <td style={{padding:'8px 12px',color:'var(--cream)'}}>{r.item_series}{r.variation?' · '+r.variation:''}</td>
                              <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:'#f87171'}}>{r.qty}</td>
                              <td style={{padding:'8px 12px',color:'var(--cream-30)',fontSize:11}}>{r.notes||'—'}</td>
                              <td style={{padding:'8px 12px'}}>
                                <button onClick={async()=>{if(window.confirm('Remove this return?')){await consignmentApi.deleteReturn(r.id);loadPartnerData(partnerId);}}}
                                  style={{background:'none',border:'none',color:'rgba(248,113,113,.5)',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}>
                                  <Trash2 size={13}/>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                }
              </Card>
            </div>

          ) : (
            /* Period History tab */
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {snapshots.length === 0
                ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>
                    No closed periods yet. Use "Close Month" after each monthly stock count to lock the on-hand snapshot.
                  </div>
                : snapshots.map((period, pi) => (
                    <Card key={pi} title={`📦 ${period.label}`}>
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                          <thead><tr>
                            {['Brand','Product','On Hand at Close','Price','Value'].map(h=>(
                              <th key={h} style={{padding:'8px 12px',textAlign:['On Hand at Close','Price','Value'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)'}}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {period.items.map(item=>(
                              <tr key={item.id} style={{borderBottom:'1px solid rgba(245,242,235,.04)'}}>
                                <td style={{padding:'8px 12px'}}><Badge color={item.brand_color}>{item.brand_name}</Badge></td>
                                <td style={{padding:'8px 12px',color:'var(--cream)'}}>{item.item_series}{item.variation?' · '+item.variation:''}</td>
                                <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:'var(--cream)'}}>{item.on_hand_qty}</td>
                                <td style={{padding:'8px 12px',textAlign:'right',color:'var(--cream-60)'}}>{sgd(item.consignment_price)}</td>
                                <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:'var(--orange)'}}>{sgd(item.on_hand_qty*(item.consignment_price||0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  ))
              }
            </div>
          )}
        </>
      )}

      <PlaceStockModal open={modal==='place'} partnerId={partnerId} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);loadPartnerData(partnerId);}}/>
      <ReturnModal open={modal==='return'} partnerId={partnerId} onHandItems={onHand} onClose={()=>setModal(null)} onSaved={()=>{setModal(null);loadPartnerData(partnerId);}}/>
      <StockCountModal open={modal==='count'} partnerId={partnerId} onHandItems={onHand} onClose={()=>setModal(null)} onSaved={()=>loadPartnerData(partnerId)}/>
      <CloseMonthModal open={modal==='close'} partnerId={partnerId} onHandItems={onHand} onClose={()=>setModal(null)} onSaved={()=>{loadPartnerData(partnerId);setTab('periods');}}/>
    </Page>
  );
}
