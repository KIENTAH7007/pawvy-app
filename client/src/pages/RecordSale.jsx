import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Plus, Trash2 } from 'lucide-react';
import { brandsApi, productsApi, partnersApi, salesApi } from '../api';
import { Page, Card, Input, Select, Btn, Divider, fmt } from '../components/ui';

const B2C_CHANNELS = ['Shopee', 'Lazada', 'Amazon', 'TikTok Shop', 'Event Sale', 'Direct Sale'];
const B2B_CHANNELS = ['Wholesale Order', 'Consignment Sale'];
const PLATFORM_FEES = { Shopee: 9, Lazada: 9, 'TikTok Shop': 8, Amazon: 15 };
const IS_MARKETPLACE = ch => ['Shopee', 'Lazada', 'Amazon', 'TikTok Shop'].includes(ch);
const IS_EVENT      = ch => ch === 'Event Sale';
const IS_B2B        = ch => B2B_CHANNELS.includes(ch);

// ── Discount calculation ─────────────────────────────────────────
function calcDiscount(partner, subtotal) {
  if (!partner || !IS_B2B) return { amount: 0, label: null, type: 'none' };
  const dt = partner.discount_type || 'standard_rebate';
  const dv = parseFloat(partner.discount_value) || 0;
  const thresh = parseFloat(partner.discount_threshold) || 0;

  if (dt === 'fixed_pct') {
    // e.g. Kohepets: 5% on every order
    const amount = parseFloat((subtotal * dv / 100).toFixed(2));
    return { amount, pct: dv, label: `${dv}% partner discount`, type: 'fixed_pct' };
  }
  if (dt === 'threshold_pct') {
    // Simple % above threshold (no standard delivery/rebate tiers)
    if (subtotal >= thresh) {
      const amount = parseFloat((subtotal * dv / 100).toFixed(2));
      return { amount, pct: dv, label: `${dv}% discount (order ≥ $${thresh})`, type: 'threshold_pct' };
    }
    return { amount: 0, label: `${dv}% discount kicks in at $${thresh}`, type: 'threshold_pct_unmet' };
  }
  if (dt === 'hybrid') {
    // Pawpy Kisses model: standard delivery/rebate tiers + % at top tier
    if (subtotal >= thresh) {
      const amount = parseFloat((subtotal * dv / 100).toFixed(2));
      return { amount, pct: dv, label: `${dv}% discount (≥ $${thresh})`, type: 'hybrid' };
    }
    if (subtotal >= 400) return { amount: 12, label: '$12 cash rebate (≥ $400)', type: 'hybrid' };
    return { amount: 0, label: null, type: 'hybrid' };
  }
  if (dt === 'credit_note') {
    // Vanillapup: 5% base at $1000, +1% per $300, cap 8%
    if (subtotal < 1000) return { amount: 0, label: 'CN: min $1,000 order required', type: 'credit_note_unmet' };
    const addPct = Math.min(Math.floor((subtotal - 1000) / 300), 3);
    const pct    = Math.min(5 + addPct, 8);
    const amount = parseFloat((subtotal * pct / 100).toFixed(2));
    return { amount, pct, label: `CN ${pct}% = SGD ${amount.toFixed(2)} — credited to NEXT month SOA`, type: 'credit_note' };
  }
  if (dt === 'standard_rebate') {
    if (subtotal >= 600) return { amount: 30, label: '$30 cash rebate (≥ $600)', type: 'standard_rebate' };
    if (subtotal >= 400) return { amount: 12, label: '$12 cash rebate (≥ $400)', type: 'standard_rebate' };
    return { amount: 0, label: 'No rebate (< $400)', type: 'standard_rebate_unmet' };
  }
  return { amount: 0, label: null, type: 'none' };
}

