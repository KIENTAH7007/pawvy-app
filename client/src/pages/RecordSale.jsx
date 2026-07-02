import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { brandsApi, productsApi, partnersApi, salesApi } from '../api';
import { Page, Card, Input, Select, Btn, Divider, fmt } from '../components/ui';

const B2C_CHANNELS = ['Shopee', 'Lazada', 'Amazon', 'TikTok Shop', 'Event Sale', 'Direct Sale'];
const B2B_CHANNELS = ['Wholesale Order', 'Consignment Sale'];
const PLATFORM_FEES = { Shopee: 9, Lazada: 9, 'TikTok Shop': 8, Amazon: 15 };
const IS_MARKETPLACE = ch => ['Shopee', 'Lazada', 'Amazon', 'TikTok Shop'].includes(ch);
const IS_B2B        = ch => B2B_CHANNELS.includes(ch);

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 680);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 680);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

// ── Discount calculation ─────────────────────────────────────────
// Fix #4: Vanillapup CN is monthly — no per-order amount, just informational label.
function calcDiscount(partner, subtotal) {
  if (!partner || !IS_B2B) return { amount: 0, label: null, type: 'none' };
  const dt = partner.discount_type || 'standard_rebate';
  const dv = parseFloat(partner.discount_value) || 0;
  const thresh = parseFloat(partner.discount_threshold) || 0;

  if (dt === 'fixed_pct') {
    const amount = parseFloat((subtotal * dv / 100).toFixed(2));
    return { amount, pct: dv, label: `${dv}% partner discount`, type: 'fixed_pct' };
  }
  if (dt === 'threshold_pct') {
    if (subtotal >= thresh) {
      const amount = parseFloat((subtotal * dv / 100).toFixed(2));
      return { amount, pct: dv, label: `${dv}% discount (order ≥ $${thresh})`, type: 'threshold_pct' };
    }
    return { amount: 0, label: `${dv}% discount kicks in at $${thresh}`, type: 'threshold_pct_unmet' };
  }
  if (dt === 'hybrid') {
    if (subtotal >= thresh) {
      const amount = parseFloat((subtotal * dv / 100).toFixed(2));
      return { amount, pct: dv, label: `${dv}% discount (≥ $${thresh})`, type: 'hybrid' };
    }
    if (subtotal >= 400) return { amount: 12, label: '$12 cash rebate (≥ $400)', type: 'hybrid' };
    return { amount: 0, label: null, type: 'hybrid' };
  }
  if (dt === 'credit_note') {
    // Fix #4: CN is calculated monthly on total orders — NOT per individual order.
    // Show tier info but store NO discount amount on this sale.
    if (subtotal < 1000) {
      return { amount: 0, label: 'CN tracked monthly (min $1,000/month) — deferred to next SOA', type: 'credit_note_unmet' };
    }
    const addPct = Math.min(Math.floor((subtotal - 1000) / 300), 3);
    const pct    = Math.min(5 + addPct, 8);
    return { amount: 0, pct, label: `CN ${pct}% — tracked monthly, credited in next month SOA`, type: 'credit_note' };
  }
  if (dt === 'standard_rebate') {
    if (subtotal >= 600) return { amount: 30, label: '$30 cash rebate (≥ $600)', type: 'standard_rebate' };
    if (subtotal >= 400) return { amount: 12, label: '$12 cash rebate (≥ $400)', type: 'standard_rebate' };
    return { amount: 0, label: 'No rebate (< $400)', type: 'standard_rebate_unmet' };
  }
  return { amount: 0, label: null, type: 'none' };
}

function getDelivery(partner, subtotal, channel) {
  if (channel !== 'Wholesale Order') return null;
  const dt = partner?.discount_type || 'standard_rebate';
  if (dt !== 'standard_rebate' && dt !== 'hybrid') return null;
  return subtotal >= 200 ? { free: true } : { free: false };
}

