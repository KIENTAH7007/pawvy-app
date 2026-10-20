import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, salesApi, brandsApi, partnersApi } from '../api';
import { Page, Select, Input, Badge, Btn, Modal, fmt } from '../components/ui';
import { Ban, Mail, Pencil, FileText } from 'lucide-react';
import { currentMonthRange, localDateStr } from '../utils/dates';

const MARKETPLACE = ['Shopee','Lazada','Amazon','TikTok Shop'];

export default function Sales() {
  const nav = useNavigate();
  const [sales,    setSales]    = useState([]);
  const [brands,   setBrands]   = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const defaultRange = currentMonthRange();
  const [filters,  setFilters]  = useState({ brand_id:'', partner_id:'', date_from:defaultRange.from, date_to:defaultRange.to, market:'' });
  const [voidConfirm, setVoidConfirm] = useState(null); // sale id pending void
  const [mailingInfoModal, setMailingInfoModal] = useState(null); // sale row pending mailing-info view
  const [editModal, setEditModal] = useState(null); // sale row pending shipping/mailing/notes edit
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  // ── Best Sellers Report (partner-facing PDF) ──────────────────────
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');
  const [report, setReport] = useState({
    preset: '3m', from: '', to: '', brandIds: [], tops: {},
    excludeOos: true, showUnits: false, partner: '',
  });
  const setR = (k, v) => setReport(r => ({ ...r, [k]: v }));

  // Resolves the chosen period preset into concrete From/To dates.
  function reportRange(r) {
    const today = new Date();
    const back = (fn) => { const d = new Date(today); fn(d); return localDateStr(d); };
    switch (r.preset) {
      case '30d': return { from: back(d => d.setDate(d.getDate() - 29)), to: localDateStr(today) };
      case '3m':  return { from: back(d => { d.setMonth(d.getMonth() - 3); d.setDate(d.getDate() + 1); }), to: localDateStr(today) };
      case '6m':  return { from: back(d => { d.setMonth(d.getMonth() - 6); d.setDate(d.getDate() + 1); }), to: localDateStr(today) };
      case 'ytd': return { from: `${today.getFullYear()}-01-01`, to: localDateStr(today) };
      case 'thismonth': return currentMonthRange(today);
      case 'lastmonth': return currentMonthRange(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      default: return { from: r.from, to: r.to };
    }
  }

  // Default depth per brand: Top 5, except GiGwi (more SKUs) at Top 10.
  const defaultTop = (b) => (b.name === 'GiGwi' ? '10' : '5');

  function openReport() {
    // Every brand ticked by default — untick the ones this partner doesn't carry.
    const tops = {};
    brands.forEach(b => { tops[b.id] = defaultTop(b); });
    setReport(r => ({ ...r, brandIds: brands.map(b => b.id), tops }));
    setReportError('');
    setReportOpen(true);
  }

  async function generateReport() {
    const { from, to } = reportRange(report);
    if (!report.brandIds.length) return setReportError('Tick at least one brand.');
    if (!from || !to) return setReportError('Choose a start and end date.');
    if (from > to) return setReportError('The start date must be on or before the end date.');
    setReportBusy(true); setReportError('');
    try {
      const q = new URLSearchParams({
        brand_ids: report.brandIds.join(','), date_from: from, date_to: to,
        top_n: '5', brand_tops: report.brandIds.map(id => `${id}:${report.tops[id] || 5}`).join(','), exclude_oos: report.excludeOos ? '1' : '0',
        show_units: report.showUnits ? '1' : '0',
      });
      if (report.partner.trim()) q.set('partner_name', report.partner.trim());
      const { blob, filename } = await api.downloadFile(`/sales/best-sellers-report?${q}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || `pawvy-best-sellers-${localDateStr()}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setReportOpen(false);
    } catch (e) {
      setReportError(e.message || 'Could not generate the report.');
    } finally {
      setReportBusy(false);
    }
  }

  useEffect(() => {
    brandsApi.getAll().then(setBrands);
    partnersApi.getAll({ active_only:'true' }).then(setPartners);
  }, []);

  const load = (f = filters) => {
    setLoading(true);
    const q = {};
    if (f.brand_id)   q.brand_id   = f.brand_id;
    if (f.partner_id) q.partner_id = f.partner_id;
    if (f.date_from)  q.date_from  = f.date_from;
    if (f.date_to)    q.date_to    = f.date_to;
    if (f.market)     q.market     = f.market;
    salesApi.getAll(q).then(d => { setSales(d); setLoading(false); });
  };

  useEffect(() => { load(); }, [filters]);

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  // "Has filter" now only flags brand/partner/market — the date range always has
  // a value (defaults to this month), so it shouldn't make Clear appear permanently.
  const hasFilter = filters.brand_id || filters.partner_id || filters.market;
  const isCurrentMonthOnly = filters.date_from === defaultRange.from && filters.date_to === defaultRange.to;

  // Each sale is in its own market's currency — never add SGD and MYR together.
  // Totals are therefore kept per currency (one line each when "All" is chosen).
  const totals = sales.reduce((a, s) => ({ ...a, q: a.q + s.qty }), { q:0 });
  const totalsByCur = sales.reduce((m, s) => {
    const c = s.currency || 'SGD';
    m[c] = m[c] || { r:0, p:0 };
    m[c].r += (s.revenue||0); m[c].p += (s.profit||0);
    return m;
  }, {});

  async function handleVoid(id) {
    await salesApi.void(id);
    setVoidConfirm(null);
    load();
  }

  function openEdit(s) {
    setEditModal(s);
    setEditForm({
      shipping_charged: s.shipping_charged || '',
      shipping_cost: s.shipping_cost || '',
      shipping_channel: s.shipping_channel || '',
      mailing_name: s.mailing_name || '',
      mailing_address: s.mailing_address || '',
      mailing_phone: s.mailing_phone || '',
      mailing_required: !!s.mailing_required,
      customer_email: s.customer_email || '',
      notes: s.notes || '',
      stripe_fee_amt: s.stripe_fee_amt || '',
    });
  }
  async function saveEdit() {
    setEditSaving(true);
    try {
      await salesApi.updateDetails(editModal.id, editForm);
      setEditModal(null);
      load();
    } finally {
      setEditSaving(false);
    }
  }

  // Discount / Fee column — separate from shipping for clarity
  function discountCell(s) {
    const discAmt = parseFloat(s.platform_fee_amt || 0);
    if (discAmt === 0) return null;
    const isMarket = MARKETPLACE.includes(s.channel);
    return {
      label: isMarket ? `Fee ${parseFloat(s.platform_fee_pct||0).toFixed(0)}%` : `Disc${s.platform_fee_pct ? ` ${parseFloat(s.platform_fee_pct).toFixed(0)}%` : ''}`,
      text: `− ${fmt.money(discAmt, s.currency)}`,
      color: isMarket ? 'var(--cream-30)' : '#fbbf24',
    };
  }

  // Shipping column — separate from discount for clarity
  function shippingCell(s) {
    const shipCharged = parseFloat(s.shipping_charged || 0);
    const channel = (s.shipping_channel || '').trim();
    if (shipCharged === 0 && !channel) return null;
    const shipCost = parseFloat(s.shipping_cost || 0);
    const shipProfit = shipCharged - shipCost;
    return {
      text: shipCharged > 0 ? `+ ${fmt.money(shipCharged, s.currency)}` : null,
      sub: shipCharged > 0 && shipCost > 0 ? `net ${fmt.money(shipProfit, s.currency)}` : null,
      channel: channel || null,
      color: '#7fc93e',
    };
  }

  return (
    <Page title="SALES LEDGER" subtitle={`${sales.length} transactions`}
      action={
        <div style={{display:'flex',gap:8}}>
          <Btn variant="ghost" onClick={openReport}><FileText size={14}/> Best Sellers Report</Btn>
          <Btn onClick={() => nav('/sales/record')}><span style={{fontSize:16}}>+</span> Record Sale</Btn>
        </div>
      }>

      {/* Filters */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}}>
        <Select label="Brand" value={filters.brand_id} onChange={e=>setF('brand_id',e.target.value)} style={{width:155}}>
          <option value="">All brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select label="Partner" value={filters.partner_id} onChange={e=>setF('partner_id',e.target.value)} style={{width:200}}>
          <option value="">All partners</option>
          {partners.map(p => <option key={p.id} value={p.id}>{p.company_name}</option>)}
        </Select>
        <Select label="Market" value={filters.market} onChange={e=>setF('market',e.target.value)} style={{width:100}}>
          <option value="">All</option>
          {['SG','MY'].map(m => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Input label="From" type="date" value={filters.date_from} onChange={e=>setF('date_from',e.target.value)} style={{width:150}}/>
        <Input label="To"   type="date" value={filters.date_to}   onChange={e=>setF('date_to',e.target.value)}   style={{width:150}}/>
        {!isCurrentMonthOnly && (
          <Btn variant="ghost" size="sm" onClick={()=>setFilters(f=>({...f,date_from:defaultRange.from,date_to:defaultRange.to}))}>This month</Btn>
        )}
        {hasFilter && <Btn variant="ghost" size="sm" onClick={()=>setFilters({brand_id:'',partner_id:'',date_from:'',date_to:'',market:''})}>Clear all filters (all time)</Btn>}
      </div>
      {isCurrentMonthOnly && (
        <div style={{ fontSize: 11, color: 'var(--cream-30)' }}>
          Showing this month only ({defaultRange.from} to {defaultRange.to}). Adjust From/To above, or clear filters, to see other periods.
        </div>
      )}

      {/* Totals bar */}
      {!loading && sales.length > 0 && (
        <div style={{display:'flex',gap:24,background:'var(--navy)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 16px',fontSize:12}}>
          <span style={{color:'var(--cream-30)'}}>Units: <strong style={{color:'var(--cream)'}}>{totals.q}</strong></span>
          {Object.entries(totalsByCur).map(([c, t]) => (
            <React.Fragment key={c}>
              <span style={{color:'var(--cream-30)'}}>Revenue: <strong style={{color:'var(--cream)'}}>{c} {t.r.toFixed(2)}</strong></span>
              <span style={{color:'var(--cream-30)'}}>Gross Profit: <strong style={{color:'#7fc93e'}}>{c} {t.p.toFixed(2)}</strong></span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Void confirmation modal */}
      {voidConfirm && (
        <div style={{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:12,padding:28,maxWidth:380,width:'90%'}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1,color:'var(--cream)',marginBottom:10}}>VOID THIS SALE?</div>
            <div style={{fontSize:12,color:'var(--cream-60)',lineHeight:1.6,marginBottom:20}}>
              The record stays in the database for audit, but will be excluded from all revenue, profit, and dashboard calculations. This cannot be undone.
            </div>
            <div style={{display:'flex',gap:10}}>
              <Btn variant="danger" onClick={() => handleVoid(voidConfirm)} style={{flex:1,justifyContent:'center'}}>
                <Ban size={13}/> Yes, Void It
              </Btn>
              <Btn variant="ghost" onClick={() => setVoidConfirm(null)} style={{flex:1,justifyContent:'center'}}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Best Sellers Report — choose period, brands and options, then generate a partner-ready PDF */}
      <Modal open={reportOpen} title="BEST SELLERS REPORT" onClose={() => !reportBusy && setReportOpen(false)} width={520}>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{fontSize:12,color:'var(--cream-60)',lineHeight:1.6}}>
            Creates a PDF with a podium for each brand's top 3, then the rest of its ranking. Ranked by units sold across every sales channel, voided sales skipped. No percentages or revenue are shown.
          </div>

          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
            <Select label="Period" value={report.preset} onChange={e=>setR('preset',e.target.value)} style={{flex:'1 1 180px'}}>
              <option value="30d">Last 30 days</option>
              <option value="3m">Last 3 months</option>
              <option value="6m">Last 6 months</option>
              <option value="ytd">Year to date</option>
              <option value="thismonth">This month</option>
              <option value="lastmonth">Last month</option>
              <option value="custom">Custom dates…</option>
            </Select>
          </div>

          {report.preset === 'custom' ? (
            <div style={{display:'flex',gap:10}}>
              <Input label="From" type="date" value={report.from} onChange={e=>setR('from',e.target.value)} style={{flex:1}}/>
              <Input label="To"   type="date" value={report.to}   onChange={e=>setR('to',e.target.value)}   style={{flex:1}}/>
            </div>
          ) : (
            <div style={{fontSize:11,color:'var(--cream-30)',marginTop:-8}}>
              {(() => { const r = reportRange(report); return `${r.from} to ${r.to}`; })()}
            </div>
          )}

          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:600,color:'var(--cream-60)',letterSpacing:.5,textTransform:'uppercase'}}>Brands in this report &amp; how many items</span>
              <span style={{display:'flex',gap:12,fontSize:11}}>
                <button type="button" onClick={()=>setR('brandIds',brands.map(b=>b.id))} style={{background:'none',border:'none',color:'var(--orange)',cursor:'pointer',padding:0,fontSize:11}}>Select all</button>
                <button type="button" onClick={()=>setR('brandIds',[])} style={{background:'none',border:'none',color:'var(--cream-60)',cursor:'pointer',padding:0,fontSize:11}}>Clear</button>
              </span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {brands.map(b => {
                const on = report.brandIds.includes(b.id);
                return (
                  <div key={b.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',border:`1px solid ${on?'var(--orange)':'var(--border)'}`,borderRadius:7,fontSize:13,color:'var(--cream)'}}>
                    <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',flex:1,minWidth:0}}>
                      <input type="checkbox" checked={on} onChange={()=>setR('brandIds', on ? report.brandIds.filter(id=>id!==b.id) : [...report.brandIds,b.id])}/>
                      {b.name}
                    </label>
                    <select disabled={!on} value={report.tops[b.id] || '5'} onChange={e=>setR('tops',{...report.tops,[b.id]:e.target.value})}
                      style={{background:'var(--navy-light)',border:'1px solid var(--border)',borderRadius:6,color:'var(--cream)',fontSize:12,padding:'4px 6px',opacity:on?1:0.4}}>
                      {['5','10','15','20'].map(n => <option key={n} value={n}>Top {n}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--cream)',cursor:'pointer'}}>
              <input type="checkbox" checked={report.excludeOos} onChange={e=>setR('excludeOos',e.target.checked)}/>
              Exclude out-of-stock items
            </label>
            <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--cream)',cursor:'pointer'}}>
              <input type="checkbox" checked={report.showUnits} onChange={e=>setR('showUnits',e.target.checked)}/>
              Show units sold
            </label>
          </div>

          <Input label="Prepared for (optional)" placeholder="Partner name, shown in the footer" value={report.partner} onChange={e=>setR('partner',e.target.value)} maxLength={80}/>

          {reportError && <div style={{fontSize:12,color:'#f87171'}}>{reportError}</div>}

          <div style={{display:'flex',gap:10}}>
            <Btn onClick={generateReport} disabled={reportBusy} style={{flex:1,justifyContent:'center'}}>
              <FileText size={14}/> {reportBusy ? 'Generating… this can take a few seconds' : 'Generate PDF'}
            </Btn>
            <Btn variant="ghost" onClick={()=>setReportOpen(false)} disabled={reportBusy}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      {/* Mailing info modal — populated by the POS System when a sale needs
          to be posted out rather than collected in person, or when a
          customer email was collected for the rewards program. */}
      <Modal open={!!mailingInfoModal} title="CUSTOMER & MAILING DETAILS" onClose={() => setMailingInfoModal(null)} width={380}>
        {mailingInfoModal && (
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{fontSize:12,color:'var(--cream-30)'}}>
              {mailingInfoModal.item_series}{mailingInfoModal.variation ? ` · ${mailingInfoModal.variation}` : ''} — {fmt.date(mailingInfoModal.date)}
            </div>
            <MailingRow label="Email" value={mailingInfoModal.customer_email} />
            {mailingInfoModal.customer_email && (
              <div style={{fontSize:10.5,color:mailingInfoModal.pdpa_consent ? '#7fc93e' : '#f87171'}}>
                {mailingInfoModal.pdpa_consent ? '✓ PDPA consent given' : '⚠ No PDPA consent on record'}
              </div>
            )}
            <MailingRow label="Name" value={mailingInfoModal.mailing_name} />
            <MailingRow label="Address" value={mailingInfoModal.mailing_address} />
            <MailingRow label="Phone" value={mailingInfoModal.mailing_phone} />
            <MailingRow label="Shipping Channel" value={mailingInfoModal.shipping_channel} />
            <div style={{fontSize:10.5,fontWeight:600,color:mailingInfoModal.mailing_required ? '#f87171' : 'var(--cream-30)'}}>
              {mailingInfoModal.mailing_required ? '● Mailing required — not yet sent' : 'Mailing not required for this item'}
            </div>
          </div>
        )}
      </Modal>

      {/* Edit shipping/mailing/notes — deliberately scoped to fields that
          don't affect inventory or the revenue/profit calc (product, qty,
          price, channel still require void + re-record). Covers the common
          case: customer decided to collect in person after all, so the
          shipping charge/courier needs correcting after the sale was logged. */}
      <Modal open={!!editModal} title="EDIT SALE DETAILS" onClose={() => setEditModal(null)} width={420}>
        {editModal && editForm && (
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{fontSize:12,color:'var(--cream-30)'}}>
              {editModal.item_series}{editModal.variation ? ` · ${editModal.variation}` : ''} — {fmt.date(editModal.date)}
            </div>
            <div style={{fontSize:10.5,color:'var(--cream-30)',lineHeight:1.5}}>
              Only shipping, mailing, email, notes{editModal.website_order_id ? ', and the Stripe fee' : ''} can be
              edited here — product, quantity, price, and channel affect stock levels, so those still need a void +
              re-record. PDPA consent itself isn't editable here — it's kept as a record of what the
              customer actually agreed to at checkout.
            </div>
            {editModal.website_order_id && (
              <div>
                <Input label={`Stripe Fee (${editModal.currency || 'SGD'})`} type="number" step="0.01"
                  value={editForm.stripe_fee_amt} onChange={e=>setEditForm(f=>({...f,stripe_fee_amt:e.target.value}))}
                  placeholder="Leave blank if not fetched yet" />
                <div style={{fontSize:10,color:'var(--cream-30)',marginTop:4}}>
                  If Stripe hasn't reported the real fee yet (common for PayNow), you can type in what you see on
                  the Stripe Dashboard as a placeholder. Once Stripe's own fee settles — usually within a day or
                  two — it's checked automatically overnight and corrected here if your guess was off. Never gets
                  added on top of the real value either way.
                </div>
              </div>
            )}
            <div style={{display:'flex',gap:10}}>
              <Input label={`Shipping Charged (${editModal.currency || 'SGD'})`} type="number" step="0.01"
                value={editForm.shipping_charged} onChange={e=>setEditForm(f=>({...f,shipping_charged:e.target.value}))} />
              <Input label={`Shipping Cost (actual, ${editModal.currency || 'SGD'})`} type="number" step="0.01"
                value={editForm.shipping_cost} onChange={e=>setEditForm(f=>({...f,shipping_cost:e.target.value}))} />
            </div>
            <Input label="Shipping Channel" value={editForm.shipping_channel}
              onChange={e=>setEditForm(f=>({...f,shipping_channel:e.target.value}))} placeholder="e.g. SPX, Self Collection" />
            <Input label="Customer Email" value={editForm.customer_email}
              onChange={e=>setEditForm(f=>({...f,customer_email:e.target.value}))} placeholder="customer@email.com" />
            <Input label="Recipient Name" value={editForm.mailing_name}
              onChange={e=>setEditForm(f=>({...f,mailing_name:e.target.value}))} />
            <Input label="Mailing Address" value={editForm.mailing_address}
              onChange={e=>setEditForm(f=>({...f,mailing_address:e.target.value}))} />
            <Input label="Phone Number" value={editForm.mailing_phone}
              onChange={e=>setEditForm(f=>({...f,mailing_phone:e.target.value}))} />
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <input type="checkbox" checked={!!editForm.mailing_required}
                onChange={e=>setEditForm(f=>({...f,mailing_required:e.target.checked}))}
                style={{width:15,height:15,cursor:'pointer'}} />
              <span style={{fontSize:12,color:'var(--cream)'}}>Mailing required</span>
            </label>
            <div style={{fontSize:10,color:'var(--cream-30)',marginTop:-6}}>
              Untick this once the item has actually been mailed out — it removes the red marker from this
              row in the ledger.
            </div>
            <Input label="Notes" value={editForm.notes}
              onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))} />
            <div style={{display:'flex',gap:10,marginTop:4}}>
              <Btn onClick={saveEdit} disabled={editSaving} style={{flex:1,justifyContent:'center'}}>{editSaving?'Saving…':'Save Changes'}</Btn>
              <Btn variant="ghost" onClick={()=>setEditModal(null)} style={{flex:1,justifyContent:'center'}}>Cancel</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Table */}
      <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)'}}>
        {loading
          ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>Loading…</div>
          : sales.length === 0
            ? <div style={{padding:40,textAlign:'center',color:'var(--cream-30)',fontSize:12}}>No sales match filters</div>
            : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:1080}}>
                  <thead>
                    <tr>
                      {['Date','Brand','Product','Channel','Partner','Mkt','Qty','Unit Price','Discount/Fee','Shipping','Revenue','Profit',''].map(h=>(
                        <th key={h} style={{padding:'9px 10px',textAlign:['Qty','Unit Price','Discount/Fee','Shipping','Revenue','Profit'].includes(h)?'right':'left',fontSize:9.5,fontWeight:700,letterSpacing:.7,textTransform:'uppercase',color:'var(--cream-30)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map(s => {
                      const isVoided = s.voided === 1;
                      const rowStyle = isVoided
                        ? {borderBottom:'1px solid rgba(245,242,235,.04)',opacity:0.4}
                        : {borderBottom:'1px solid rgba(245,242,235,.04)'};
                      return (
                        <tr key={s.id} style={rowStyle}>
                          <td style={{padding:'8px 10px',color:'var(--cream-60)',whiteSpace:'nowrap',textDecoration:isVoided?'line-through':'none'}}>
                            {fmt.date(s.date)}
                            {isVoided && <span style={{marginLeft:6,fontSize:9,fontWeight:700,color:'#f87171',background:'rgba(248,113,113,.15)',padding:'1px 5px',borderRadius:3}}>VOID</span>}
                          </td>
                          <td style={{padding:'8px 10px'}}><Badge color={s.brand_color}>{s.brand_name}</Badge></td>
                          <td style={{padding:'8px 10px',color:'var(--cream)',maxWidth:140,display:'flex',alignItems:'center',gap:6}}>
                            <span style={{
                              maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                              color: s.mailing_required ? '#f87171' : 'inherit',
                              fontWeight: s.mailing_required ? 600 : 'inherit',
                            }}>
                              {s.item_series}{s.variation ? ` · ${s.variation}` : ''}
                            </span>
                            {Boolean(s.mailing_name || s.mailing_address || s.mailing_phone || s.shipping_channel || s.customer_email || s.mailing_required) && (
                              <button onClick={() => setMailingInfoModal(s)}
                                title={s.mailing_required ? 'Mailing required — not yet sent' : 'View customer / mailing details'}
                                style={{flexShrink:0,position:'relative',background:'none',border:'none',color: s.mailing_required ? '#f87171' : 'var(--orange)',cursor:'pointer',padding:0,display:'flex',alignItems:'center'}}>
                                <Mail size={12} />
                              </button>
                            )}
                          </td>
                          <td style={{padding:'8px 10px',color:'var(--cream-60)',whiteSpace:'nowrap'}}>{s.channel}</td>
                          <td style={{padding:'8px 10px',color:'var(--cream-60)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.partner_name||'—'}</td>
                          <td style={{padding:'8px 10px',color:'var(--cream-30)'}}>{s.market}</td>
                          <td style={{padding:'8px 10px',textAlign:'right',color:'var(--cream)'}}>{s.qty}</td>
                          <td style={{padding:'8px 10px',textAlign:'right',color:'var(--cream-60)'}}>{fmt.money(s.unit_price, s.currency)}</td>
                          <td style={{padding:'8px 10px',textAlign:'right'}}>
                            {(() => {
                              const d = discountCell(s);
                              if (!d) return <span style={{color:'var(--cream-30)'}}>—</span>;
                              return (
                                <span style={{fontSize:11,color:d.color}}>
                                  {d.text}
                                  <span style={{color:'var(--cream-30)',marginLeft:4,fontSize:10}}>{d.label}</span>
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{padding:'8px 10px',textAlign:'right'}}>
                            {(() => {
                              const sh = shippingCell(s);
                              if (!sh) return <span style={{color:'var(--cream-30)'}}>—</span>;
                              return (
                                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
                                  {sh.text && <span style={{fontSize:11,color:sh.color}}>{sh.text}</span>}
                                  {sh.sub && <span style={{fontSize:9,color:'var(--cream-30)'}}>{sh.sub}</span>}
                                  {sh.channel && <span style={{fontSize:9,color:'var(--cream-30)'}}>{sh.channel}</span>}
                                </div>
                              );
                            })()}
                          </td>
                          <td style={{padding:'8px 10px',textAlign:'right',fontWeight:600,color:'var(--cream)'}}>{fmt.money(s.revenue, s.currency)}</td>
                          <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:s.profit>=0?'#7fc93e':'#f87171'}}>
                            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
                              <span>{fmt.money(s.profit, s.currency)}</span>
                              {parseFloat(s.stripe_fee_amt || 0) > 0 && (
                                <span style={{fontSize:9,fontWeight:400,color:'var(--cream-30)'}}>
                                  − {fmt.money(s.stripe_fee_amt, s.currency)} Stripe fee
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{padding:'8px 6px',textAlign:'right',whiteSpace:'nowrap'}}>
                            {!isVoided && (
                              <>
                                <button onClick={() => openEdit(s)} title="Edit shipping/mailing/notes"
                                  style={{background:'none',border:'none',color:'rgba(245,242,235,.35)',cursor:'pointer',padding:4,display:'inline-flex',alignItems:'center'}}
                                  onMouseEnter={e=>e.currentTarget.style.color='var(--orange)'}
                                  onMouseLeave={e=>e.currentTarget.style.color='rgba(245,242,235,.35)'}>
                                  <Pencil size={13}/>
                                </button>
                                <button onClick={() => setVoidConfirm(s.id)} title="Void this sale"
                                  style={{background:'none',border:'none',color:'rgba(248,113,113,.5)',cursor:'pointer',padding:4,display:'inline-flex',alignItems:'center'}}
                                  onMouseEnter={e=>e.currentTarget.style.color='#f87171'}
                                  onMouseLeave={e=>e.currentTarget.style.color='rgba(248,113,113,.5)'}>
                                  <Ban size={13}/>
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
        }
      </div>
    </Page>
  );
}

function MailingRow({ label, value }) {
  return (
    <div>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:.5,textTransform:'uppercase',color:'var(--cream-30)',marginBottom:3}}>{label}</div>
      <div style={{fontSize:13,color:value ? 'var(--cream)' : 'var(--cream-30)'}}>{value || 'Not provided'}</div>
    </div>
  );
}
