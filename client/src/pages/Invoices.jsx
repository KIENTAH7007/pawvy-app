import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Truck, FileSpreadsheet, AlertCircle, CheckCircle, Clock, Trash2, Printer, RefreshCw } from 'lucide-react';
import { invoicesApi, consignmentApi, partnersApi, partnerAddressesApi } from '../api';
import { Page, Card, Select, Input, Btn, Badge, Modal } from '../components/ui';
import { sgd, pawvyHeaderHtml, pawvyAddressBlockHtml, pawvyFooterHtml, pawvyPaymentInstructionsHtml, openPdfWindow } from '../utils/pawvyPdf';

const today = () => new Date().toISOString().slice(0,10);

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener('resize',h); return ()=>window.removeEventListener('resize',h); }, []);
  return m;
}

// ── Sequential doc number (client-side fallback display only — server assigns the real one) ──
function localDocNum(prefix) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `${prefix}-${ymd}-XXX`;
}

// ── PDF: Invoice ──────────────────────────────────────────────────
function generateInvoicePDF(invoice) {
  const date = new Date(invoice.date).toLocaleDateString('en-SG', { day:'numeric', month:'long', year:'numeric' });
  const rows = (invoice.items||[]).map((it, idx) => {
    // Brand-aware rows (product-linked lines) vs plain description (legacy/non-product lines)
    const brand = it.brand_name || '—';
    const desc  = it.item_series ? `${it.item_series}${it.variation ? ' · '+it.variation : ''}` : it.description;
    return `
    <tr style="background:${idx%2===0?'#fff':'#f8f9fc'}">
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0">${brand}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0">${desc}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right">${it.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right">${parseFloat(it.unit_price).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right;font-weight:600">${parseFloat(it.line_total).toFixed(2)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${invoice.invoice_number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#1a1a2e; background:#fff; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body>

  ${pawvyHeaderHtml('INVOICE', date)}
  ${pawvyAddressBlockHtml({ company_name: invoice.partner_name, address: invoice.partner_address, pic_name: invoice.pic_name }, invoice.invoice_number, invoice.outlet_label ? { label: invoice.outlet_label, address: invoice.outlet_address, pic_name: invoice.outlet_pic } : null)}

  <div style="padding:0 32px;display:flex;gap:32px;font-size:11px;color:#666">
    <div><strong style="color:#14213d">Due Date:</strong> ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-SG') : '—'}</div>
    <div><strong style="color:#14213d">Market:</strong> ${invoice.market||'SG'}</div>
  </div>

  <div style="padding:24px 32px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#14213d">
        <th style="padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px">Brand</th>
        <th style="padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px">Description</th>
        <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Qty</th>
        <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Unit Price</th>
        <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div style="padding:0 32px 24px;display:flex;justify-content:flex-end">
    <div style="width:280px">
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:#555">
        <span>Subtotal</span><span>${sgd(invoice.subtotal)}</span>
      </div>
      ${invoice.discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:#27ae60"><span>Discount</span><span>− ${sgd(invoice.discount)}</span></div>` : ''}
      ${invoice.shipping > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;color:#555"><span>Shipping</span><span>+ ${sgd(invoice.shipping)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #14213d;margin-top:4px">
        <span style="font-size:14px;font-weight:700;color:#14213d">Amount Due</span>
        <span style="font-size:14px;font-weight:700;color:#14213d">${sgd(invoice.total)}</span>
      </div>
    </div>
  </div>

  ${pawvyPaymentInstructionsHtml()}

  ${pawvyFooterHtml()}
  </body></html>`;
  openPdfWindow(html);
}

// ── PDF: Delivery Order (no pricing shown) ──────────────────────────
function generateDOPDF(doc) {
  const date = new Date(doc.date).toLocaleDateString('en-SG', { day:'numeric', month:'long', year:'numeric' });
  const rows = (doc.items||[]).map((it, idx) => {
    const brand = it.brand_name || '—';
    const desc  = it.item_series ? `${it.item_series}${it.variation ? ' · '+it.variation : ''}` : it.description;
    return `
    <tr style="background:${idx%2===0?'#fff':'#f8f9fc'}">
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0">${brand}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0">${desc}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right;font-weight:700;font-size:14px">${it.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right;font-weight:700;font-size:14px">${it.qty}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${doc.invoice_number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#1a1a2e; background:#fff; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body>

  ${pawvyHeaderHtml('DELIVERY ORDER', date)}
  ${pawvyAddressBlockHtml({ company_name: doc.partner_name, address: doc.partner_address, pic_name: doc.pic_name }, doc.invoice_number, doc.outlet_label ? { label: doc.outlet_label, address: doc.outlet_address, pic_name: doc.outlet_pic } : null)}

  <div style="padding:24px 32px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#14213d">
        <th style="padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px">Brand</th>
        <th style="padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px">Description</th>
        <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Qty Ordered</th>
        <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Qty Delivered</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div style="padding:0 32px 24px;font-size:11px;color:#666;line-height:1.8">
    ¹ All products are verified and received by consignee at the point of delivery.
  </div>

  <div style="padding:0 32px 32px">
    <div style="font-size:13px;color:#222">Checked and verified by:</div>
    <div style="border-bottom:1px solid #222;width:320px;height:40px;margin-top:6px"></div>
  </div>

  ${pawvyFooterHtml()}
  </body></html>`;
  openPdfWindow(html);
}

// ── PDF: SOA ─────────────────────────────────────────────────────
function generateSOAPDF(soa) {
  const periodLabel = `${new Date(soa.period_start).toLocaleDateString('en-SG',{day:'numeric',month:'short'})} – ${new Date(soa.period_end).toLocaleDateString('en-SG',{day:'numeric',month:'short',year:'numeric'})}`;
  const rows = (soa.items||[]).map((it, idx) => `
    <tr style="background:${idx%2===0?'#fff':'#f8f9fc'}">
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;${parseFloat(it.line_total)<0?'color:#27ae60;font-weight:600':''}">${it.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;text-align:right;font-weight:600;${parseFloat(it.line_total)<0?'color:#27ae60':''}">${parseFloat(it.line_total)<0?'− ':''}${sgd(Math.abs(it.line_total))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${soa.invoice_number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#1a1a2e; background:#fff; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body>

  ${pawvyHeaderHtml('STATEMENT OF ACCOUNT', periodLabel)}
  ${pawvyAddressBlockHtml({ company_name: soa.partner_name, address: soa.partner_address, pic_name: soa.pic_name }, soa.invoice_number)}

  <div style="padding:0 32px;display:flex;gap:32px;font-size:11px;color:#666">
    <div><strong style="color:#14213d">Period:</strong> ${periodLabel}</div>
    <div><strong style="color:#14213d">Due Date:</strong> ${soa.due_date ? new Date(soa.due_date).toLocaleDateString('en-SG') : '—'}</div>
  </div>

  <div style="padding:24px 32px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#14213d">
        <th style="padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px">Description</th>
        <th style="padding:10px 12px;text-align:right;color:#fff;font-weight:700;font-size:11px">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div style="padding:0 32px 24px;display:flex;justify-content:flex-end">
    <div style="width:280px">
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #14213d;margin-top:4px">
        <span style="font-size:14px;font-weight:700;color:#14213d">Total Due</span>
        <span style="font-size:14px;font-weight:700;color:#14213d">${sgd(soa.total)}</span>
      </div>
    </div>
  </div>

  ${pawvyPaymentInstructionsHtml()}

  ${pawvyFooterHtml()}
  </body></html>`;
  openPdfWindow(html);
}

// ════════════════════════════════════════════════════════════════
// Generate Invoice Modal
// ════════════════════════════════════════════════════════════════
function GenerateInvoiceModal({ open, onClose, partners, onGenerated }) {
  const [partnerId, setPartnerId] = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState(today());
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [sales, setSales]         = useState([]);
  const [selected, setSelected]   = useState(new Set());
  const [notes, setNotes]         = useState('');
  const [outletId, setOutletId]   = useState('');
  const [outlets, setOutlets]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [result, setResult]       = useState(null);

  useEffect(() => {
    if (open) { setPartnerId(''); setSales([]); setSelected(new Set()); setNotes(''); setError(''); setResult(null); setDateFrom(''); setDateTo(today()); setInvoiceDate(today()); setOutletId(''); setOutlets([]); }
  }, [open]);

  useEffect(() => {
    if (!partnerId) { setSales([]); setOutlets([]); return; }
    setLoading(true);
    const q = {};
    if (dateFrom) q.date_from = dateFrom;
    if (dateTo)   q.date_to   = dateTo;
    Promise.all([
      invoicesApi.uninvoiced(partnerId, q),
      partnerAddressesApi.list(partnerId),
    ]).then(([d, addrs]) => {
      setSales(d); setSelected(new Set(d.map(s=>s.id)));
      setOutlets(addrs);
      // Pre-select the primary address if there is one
      const primary = addrs.find(a => a.is_primary);
      setOutletId(primary ? String(primary.id) : (addrs.length === 1 ? String(addrs[0].id) : ''));
      setLoading(false);
    });
  }, [partnerId, dateFrom, dateTo]);

  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(prev => prev.size === sales.length ? new Set() : new Set(sales.map(s=>s.id)));

  const selectedSales = sales.filter(s => selected.has(s.id));
  const subtotal = selectedSales.reduce((s,r) => s + r.qty*r.unit_price, 0);
  const discount = selectedSales.reduce((s,r) => s + (r.platform_fee_amt||0), 0);
  const shipping = selectedSales.reduce((s,r) => s + (r.shipping_charged||0), 0);
  const total = subtotal - discount + shipping;

  async function generate() {
    if (selected.size === 0) { setError('Select at least one order line.'); return; }
    setSaving(true); setError('');
    try {
      const res = await invoicesApi.generateInvoice({ partner_id: partnerId, sale_ids: [...selected], notes: notes||null, invoice_date: invoiceDate, outlet_address_id: outletId||null });
      setResult(res);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (result) return (
    <Modal open={open} title="INVOICE GENERATED" onClose={()=>{onGenerated();onClose();}} width={440}>
      <div style={{display:'flex',flexDirection:'column',gap:14,alignItems:'center',padding:'10px 0'}}>
        <CheckCircle size={48} color="#7fc93e"/>
        <div style={{fontFamily:"monospace",fontSize:22,color:'var(--cream)',letterSpacing:1}}>{result.invoice_number}</div>
        <div style={{fontSize:28,fontFamily:"'Bebas Neue',sans-serif",color:'#7fc93e',letterSpacing:1}}>{sgd(result.total)}</div>
        <div style={{fontSize:11,color:'var(--cream-30)'}}>Due {new Date(result.due_date).toLocaleDateString('en-SG')} · {result.items_count} line item{result.items_count!==1?'s':''}</div>
        <div style={{display:'flex',gap:10,width:'100%'}}>
          <Btn onClick={async()=>{const full=await invoicesApi.get(result.id);generateInvoicePDF(full);}} size="lg" style={{flex:1,justifyContent:'center'}}>
            <Printer size={14}/> Print Invoice
          </Btn>
          <Btn variant="ghost" onClick={()=>{onGenerated();onClose();}}>Done</Btn>
        </div>
      </div>
    </Modal>
  );

  return (
    <Modal open={open} title="GENERATE INVOICE" onClose={onClose} width={760}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <Select label="Partner" value={partnerId} onChange={e=>setPartnerId(e.target.value)} style={{width:240}}>
            <option value="">— Select partner —</option>
            {partners.map(p=><option key={p.id} value={p.id}>{p.company_name}</option>)}
          </Select>
          <Input label="From" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{width:160}}/>
          <Input label="To"   type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   style={{width:160}}/>
          <Input label="Invoice Date" type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)} style={{width:160}}/>
        </div>
        <div style={{fontSize:10,color:'var(--cream-30)',marginTop:-8}}>
          Invoice Date defaults to today. Due date and SOA period grouping are based on this date — back-date it if you want the invoice to align with an earlier order date.
        </div>

        {outlets.length > 0 && (
          <div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:6}}>Deliver / Bill To Outlet</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button onClick={()=>setOutletId('')}
                style={{padding:'6px 14px',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',
                  border:`1px solid ${!outletId?'var(--orange)':'var(--border)'}`,
                  background:!outletId?'rgba(243,111,74,.1)':'transparent',
                  color:!outletId?'var(--orange)':'var(--cream-60)'}}>
                HQ / Main
              </button>
              {outlets.map(o=>(
                <button key={o.id} onClick={()=>setOutletId(String(o.id))}
                  style={{padding:'6px 14px',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',
                    border:`1px solid ${String(outletId)===String(o.id)?'var(--orange)':'var(--border)'}`,
                    background:String(outletId)===String(o.id)?'rgba(243,111,74,.1)':'transparent',
                    color:String(outletId)===String(o.id)?'var(--orange)':'var(--cream-60)'}}>
                  {o.label}
                </button>
              ))}
            </div>
            {outletId && outlets.find(o=>String(o.id)===String(outletId)) && (
              <div style={{fontSize:11,color:'var(--cream-30)',marginTop:5,paddingLeft:2}}>
                📍 {outlets.find(o=>String(o.id)===String(outletId)).address}
              </div>
            )}
          </div>
        )}

        {!partnerId ? (
          <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Select a partner to see un-invoiced orders.</div>
        ) : loading ? (
          <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
        ) : sales.length === 0 ? (
          <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No un-invoiced orders for this partner in this period.</div>
        ) : (
          <>
            <div style={{overflowX:'auto',border:'1px solid var(--border)',borderRadius:8}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{background:'rgba(245,242,235,.05)'}}>
                  <th style={{padding:'8px 10px'}}><input type="checkbox" checked={selected.size===sales.length} onChange={toggleAll} style={{accentColor:'var(--orange)'}}/></th>
                  {['Date','Product','Channel','Qty','Price','Disc','Ship'].map(h=>(
                    <th key={h} style={{padding:'8px 10px',textAlign:['Qty','Price','Disc','Ship'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {sales.map(s=>(
                    <tr key={s.id} style={{borderTop:'1px solid rgba(245,242,235,.04)'}}>
                      <td style={{padding:'8px 10px'}}><input type="checkbox" checked={selected.has(s.id)} onChange={()=>toggle(s.id)} style={{accentColor:'var(--orange)'}}/></td>
                      <td style={{padding:'8px 10px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{s.date}</td>
                      <td style={{padding:'8px 10px',color:'var(--cream)'}}>{s.brand_name} {s.item_series}{s.variation?' · '+s.variation:''}</td>
                      <td style={{padding:'8px 10px',color:'var(--cream-60)',fontSize:11}}>{s.channel}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',color:'var(--cream)'}}>{s.qty}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',color:'var(--cream-60)'}}>{sgd(s.unit_price)}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',color:'#fbbf24'}}>{s.platform_fee_amt>0?sgd(s.platform_fee_amt):'—'}</td>
                      <td style={{padding:'8px 10px',textAlign:'right',color:'#7fc93e'}}>{s.shipping_charged>0?sgd(s.shipping_charged):'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{background:'rgba(245,242,235,.04)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 16px',display:'flex',gap:24,flexWrap:'wrap',justifyContent:'flex-end'}}>
              <span style={{fontSize:12,color:'var(--cream-30)'}}>Subtotal: <strong style={{color:'var(--cream)'}}>{sgd(subtotal)}</strong></span>
              {discount>0 && <span style={{fontSize:12,color:'var(--cream-30)'}}>Discount: <strong style={{color:'#fbbf24'}}>−{sgd(discount)}</strong></span>}
              {shipping>0 && <span style={{fontSize:12,color:'var(--cream-30)'}}>Shipping: <strong style={{color:'#7fc93e'}}>+{sgd(shipping)}</strong></span>}
              <span style={{fontSize:14,color:'var(--cream)'}}>Total: <strong style={{color:'var(--orange)'}}>{sgd(total)}</strong></span>
            </div>
          </>
        )}
        <Input label="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Partial shipment"/>
        {error && <div style={{color:'#f87171',fontSize:12}}>{error}</div>}
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={generate} disabled={saving||selected.size===0} size="lg" style={{flex:1,justifyContent:'center'}}>
            {saving?'Generating…':<><FileText size={14}/> Generate Invoice ({selected.size})</>}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// Generate Delivery Order Modal
// ════════════════════════════════════════════════════════════════
function GenerateDOModal({ open, onClose, partners, onGenerated }) {
  const [partnerId, setPartnerId] = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState(today());
  const [sales, setSales]         = useState([]);
  const [selected, setSelected]   = useState(new Set());
  const [notes, setNotes]         = useState('');
  const [outletId, setOutletId]   = useState('');
  const [outlets, setOutlets]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [result, setResult]       = useState(null);

  useEffect(() => {
    if (open) { setPartnerId(''); setSales([]); setSelected(new Set()); setNotes(''); setError(''); setResult(null); setDateFrom(''); setDateTo(today()); setOutletId(''); setOutlets([]); }
  }, [open]);

  useEffect(() => {
    if (!partnerId) { setSales([]); setOutlets([]); return; }
    setLoading(true);
    const q = {};
    if (dateFrom) q.date_from = dateFrom;
    if (dateTo)   q.date_to   = dateTo;
    Promise.all([
      invoicesApi.availableForDO(partnerId, q),
      partnerAddressesApi.list(partnerId),
    ]).then(([d, addrs]) => {
      setSales(d); setSelected(new Set(d.map(s=>s.id)));
      setOutlets(addrs);
      const primary = addrs.find(a => a.is_primary);
      setOutletId(primary ? String(primary.id) : (addrs.length === 1 ? String(addrs[0].id) : ''));
      setLoading(false);
    });
  }, [partnerId, dateFrom, dateTo]);

  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(prev => prev.size === sales.length ? new Set() : new Set(sales.map(s=>s.id)));

  async function generate() {
    if (selected.size === 0) { setError('Select at least one order line.'); return; }
    setSaving(true); setError('');
    try {
      const res = await invoicesApi.generateDO({ partner_id: partnerId, sale_ids: [...selected], notes: notes||null, outlet_address_id: outletId||null });
      setResult(res);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (result) return (
    <Modal open={open} title="DELIVERY ORDER GENERATED" onClose={()=>{onGenerated();onClose();}} width={420}>
      <div style={{display:'flex',flexDirection:'column',gap:14,alignItems:'center',padding:'10px 0'}}>
        <CheckCircle size={48} color="#7fc93e"/>
        <div style={{fontSize:18,fontFamily:"monospace",color:'var(--cream)'}}>{result.invoice_number}</div>
        <div style={{fontSize:11,color:'var(--cream-30)'}}>{result.items_count} line item{result.items_count!==1?'s':''}</div>
        <div style={{display:'flex',gap:10,width:'100%'}}>
          <Btn onClick={async()=>{const full=await invoicesApi.get(result.id);generateDOPDF(full);}} size="lg" style={{flex:1,justifyContent:'center'}}>
            <Printer size={14}/> Print DO
          </Btn>
          <Btn variant="ghost" onClick={()=>{onGenerated();onClose();}}>Done</Btn>
        </div>
      </div>
    </Modal>
  );

  return (
    <Modal open={open} title="GENERATE DELIVERY ORDER" onClose={onClose} width={700}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <Select label="Partner" value={partnerId} onChange={e=>setPartnerId(e.target.value)} style={{width:240}}>
            <option value="">— Select partner —</option>
            {partners.map(p=><option key={p.id} value={p.id}>{p.company_name}</option>)}
          </Select>
          <Input label="From" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{width:160}}/>
          <Input label="To"   type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   style={{width:160}}/>
        </div>

        {outlets.length > 0 && (
          <div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:.8,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:6}}>Deliver To Outlet</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button onClick={()=>setOutletId('')}
                style={{padding:'6px 14px',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',
                  border:`1px solid ${!outletId?'var(--orange)':'var(--border)'}`,
                  background:!outletId?'rgba(243,111,74,.1)':'transparent',
                  color:!outletId?'var(--orange)':'var(--cream-60)'}}>
                Main Address
              </button>
              {outlets.map(o=>(
                <button key={o.id} onClick={()=>setOutletId(String(o.id))}
                  style={{padding:'6px 14px',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',
                    border:`1px solid ${String(outletId)===String(o.id)?'var(--orange)':'var(--border)'}`,
                    background:String(outletId)===String(o.id)?'rgba(243,111,74,.1)':'transparent',
                    color:String(outletId)===String(o.id)?'var(--orange)':'var(--cream-60)'}}>
                  {o.label}
                </button>
              ))}
            </div>
            {outletId && outlets.find(o=>String(o.id)===String(outletId)) && (
              <div style={{fontSize:11,color:'var(--cream-30)',marginTop:5,paddingLeft:2}}>
                📍 {outlets.find(o=>String(o.id)===String(outletId)).address}
              </div>
            )}
          </div>
        )}

        {!partnerId ? (
          <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Select a partner to see orders available for delivery.</div>
        ) : loading ? (
          <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
        ) : sales.length === 0 ? (
          <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No orders available for a delivery order in this period.</div>
        ) : (
          <div style={{overflowX:'auto',border:'1px solid var(--border)',borderRadius:8}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr style={{background:'rgba(245,242,235,.05)'}}>
                <th style={{padding:'8px 10px'}}><input type="checkbox" checked={selected.size===sales.length} onChange={toggleAll} style={{accentColor:'var(--orange)'}}/></th>
                {['Date','Product','Qty'].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:h==='Qty'?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {sales.map(s=>(
                  <tr key={s.id} style={{borderTop:'1px solid rgba(245,242,235,.04)'}}>
                    <td style={{padding:'8px 10px'}}><input type="checkbox" checked={selected.has(s.id)} onChange={()=>toggle(s.id)} style={{accentColor:'var(--orange)'}}/></td>
                    <td style={{padding:'8px 10px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{s.date}</td>
                    <td style={{padding:'8px 10px',color:'var(--cream)'}}>{s.brand_name} {s.item_series}{s.variation?' · '+s.variation:''}</td>
                    <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:'var(--cream)'}}>{s.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Input label="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Delivered by Grab"/>
        {error && <div style={{color:'#f87171',fontSize:12}}>{error}</div>}
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={generate} disabled={saving||selected.size===0} size="lg" style={{flex:1,justifyContent:'center'}}>
            {saving?'Generating…':<><Truck size={14}/> Generate DO ({selected.size})</>}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// Generate SOA Modal
// ════════════════════════════════════════════════════════════════
function GenerateSOAModal({ open, onClose, partners, onGenerated }) {
  const [partnerId, setPartnerId] = useState('');
  const [month, setMonth]         = useState(() => new Date().toISOString().slice(0,7));
  const [preview, setPreview]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [result, setResult]       = useState(null);

  const soaPartners = partners.filter(p => p.billing_cycle === 'soa');

  useEffect(() => {
    if (open) { setPartnerId(''); setPreview(null); setError(''); setResult(null); setMonth(new Date().toISOString().slice(0,7)); }
  }, [open]);

  function periodRange(monthStr) {
    // Avoid toISOString() here — it converts to UTC and can shift the date backwards
    // by one day in timezones ahead of UTC (e.g. SGT), silently excluding the last day's invoices.
    const [y,m] = monthStr.split('-').map(Number);
    const start = `${monthStr}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${monthStr}-${String(lastDay).padStart(2,'0')}`;
    return { start, end };
  }

  useEffect(() => {
    if (!partnerId || !month) { setPreview(null); return; }
    setLoading(true);
    const { start, end } = periodRange(month);
    invoicesApi.soaPreview(partnerId, { period_start: start, period_end: end })
      .then(setPreview).catch(()=>setPreview(null)).finally(()=>setLoading(false));
  }, [partnerId, month]);

  async function generate() {
    setSaving(true); setError('');
    try {
      const { start, end } = periodRange(month);
      const label = new Date(start).toLocaleString('default',{month:'long',year:'numeric'});
      const res = await invoicesApi.generateSOA({ partner_id: partnerId, period_start: start, period_end: end, period_label: label });
      setResult(res);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (result) return (
    <Modal open={open} title="SOA GENERATED" onClose={()=>{onGenerated();onClose();}} width={440}>
      <div style={{display:'flex',flexDirection:'column',gap:14,alignItems:'center',padding:'10px 0'}}>
        <CheckCircle size={48} color="#7fc93e"/>
        <div style={{fontSize:18,fontFamily:"monospace",color:'var(--cream)'}}>{result.invoice_number}</div>
        <div style={{fontSize:28,fontFamily:"'Bebas Neue',sans-serif",color:'#7fc93e',letterSpacing:1}}>{sgd(result.total)}</div>
        <div style={{fontSize:11,color:'var(--cream-30)'}}>{result.invoices_included} invoice(s) included{result.cn?.amount>0?` · CN credit ${sgd(result.cn.amount)}`:''}</div>
        <div style={{display:'flex',gap:10,width:'100%'}}>
          <Btn onClick={async()=>{const full=await invoicesApi.get(result.id);generateSOAPDF(full);}} size="lg" style={{flex:1,justifyContent:'center'}}>
            <Printer size={14}/> Print SOA
          </Btn>
          <Btn variant="ghost" onClick={()=>{onGenerated();onClose();}}>Done</Btn>
        </div>
      </div>
    </Modal>
  );

  return (
    <Modal open={open} title="GENERATE STATEMENT OF ACCOUNT" onClose={onClose} width={680}>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <Select label="SOA Partner" value={partnerId} onChange={e=>setPartnerId(e.target.value)} style={{width:260}}>
            <option value="">— Select partner —</option>
            {soaPartners.map(p=><option key={p.id} value={p.id}>{p.company_name}</option>)}
          </Select>
          <Input label="Month" type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{width:180}}/>
        </div>
        {soaPartners.length === 0 && (
          <div style={{fontSize:12,color:'#fbbf24'}}>⚠ No partners set to "Monthly SOA" billing cycle yet. Set this in the Partners tab.</div>
        )}

        {!partnerId ? (
          <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Select a partner and month to preview.</div>
        ) : loading ? (
          <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
        ) : preview && (
          <>
            {preview.cn?.amount > 0 && (
              <div style={{background:'rgba(127,201,62,.1)',border:'1px solid rgba(127,201,62,.3)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#7fc93e'}}>
                Credit Note: {preview.cn.pct}% on prior month total (SGD {preview.cn.subtotal.toFixed(2)}) = <strong>− {sgd(preview.cn.amount)}</strong> (first line credit)
              </div>
            )}
            <div style={{overflowX:'auto',border:'1px solid var(--border)',borderRadius:8}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{background:'rgba(245,242,235,.05)'}}>
                  {['Invoice #','Date','Amount'].map(h=>(
                    <th key={h} style={{padding:'8px 10px',textAlign:h==='Amount'?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {preview.invoices.length === 0
                    ? <tr><td colSpan={3} style={{padding:20,textAlign:'center',color:'var(--cream-30)'}}>No invoices found in this period</td></tr>
                    : preview.invoices.map(inv=>(
                      <tr key={inv.id} style={{borderTop:'1px solid rgba(245,242,235,.04)'}}>
                        <td style={{padding:'8px 10px',color:'var(--cream)',fontFamily:'monospace',fontSize:11}}>{inv.invoice_number}</td>
                        <td style={{padding:'8px 10px',color:'var(--cream-60)'}}>{inv.date}</td>
                        <td style={{padding:'8px 10px',textAlign:'right',color:'var(--cream)'}}>{sgd(inv.total)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
            <div style={{background:'rgba(245,242,235,.04)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 16px',display:'flex',justifyContent:'flex-end',gap:24}}>
              <span style={{fontSize:12,color:'var(--cream-30)'}}>Subtotal: <strong style={{color:'var(--cream)'}}>{sgd(preview.subtotal)}</strong></span>
              {preview.cn?.amount>0 && <span style={{fontSize:12,color:'#7fc93e'}}>CN: <strong>−{sgd(preview.cn.amount)}</strong></span>}
              <span style={{fontSize:14,color:'var(--cream)'}}>Total: <strong style={{color:'var(--orange)'}}>{sgd(preview.total)}</strong></span>
            </div>
          </>
        )}

        {error && <div style={{color:'#f87171',fontSize:12}}>{error}</div>}
        <div style={{display:'flex',gap:10}}>
          <Btn onClick={generate} disabled={saving||!preview||preview.invoices.length===0} size="lg" style={{flex:1,justifyContent:'center'}}>
            {saving?'Generating…':<><FileSpreadsheet size={14}/> Generate SOA</>}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// Main Invoices & Docs Page
// ════════════════════════════════════════════════════════════════
export default function Invoices() {
  const isMobile = useIsMobile();
  const [tab, setTab]               = useState('documents'); // documents | monitoring
  const [showPaidPI,  setShowPaidPI]  = useState(false);
  const [showPaidSOA, setShowPaidSOA] = useState(false);
  const [partners, setPartners]     = useState([]);
  const [documents, setDocuments]   = useState([]);
  const [filterType, setFilterType] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [loading, setLoading]       = useState(false);
  const [modal, setModal]           = useState(null);
  const [monitoring, setMonitoring] = useState(null);

  const loadPartners = useCallback(() => partnersApi.getAll({ active_only:'true' }).then(setPartners), []);
  const loadDocs = useCallback(() => {
    setLoading(true);
    const q = {};
    if (filterType)    q.type = filterType;
    if (filterPartner) q.partner_id = filterPartner;
    invoicesApi.list(q).then(d=>{setDocuments(d);setLoading(false);});
  }, [filterType, filterPartner]);
  const loadMonitoring = useCallback(() => invoicesApi.monitoring().then(setMonitoring), []);

  useEffect(() => { loadPartners(); }, []);
  useEffect(() => { if (tab==='documents') loadDocs(); }, [tab, loadDocs]);
  useEffect(() => { if (tab==='monitoring') loadMonitoring(); }, [tab, loadMonitoring]);

  async function printDoc(doc) {
    const full = await invoicesApi.get(doc.id);
    if (doc.type === 'Invoice') generateInvoicePDF(full);
    else if (doc.type === 'Delivery Order') generateDOPDF(full);
    else if (doc.type === 'SOA') generateSOAPDF(full);
  }

  async function togglePaid(doc) {
    if (doc.status === 'Paid') await invoicesApi.markUnpaid(doc.id);
    else await invoicesApi.markPaid(doc.id);
    tab === 'documents' ? loadDocs() : loadMonitoring();
  }

  async function voidDoc(id) {
    if (!window.confirm('Void this document? Linked orders will become available again.')) return;
    await invoicesApi.delete(id);
    loadDocs();
  }

  // TEMPORARY — recalculates discount/total for invoices generated before
  // patch 70. Only touches sales.platform_fee_amt and invoices.discount/
  // total, never inventory. Remove this handler + the button below once
  // no longer needed (see server/routes/invoices.js for the matching route).
  async function recalcDiscount(doc) {
    if (!window.confirm(`Recalculate the discount for ${doc.invoice_number}? This corrects the stored discount/total to fix pre-patch-70 rounding — it does not touch inventory or quantities.`)) return;
    try {
      const result = await invoicesApi.recalculateDiscount(doc.id);
      window.alert(
        `${result.invoice_number} updated (${result.lines_updated} line${result.lines_updated===1?'':'s'}):\n` +
        `Discount: ${sgd(result.before.discount)} → ${sgd(result.after.discount)}\n` +
        `Total: ${sgd(result.before.total)} → ${sgd(result.after.total)}`
      );
      loadDocs();
    } catch (e) {
      window.alert(`Couldn't recalculate: ${e.message || 'unknown error'}`);
    }
  }

  const typeIcon = { Invoice: FileText, 'Delivery Order': Truck, SOA: FileSpreadsheet };
  const typeColor = { Invoice: '#f36f4a', 'Delivery Order': '#378ADD', SOA: '#7F77DD' };

  return (
    <Page title="INVOICES & DOCS" subtitle="Generate invoices, delivery orders, and statements of account"
      action={
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <Btn onClick={()=>setModal('invoice')}><FileText size={14}/> Generate Invoice</Btn>
          <Btn variant="secondary" onClick={()=>setModal('do')}><Truck size={14}/> Generate DO</Btn>
          <Btn variant="ghost" onClick={()=>setModal('soa')}><FileSpreadsheet size={14}/> Generate SOA</Btn>
        </div>
      }>

      {/* Tabs */}
      <div style={{display:'flex',gap:2,borderBottom:'1px solid var(--border)'}}>
        {[['documents','All Documents'],['monitoring','Payment Monitoring']].map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)}
            style={{padding:'8px 16px',fontSize:12,fontWeight:600,border:'none',cursor:'pointer',background:'none',
              color:tab===key?'var(--orange)':'var(--cream-30)',borderBottom:`2px solid ${tab===key?'var(--orange)':'transparent'}`,marginBottom:-1}}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'documents' ? (
        <>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <Select label="Type" value={filterType} onChange={e=>setFilterType(e.target.value)} style={{width:180}}>
              <option value="">All types</option>
              <option value="Invoice">Invoice</option>
              <option value="Delivery Order">Delivery Order</option>
              <option value="SOA">SOA</option>
            </Select>
            <Select label="Partner" value={filterPartner} onChange={e=>setFilterPartner(e.target.value)} style={{width:220}}>
              <option value="">All partners</option>
              {partners.map(p=><option key={p.id} value={p.id}>{p.company_name}</option>)}
            </Select>
          </div>

          <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
            {loading ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
            : documents.length === 0 ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No documents generated yet.</div>
            : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:800}}>
                  <thead><tr>
                    {['Type','Doc #','Date','Partner','Due','Status','Total',''].map(h=>(
                      <th key={h} style={{padding:'9px 12px',textAlign:h==='Total'?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {documents.map(doc=>{
                      const Icon = typeIcon[doc.type] || FileText;
                      const overdue = doc.is_overdue === 1;
                      return (
                        <tr key={doc.id} style={{borderBottom:'1px solid rgba(245,242,235,.04)'}}>
                          <td style={{padding:'9px 12px'}}>
                            <span style={{display:'flex',alignItems:'center',gap:6,color:typeColor[doc.type]}}>
                              <Icon size={13}/><span style={{fontSize:11,fontWeight:600}}>{doc.type}</span>
                            </span>
                          </td>
                          <td style={{padding:'9px 12px',color:'var(--cream)',fontFamily:'monospace',fontSize:11}}>{doc.invoice_number}</td>
                          <td style={{padding:'9px 12px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{doc.date}</td>
                          <td style={{padding:'9px 12px',color:'var(--cream)'}}>{doc.partner_name||'—'}</td>
                          <td style={{padding:'9px 12px',color:overdue?'#f87171':'var(--cream-60)',whiteSpace:'nowrap'}}>{doc.due_date||'—'}</td>
                          <td style={{padding:'9px 12px'}}>
                            {doc.type !== 'Delivery Order' && (
                              <button onClick={()=>togglePaid(doc)} style={{background:'none',border:'none',cursor:'pointer',padding:0}}>
                                <Badge color={doc.status==='Paid'?'#7fc93e':overdue?'#f87171':'#fbbf24'}>
                                  {doc.status==='Paid'?'Paid':overdue?'Overdue':'Unpaid'}
                                </Badge>
                              </button>
                            )}
                          </td>
                          <td style={{padding:'9px 12px',textAlign:'right',fontWeight:700,color:'var(--cream)'}}>
                            {doc.type==='Delivery Order' ? '—' : sgd(doc.total)}
                          </td>
                          <td style={{padding:'9px 12px',display:'flex',gap:6}}>
                            <button onClick={()=>printDoc(doc)} title="Print" style={{background:'none',border:'none',color:'var(--cream-30)',cursor:'pointer',padding:4}}>
                              <Printer size={14}/>
                            </button>
                            {/* TEMPORARY — remove with recalcDiscount() once pre-patch-70 invoices are cleaned up */}
                            {doc.type === 'Invoice' && (
                              <button onClick={()=>recalcDiscount(doc)} title="Recalculate discount (pre-patch-70 fix)" style={{background:'none',border:'none',color:'var(--cream-30)',cursor:'pointer',padding:4}}>
                                <RefreshCw size={13}/>
                              </button>
                            )}
                            <button onClick={()=>voidDoc(doc.id)} title="Void" style={{background:'none',border:'none',color:'rgba(248,113,113,.5)',cursor:'pointer',padding:4}}>
                              <Trash2 size={13}/>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Payment Monitoring */
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <Card title="PER-INVOICE PARTNERS — AR MONITORING">
            {!monitoring
              ? <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
              : (() => {
                  const filtered = showPaidPI ? monitoring.perInvoice : monitoring.perInvoice.filter(i => i.status !== 'Paid');
                  return (<>
                    <div style={{padding:'8px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:11,color:'var(--cream-30)'}}>{filtered.length} unpaid / overdue</span>
                      <button onClick={()=>setShowPaidPI(v=>!v)} style={{fontSize:11,background:'none',border:'1px solid var(--border)',borderRadius:6,padding:'3px 10px',color:'var(--cream-60)',cursor:'pointer'}}>
                        {showPaidPI ? 'Hide Paid' : 'Show Paid'}
                      </button>
                    </div>
              {filtered.length === 0
                ? <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>{showPaidPI ? 'No invoices yet.' : 'All invoices cleared! ✓ Toggle "Show Paid" to see history.'}</div>
                : <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr>
                    {['Invoice #','Partner','Date','Due','Days Overdue','Amount','Status'].map(h=>(
                      <th key={h} style={{padding:'8px 12px',textAlign:['Amount','Days Overdue'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filtered.map(inv=>(
                      <tr key={inv.id} style={{borderBottom:'1px solid rgba(245,242,235,.04)',background:inv.is_overdue?'rgba(248,113,113,.05)':'transparent'}}>
                        <td style={{padding:'8px 12px',color:'var(--cream)',fontFamily:'monospace',fontSize:11}}>{inv.invoice_number}</td>
                        <td style={{padding:'8px 12px',color:'var(--cream)'}}>{inv.partner_name}</td>
                        <td style={{padding:'8px 12px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{inv.date}</td>
                        <td style={{padding:'8px 12px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{inv.due_date}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',color:inv.is_overdue?'#f87171':'var(--cream-30)',fontWeight:inv.is_overdue?700:400}}>
                          {inv.status==='Paid'?'—':inv.is_overdue?`${inv.days_overdue}d`:'—'}
                        </td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:'var(--cream)'}}>{sgd(inv.total)}</td>
                        <td style={{padding:'8px 12px'}}>
                          <button onClick={()=>togglePaid(inv)} style={{background:'none',border:'none',cursor:'pointer',padding:0}}>
                            <Badge color={inv.status==='Paid'?'#7fc93e':inv.is_overdue?'#f87171':'#fbbf24'}>
                              {inv.status==='Paid'?<><CheckCircle size={10}/> Paid</>:inv.is_overdue?<><AlertCircle size={10}/> Overdue</>:<><Clock size={10}/> Unpaid</>}
                            </Badge>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
            </>);
              })()
            }
          </Card>

          <Card title="SOA PARTNERS — STATEMENT MONITORING">
            {!monitoring
              ? <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
              : (() => {
                  const filteredSOA = showPaidSOA ? monitoring.soa : monitoring.soa.filter(s => s.status !== 'Paid');
                  return (<>
                    <div style={{padding:'8px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:11,color:'var(--cream-30)'}}>{filteredSOA.length} unpaid / overdue</span>
                      <button onClick={()=>setShowPaidSOA(v=>!v)} style={{fontSize:11,background:'none',border:'1px solid var(--border)',borderRadius:6,padding:'3px 10px',color:'var(--cream-60)',cursor:'pointer'}}>
                        {showPaidSOA ? 'Hide Paid' : 'Show Paid'}
                      </button>
                    </div>
                  {filteredSOA.length === 0
                    ? <div style={{padding:30,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>{showPaidSOA ? 'No SOAs generated yet.' : 'All SOAs cleared! ✓ Toggle "Show Paid" to see history.'}</div>
                    : <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead><tr>
                          {['SOA #','Partner','Period','Due','Days Overdue','Amount','Status'].map(h=>(
                            <th key={h} style={{padding:'8px 12px',textAlign:['Amount','Days Overdue'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)'}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {filteredSOA.map(s=>(
                            <tr key={s.id} style={{borderBottom:'1px solid rgba(245,242,235,.04)',background:s.is_overdue?'rgba(248,113,113,.05)':'transparent'}}>
                              <td style={{padding:'8px 12px',color:'var(--cream)',fontFamily:'monospace',fontSize:11}}>{s.invoice_number}</td>
                              <td style={{padding:'8px 12px',color:'var(--cream)'}}>{s.partner_name}</td>
                              <td style={{padding:'8px 12px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{s.period_start} → {s.period_end}</td>
                              <td style={{padding:'8px 12px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{s.due_date}</td>
                              <td style={{padding:'8px 12px',textAlign:'right',color:s.is_overdue?'#f87171':'var(--cream-30)',fontWeight:s.is_overdue?700:400}}>
                                {s.status==='Paid'?'—':s.is_overdue?`${s.days_overdue}d`:'—'}
                              </td>
                              <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:'var(--cream)'}}>{sgd(s.total)}</td>
                              <td style={{padding:'8px 12px'}}>
                                <button onClick={()=>togglePaid(s)} style={{background:'none',border:'none',cursor:'pointer',padding:0}}>
                                  <Badge color={s.status==='Paid'?'#7fc93e':s.is_overdue?'#f87171':'#fbbf24'}>
                                    {s.status==='Paid'?<><CheckCircle size={10}/> Paid</>:s.is_overdue?<><AlertCircle size={10}/> Overdue</>:<><Clock size={10}/> Unpaid</>}
                                  </Badge>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>}
                </>);
              })()
            }
          </Card>
        </div>
      )}

      <GenerateInvoiceModal open={modal==='invoice'} partners={partners} onClose={()=>setModal(null)} onGenerated={()=>{setModal(null);loadDocs();}}/>
      <GenerateDOModal      open={modal==='do'}      partners={partners} onClose={()=>setModal(null)} onGenerated={()=>{setModal(null);loadDocs();}}/>
      <GenerateSOAModal     open={modal==='soa'}     partners={partners} onClose={()=>setModal(null)} onGenerated={()=>{setModal(null);loadDocs();}}/>
    </Page>
  );
}
