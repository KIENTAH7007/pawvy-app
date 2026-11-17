import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ArrowLeftRight, Trash2, AlertTriangle, CheckCircle, Upload, Clock, X } from 'lucide-react';
import { inventoryApi, forecastApi, brandsApi, productsApi } from '../api';
import { Page, Card, Select, Input, Btn, Badge, Modal } from '../components/ui';
import { localDateStr } from '../utils/dates';

const today = () => localDateStr();
const sgd = v => `SGD ${parseFloat(v||0).toFixed(2)}`;

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
          New stock always lands at <strong style={{color:'var(--orange)'}}>Hougang</strong>. Transfer to Mega when ready to fulfil orders.
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
  const [direction, setDirection] = useState('hougang_to_mega');
  const [lines, setLines]   = useState([{ brand_id:'', product_id:'', qty:'' }]);
  const [date, setDate]     = useState(today());
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => { if (open) { setLines([{ brand_id:'', product_id:'', qty:'' }]); setDirection('hougang_to_mega'); setDate(today()); setNotes(''); setError(''); } }, [open]);

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
            {[['hougang_to_mega','Hougang → Mega'],['mega_to_hougang','Mega → Hougang']].map(([val,label])=>(
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
  const [lines, setLines]   = useState([{ brand_id:'', product_id:'', location:'Mega', qty:'', reason:'Damaged' }]);
  const [date, setDate]     = useState(today());
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => { if (open) { setLines([{ brand_id:'', product_id:'', location:'Mega', qty:'', reason:'Damaged' }]); setDate(today()); setNotes(''); setError(''); } }, [open]);

  function updateLine(idx, key, val) {
    setLines(prev => prev.map((l,i)=> i===idx ? { ...l, [key]: val } : l));
  }
  const addLine    = () => setLines(p=>[...p,{ brand_id:'', product_id:'', location:'Mega', qty:'', reason:'Damaged' }]);
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
              <option value="Mega">Mega</option>
              <option value="Hougang">Hougang</option>
            </Select>
            <Input type="number" min="1" value={line.qty} onChange={e=>updateLine(idx,'qty',e.target.value)} placeholder="0"/>
            <Select value={line.reason} onChange={e=>updateLine(idx,'reason',e.target.value)}>
              {['Damaged','Expired','Lost','Marketing','Event Sponsor','Other'].map(r=><option key={r} value={r}>{r}</option>)}
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
  const [lines, setLines]   = useState([{ brand_id:'', product_id:'', location:'Mega', actual_qty:'' }]);
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => { if (open) { setLines([{ brand_id:'', product_id:'', location:'Mega', actual_qty:'' }]); setNotes(''); setError(''); inventoryApi.levels().then(setLevels); } }, [open]);

  function updateLine(idx, key, val) {
    setLines(prev => prev.map((l,i)=> i===idx ? { ...l, [key]: val } : l));
  }
  const addLine    = () => setLines(p=>[...p,{ brand_id:'', product_id:'', location:'Mega', actual_qty:'' }]);
  const removeLine = (idx) => setLines(p=>p.filter((_,i)=>i!==idx));

  function currentQty(productId, location) {
    const row = levels.find(l => String(l.product_id)===String(productId));
    if (!row) return null;
    return location==='Mega' ? row.mega_qty : row.hougang_qty;
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
                <option value="Mega">Mega</option>
                <option value="Hougang">Hougang</option>
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
// ── Restock Planner (step 1): stock cover by month ─────────────────
const COVER_COLORS = { low:'#f87171', out:'#f87171', watch:'#f5a623', ok:'#7fc93e', no_sales:'#6b7280' };
const monthLabel = ym => ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][parseInt(ym.slice(5,7),10)-1];

function RestockPlanner({ cover, selBrand, setSelBrand }) {
  if (!cover || cover.items.length === 0)
    return <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12,background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>No products to plan yet.</div>;
  const brandInfo = cover.brands.find(b=>String(b.brand_id)===String(selBrand)) || cover.brands[0];
  const items = cover.items.filter(i=>String(i.brand_id)===String(brandInfo.brand_id));
  const th = (right) => ({padding:'9px 10px',textAlign:right?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'});
  const lastIdx = cover.months.length - 1;
  const BAR_MAX = 6;
  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))',gap:10}}>
        {cover.brands.map(b=>{
          const sel = String(b.brand_id)===String(brandInfo.brand_id);
          return (
            <div key={b.brand_id} onClick={()=>setSelBrand(b.brand_id)}
              style={{cursor:'pointer',background:'var(--navy)',border:`1px solid ${sel?'var(--orange)':'var(--border)'}`,borderRadius:8,padding:'12px 14px'}}>
              <Badge color={b.brand_color}>{b.brand_name}</Badge>
              {b.active_skus===0 ? <div style={{marginTop:8,fontSize:12,color:'var(--cream-30)'}}>No recent sales to plan from</div> :
              <div style={{marginTop:8,fontSize:13,color:'var(--cream)'}}>
                <span style={{fontWeight:700,fontSize:20,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1,color:b.low_skus>0?'#f87171':'#7fc93e'}}>{b.low_skus}</span>
                <span style={{color:'var(--cream-30)'}}> of {b.active_skus} SKUs under {cover.low_threshold} months of cover</span>
              </div>}
              {b.on_the_way_units>0 && <div style={{fontSize:11,color:'#378ADD',marginTop:4}}>{b.on_the_way_units} units on the way</div>}
              {b.time_to_plan && <div style={{marginTop:8}}><Badge color="#f87171"><AlertTriangle size={10}/> Time to plan an order</Badge></div>}
            </div>
          );
        })}
      </div>

      <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
        <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1,color:'var(--cream)'}}>{brandInfo.brand_name} · Stock Cover</span>
          <span style={{fontSize:11,color:'var(--cream-30)'}}>Sales Ledger sales incl. consignment sales (placements not counted) · cover = (on hand + on the way) ÷ avg per month</span>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:900}}>
            <thead><tr>
              <th style={th(false)}>SKU</th>
              <th style={th(true)}>On Hand</th>
              {cover.months.map((ym,i)=><th key={ym} style={th(true)}>{monthLabel(ym)}{i===lastIdx?'*':''}</th>)}
              <th style={th(true)}>Avg / Mo</th>
              <th style={th(true)}>On The Way</th>
              <th style={th(false)}>Cover</th>
            </tr></thead>
            <tbody>
              {items.map(i=>{
                const col = COVER_COLORS[i.status];
                const pct = i.cover_months===null ? 0 : Math.min(100,(i.cover_months/BAR_MAX)*100);
                return (
                  <tr key={i.product_id} style={{borderBottom:'1px solid rgba(245,242,235,.04)',background:(i.status==='low'||i.status==='out')?'rgba(248,113,113,.04)':'transparent'}}>
                    <td style={{padding:'9px 10px',color:'var(--cream)'}}>{i.item_series}{i.variation?' · '+i.variation:''}</td>
                    <td style={{padding:'9px 10px',textAlign:'right',fontWeight:700,color:'var(--cream)'}}>{i.on_hand}</td>
                    {i.monthly.map((u,idx)=>(
                      <td key={idx} style={{padding:'9px 10px',textAlign:'right',color:idx===lastIdx?'var(--cream-30)':'var(--cream-60)',fontStyle:idx===lastIdx?'italic':'normal'}}>{u||'–'}</td>
                    ))}
                    <td style={{padding:'9px 10px',textAlign:'right',color:'var(--cream)'}}>{i.avg_per_month>0?i.avg_per_month:'–'}</td>
                    <td style={{padding:'9px 10px',textAlign:'right',color:i.on_the_way>0?'#378ADD':'var(--cream-30)',fontWeight:i.on_the_way>0?700:400}}>{i.on_the_way>0?i.on_the_way:'–'}</td>
                    <td style={{padding:'9px 10px',minWidth:150}}>
                      {i.status==='no_sales' ? <span style={{fontSize:11,color:'var(--cream-30)'}}>No recent sales</span>
                      : i.status==='out' ? <span style={{fontSize:11,fontWeight:700,color:col}}>Out of stock</span>
                      : <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{flex:1,height:6,background:'rgba(245,242,235,.08)',borderRadius:3,minWidth:60}}>
                            <div style={{width:`${pct}%`,height:'100%',background:col,borderRadius:3}}/>
                          </div>
                          <span style={{fontWeight:700,color:col,minWidth:44,textAlign:'right'}}>{i.cover_months} mo</span>
                        </div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{padding:'10px 16px',fontSize:11,color:'var(--cream-30)',borderTop:'1px solid var(--border)'}}>
          *{monthLabel(cover.current_month)} = month to date, not used in the average · Avg = last 3 full months ({cover.avg_months.map(monthLabel).join(', ')}) · Red under {cover.low_threshold} months, amber under {cover.watch_threshold} · "Time to plan" shows when half or more of a brand's selling SKUs are in red
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const isMobile = useIsMobile();
  const [tab, setTab]           = useState('levels'); // levels | restock
  const [levels, setLevels]     = useState([]);
  const [cover, setCover]       = useState(null);
  const [brands, setBrands]     = useState([]);
  const [filterBrand, setFB]    = useState('');
  const [loading, setLoading]   = useState(false);
  const [modal, setModal]       = useState(null);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [selBrand, setSelBrand]   = useState(null);

  const loadLevels = useCallback(() => {
    setLoading(true);
    inventoryApi.levels(filterBrand?{brand_id:filterBrand}:{}).then(d=>{setLevels(d);setLoading(false);});
  }, [filterBrand]);

  const loadRecs = useCallback(() => {
    setLoading(true);
    forecastApi.stockCover(filterBrand?{brand_id:filterBrand}:{}).then(d=>{setCover(d);setLoading(false);});
  }, [filterBrand]);

  useEffect(() => { brandsApi.getAll().then(setBrands); }, []);
  useEffect(() => { tab==='levels' ? loadLevels() : loadRecs(); }, [tab, loadLevels, loadRecs]);

  const reload = () => { setModal(null); tab==='levels'?loadLevels():loadRecs(); };

  const totalWarehouse   = levels.reduce((s,l)=>s+l.warehouse_total,0);
  const totalConsignment = levels.reduce((s,l)=>s+l.consignment_qty,0);
  const lowStockCount    = cover?.items.filter(i=>i.status==='low'||i.status==='out').length || 0;

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
          { label:'Low Cover SKUs', value:lowStockCount, color: lowStockCount>0?'#f87171':'#7fc93e' },
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
          {[['levels','Stock Levels'],['restock','Restock Planner']].map(([key,label])=>(
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
                    {['Brand','Product','Hougang','Mega','Qty On Hand','Consignment','Total Stock'].map(h=>(
                      <th key={h} style={{padding:'9px 12px',textAlign:['Hougang','Mega','Qty On Hand','Consignment','Total Stock'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
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
                        <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{l.hougang_qty}</td>
                        <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{l.mega_qty}</td>
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
        <RestockPlanner cover={cover} selBrand={selBrand} setSelBrand={setSelBrand}/>
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