const STANDARD_REBATE_TIERS = [
  { min: 600, rebate: 30, label: '≥ $600 → $30 rebate' },
  { min: 400, rebate: 12, label: '≥ $400 → $12 rebate' },
  { min: 200, rebate:  0, label: '≥ $200 → FOC delivery' },
  { min:   0, rebate:  0, label: '< $200 → delivery charge' },
];

const EMPTY_LINE = { brand_id: '', product_id: '', qty: '', unit_cost: '', unit_price: '' };

export default function RecordSale() {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const [date,      setDate]      = useState(new Date().toISOString().slice(0, 10));
  const [market,    setMarket]    = useState('SG');
  const [channel,   setChannel]   = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [notes,     setNotes]     = useState('');
  const [feePct,    setFeePct]    = useState(0);
  const [hideConfidential, setHideConfidential] = useState(false);
  const [deliveryCharge, setDeliveryCharge] = useState('');
  const [shippingCharged, setShippingCharged] = useState('');
  const [shippingCost,    setShippingCost]    = useState('');
  const [lines,     setLines]     = useState([{ ...EMPTY_LINE }]);
  const [brands,    setBrands]    = useState([]);
  const [partners,  setPartners]  = useState([]);
  const [productsByBrand, setProductsByBrand] = useState({});
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => { brandsApi.getAll().then(setBrands); partnersApi.getAll({ active_only:'true' }).then(setPartners); }, []);

  const selectedPartner = partners.find(p => String(p.id) === String(partnerId));
  const partnerModel    = selectedPartner?.model || '';

  function getPriceForProduct(prod, ch, mkt, pModel) {
    const c = ch    ?? channel;
    const m = mkt   ?? market;
    const p = pModel ?? partnerModel;
    if (p === 'Consignment') {
      return prod.price_consignment_sg || prod.price_wholesale_sg || 0;
    }
    return m === 'MY' ? prod.price_wholesale_my : m === 'AU' ? prod.price_wholesale_au : (prod.price_wholesale_sg || 0);
  }

  async function ensureProducts(brand_id) {
    if (!brand_id || productsByBrand[brand_id]) return;
    const prods = await productsApi.getAll({ brand_id, active: 'true' });
    setProductsByBrand(prev => ({ ...prev, [brand_id]: prods }));
  }

  function updateLine(idx, key, val) {
    setLines(prev => {
      const next = prev.map((l, i) => i === idx ? { ...l, [key]: val } : l);
      if (key === 'product_id') {
        const prods = productsByBrand[next[idx].brand_id] || [];
        const prod  = prods.find(p => String(p.id) === String(val));
        if (prod) {
          next[idx].unit_cost  = prod.unit_cost;
          const price = getPriceForProduct(prod, channel, market, partnerModel);
          next[idx].unit_price = price || '';
        }
      }
      return next;
    });
  }

  useEffect(() => {
    setLines(prev => prev.map(line => {
      if (!line.product_id) return line;
      const prods = productsByBrand[line.brand_id] || [];
      const prod  = prods.find(p => String(p.id) === String(line.product_id));
      if (!prod) return line;
      const price = getPriceForProduct(prod, channel, market, partnerModel);
      return { ...line, unit_price: price || line.unit_price };
    }));
  }, [channel, market, partnerModel]);

  const addLine    = ()  => setLines(p => [...p, { ...EMPTY_LINE }]);
  const removeLine = (i) => setLines(p => p.filter((_, idx) => idx !== i));

  const lineCalcs  = lines.map(l => ({
    qty:   parseFloat(l.qty)        || 0,
    cost:  parseFloat(l.unit_cost)  || 0,
    price: parseFloat(l.unit_price) || 0,
    get revenue()    { return this.qty * this.price; },
    get lineProfit() { return this.qty * (this.price - this.cost); },
  }));
  const subtotal    = lineCalcs.reduce((s, l) => s + l.revenue,    0);
  const totalProfit = lineCalcs.reduce((s, l) => s + l.lineProfit, 0);
  const mktFeeAmt   = IS_MARKETPLACE(channel) ? subtotal * (feePct / 100) : 0;

  const discount    = IS_B2B(channel) && selectedPartner ? calcDiscount(selectedPartner, subtotal) : { amount: 0, label: null, type: 'none' };
  const delivery    = IS_B2B(channel) && channel === 'Wholesale Order' ? getDelivery(selectedPartner, subtotal, channel) : null;
  const delivAmt    = delivery && !delivery.free ? parseFloat(deliveryCharge) || 0 : 0;
  const discountAffectsProfit = discount.type !== 'credit_note' && discount.type !== 'credit_note_unmet';
  
  const shipCharged = parseFloat(shippingCharged) || 0;
  const shipCost    = parseFloat(shippingCost) || 0;
  const shipProfit  = shipCharged - shipCost;

  const netProfit   = totalProfit - mktFeeAmt - (discountAffectsProfit ? discount.amount : 0) + shipProfit;

  const invoiceTotal = IS_B2B(channel)
    ? subtotal + delivAmt - (discountAffectsProfit ? discount.amount : 0) + shipCharged
    : null;

  // Fix #7: Build per-line discount amounts for saving
  // For B2B, we store the discount in platform_fee_amt per line.
  function getPerLineDiscountAmt(lineIdx) {
    if (!IS_B2B(channel) || !discountAffectsProfit || discount.amount === 0) return 0;
    const lc = lineCalcs[lineIdx];
    if (subtotal === 0 || lc.revenue === 0) return 0;

    const { type, pct } = discount;
    if (type === 'fixed_pct' || type === 'hybrid' || type === 'threshold_pct') {
      // Percentage discount — apply directly per line
      return parseFloat((lc.qty * lc.price * (pct / 100)).toFixed(2));
    }
    // Fixed cash rebate — distribute proportionally across lines
    const share = lc.revenue / subtotal;
    return parseFloat((discount.amount * share).toFixed(2));
  }

  async function handleSave() {
    const validLines = lines.filter(l => l.product_id && l.qty && l.unit_price);
    if (!date || !channel || validLines.length === 0) {
      setError('Fill in Date, Channel, and at least one complete product line.'); return;
    }
    setSaving(true); setError('');
    try {
      const saleNotes = [
        notes || null,
        discount.type === 'credit_note' && discount.pct > 0
          ? `CN tier ${discount.pct}% — calculated on monthly total, credited to next SOA`
          : null,
        discount.type !== 'credit_note' && discount.amount > 0
          ? `Discount applied: ${discount.label}`
          : null,
        shipCharged > 0
          ? `Shipping: charged $${shipCharged.toFixed(2)}, cost $${shipCost.toFixed(2)}`
          : null,
      ].filter(Boolean).join(' | ') || null;

      for (let i = 0; i < validLines.length; i++) {
        const l = validLines[i];
        const qty   = parseInt(l.qty);
        const price = parseFloat(l.unit_price);
        const cost  = parseFloat(l.unit_cost) || 0;

        // Platform fee (marketplace) or B2B discount stored in platform_fee_amt
        let feeAmt = 0;
        let feePctToSave = 0;
        if (IS_MARKETPLACE(channel)) {
          feePctToSave = feePct;
          feeAmt = parseFloat((qty * price * feePct / 100).toFixed(2));
        } else if (IS_B2B(channel)) {
          // Fix #7: store B2B discount in platform_fee_amt
          feeAmt = getPerLineDiscountAmt(lines.indexOf(l));
          feePctToSave = 0;
        }

        // Only first line gets the shipping amount (it's per-order)
        const isFirst = (i === 0);

        await salesApi.create({
          date, product_id: l.product_id, partner_id: partnerId || null,
          channel, market, qty, unit_cost: cost, unit_price: price,
          platform_fee_pct: feePctToSave,
          platform_fee_amt: feeAmt,
          shipping_charged: isFirst ? shipCharged : 0,
          shipping_cost:    isFirst ? shipCost    : 0,
          notes: saleNotes,
        });
      }
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setLines([{ ...EMPTY_LINE }]);
        setNotes('');
        setShippingCharged('');
        setShippingCost('');
      }, 1800);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  const priceLabel = partnerModel === 'Consignment' ? 'Consignment price' : 'Wholesale price';

  /* ── Mobile line card ─────────────────────────────────────────── */
  function MobileLineCard({ line, idx }) {
    const prods = productsByBrand[line.brand_id] || [];
    const lc = lineCalcs[idx];
    return (
      <div style={{border:'1px solid var(--border)',borderRadius:8,padding:12,background:'rgba(245,242,235,.03)',display:'flex',flexDirection:'column',gap:8}}>
        <div style={{display:'flex',gap:8}}>
          <Select value={line.brand_id} onChange={async e=>{updateLine(idx,'brand_id',e.target.value);updateLine(idx,'product_id','');await ensureProducts(e.target.value);}} style={{flex:1}}>
            <option value="">Brand</option>
            {brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <button onClick={()=>removeLine(idx)} disabled={lines.length===1}
            style={{background:'none',border:'none',color:'rgba(248,113,113,.6)',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}>
            <Trash2 size={16}/>
          </button>
        </div>
        <Select value={line.product_id} onChange={e=>updateLine(idx,'product_id',e.target.value)} disabled={!line.brand_id}>
          <option value="">— Select SKU —</option>
          {prods.map(p=><option key={p.id} value={p.id}>{p.item_series}{p.variation?' · '+p.variation:''}</option>)}
        </Select>
        <div style={{display:'grid',gridTemplateColumns: hideConfidential ? '1fr 1fr' : '1fr 1fr 1fr',gap:8}}>
          <Input label="Qty" type="number" min="1" value={line.qty} onChange={e=>updateLine(idx,'qty',e.target.value)} placeholder="0"/>
          {!hideConfidential && <Input label="Unit Cost" type="number" step="0.01" value={line.unit_cost} onChange={e=>updateLine(idx,'unit_cost',e.target.value)} placeholder="0.00"/>}
          <Input label="Sale Price" type="number" step="0.01" value={line.unit_price} onChange={e=>updateLine(idx,'unit_price',e.target.value)} placeholder="0.00"/>
        </div>
        {lc.revenue > 0 && (
          <div style={{textAlign:'right',fontSize:13,fontWeight:700,color: hideConfidential ? 'var(--cream)' : (lc.lineProfit>=0?'#7fc93e':'#f87171')}}>
            {fmt.sgd(lc.revenue)}
            {!hideConfidential && <span style={{fontSize:10,color:'var(--cream-30)',marginLeft:6}}>profit {fmt.sgd(lc.lineProfit)}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <Page title="RECORD SALE" subtitle="Log a sale — add multiple products for one order"
      action={
        <button onClick={() => setHideConfidential(v => !v)}
          title={hideConfidential ? 'Show cost & profit info' : 'Hide cost & profit (retailer view)'}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer',
            background: hideConfidential ? 'rgba(243,111,74,.15)' : 'transparent',
            border: `1px solid ${hideConfidential ? 'var(--orange)' : 'var(--border)'}`,
            color: hideConfidential ? 'var(--orange)' : 'var(--cream-60)' }}>
          {hideConfidential ? <EyeOff size={14}/> : <Eye size={14}/>}
          {hideConfidential ? 'Retailer View ON' : 'Retailer View'}
        </button>
      }>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 268px', gap: 16, alignItems: 'start' }}>

        {/* ── Main form ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 2fr', gap: 12 }}>
              <Input label="Date *" type="date" value={date} onChange={e => setDate(e.target.value)} />
              <Select label="Market *" value={market} onChange={e => setMarket(e.target.value)}>
                {['SG', 'MY', 'AU'].map(m => <option key={m} value={m}>{m}</option>)}
              </Select>
              <Select label="Channel *" value={channel} onChange={e => setChannel(e.target.value)} style={isMobile ? {gridColumn:'span 2'} : {}}>
                <option value="">— Select —</option>
                <optgroup label="B2C / Online">
                  {B2C_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
                <optgroup label="B2B / Trade">
                  {B2B_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              </Select>
              <Select label="Partner / Retailer" value={partnerId} onChange={e => setPartnerId(e.target.value)} style={isMobile ? {gridColumn:'span 2'} : {}}>
                <option value="">— None / Direct —</option>
                {partners.filter(p => p.model !== 'None').map(p => (
                  <option key={p.id} value={p.id}>
                    {p.company_name}{p.model === 'Consignment' ? ' (C)' : ''}
                  </option>
                ))}
              </Select>
            </div>
            {selectedPartner && (
              <div style={{ margin: '-4px 16px 12px', fontSize: 11, color: 'var(--cream-30)', display: 'flex', gap: 16, flexWrap:'wrap' }}>
                <span>Model: <strong style={{ color: partnerModel === 'Consignment' ? '#378ADD' : '#f36f4a' }}>{partnerModel}</strong></span>
                <span>Price auto-fill: <strong style={{ color: 'var(--cream-60)' }}>{priceLabel}</strong></span>
                {selectedPartner.discount_type && selectedPartner.discount_type !== 'none' && selectedPartner.discount_type !== 'standard_rebate' && (
                  <span style={{ color: '#fbbf24' }}>⭐ Special discount partner</span>
                )}
              </div>
            )}
          </Card>

          {/* Line items */}
          <Card>
            <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, letterSpacing: 1, color: 'var(--cream)' }}>PRODUCTS</span>
              <Btn size="sm" variant="secondary" onClick={addLine}><Plus size={12} /> Add Product</Btn>
            </div>

            {isMobile ? (
              <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:8}}>
                {lines.map((line, idx) => <MobileLineCard key={idx} line={line} idx={idx}/>)}
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: hideConfidential ? '1fr 2fr 70px 100px 90px 36px' : '1fr 2fr 70px 100px 100px 90px 36px', gap: 8, padding: '7px 16px 3px', fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--cream-30)' }}>
                  <span>Brand</span><span>Product / SKU</span><span>Qty</span>{!hideConfidential && <span>Unit Cost</span>}<span>Sale Price</span><span style={{ textAlign: 'right' }}>Line Total</span><span />
                </div>
                {lines.map((line, idx) => {
                  const prods = productsByBrand[line.brand_id] || [];
                  const lc    = lineCalcs[idx];
                  return (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: hideConfidential ? '1fr 2fr 70px 100px 90px 36px' : '1fr 2fr 70px 100px 100px 90px 36px', gap: 8, padding: '6px 16px', borderBottom: '1px solid var(--cream-05)' }}>
                      <Select value={line.brand_id} onChange={async e => { updateLine(idx, 'brand_id', e.target.value); updateLine(idx, 'product_id', ''); await ensureProducts(e.target.value); }}>
                        <option value="">Brand</option>
                        {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </Select>
                      <Select value={line.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)} disabled={!line.brand_id}>
                        <option value="">— SKU —</option>
                        {prods.map(p => <option key={p.id} value={p.id}>{p.item_series}{p.variation ? ' · ' + p.variation : ''}</option>)}
                      </Select>
                      <Input type="number" min="1" value={line.qty}        onChange={e => updateLine(idx, 'qty',        e.target.value)} placeholder="0" />
                      {!hideConfidential && <Input type="number" step="0.01" value={line.unit_cost}  onChange={e => updateLine(idx, 'unit_cost',  e.target.value)} placeholder="0.00" />}
                      <Input type="number" step="0.01" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', e.target.value)} placeholder="0.00" />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontWeight: 600, color: hideConfidential ? 'var(--cream)' : (lc.lineProfit >= 0 ? '#7fc93e' : '#f87171'), fontSize: 12 }}>
                        {lc.revenue > 0 ? fmt.sgd(lc.revenue) : '—'}
                      </div>
                      <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                        style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,.6)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
            <div style={{ padding: '8px 16px' }}>
              <Btn size="sm" variant="ghost" onClick={addLine}><Plus size={12} /> Add another product</Btn>
            </div>
          </Card>

          {/* Shipping (Fix #10) — shown for B2B Wholesale orders */}
          {IS_B2B(channel) && channel === 'Wholesale Order' && (
            <Card title="SHIPPING (OPTIONAL)">
              <div style={{padding:'12px 16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <Input
                  label="Shipping Charged to Partner (SGD)"
                  type="number" step="0.01"
                  value={shippingCharged}
                  onChange={e => setShippingCharged(e.target.value)}
                  placeholder="0.00"
                />
                <Input
                  label="Actual Shipping Cost (SGD)"
                  type="number" step="0.01"
                  value={shippingCost}
                  onChange={e => setShippingCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              {shipCharged > 0 && (
                <div style={{padding:'0 16px 12px',fontSize:11,color:'#7fc93e'}}>
                  Shipping profit: SGD {shipProfit.toFixed(2)} (charged SGD {shipCharged.toFixed(2)} − cost SGD {shipCost.toFixed(2)})
                </div>
              )}
            </Card>
          )}

          <Card>
            <div style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <Input label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. partial payment, tester included…" />
              </div>
              <Btn onClick={handleSave} disabled={saving || saved} size="lg" style={{ whiteSpace: 'nowrap' }}>
                {saved ? <><CheckCircle size={14} /> Saved!</> : saving ? 'Saving…' : 'Save Order'}
              </Btn>
            </div>
            {error && <div style={{ margin: '0 14px 12px', background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#f87171' }}>{error}</div>}
          </Card>
        </div>

        {/* ── Right panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Card title="ORDER SUMMARY">
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Row label={`Subtotal (${lines.filter(l=>l.qty).length} lines)`} value={fmt.sgd(subtotal)} />

              {IS_MARKETPLACE(channel) && mktFeeAmt > 0 && (
                <Row label={`Marketplace fee (${feePct}%)`} value={`− ${fmt.sgd(mktFeeAmt)}`} muted />
              )}

              {IS_B2B(channel) && discount.label && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 11, color: discount.amount > 0 ? '#fbbf24' : 'var(--cream-30)', flex: 1, lineHeight: 1.4 }}>{discount.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: discount.amount > 0 ? '#fbbf24' : 'var(--cream-30)', whiteSpace: 'nowrap' }}>
                    {discount.amount > 0 && discountAffectsProfit ? `− ${fmt.sgd(discount.amount)}` : discount.amount > 0 ? 'Deferred' : '—'}
                  </span>
                </div>
              )}

              {delivery !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: delivery.free ? '#7fc93e' : 'var(--cream-30)' }}>
                    {delivery.free ? '✓ Delivery (FOC ≥ $200)' : 'Delivery charge (to retailer)'}
                  </span>
                  {delivery.free
                    ? <span style={{ fontSize: 11, color: '#7fc93e', fontWeight: 700 }}>FREE</span>
                    : <input type="number" step="0.01" value={deliveryCharge} onChange={e => setDeliveryCharge(e.target.value)} placeholder="$0.00"
                        style={{ width: 70, background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 8px', color: 'var(--cream)', fontSize: 11, textAlign: 'right' }} />
                  }
                </div>
              )}

              {shipCharged > 0 && (
                <Row label={`Shipping charged`} value={`+ ${fmt.sgd(shipCharged)}`} />
              )}

              <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
              {!hideConfidential && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>Net Profit (Pawvy)</span>
                  <span style={{ fontSize: 22, fontFamily: "'Bebas Neue',sans-serif", color: netProfit >= 0 ? '#7fc93e' : '#f87171', letterSpacing: 1 }}>{fmt.sgd(netProfit)}</span>
                </div>
              )}
              {invoiceTotal !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border)', marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: 'var(--cream-60)' }}>Invoice to partner</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>{fmt.sgd(invoiceTotal)}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Rebate tiers */}
          {IS_B2B(channel) && channel === 'Wholesale Order' && (!selectedPartner || selectedPartner.discount_type === 'standard_rebate') && (
            <Card title="REBATE TIERS">
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {STANDARD_REBATE_TIERS.map((tier, i) => {
                  const active = subtotal >= tier.min && (i === 0 || subtotal < STANDARD_REBATE_TIERS[i-1].min);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 5, background: active ? 'rgba(243,111,74,.1)' : 'transparent' }}>
                      <span style={{ fontSize: 11, color: active ? 'var(--orange)' : 'var(--cream-30)' }}>{tier.label.split(' → ')[0]}</span>
                      <span style={{ fontSize: 11, fontWeight: active ? 700 : 400, color: active ? 'var(--orange)' : 'var(--cream-30)' }}>{tier.label.split(' → ')[1]}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {IS_B2B(channel) && channel === 'Wholesale Order' && selectedPartner?.discount_type === 'hybrid' && (
            <Card title={`${selectedPartner.company_name.split(' ')[0].toUpperCase()} REBATE TIERS`}>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  { min: selectedPartner.discount_threshold||600, label: `≥ $${selectedPartner.discount_threshold||600} → ${selectedPartner.discount_value||0}% discount` },
                  { min: 400, label: '≥ $400 → $12 rebate' },
                  { min: 200, label: '≥ $200 → FOC delivery' },
                  { min:   0, label: '< $200 → delivery charge' },
                ].map((tier, i) => {
                  const nextMin = [selectedPartner.discount_threshold||600, 400, 200, 0][i-1];
                  const active  = subtotal >= tier.min && (i === 0 || subtotal < nextMin);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 5, background: active ? 'rgba(243,111,74,.1)' : 'transparent' }}>
                      <span style={{ fontSize: 11, color: active ? 'var(--orange)' : 'var(--cream-30)' }}>{tier.label.split(' → ')[0]}</span>
                      <span style={{ fontSize: 11, fontWeight: active ? 700 : 400, color: active ? 'var(--orange)' : 'var(--cream-30)' }}>{tier.label.split(' → ')[1]}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Fix #4: Vanillapup CN — monthly tracking only */}
          {IS_B2B(channel) && selectedPartner?.discount_type === 'credit_note' && (
            <Card title="VANILLAPUP CN TIERS">
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11 }}>
                {[
                  { min: 1900, pct: 8, label: '≥ $1,900/mth → 8% CN' },
                  { min: 1600, pct: 7, label: '≥ $1,600/mth → 7% CN' },
                  { min: 1300, pct: 6, label: '≥ $1,300/mth → 6% CN' },
                  { min: 1000, pct: 5, label: '≥ $1,000/mth → 5% CN' },
                  { min:    0, pct: 0, label: '< $1,000/mth → no CN' },
                ].map((tier, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 5 }}>
                    <span style={{ color: 'var(--cream-30)' }}>{tier.label.split(' → ')[0]}</span>
                    <span style={{ color: 'var(--cream-30)' }}>{tier.label.split(' → ')[1]}</span>
                  </div>
                ))}
                <div style={{ color: '#fbbf24', fontSize: 10, marginTop: 4, lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  ⚠ CN is calculated on the MONTHLY TOTAL of all Vanillapup orders — not per individual order. No deduction on this sale. Credited to next month's SOA.
                </div>
              </div>
            </Card>
          )}

          {IS_MARKETPLACE(channel) && (
            <Card title="PLATFORM FEE">
              <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--cream-60)' }}>Fee %</span>
                  <input type="number" step="0.5" value={feePct} onChange={e => setFeePct(parseFloat(e.target.value) || 0)}
                    style={{ width: 60, background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 8px', color: 'var(--cream)', fontSize: 12, textAlign: 'right' }} />
                </div>
                <div style={{ color: 'var(--cream-30)', fontSize: 10, lineHeight: 1.6 }}>Shopee 9%, Lazada 9%, TikTok 8%, Amazon 15%</div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function Row({ label, value, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 11, color: muted ? 'var(--cream-30)' : 'var(--cream-60)' }}>{label}</span>
      <span style={{ fontSize: 12, color: muted ? 'var(--cream-30)' : 'var(--cream)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
