import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ArrowLeftRight, Trash2, AlertTriangle, CheckCircle, Upload, Clock, X, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { inventoryApi, forecastApi, brandsApi, productsApi } from '../api';
import { Page, Card, Select, Input, Btn, Badge, Modal } from '../components/ui';
import { pawvyHeaderHtml, pawvyAddressBlockHtml, pawvyFooterHtml, openPdfWindow } from '../utils/pawvyPdf';

const today = () => new Date().toISOString().slice(0,10);
const sgd = v => `SGD ${parseFloat(v||0).toFixed(2)}`;

// ── PDF: Restock Order Sheet (consolidated per-brand order list) ────
function printRestockOrderSheet(brandInfo, items, recs) {
  const date = new Date().toLocaleDateString('en-SG', { day:'numeric', month:'long', year:'numeric' });
  const orderable = items.filter(i => i.recommended_qty > 0);
  const rows = orderable.map((i, idx) => `
    <tr style="background:${idx%2===0?'#fff':'#f8f9fc'}">
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;font-weight:600">${i.item_series}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;color:#666">${i.variation||'—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right">${i.warehouse_total}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right;font-weight:700;font-size:14px;color:#f36f4a">${i.recommended_qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right">${parseFloat(i.unit_cost||0).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right;font-weight:600">${i.estimated_cost.toFixed(2)}</td>
    </tr>`).join('');

  const totalQty  = orderable.reduce((s,i)=>s+i.recommended_qty,0);
  const totalCost = orderable.reduce((s,i)=>s+i.estimated_cost,0);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Restock Order — ${brandInfo?.brand_name}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#1a1a2e; background:#fff; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body>

  ${pawvyHeaderHtml('RESTOCK ORDER SHEET', date)}
  ${pawvyAddressBlockHtml({ company_name: `${brandInfo?.brand_name} — Supplier Order` }, `RO-${brandInfo?.brand_name?.toUpperCase().replace(/\s/g,'')}-${date.replace(/\s/g,'')}`)}

  <div style="padding:0 32px;font-size:11px;color:#666;line-height:1.7">
    Based on trailing ${recs.trailing_days}-day sales velocity, recommended quantities top up every SKU to cover the next ${recs.cover_days} days.
  </div>

  <div style="padding:24px 32px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#14213d">
          <th style="padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px">Product</th>
          <th style="padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px">Variation</th>
          <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Current Stock</th>
          <th style="padding:10px 12px;text-align:right;color:#f36f4a;font-weight:700;font-size:11px">Order Qty</th>
          <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Unit Cost</th>
          <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Est. Cost</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#888">No SKUs need restocking right now</td></tr>'}</tbody>
    </table>
  </div>

  <div style="padding:0 32px 24px;display:flex;justify-content:flex-end">
    <div style="width:280px">
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #ddd;font-size:12px;color:#555">
        <span>Total Order Quantity</span><span style="font-weight:600">${totalQty} units</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #14213d;margin-top:4px">
        <span style="font-size:14px;font-weight:700;color:#14213d">Estimated Total Cost</span>
        <span style="font-size:14px;font-weight:700;color:#14213d">SGD ${totalCost.toFixed(2)}</span>
      </div>
    </div>
  </div>

  ${pawvyFooterHtml('Internal restock planning document — not for distribution')}
  </body></html>`;

  openPdfWindow(html);
}

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener('resize',h); return ()=>window.removeEventListener('resize',h); }, []);
  return m;
}

// ── Product picker shared by all action modals ──────────────────────
// ── Shared brand+product line picker (used by all multi-line modals) ──
function useProductCatalog() {
  const [products, setProducts] = useState([]);
  const [brands, setBrands]     = useState([]);
  useEffect(() => {
    productsApi.getAll({ active:'true' }).then(setProducts);
    brandsApi.getAll().then(setBrands);
  }, []);
  return { products, brands };
}

function BrandProductSelect({ brands, products, brandId, productId, onBrandChange, onProductChange }) {
  const filtered = brandId ? products.filter(p => String(p.brand_id) === String(brandId)) : products;
  return (
    <>
      <Select value={brandId} onChange={e=>{onBrandChange(e.target.value);onProductChange('');}}>
        <option value="">All brands</option>
        {brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </Select>
      <Select value={productId} onChange={e=>onProductChange(e.target.value)}>
        <option value="">— Select product —</option>
        {filtered.map(p=><option key={p.id} value={p.id}>{p.item_series}{p.variation?' · '+p.variation:''}</option>)}
      </Select>
    </>
  );
}

// ── Restock Modal (multi-line) ──────────────────────────────────────
function RestockModal({ open, onClose, onSaved }) {
  const { products, brands } = useProductCatalog();
  const [lines, setLines]   = useState([{ brand_id:'', product_id:'', qty:'', unit_cost:'' }]);
  const [date, setDate]     = useState(today());
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => { if (open) { setLines([{ brand_id:'', product_id:'', qty:'', unit_cost:'' }]); setDate(today()); setNotes(''); setError(''); } }, [open]);

  function updateLine(idx, key, val) {
    setLines(prev => {
      const next = prev.map((l,i)=> i===idx ? { ...l, [key]: val } : l);
      if (key === 'product_id') {
        const prod = products.find(p => String(p.id)===String(val));
        if (prod && !next[idx].unit_cost) next[idx].unit_cost = String(prod.unit_cost ?? '');
      }
      return next;
    });
  }
  const addLine    = () => setLines(p=>[...p,{ brand_id:'', product_id:'', qty:'', unit_cost:'' }]);
  const removeLine = (idx) => setLines(p=>p.filter((_,i)=>i!==idx));

  async function save() {
    const valid = lines.filter(l=>l.product_id && l.qty && parseInt(l.qty)>0);
    if (!valid.length) { setError('Add at least one product with qty > 0.'); return; }
    setSaving(true); setError('');
    try {
      for (const l of valid) {
        await inventoryApi.restock({ product_id: l.product_id, qty: parseInt(l.qty), unit_cost: l.unit_cost||undefined, date, notes: notes||null });
      }
      onSaved();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} title="RESTOCK IN" onClose={onClose} width={700}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{fontSize:11,color:'var(--cream-30)',background:'rgba(245,242,235,.04)',borderRadius:6,padding:'8px 12px'}}>
          New stock always lands at <strong style={{color:'var(--orange)'}}>Storhub</strong>. Transfer to Home when ready to fulfil orders.
        </div>
        <Input label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:180}}/>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1.4fr 70px 100px 28px',gap:8,padding:'0 2px'}}>
          {['Brand','Product / SKU','Qty','Unit Cost'].map(h=>(
            <div key={h} style={{fontSize:9,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)'}}>{h}</div>
          ))}
        </div>
        {lines.map((line, idx) => (
          <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1.4fr 70px 100px 28px',gap:8,alignItems:'flex-start'}}>
            <BrandProductSelect brands={brands} products={products}
              brandId={line.brand_id} productId={line.product_id}
              onBrandChange={v=>updateLine(idx,'brand_id',v)} onProductChange={v=>updateLine(idx,'product_id',v)}/>
            <Input type="number" min="1" value={line.qty} onChange={e=>updateLine(idx,'qty',e.target.value)} placeholder="0"/>
            <input type="text" inputMode="decimal" value={line.unit_cost} onChange={e=>updateLine(idx,'unit_cost',e.target.value)} placeholder="0.00"
              style={{background:'var(--navy-light)',border:'1px solid var(--border)',borderRadius:7,padding:'9px 12px',color:'var(--cream)',fontSize:13,outline:'none',width:'100%'}}/>
            <button onClick={()=>removeLine(idx)} disabled={lines.length===1}
              style={{background:'none',border:'none',color:'rgba(248,113,113,.6)',cursor:'pointer',padding:'8px 0',display:'flex',alignItems:'center'}}>
              <Trash2 size={14}/>
            </button>
          </div>
        ))}
        <Btn size="sm" variant="ghost" onClick={addLine}><Plus size={12}/> Add another product</Btn>
        <Input label="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. PO #1234, supplier invoice ref"/>
        {error && <div style={{color:'#f87171',fontSize:12}}>{error}</div>}
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={save} disabled={saving} size="lg" style={{flex:1,justifyContent:'center'}}>
            {saving?'Saving…':<><Plus size={14}/> Confirm Restock ({lines.filter(l=>l.product_id&&l.qty).length})</>}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Transfer Modal (multi-line) ──────────────────────────────────────
function TransferModal({ open, onClose, onSaved }) {
  const { products, brands } = useProductCatalog();
  const [direction, setDirection] = useState('storhub_to_home');
  const [lines, setLines]   = useState([{ brand_id:'', product_id:'', qty:'' }]);
  const [date, setDate]     = useState(today());
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => { if (open) { setLines([{ brand_id:'', product_id:'', qty:'' }]); setDirection('storhub_to_home'); setDate(today()); setNotes(''); setError(''); } }, [open]);

  function updateLine(idx, key, val) {
    setLines(prev => prev.map((l,i)=> i===idx ? { ...l, [key]: val } : l));
  }
  const addLine    = () => setLines(p=>[...p,{ brand_id:'', product_id:'', qty:'' }]);
  const removeLine = (idx) => setLines(p=>p.filter((_,i)=>i!==idx));

  async function save() {
    const valid = lines.filter(l=>l.product_id && l.qty && parseInt(l.qty)>0);
    if (!valid.length) { setError('Add at least one product with qty > 0.'); return; }
    setSaving(true); setError('');
    try {
      for (const l of valid) {
        await inventoryApi.transfer({ product_id: l.product_id, qty: parseInt(l.qty), direction, date, notes: notes||null });
      }
      onSaved();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} title="TRANSFER STOCK" onClose={onClose} width={680}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:'var(--cream-60)',letterSpacing:.5,textTransform:'uppercase',marginBottom:6}}>Direction</div>
          <div style={{display:'flex',gap:8}}>
            {[['storhub_to_home','Storhub → Home'],['home_to_storhub','Home → Storhub']].map(([val,label])=>(
              <button key={val} onClick={()=>setDirection(val)}
                style={{flex:1,padding:'10px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:700,
                  border:`1px solid ${direction===val?'var(--orange)':'var(--border)'}`,
                  background:direction===val?'rgba(243,111,74,.08)':'transparent',
                  color:direction===val?'var(--orange)':'var(--cream-60)'}}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <Input label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:180}}/>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1.4fr 70px 28px',gap:8,padding:'0 2px'}}>
          {['Brand','Product / SKU','Qty'].map(h=>(
            <div key={h} style={{fontSize:9,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)'}}>{h}</div>
          ))}
        </div>
        {lines.map((line, idx) => (
          <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1.4fr 70px 28px',gap:8,alignItems:'flex-start'}}>
            <BrandProductSelect brands={brands} products={products}
              brandId={line.brand_id} productId={line.product_id}
              onBrandChange={v=>updateLine(idx,'brand_id',v)} onProductChange={v=>updateLine(idx,'product_id',v)}/>
            <Input type="number" min="1" value={line.qty} onChange={e=>updateLine(idx,'qty',e.target.value)} placeholder="0"/>
            <button onClick={()=>removeLine(idx)} disabled={lines.length===1}
              style={{background:'none',border:'none',color:'rgba(248,113,113,.6)',cursor:'pointer',padding:'8px 0',display:'flex',alignItems:'center'}}>
              <Trash2 size={14}/>
            </button>
          </div>
        ))}
        <Btn size="sm" variant="ghost" onClick={addLine}><Plus size={12}/> Add another product</Btn>
        <Input label="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Restocking for partner orders"/>
        {error && <div style={{color:'#f87171',fontSize:12}}>{error}</div>}
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={save} disabled={saving} size="lg" style={{flex:1,justifyContent:'center'}}>
            {saving?'Saving…':<><ArrowLeftRight size={14}/> Confirm Transfer ({lines.filter(l=>l.product_id&&l.qty).length})</>}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Write-off Modal (multi-line) ──────────────────────────────────────
function WriteoffModal({ open, onClose, onSaved }) {
  const { products, brands } = useProductCatalog();
  const [lines, setLines]   = useState([{ brand_id:'', product_id:'', location:'Home', qty:'', reason:'Damaged' }]);
  const [date, setDate]     = useState(today());
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => { if (open) { setLines([{ brand_id:'', product_id:'', location:'Home', qty:'', reason:'Damaged' }]); setDate(today()); setNotes(''); setError(''); } }, [open]);

  function updateLine(idx, key, val) {
    setLines(prev => prev.map((l,i)=> i===idx ? { ...l, [key]: val } : l));
  }
  const addLine    = () => setLines(p=>[...p,{ brand_id:'', product_id:'', location:'Home', qty:'', reason:'Damaged' }]);
  const removeLine = (idx) => setLines(p=>p.filter((_,i)=>i!==idx));

  async function save() {
    const valid = lines.filter(l=>l.product_id && l.qty && parseInt(l.qty)>0);
    if (!valid.length) { setError('Add at least one product with qty > 0.'); return; }
    setSaving(true); setError('');
    try {
      for (const l of valid) {
        await inventoryApi.writeoff({ product_id: l.product_id, location: l.location, qty: parseInt(l.qty), reason: l.reason, date, notes: notes||null });
      }
      onSaved();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} title="RECORD WRITE-OFF" onClose={onClose} width={760}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{fontSize:11,color:'#fbbf24',background:'rgba(251,191,36,.08)',border:'1px solid rgba(251,191,36,.3)',borderRadius:6,padding:'8px 12px'}}>
          This permanently removes stock and records the cost as a loss in your P&L.
        </div>
        <Input label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:180}}/>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 90px 60px 110px 28px',gap:8,padding:'0 2px'}}>
          {['Brand','Product / SKU','Location','Qty','Reason'].map(h=>(
            <div key={h} style={{fontSize:9,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)'}}>{h}</div>
          ))}
        </div>
        {lines.map((line, idx) => (
          <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 90px 60px 110px 28px',gap:8,alignItems:'flex-start'}}>
            <BrandProductSelect brands={brands} products={products}
              brandId={line.brand_id} productId={line.product_id}
              onBrandChange={v=>updateLine(idx,'brand_id',v)} onProductChange={v=>updateLine(idx,'product_id',v)}/>
            <Select value={line.location} onChange={e=>updateLine(idx,'location',e.target.value)}>
              <option value="Home">Home</option>
              <option value="Storhub">Storhub</option>
            </Select>
            <Input type="number" min="1" value={line.qty} onChange={e=>updateLine(idx,'qty',e.target.value)} placeholder="0"/>
            <Select value={line.reason} onChange={e=>updateLine(idx,'reason',e.target.value)}>
              {['Damaged','Expired','Lost','Other'].map(r=><option key={r} value={r}>{r}</option>)}
            </Select>
            <button onClick={()=>removeLine(idx)} disabled={lines.length===1}
              style={{background:'none',border:'none',color:'rgba(248,113,113,.6)',cursor:'pointer',padding:'8px 0',display:'flex',alignItems:'center'}}>
              <Trash2 size={14}/>
            </button>
          </div>
        ))}
        <Btn size="sm" variant="ghost" onClick={addLine}><Plus size={12}/> Add another product</Btn>
        <Input label="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Water damage from storage"/>
        {error && <div style={{color:'#f87171',fontSize:12}}>{error}</div>}
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={save} disabled={saving} size="lg"
            style={{flex:1,justifyContent:'center',background:'rgba(248,113,113,.15)',color:'#f87171',border:'1px solid rgba(248,113,113,.4)'}}>
            {saving?'Saving…':<><Trash2 size={14}/> Confirm Write-off ({lines.filter(l=>l.product_id&&l.qty).length})</>}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Adjustment Modal (multi-line) ──────────────────────────────────────
function AdjustmentModal({ open, onClose, onSaved }) {
  const { products, brands } = useProductCatalog();
  const [levels, setLevels] = useState([]);
  const [lines, setLines]   = useState([{ brand_id:'', product_id:'', location:'Home', actual_qty:'' }]);
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => { if (open) { setLines([{ brand_id:'', product_id:'', location:'Home', actual_qty:'' }]); setNotes(''); setError(''); inventoryApi.levels().then(setLevels); } }, [open]);

  function updateLine(idx, key, val) {
    setLines(prev => prev.map((l,i)=> i===idx ? { ...l, [key]: val } : l));
  }
  const addLine    = () => setLines(p=>[...p,{ brand_id:'', product_id:'', location:'Home', actual_qty:'' }]);
  const removeLine = (idx) => setLines(p=>p.filter((_,i)=>i!==idx));

  function currentQty(productId, location) {
    const row = levels.find(l => String(l.product_id)===String(productId));
    if (!row) return null;
    return location==='Home' ? row.home_qty : row.storhub_qty;
  }

  async function save() {
    const valid = lines.filter(l=>l.product_id && l.actual_qty!=='');
    if (!valid.length) { setError('Add at least one product with an actual count.'); return; }
    setSaving(true); setError('');
    try {
      for (const l of valid) {
        await inventoryApi.adjustment({ product_id: l.product_id, location: l.location, actual_qty: parseInt(l.actual_qty), notes: notes||null });
      }
      onSaved();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} title="STOCK ADJUSTMENT" onClose={onClose} width={760}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{fontSize:11,color:'var(--cream-30)',background:'rgba(245,242,235,.04)',borderRadius:6,padding:'8px 12px'}}>
          Use this to correct discrepancies after a physical count — enter the actual quantity you counted, the system logs the difference.
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 90px 70px 90px 28px',gap:8,padding:'0 2px'}}>
          {['Brand','Product / SKU','Location','System','Actual'].map(h=>(
            <div key={h} style={{fontSize:9,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)'}}>{h}</div>
          ))}
        </div>
        {lines.map((line, idx) => {
          const sysQty = line.product_id ? currentQty(line.product_id, line.location) : null;
          return (
            <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 90px 70px 90px 28px',gap:8,alignItems:'flex-start'}}>
              <BrandProductSelect brands={brands} products={products}
                brandId={line.brand_id} productId={line.product_id}
                onBrandChange={v=>updateLine(idx,'brand_id',v)} onProductChange={v=>updateLine(idx,'product_id',v)}/>
              <Select value={line.location} onChange={e=>updateLine(idx,'location',e.target.value)}>
                <option value="Home">Home</option>
                <option value="Storhub">Storhub</option>
              </Select>
              <div style={{padding:'9px 0',fontSize:13,color:'var(--cream-30)',textAlign:'center'}}>{sysQty===null?'—':sysQty}</div>
              <Input type="number" min="0" value={line.actual_qty} onChange={e=>updateLine(idx,'actual_qty',e.target.value)} placeholder="0"/>
              <button onClick={()=>removeLine(idx)} disabled={lines.length===1}
                style={{background:'none',border:'none',color:'rgba(248,113,113,.6)',cursor:'pointer',padding:'8px 0',display:'flex',alignItems:'center'}}>
                <Trash2 size={14}/>
              </button>
            </div>
          );
        })}
        <Btn size="sm" variant="ghost" onClick={addLine}><Plus size={12}/> Add another product</Btn>
        <Input label="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Physical count June 2026"/>
        {error && <div style={{color:'#f87171',fontSize:12}}>{error}</div>}
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={save} disabled={saving} size="lg" style={{flex:1,justifyContent:'center'}}>
            {saving?'Saving…':<><CheckCircle size={14}/> Confirm Adjustment ({lines.filter(l=>l.product_id&&l.actual_qty!=='').length})</>}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}


// ── Opening Stock Import Modal ────────────────────────────────────────
function ImportModal({ open, onClose, onSaved }) {
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState(null);

  useEffect(() => { if (open) { setResult(null); } }, [open]);

  async function run() {
    setRunning(true);
    try { setResult(await inventoryApi.importOpening()); }
    finally { setRunning(false); }
  }

  return (
    <Modal open={open} title="IMPORT OPENING STOCK" onClose={onClose} width={560}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        {!result ? (
          <>
            <div style={{fontSize:12,color:'var(--cream-60)',lineHeight:1.7}}>
              Imports your 2026 baseline stock count (219 SKUs from your tracking file) by matching barcodes to your Products & Pricing catalogue. Safe to run — already-imported products are automatically skipped, so this can't double-count.
            </div>
            <Btn onClick={run} disabled={running} size="lg" style={{justifyContent:'center'}}>
              {running?'Importing…':<><Upload size={14}/> Run Import</>}
            </Btn>
          </>
        ) : (
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
              <div style={{background:'rgba(127,201,62,.1)',borderRadius:8,padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:22,fontWeight:700,color:'#7fc93e'}}>{result.matched_count}</div>
                <div style={{fontSize:10,color:'var(--cream-30)'}}>Matched</div>
              </div>
              <div style={{background:'rgba(251,191,36,.1)',borderRadius:8,padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:22,fontWeight:700,color:'#fbbf24'}}>{result.unmatched_count}</div>
                <div style={{fontSize:10,color:'var(--cream-30)'}}>Unmatched</div>
              </div>
              <div style={{background:'rgba(245,242,235,.06)',borderRadius:8,padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:22,fontWeight:700,color:'var(--cream-30)'}}>{result.skipped_count}</div>
                <div style={{fontSize:10,color:'var(--cream-30)'}}>Already Done</div>
              </div>
            </div>
            {result.unmatched_count > 0 && (
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#fbbf24',marginBottom:8}}>Unmatched SKUs (need manual entry via Stock Adjustment):</div>
                <div style={{maxHeight:160,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8}}>
                  {result.unmatched.map((u,i)=>(
                    <div key={i} style={{padding:'6px 12px',fontSize:11,color:'var(--cream-60)',borderBottom:'1px solid rgba(245,242,235,.04)'}}>
                      {u.brand} · {u.item_series}{u.variation?' · '+u.variation:''} {u.barcode?`(${u.barcode})`:'(no barcode)'}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Btn onClick={()=>{onSaved();onClose();}} size="lg" style={{justifyContent:'center'}}>Done</Btn>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Movement History Drawer ────────────────────────────────────────────
function MovementHistoryModal({ open, onClose, product }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (open && product) {
      setLoading(true);
      inventoryApi.movements(product.product_id).then(d=>{setMovements(d);setLoading(false);});
    }
  }, [open, product]);

  const typeColor = {
    'Opening Stock':'var(--cream-30)', 'Restock In':'#7fc93e', 'Transfer In':'#378ADD', 'Transfer Out':'#378ADD',
    'Sale':'#f87171', 'Sale Reversal':'#7fc93e', 'Consignment Placement':'#fbbf24', 'Placement Reversal':'#7fc93e',
    'Consignment Return':'#7fc93e', 'Return Reversal':'#f87171', 'Write-off':'#f87171', 'Adjustment':'#7F77DD',
  };

  return (
    <Modal open={open} title={`MOVEMENT HISTORY — ${product?.item_series||''}`} onClose={onClose} width={640}>
      {loading ? <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
      : movements.length === 0 ? <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No movements recorded yet.</div>
      : (
        <div style={{maxHeight:420,overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{position:'sticky',top:0,background:'var(--navy)'}}>
              {['Date','Type','Location','Qty','Notes'].map(h=>(
                <th key={h} style={{padding:'8px 10px',textAlign:h==='Qty'?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {movements.map((m,i)=>(
                <tr key={i} style={{borderBottom:'1px solid rgba(245,242,235,.04)'}}>
                  <td style={{padding:'7px 10px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{m.date}</td>
                  <td style={{padding:'7px 10px',color:typeColor[m.type]||'var(--cream)'}}>{m.type}</td>
                  <td style={{padding:'7px 10px',color:'var(--cream-60)'}}>{m.location}</td>
                  <td style={{padding:'7px 10px',textAlign:'right',fontWeight:700,color:m.qty_change>=0?'#7fc93e':'#f87171'}}>{m.qty_change>0?'+':''}{m.qty_change}</td>
                  <td style={{padding:'7px 10px',color:'var(--cream-30)',fontSize:11}}>{m.notes||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ── Main Inventory Page ────────────────────────────────────────────────
export default function Inventory() {
  const isMobile = useIsMobile();
  const [tab, setTab]           = useState('levels'); // levels | restock
  const [levels, setLevels]     = useState([]);
  const [recs, setRecs]         = useState(null);
  const [brands, setBrands]     = useState([]);
  const [filterBrand, setFB]    = useState('');
  const [loading, setLoading]   = useState(false);
  const [modal, setModal]       = useState(null);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [restockBrand, setRestockBrand] = useState(null);

  const loadLevels = useCallback(() => {
    setLoading(true);
    inventoryApi.levels(filterBrand?{brand_id:filterBrand}:{}).then(d=>{setLevels(d);setLoading(false);});
  }, [filterBrand]);

  const loadRecs = useCallback(() => {
    setLoading(true);
    forecastApi.restockRecommendations(filterBrand?{brand_id:filterBrand}:{}).then(d=>{setRecs(d);setLoading(false);});
  }, [filterBrand]);

  useEffect(() => { brandsApi.getAll().then(setBrands); }, []);
  useEffect(() => { setRestockBrand(null); tab==='levels' ? loadLevels() : loadRecs(); }, [tab, loadLevels, loadRecs]);

  const reload = () => { setModal(null); tab==='levels'?loadLevels():loadRecs(); };

  const totalWarehouse   = levels.reduce((s,l)=>s+l.warehouse_total,0);
  const totalConsignment = levels.reduce((s,l)=>s+l.consignment_qty,0);
  const lowStockCount    = recs?.items.filter(i=>i.needs_reorder).length || 0;

  return (
    <Page title="INVENTORY" subtitle="Stock levels, movements, and restock planning"
      action={
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <Btn onClick={()=>setModal('restock')}><Plus size={14}/> Restock In</Btn>
          <Btn variant="secondary" onClick={()=>setModal('transfer')}><ArrowLeftRight size={14}/> Transfer</Btn>
          <Btn variant="ghost" onClick={()=>setModal('writeoff')} style={{color:'#f87171',borderColor:'rgba(248,113,113,.3)'}}><Trash2 size={14}/> Write-off</Btn>
          <Btn variant="ghost" onClick={()=>setModal('adjustment')}><CheckCircle size={14}/> Adjust</Btn>
        </div>
      }>

      {/* Import banner — only meaningful before baseline is set, but harmless to always show as an option */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(243,111,74,.06)',border:'1px solid rgba(243,111,74,.2)',borderRadius:8,padding:'10px 16px',flexWrap:'wrap',gap:8}}>
        <span style={{fontSize:12,color:'var(--cream-60)'}}>Haven't set your opening stock baseline yet? Import your 2026 tracking file data in one click.</span>
        <Btn size="sm" variant="ghost" onClick={()=>setModal('import')}><Upload size={12}/> Import Opening Stock</Btn>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'repeat(4,1fr)',gap:10}}>
        {[
          { label:'Warehouse Units', value:totalWarehouse, color:'var(--cream)' },
          { label:'Consignment Units', value:totalConsignment, color:'#378ADD' },
          { label:'SKUs Tracked', value:levels.length, color:'var(--cream-60)' },
          { label:'Need Reorder', value:lowStockCount, color: lowStockCount>0?'#f87171':'#7fc93e' },
        ].map(k=>(
          <div key={k.label} style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:8,padding:'14px 16px'}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:6}}>{k.label}</div>
            <div style={{fontSize:22,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1,color:k.color}}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters + Tabs */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',gap:2,borderBottom:'1px solid var(--border)'}}>
          {[['levels','Stock Levels'],['restock','Restock Recommendations']].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)}
              style={{padding:'8px 16px',fontSize:12,fontWeight:600,border:'none',cursor:'pointer',background:'none',
                color:tab===key?'var(--orange)':'var(--cream-30)',borderBottom:`2px solid ${tab===key?'var(--orange)':'transparent'}`,marginBottom:-1}}>
              {label}
            </button>
          ))}
        </div>
        <Select label="Brand" value={filterBrand} onChange={e=>setFB(e.target.value)} style={{width:180}}>
          <option value="">All brands</option>
          {brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </div>

      {loading ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>

      : tab === 'levels' ? (
        <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
          {levels.length === 0
            ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No stock data yet. Run the opening stock import or add a Restock entry to get started.</div>
            : <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:760}}>
                  <thead><tr>
                    {['Brand','Product','Storhub','Home','Qty On Hand','Consignment','Total Stock'].map(h=>(
                      <th key={h} style={{padding:'9px 12px',textAlign:['Storhub','Home','Qty On Hand','Consignment','Total Stock'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {levels.map(l=>(
                      <tr key={l.product_id} style={{borderBottom:'1px solid rgba(245,242,235,.04)',cursor:'pointer'}}
                        onClick={()=>setHistoryProduct(l)}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(245,242,235,.03)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{padding:'9px 12px'}}><Badge color={l.brand_color}>{l.brand_name}</Badge></td>
                        <td style={{padding:'9px 12px',color:'var(--cream)'}}>{l.item_series}{l.variation?' · '+l.variation:''}</td>
                        <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{l.storhub_qty}</td>
                        <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{l.home_qty}</td>
                        <td style={{padding:'9px 12px',textAlign:'right',fontWeight:700,color:'var(--cream)'}}>{l.warehouse_total}</td>
                        <td style={{padding:'9px 12px',textAlign:'right',color:'#378ADD'}}>{l.consignment_qty}</td>
                        <td style={{padding:'9px 12px',textAlign:'right'}}>
                          <span style={{fontWeight:700,fontSize:14,color:l.total_stock>0?'var(--orange)':'#f87171'}}>{l.total_stock}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </div>

      ) : (
        <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
          {!recs || recs.items.length === 0
            ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No sales data yet to forecast from.</div>
            : <>
                <div style={{padding:'10px 16px',fontSize:11,color:'var(--cream-30)',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                  <span>Velocity based on trailing {recs.trailing_days} days · Reorder flagged when stock covers less than {recs.lead_time_days} days (your supplier lead time) · Top-up qty covers the next {recs.cover_days} days</span>
                  {restockBrand && (
                    <button onClick={()=>setRestockBrand(null)} style={{display:'flex',alignItems:'center',gap:4,background:'none',border:'none',color:'var(--orange)',cursor:'pointer',fontSize:11,fontWeight:700}}>
                      <ChevronLeft size={13}/> All Brands
                    </button>
                  )}
                </div>

                {!restockBrand ? (
                  /* ── Brand Rollup ── */
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:680}}>
                      <thead><tr>
                        {['Brand','SKUs Needing Reorder','Earliest Stockout','Top-up Qty','Est. Cost',''].map(h=>(
                          <th key={h} style={{padding:'9px 12px',textAlign:['SKUs Needing Reorder','Earliest Stockout','Top-up Qty','Est. Cost'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {recs.brands.map(b=>{
                          const urgent = b.earliest_days_remaining !== null && b.earliest_days_remaining < recs.lead_time_days;
                          return (
                            <tr key={b.brand_id} style={{borderBottom:'1px solid rgba(245,242,235,.04)',cursor:'pointer',background:urgent?'rgba(248,113,113,.04)':'transparent'}}
                              onClick={()=>setRestockBrand(b.brand_id)}
                              onMouseEnter={e=>e.currentTarget.style.background='rgba(245,242,235,.04)'}
                              onMouseLeave={e=>e.currentTarget.style.background=urgent?'rgba(248,113,113,.04)':'transparent'}>
                              <td style={{padding:'10px 12px'}}><Badge color={b.brand_color}>{b.brand_name}</Badge></td>
                              <td style={{padding:'10px 12px',textAlign:'right'}}>
                                <span style={{fontWeight:700,color:b.needs_reorder_count>0?'#f87171':'var(--cream-30)'}}>{b.needs_reorder_count}</span>
                                <span style={{color:'var(--cream-30)'}}> / {b.total_skus}</span>
                              </td>
                              <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:urgent?'#f87171':'var(--cream-60)'}}>
                                {b.earliest_days_remaining===null?'—':`${b.earliest_days_remaining}d`}
                              </td>
                              <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:b.total_recommended_qty>0?'var(--orange)':'var(--cream-30)'}}>
                                {b.total_recommended_qty>0?b.total_recommended_qty:'—'}
                              </td>
                              <td style={{padding:'10px 12px',textAlign:'right',color:'var(--cream-60)'}}>{b.total_estimated_cost>0?sgd(b.total_estimated_cost):'—'}</td>
                              <td style={{padding:'10px 12px',textAlign:'right'}}><ChevronRight size={14} color="var(--cream-30)"/></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* ── Brand Drill-down — ALL SKUs in brand, not just flagged ones ── */
                  (() => {
                    const brandItems = recs.items.filter(i=>String(i.brand_id)===String(restockBrand));
                    const brandInfo  = recs.brands.find(b=>String(b.brand_id)===String(restockBrand));
                    return (
                      <>
                        <div style={{padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--border)'}}>
                          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1,color:'var(--cream)'}}>
                            <Badge color={brandInfo?.brand_color}>{brandInfo?.brand_name}</Badge> — Full Catalogue Order Sheet
                          </span>
                          <Btn size="sm" variant="ghost" onClick={()=>printRestockOrderSheet(brandInfo, brandItems, recs)}>
                            <Printer size={12}/> Print Order Sheet
                          </Btn>
                        </div>
                        <div style={{overflowX:'auto'}}>
                          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:820}}>
                            <thead><tr>
                              {['Product','Stock','Daily Velocity','Days Left','Status','Top-up Qty','Est. Cost'].map(h=>(
                                <th key={h} style={{padding:'9px 12px',textAlign:['Stock','Daily Velocity','Days Left','Top-up Qty','Est. Cost'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {brandItems.map(item=>(
                                <tr key={item.product_id} style={{borderBottom:'1px solid rgba(245,242,235,.04)',background:item.needs_reorder?'rgba(248,113,113,.04)':'transparent'}}>
                                  <td style={{padding:'9px 12px',color:'var(--cream)'}}>{item.item_series}{item.variation?' · '+item.variation:''}</td>
                                  <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{item.warehouse_total}</td>
                                  <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{item.daily_velocity>0?item.daily_velocity.toFixed(2):'—'}/day</td>
                                  <td style={{padding:'9px 12px',textAlign:'right',fontWeight:700,color:item.days_remaining===null?'var(--cream-30)':item.days_remaining<recs.lead_time_days?'#f87171':'var(--cream)'}}>
                                    {item.days_remaining===null?'—':`${item.days_remaining}d`}
                                  </td>
                                  <td style={{padding:'9px 12px'}}>
                                    {item.needs_reorder
                                      ? <Badge color="#f87171"><AlertTriangle size={10}/> Reorder</Badge>
                                      : <Badge color="#7fc93e">OK</Badge>
                                    }
                                  </td>
                                  <td style={{padding:'9px 12px',textAlign:'right',fontWeight:700,color:item.recommended_qty>0?'var(--orange)':'var(--cream-30)'}}>
                                    {item.recommended_qty>0?item.recommended_qty:'—'}
                                  </td>
                                  <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{item.recommended_qty>0?sgd(item.estimated_cost):'—'}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{borderTop:'2px solid var(--border)'}}>
                                <td colSpan={5} style={{padding:'10px 12px',fontWeight:700,color:'var(--cream-30)',fontSize:11}}>CONSOLIDATED ORDER TOTAL</td>
                                <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'var(--orange)'}}>{brandInfo?.total_recommended_qty}</td>
                                <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'var(--orange)'}}>{sgd(brandInfo?.total_estimated_cost)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </>
                    );
                  })()
                )}
              </>
          }
        </div>
      )}


      <RestockModal open={modal==='restock'} onClose={()=>setModal(null)} onSaved={reload}/>
      <TransferModal open={modal==='transfer'} onClose={()=>setModal(null)} onSaved={reload}/>
      <WriteoffModal open={modal==='writeoff'} onClose={()=>setModal(null)} onSaved={reload}/>
      <AdjustmentModal open={modal==='adjustment'} onClose={()=>setModal(null)} onSaved={reload}/>
      <ImportModal open={modal==='import'} onClose={()=>setModal(null)} onSaved={reload}/>
      <MovementHistoryModal open={!!historyProduct} product={historyProduct} onClose={()=>setHistoryProduct(null)}/>
    </Page>
  );
}