// Delivery FOC check (standard rebate partners only, Wholesale Order only)
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
  const [date,      setDate]      = useState(new Date().toISOString().slice(0, 10));
  const [market,    setMarket]    = useState('SG');
  const [channel,   setChannel]   = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [notes,     setNotes]     = useState('');
  const [feePct,    setFeePct]    = useState(0);
  const [deliveryCharge, setDeliveryCharge] = useState('');
  const [lines,     setLines]     = useState([{ ...EMPTY_LINE }]);
  const [brands,    setBrands]    = useState([]);
  const [partners,  setPartners]  = useState([]);
  const [productsByBrand, setProductsByBrand] = useState({});
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => { brandsApi.getAll().then(setBrands); partnersApi.getAll().then(setPartners); }, []);
  useEffect(() => { setFeePct(PLATFORM_FEES[channel] || 0); }, [channel]);

  const selectedPartner = partners.find(p => String(p.id) === String(partnerId));
  const partnerModel    = selectedPartner?.model || '';

  // Determine which price field to auto-fill — takes explicit params to avoid closure issues
  function getPriceForProduct(prod, ch, mkt, pModel) {
    const c = ch    ?? channel;
    const m = mkt   ?? market;
    const p = pModel ?? partnerModel;
    if (c === 'Event Sale') {
      return m === 'MY' ? prod.price_rrp_my : m === 'AU' ? prod.price_rrp_au : (prod.price_rrp_sg || 0);
    }
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
          // Pass channel/market/partnerModel explicitly to avoid closure issues
          const price = getPriceForProduct(prod, channel, market, partnerModel);
          next[idx].unit_price = price || '';
        }
      }
      return next;
    });
  }

  // Re-fill prices when channel, market, or partner changes
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

  // Totals
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

  // B2B discount
  const discount    = IS_B2B(channel) && selectedPartner ? calcDiscount(selectedPartner, subtotal) : { amount: 0, label: null, type: 'none' };
  const delivery    = IS_B2B(channel) && channel === 'Wholesale Order' ? getDelivery(selectedPartner, subtotal, channel) : null;
  const delivAmt    = delivery && !delivery.free ? parseFloat(deliveryCharge) || 0 : 0;
  // Credit note doesn't reduce THIS sale's profit — it's deferred to next SOA
  const discountAffectsProfit = discount.type !== 'credit_note' && discount.type !== 'credit_note_unmet';
  const netProfit   = totalProfit - mktFeeAmt - (discountAffectsProfit ? discount.amount : 0);

  const invoiceTotal = IS_B2B(channel)
    ? subtotal + delivAmt - (discountAffectsProfit ? discount.amount : 0)
    : null;

  async function handleSave() {
    const validLines = lines.filter(l => l.product_id && l.qty && l.unit_price);
    if (!date || !channel || validLines.length === 0) {
      setError('Fill in Date, Channel, and at least one complete product line.'); return;
    }
    setSaving(true); setError('');
    try {
      // Build sale notes
      const saleNotes = [
        notes || null,
        discount.type === 'credit_note' && discount.amount > 0
          ? `CN ${discount.pct}% = SGD ${discount.amount.toFixed(2)} — credit to next SOA`
          : null,
        discount.type !== 'credit_note' && discount.amount > 0
          ? `Discount applied: ${discount.label}`
          : null,
      ].filter(Boolean).join(' | ') || null;

      for (const l of validLines) {
        const qty   = parseInt(l.qty);
        const price = parseFloat(l.unit_price);
        const cost  = parseFloat(l.unit_cost) || 0;
        const feeA  = IS_MARKETPLACE(channel) ? parseFloat((qty * price * feePct / 100).toFixed(2)) : 0;
        await salesApi.create({
          date, product_id: l.product_id, partner_id: partnerId || null,
          channel, market, qty, unit_cost: cost, unit_price: price,
          platform_fee_pct: IS_MARKETPLACE(channel) ? feePct : 0,
          platform_fee_amt: feeA,
          notes: saleNotes,
        });
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); setLines([{ ...EMPTY_LINE }]); setNotes(''); }, 1800);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  const priceLabel = IS_EVENT(channel) ? 'RRP' : partnerModel === 'Consignment' ? 'Consignment price' : 'Wholesale price';

  return (
    <Page title="RECORD SALE" subtitle="Log a sale — add multiple products for one order">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 268px', gap: 16, alignItems: 'start' }}>

        {/* ── Main form ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 12 }}>
              <Input label="Date *" type="date" value={date} onChange={e => setDate(e.target.value)} />
              <Select label="Market *" value={market} onChange={e => setMarket(e.target.value)}>
                {['SG', 'MY', 'AU'].map(m => <option key={m} value={m}>{m}</option>)}
              </Select>
              <Select label="Channel *" value={channel} onChange={e => setChannel(e.target.value)}>
                <option value="">— Select —</option>
                <optgroup label="B2C / Online">
                  {B2C_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
                <optgroup label="B2B / Trade">
                  {B2B_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              </Select>
              <Select label="Partner / Retailer" value={partnerId} onChange={e => setPartnerId(e.target.value)}>
                <option value="">— None / Direct —</option>
                {partners.filter(p => p.model !== 'None').map(p => (
                  <option key={p.id} value={p.id}>
                    {p.company_name}{p.model === 'Consignment' ? ' (C)' : ''}
                  </option>
                ))}
              </Select>
            </div>
            {selectedPartner && (
              <div style={{ margin: '-4px 16px 12px', fontSize: 11, color: 'var(--cream-30)', display: 'flex', gap: 16 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 70px 100px 100px 90px 36px', gap: 8, padding: '7px 16px 3px', fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: 'var(--cream-30)' }}>
              <span>Brand</span><span>Product / SKU</span><span>Qty</span><span>Unit Cost</span><span>Sale Price</span><span style={{ textAlign: 'right' }}>Line Total</span><span />
            </div>
            {lines.map((line, idx) => {
              const prods = productsByBrand[line.brand_id] || [];
              const lc    = lineCalcs[idx];
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 70px 100px 100px 90px 36px', gap: 8, padding: '6px 16px', borderBottom: '1px solid var(--cream-05)' }}>
                  <Select value={line.brand_id} onChange={async e => { updateLine(idx, 'brand_id', e.target.value); updateLine(idx, 'product_id', ''); await ensureProducts(e.target.value); }}>
                    <option value="">Brand</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                  <Select value={line.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)} disabled={!line.brand_id}>
                    <option value="">— SKU —</option>
                    {prods.map(p => <option key={p.id} value={p.id}>{p.item_series}{p.variation ? ' · ' + p.variation : ''}</option>)}
                  </Select>
                  <Input type="number" min="1" value={line.qty}        onChange={e => updateLine(idx, 'qty',        e.target.value)} placeholder="0" />
                  <Input type="number" step="0.01" value={line.unit_cost}  onChange={e => updateLine(idx, 'unit_cost',  e.target.value)} placeholder="0.00" />
                  <Input type="number" step="0.01" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', e.target.value)} placeholder="0.00" />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontWeight: 600, color: lc.lineProfit >= 0 ? '#7fc93e' : '#f87171', fontSize: 12 }}>
                    {lc.revenue > 0 ? fmt.sgd(lc.revenue) : '—'}
                  </div>
                  <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                    style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,.6)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            <div style={{ padding: '8px 16px' }}>
              <Btn size="sm" variant="ghost" onClick={addLine}><Plus size={12} /> Add another product</Btn>
            </div>
          </Card>

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

              {/* Discount row */}
              {IS_B2B(channel) && discount.label && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 11, color: discount.amount > 0 ? '#fbbf24' : 'var(--cream-30)', flex: 1, lineHeight: 1.4 }}>{discount.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: discount.amount > 0 ? '#fbbf24' : 'var(--cream-30)', whiteSpace: 'nowrap' }}>
                    {discount.amount > 0 && discountAffectsProfit ? `− ${fmt.sgd(discount.amount)}` : discount.amount > 0 ? 'Deferred' : '—'}
                  </span>
                </div>
              )}

              {/* Delivery */}
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

              <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>Net Profit (Pawvy)</span>
                <span style={{ fontSize: 22, fontFamily: "'Bebas Neue',sans-serif", color: netProfit >= 0 ? '#7fc93e' : '#f87171', letterSpacing: 1 }}>{fmt.sgd(netProfit)}</span>
              </div>
              {invoiceTotal !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border)', marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: 'var(--cream-60)' }}>Invoice to partner</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>{fmt.sgd(invoiceTotal)}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Standard rebate guide */}
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

          {/* Hybrid rebate guide (Pawpy Kisses model) */}
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

          {/* Vanillapup CN guide */}
          {IS_B2B(channel) && selectedPartner?.discount_type === 'credit_note' && (
            <Card title="VANILLAPUP CN TIERS">
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11 }}>
                {[
                  { min: 1900, pct: 8, label: '≥ $1,900 → 8% CN' },
                  { min: 1600, pct: 7, label: '≥ $1,600 → 7% CN' },
                  { min: 1300, pct: 6, label: '≥ $1,300 → 6% CN' },
                  { min: 1000, pct: 5, label: '≥ $1,000 → 5% CN' },
                  { min:    0, pct: 0, label: '< $1,000 → no CN' },
                ].map((tier, i) => {
                  const active = subtotal >= tier.min && (i === 0 || subtotal < [1900,1600,1300,1000,0][i-1]);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 5, background: active ? 'rgba(251,191,36,.08)' : 'transparent' }}>
                      <span style={{ color: active ? '#fbbf24' : 'var(--cream-30)' }}>{tier.label.split(' → ')[0]}</span>
                      <span style={{ fontWeight: active ? 700 : 400, color: active ? '#fbbf24' : 'var(--cream-30)' }}>{tier.label.split(' → ')[1]}</span>
                    </div>
                  );
                })}
                <div style={{ color: 'var(--cream-30)', fontSize: 10, marginTop: 4, lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  CN is credited to the NEXT month's SOA, not deducted from this invoice.
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

// Helper component
function Row({ label, value, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 11, color: muted ? 'var(--cream-30)' : 'var(--cream-60)' }}>{label}</span>
      <span style={{ fontSize: 12, color: muted ? 'var(--cream-30)' : 'var(--cream)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
