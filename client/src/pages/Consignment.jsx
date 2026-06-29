import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Plus, RotateCcw, Search, Trash2, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { consignmentApi, productsApi } from '../api';
import { Page, Card, Select, Input, Btn, Badge, Modal } from '../components/ui';

const sgd = v => `SGD ${parseFloat(v||0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0,10);

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener('resize',h); return ()=>window.removeEventListener('resize',h); }, []);
  return m;
}

// ── PDF Generation ─────────────────────────────────────────────────
function generateConsignmentPDF(partner, items, countDate) {
  const rows = items.filter(i => i.on_hand >= 0).map(i => `
    <tr>
      <td>${i.brand_name}</td>
      <td>${i.item_series}${i.variation ? ' · '+i.variation : ''}</td>
      <td style="text-align:right">${i.total_placed}</td>
      <td style="text-align:right">${i.total_invoiced}</td>
      <td style="text-align:right">${i.total_returned}</td>
      <td style="text-align:right;font-weight:700">${i.on_hand}</td>
      <td style="text-align:right">${sgd(i.consignment_price)}</td>
      <td style="text-align:right">${sgd(i.on_hand * (i.consignment_price||0))}</td>
    </tr>`).join('');

  const totalValue = items.reduce((s,i) => s + Math.max(0,i.on_hand) * (i.consignment_price||0), 0);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Consignment List – ${partner.company_name}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; margin: 0; padding: 32px; }
    h1  { font-size: 22px; margin: 0 0 4px; color: #14213d; }
    .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { background: #14213d; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
    th:nth-child(n+3) { text-align: right; }
    td { padding: 7px 10px; border-bottom: 1px solid #e5e5e5; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .footer { margin-top: 24px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 12px; display:flex; justify-content:space-between; }
    .total { text-align:right; font-size:13px; font-weight:700; margin-top:10px; color:#14213d; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; }
    .logo { font-size: 28px; font-weight: 900; color: #f36f4a; letter-spacing:2px; }
    .meta { text-align:right; font-size:11px; color:#666; }
  </style></head><body>
  <div class="header">
    <div>
      <div class="logo">PAWVY</div>
      <div style="font-size:10px;color:#888;margin-bottom:12px">Pawvy Limited Partnership · UEN T23LP0163A</div>
      <h1>Consignment List</h1>
      <div class="sub">${partner.company_name}${partner.address ? ' · '+partner.address : ''}</div>
    </div>
    <div class="meta">
      <div><strong>Generated:</strong> ${countDate || new Date().toLocaleDateString('en-SG')}</div>
      <div><strong>Partner:</strong> ${partner.company_name}</div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th>Brand</th><th>Product</th>
      <th>Placed</th><th>Invoiced</th><th>Returned</th>
      <th>On Hand</th><th>Price</th><th>Value</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total">Total Consignment Value: ${sgd(totalValue)}</div>
  <div class="footer">
    <span>Pawvy Limited Partnership · 91 Defu Lane 10, Singapore 539221 · janicelee@pawvy.co</span>
    <span>Printed ${new Date().toLocaleDateString('en-SG')}</span>
  </div>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.print();
}

// ── Place Stock Modal ──────────────────────────────────────────────
function PlaceStockModal({ open, onClose, partnerId, onSaved }) {
  const [date, setDate]       = useState(today());
  const [products, setProducts] = useState([]);
  const [lines, setLines]     = useState([{ product_id:'', qty:'', consignment_price:'', unit_cost:'' }]);
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (open) {
      setDate(today()); setLines([{ product_id:'', qty:'', consignment_price:'', unit_cost:'' }]); setNotes(''); setError('');
      productsApi.getAll({ active:'true' }).then(setProducts);
    }
  }, [open]);

  function updateLine(idx, key, val) {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      if (key === 'product_id') {
        const prod = products.find(p => String(p.id) === String(val));
        if (prod) {
          next[idx].consignment_price = prod.price_consignment_sg || '';
          next[idx].unit_cost         = prod.unit_cost || '';
        }
      }
      return next;
    });
  }

  async function save() {
    const valid = lines.filter(l => l.product_id && l.qty);
    if (!valid.length) { setError('Add at least one product line.'); return; }
    setSaving(true); setError('');
    try {
      for (const l of valid) {
        await consignmentApi.addPlacement({
          partner_id: partnerId, product_id: l.product_id,
          date, qty: l.qty,
          consignment_price: l.consignment_price || 0,
          unit_cost: l.unit_cost || 0,
          notes: notes || null,
        });
      }
      onSaved();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} title="PLACE STOCK" onClose={onClose} width={620}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <Input label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:180}}/>

        <div style={{fontSize:10,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)',display:'grid',gridTemplateColumns:'2fr 70px 100px 100px',gap:8,padding:'0 4px'}}>
          <span>Product / SKU</span><span>Qty</span><span>Consign Price</span><span>Unit Cost</span>
        </div>
        {lines.map((line, idx) => (
          <div key={idx} style={{display:'grid',gridTemplateColumns:'2fr 70px 100px 100px 32px',gap:8,alignItems:'flex-start'}}>
            <Select value={line.product_id} onChange={e=>updateLine(idx,'product_id',e.target.value)}>
              <option value="">— Select product —</option>
              {products.map(p=>(
                <option key={p.id} value={p.id}>{p.brand_name} · {p.item_series}{p.variation?' · '+p.variation:''}</option>
              ))}
            </Select>
            <Input type="number" min="1" value={line.qty} onChange={e=>updateLine(idx,'qty',e.target.value)} placeholder="0"/>
            <Input type="number" step="0.01" value={line.consignment_price} onChange={e=>updateLine(idx,'consignment_price',e.target.value)} placeholder="0.00"/>
            <Input type="number" step="0.01" value={line.unit_cost} onChange={e=>updateLine(idx,'unit_cost',e.target.value)} placeholder="0.00"/>
            <button onClick={()=>setLines(l=>l.filter((_,i)=>i!==idx))} disabled={lines.length===1}
              style={{background:'none',border:'none',color:'rgba(248,113,113,.6)',cursor:'pointer',padding:'10px 0',display:'flex',alignItems:'center'}}>
              <Trash2 size={14}/>
            </button>
          </div>
        ))}
        <Btn size="sm" variant="ghost" onClick={()=>setLines(l=>[...l,{product_id:'',qty:'',consignment_price:'',unit_cost:''}])}>
          <Plus size={12}/> Add product
        </Btn>
        <Input label="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Restocking visit June"/>
        {error && <div style={{color:'#f87171',fontSize:12}}>{error}</div>}
        <div style={{display:'flex',gap:10}}>
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

  async function save() {
    const valid = lines.filter(l => l.product_id && l.qty && parseInt(l.qty) > 0);
    if (!valid.length) { setError('Add at least one product line.'); return; }
    setSaving(true); setError('');
    try {
      for (const l of valid) {
        await consignmentApi.addReturn({ partner_id: partnerId, product_id: l.product_id, date, qty: l.qty, notes: notes||null });
      }
      onSaved();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} title="RECORD RETURN" onClose={onClose} width={480}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <Input label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:180}}/>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)',display:'grid',gridTemplateColumns:'2fr 80px',gap:8,padding:'0 4px'}}>
          <span>Product</span><span>Qty Returned</span>
        </div>
        {lines.map((line, idx) => (
          <div key={idx} style={{display:'grid',gridTemplateColumns:'2fr 80px 32px',gap:8,alignItems:'flex-start'}}>
            <Select value={line.product_id} onChange={e=>updateLine(idx,'product_id',e.target.value)}>
              <option value="">— Select product —</option>
              {onHandItems.filter(i=>i.on_hand>0).map(p=>(
                <option key={p.product_id} value={p.product_id}>
                  {p.brand_name} · {p.item_series}{p.variation?' · '+p.variation:''} (on hand: {p.on_hand})
                </option>
              ))}
            </Select>
            <Input type="number" min="1" value={line.qty} onChange={e=>updateLine(idx,'qty',e.target.value)} placeholder="0"/>
            <button onClick={()=>setLines(l=>l.filter((_,i)=>i!==idx))} disabled={lines.length===1}
              style={{background:'none',border:'none',color:'rgba(248,113,113,.6)',cursor:'pointer',padding:'10px 0',display:'flex',alignItems:'center'}}>
              <Trash2 size={14}/>
            </button>
          </div>
        ))}
        <Btn size="sm" variant="ghost" onClick={()=>setLines(l=>[...l,{product_id:'',qty:''}])}>
          <Plus size={12}/> Add product
        </Btn>
        <Input label="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Damaged, unsold stock"/>
        {error && <div style={{color:'#f87171',fontSize:12}}>{error}</div>}
        <div style={{display:'flex',gap:10}}>
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

  useEffect(() => {
    if (open) {
      setDate(today()); setNotes(''); setCounts({}); setResult(null); setError('');
    }
  }, [open]);

  const activeItems = onHandItems.filter(i => i.on_hand >= 0);

  function setCount(productId, val) {
    setCounts(prev => ({ ...prev, [productId]: val }));
  }

  const discrepancies = activeItems.map(item => {
    const counted = parseInt(counts[item.product_id] ?? '');
    const disc    = isNaN(counted) ? null : Math.max(0, item.on_hand - counted);
    return { ...item, counted: isNaN(counted) ? null : counted, discrepancy: disc };
  });

  const totalDisc   = discrepancies.reduce((s,d) => s + (d.discrepancy||0), 0);
  const totalInvoice = discrepancies.reduce((s,d) => s + (d.discrepancy||0) * (d.consignment_price||0), 0);
  const allFilled    = activeItems.length > 0 && activeItems.every(i => counts[i.product_id] !== undefined && counts[i.product_id] !== '');

  async function submit() {
    if (!allFilled) { setError('Please fill in the physical count for every product.'); return; }
    setSaving(true); setError('');
    try {
      const items = activeItems.map(i => ({
        product_id: i.product_id,
        qty_counted: parseInt(counts[i.product_id]) || 0,
      }));
      const res = await consignmentApi.submitCount({ partner_id: partnerId, date, notes: notes||null, items });
      setResult(res);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (result) return (
    <Modal open={open} title="STOCK COUNT COMPLETE" onClose={()=>{onSaved();onClose();}} width={480}>
      <div style={{display:'flex',flexDirection:'column',gap:14,alignItems:'center',padding:'10px 0'}}>
        <CheckCircle size={48} color="#7fc93e"/>
        <div style={{textAlign:'center'}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'var(--cream)',letterSpacing:1}}>Count Submitted</div>
          <div style={{fontSize:12,color:'var(--cream-60)',marginTop:4}}>
            {result.lines_invoiced} product{result.lines_invoiced!==1?'s':''} invoiced
          </div>
        </div>
        {result.lines_invoiced > 0 ? (
          <div style={{background:'rgba(127,201,62,.1)',border:'1px solid rgba(127,201,62,.3)',borderRadius:8,padding:'14px 20px',textAlign:'center',width:'100%'}}>
            <div style={{fontSize:11,color:'#7fc93e',marginBottom:4}}>Invoice Generated</div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:'#7fc93e',letterSpacing:1}}>
              {sgd(result.invoice_total)}
            </div>
            <div style={{fontSize:10,color:'var(--cream-30)',marginTop:4}}>
              Sale records created in ledger • Partner to pay by transfer
            </div>
          </div>
        ) : (
          <div style={{background:'rgba(245,242,235,.05)',border:'1px solid var(--border)',borderRadius:8,padding:'14px 20px',textAlign:'center',width:'100%'}}>
            <div style={{fontSize:12,color:'var(--cream-30)'}}>No discrepancy — stock matches system count</div>
          </div>
        )}
        <Btn onClick={()=>{onSaved();onClose();}} size="lg" style={{width:'100%',justifyContent:'center'}}>Done</Btn>
      </div>
    </Modal>
  );

  return (
    <Modal open={open} title="STOCK COUNT" onClose={onClose} width={700}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <Input label="Count Date" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:180}}/>
          <Input label="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Monthly count June 2026" style={{flex:1}}/>
        </div>

        {activeItems.length === 0 ? (
          <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>
            No active consignment stock to count.
          </div>
        ) : (
          <>
            <div style={{overflowX:'auto',borderRadius:8,border:'1px solid var(--border)'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:'rgba(245,242,235,.05)'}}>
                    {['Brand','Product','On Hand (System)','Physical Count','Discrepancy','Invoice'].map(h=>(
                      <th key={h} style={{padding:'8px 12px',textAlign:['On Hand (System)','Physical Count','Discrepancy','Invoice'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {discrepancies.map(item => (
                    <tr key={item.product_id} style={{borderBottom:'1px solid rgba(245,242,235,.04)'}}>
                      <td style={{padding:'8px 12px'}}><Badge color={item.brand_color}>{item.brand_name}</Badge></td>
                      <td style={{padding:'8px 12px',color:'var(--cream)',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {item.item_series}{item.variation?' · '+item.variation:''}
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:'var(--cream)'}}>{item.on_hand}</td>
                      <td style={{padding:'8px 12px',textAlign:'right'}}>
                        <input type="number" min="0" value={counts[item.product_id]??''}
                          onChange={e=>setCount(item.product_id, e.target.value)}
                          placeholder="—"
                          style={{width:70,background:'var(--navy-light)',border:`1px solid ${counts[item.product_id]!==undefined&&counts[item.product_id]!==''?'var(--orange)':'var(--border)'}`,borderRadius:6,padding:'6px 8px',color:'var(--cream)',fontSize:12,textAlign:'right',outline:'none'}}/>
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,
                        color: item.discrepancy === null ? 'var(--cream-30)' : item.discrepancy > 0 ? '#fbbf24' : '#7fc93e'}}>
                        {item.discrepancy === null ? '—' : item.discrepancy > 0 ? `−${item.discrepancy}` : '✓ 0'}
                      </td>
                      <td style={{padding:'8px 12px',textAlign:'right',color:'var(--cream)',fontSize:11}}>
                        {item.discrepancy > 0 ? sgd(item.discrepancy * item.consignment_price) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary bar */}
            <div style={{background:'rgba(245,242,235,.04)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 16px',display:'flex',gap:24,flexWrap:'wrap'}}>
              <span style={{fontSize:12,color:'var(--cream-30)'}}>
                Total discrepancy: <strong style={{color: totalDisc > 0 ? '#fbbf24' : '#7fc93e'}}>{totalDisc} units</strong>
              </span>
              <span style={{fontSize:12,color:'var(--cream-30)'}}>
                Invoice amount: <strong style={{color:'var(--orange)'}}>{sgd(totalInvoice)}</strong>
              </span>
              {totalDisc > 0 && (
                <span style={{fontSize:11,color:'var(--cream-30)'}}>
                  ⚡ Sale records will be created automatically
                </span>
              )}
            </div>
          </>
        )}

        {error && (
          <div style={{display:'flex',gap:8,background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',borderRadius:7,padding:'10px 14px',color:'#f87171',fontSize:12}}>
            <AlertCircle size={14} style={{flexShrink:0,marginTop:1}}/>{error}
          </div>
        )}

        <div style={{display:'flex',gap:10}}>
          <Btn onClick={submit} disabled={saving||!allFilled} size="lg" style={{flex:1,justifyContent:'center'}}>
            {saving ? 'Submitting…' : <><Search size={14}/> Submit Count & Invoice</>}
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
  const [partners, setPartners]     = useState([]);
  const [partnerId, setPartnerId]   = useState('');
  const [onHand, setOnHand]         = useState([]);
  const [partner, setPartner]       = useState(null);
  const [counts, setCounts]         = useState([]);
  const [placements, setPlacements] = useState([]);
  const [returns, setReturns]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('summary'); // summary | history
  const [modal, setModal]           = useState(null);      // null | 'place' | 'return' | 'count'

  useEffect(() => {
    consignmentApi.partners().then(data => {
      setPartners(data);
      if (data.length > 0) setPartnerId(String(data[0].id));
    });
  }, []);

  const loadPartnerData = useCallback(async (pid) => {
    if (!pid) return;
    setLoading(true);
    const [oh, cnts, plac, rets] = await Promise.all([
      consignmentApi.onHand(pid),
      consignmentApi.counts(pid),
      consignmentApi.placements(pid),
      consignmentApi.returns(pid),
    ]);
    setPartner(oh.partner);
    setOnHand(oh.items);
    setCounts(cnts);
    setPlacements(plac);
    setReturns(rets);
    setLoading(false);
  }, []);

  useEffect(() => { if (partnerId) loadPartnerData(partnerId); }, [partnerId]);

  const totalValue   = onHand.reduce((s,i) => s + Math.max(0,i.on_hand) * (i.consignment_price||0), 0);
  const totalUnits   = onHand.reduce((s,i) => s + Math.max(0,i.on_hand), 0);
  const totalInvoiced= onHand.reduce((s,i) => s + (i.total_invoiced||0), 0);

  const TABS = ['summary','history'];

  return (
    <Page title="CONSIGNMENT" subtitle="Track stock placed at consignment partners">
      {/* Partner selector */}
      <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
        <Select label="Consignment Partner" value={partnerId} onChange={e=>setPartnerId(e.target.value)} style={{width:260}}>
          <option value="">— Select partner —</option>
          {partners.map(p=><option key={p.id} value={p.id}>{p.company_name}</option>)}
        </Select>
        {partners.length === 0 && (
          <div style={{fontSize:12,color:'#fbbf24',paddingBottom:8}}>
            ⚠ No consignment partners found. Set a partner's model to "Consignment" in the Partners tab.
          </div>
        )}
      </div>

      {partnerId && (
        <>
          {/* Action buttons */}
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <Btn onClick={()=>setModal('place')}><Plus size={14}/> Place Stock</Btn>
            <Btn onClick={()=>setModal('count')} variant="secondary"><Search size={14}/> Stock Count</Btn>
            <Btn onClick={()=>setModal('return')} variant="ghost"><RotateCcw size={14}/> Record Return</Btn>
            <div style={{flex:1}}/>
            <Btn variant="ghost" onClick={()=>generateConsignmentPDF(partner||{company_name:'Partner'}, onHand, new Date().toLocaleDateString('en-SG'))}>
              <FileText size={14}/> Print List
            </Btn>
          </div>

          {/* KPI cards */}
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'repeat(4,1fr)',gap:10}}>
            {[
              { label:'On Hand Units', value: totalUnits, color:'var(--cream)' },
              { label:'Consignment Value', value: `SGD ${totalValue.toFixed(2)}`, color:'var(--orange)' },
              { label:'Units Invoiced', value: totalInvoiced, color:'#7fc93e' },
              { label:'SKUs on Floor', value: onHand.filter(i=>i.on_hand>0).length, color:'var(--cream-60)' },
            ].map(k=>(
              <div key={k.label} style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:8,padding:'14px 16px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:6}}>{k.label}</div>
                <div style={{fontSize:22,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1,color:k.color}}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{display:'flex',gap:2,borderBottom:'1px solid var(--border)'}}>
            {[['summary','On-Hand Summary'],['history','Activity Log']].map(([key,label])=>(
              <button key={key} onClick={()=>setTab(key)}
                style={{padding:'8px 16px',fontSize:12,fontWeight:600,border:'none',cursor:'pointer',
                  background:'none',color:tab===key?'var(--orange)':'var(--cream-30)',
                  borderBottom:`2px solid ${tab===key?'var(--orange)':'transparent'}`,
                  marginBottom:-1,transition:'all .15s'}}>
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
          ) : tab === 'summary' ? (
            /* ── On-Hand Summary Table ── */
            <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
              {onHand.length === 0 ? (
                <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>
                  No stock placed yet. Use "Place Stock" to add your first consignment batch.
                </div>
              ) : (
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:700}}>
                    <thead>
                      <tr>
                        {['Brand','Product','Total Placed','Invoiced','Returned','On Hand','Price','Value'].map(h=>(
                          <th key={h} style={{padding:'9px 12px',textAlign:['Total Placed','Invoiced','Returned','On Hand','Price','Value'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {onHand.map(item=>(
                        <tr key={item.product_id} style={{borderBottom:'1px solid rgba(245,242,235,.04)'}}>
                          <td style={{padding:'9px 12px'}}><Badge color={item.brand_color}>{item.brand_name}</Badge></td>
                          <td style={{padding:'9px 12px',color:'var(--cream)'}}>
                            {item.item_series}{item.variation?' · '+item.variation:''}
                          </td>
                          <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{item.total_placed}</td>
                          <td style={{padding:'9px 12px',textAlign:'right',color:'#7fc93e'}}>{item.total_invoiced}</td>
                          <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{item.total_returned}</td>
                          <td style={{padding:'9px 12px',textAlign:'right'}}>
                            <span style={{fontWeight:700,fontSize:14,color:item.on_hand>0?'var(--cream)':item.on_hand===0?'var(--cream-30)':'#f87171'}}>
                              {item.on_hand}
                            </span>
                          </td>
                          <td style={{padding:'9px 12px',textAlign:'right',color:'var(--cream-60)'}}>{sgd(item.consignment_price)}</td>
                          <td style={{padding:'9px 12px',textAlign:'right',fontWeight:700,color:'var(--orange)'}}>
                            {sgd(Math.max(0,item.on_hand) * (item.consignment_price||0))}
                          </td>
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
              )}
            </div>
          ) : (
            /* ── Activity Log ── */
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {/* Stock Counts */}
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
                          {c.invoice_amount > 0 && (
                            <span style={{fontSize:12,fontWeight:700,color:'#7fc93e'}}>Invoice: {sgd(c.invoice_amount)}</span>
                          )}
                          {c.total_discrepancy === 0 && (
                            <span style={{fontSize:11,color:'var(--cream-30)'}}>No discrepancy</span>
                          )}
                          <button onClick={async()=>{if(window.confirm('Void this count and its invoiced sales?')){await consignmentApi.deleteCount(c.id);loadPartnerData(partnerId);}}}
                            style={{background:'none',border:'none',color:'rgba(248,113,113,.5)',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}
                            title="Void count">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        {c.items?.map(i=>(
                          <div key={i.product_id} style={{fontSize:10,background:'rgba(245,242,235,.06)',borderRadius:4,padding:'3px 8px',color:i.qty_discrepancy>0?'#fbbf24':'var(--cream-30)'}}>
                            {i.item_series}{i.variation?' · '+i.variation:''}: counted {i.qty_counted} / on-hand {i.qty_on_hand}
                            {i.qty_discrepancy > 0 && ` → −${i.qty_discrepancy} invoiced`}
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
                  : (
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead><tr>
                          {['Date','Brand','Product','Qty','Price','Notes',''].map(h=>(
                            <th key={h} style={{padding:'8px 12px',textAlign:['Qty','Price'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)'}}>{h}</th>
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
                  )
                }
              </Card>

              {/* Returns */}
              <Card title={`RETURNS (${returns.length})`}>
                {returns.length === 0
                  ? <div style={{padding:'20px 16px',fontSize:12,color:'var(--cream-30)'}}>No returns recorded.</div>
                  : (
                    <div style={{overflowX:'auto'}}>
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
                  )
                }
              </Card>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <PlaceStockModal
        open={modal==='place'} partnerId={partnerId}
        onClose={()=>setModal(null)}
        onSaved={()=>{setModal(null);loadPartnerData(partnerId);}}
      />
      <ReturnModal
        open={modal==='return'} partnerId={partnerId} onHandItems={onHand}
        onClose={()=>setModal(null)}
        onSaved={()=>{setModal(null);loadPartnerData(partnerId);}}
      />
      <StockCountModal
        open={modal==='count'} partnerId={partnerId} onHandItems={onHand}
        onClose={()=>setModal(null)}
        onSaved={()=>loadPartnerData(partnerId)}
      />
    </Page>
  );
}
