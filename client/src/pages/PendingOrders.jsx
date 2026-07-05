import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Trash2, Plus, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { partnersApi, brandsApi, productsApi, ordersApi } from '../api';
import { Page, Card, Input, Select, Btn, fmt } from '../components/ui';

// ── Discount calculation ─────────────────────────────────────────
// Mirrors RecordSale.jsx EXACTLY, so approving a portal order produces
// identical pricing/discount behavior to manually entering the same order
// into Record Sale with the same partner selected. Keep these two in sync
// if the discount models ever change.
function calcDiscount(partner, subtotal) {
  if (!partner) return { amount: 0, label: null, type: 'none' };
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

// Same apportionment rule as RecordSale.jsx: percentage discounts apply
// directly per line; fixed cash rebates are distributed proportionally by
// each line's share of the subtotal.
function getPerLineDiscountAmt(discount, subtotal, line) {
  if (!discount || discount.amount === 0) return 0;
  const revenue = line.qty * line.unit_price;
  if (subtotal === 0 || revenue === 0) return 0;
  const { type, pct } = discount;
  if (type === 'fixed_pct' || type === 'hybrid' || type === 'threshold_pct') {
    return parseFloat((line.qty * line.unit_price * (pct / 100)).toFixed(2));
  }
  const share = revenue / subtotal;
  return parseFloat((discount.amount * share).toFixed(2));
}

const TABS = [
  { key: 'pending',  label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function PendingOrders() {
  const [tab, setTab]           = useState('pending');
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [partners, setPartners] = useState([]);
  const [brands, setBrands]     = useState([]);
  const [pbb, setPbb]           = useState({}); // products by brand, lazy-loaded
  const [expandedId, setExpandedId] = useState(null);
  const [editState, setEditState]   = useState({}); // { [orderId]: { partnerId, items:[...] } }
  const [busyId, setBusyId]     = useState(null);
  const [error, setError]       = useState('');

  function load() {
    setLoading(true);
    ordersApi.list({ status: tab }).then(setOrders).finally(() => setLoading(false));
  }
  useEffect(() => { load(); setExpandedId(null); }, [tab]);
  useEffect(() => { partnersApi.getAll().then(setPartners); brandsApi.getAll().then(setBrands); }, []);

  async function ensureProducts(brand_id) {
    if (!brand_id || pbb[brand_id]) return;
    const prods = await productsApi.getAll({ brand_id, active: 'true' });
    setPbb(prev => ({ ...prev, [brand_id]: prods }));
  }

  function expand(order) {
    if (expandedId === order.id) { setExpandedId(null); return; }
    setExpandedId(order.id);
    setError('');
    if (!editState[order.id]) {
      setEditState(prev => ({
        ...prev,
        [order.id]: {
          partnerId: order.partner_id || '',
          items: order.items.map(it => ({
            product_id: it.product_id,
            qty: it.qty,
            item_series: it.item_series,
            variation: it.variation,
            brand_name: it.brand_name,
            brand_color: it.brand_color,
            unit_price: it.price_wholesale_sg,
          })),
        },
      }));
    }
  }

  function updateEdit(orderId, updater) {
    setEditState(prev => ({ ...prev, [orderId]: updater(prev[orderId]) }));
  }

  function updateItemQty(orderId, idx, qty) {
    updateEdit(orderId, es => ({ ...es, items: es.items.map((it, i) => i === idx ? { ...it, qty } : it) }));
  }
  function removeItem(orderId, idx) {
    updateEdit(orderId, es => ({ ...es, items: es.items.filter((_, i) => i !== idx) }));
  }
  function addLine(orderId) {
    updateEdit(orderId, es => ({ ...es, items: [...es.items, { product_id: '', qty: 1, brand_id_temp: '' }] }));
  }
  function updateNewLineBrand(orderId, idx, brand_id) {
    updateEdit(orderId, es => ({ ...es, items: es.items.map((it, i) => i === idx ? { ...it, brand_id_temp: brand_id, product_id: '' } : it) }));
    ensureProducts(brand_id);
  }
  function updateNewLineProduct(orderId, idx, product_id, brand_id) {
    const prod = (pbb[brand_id] || []).find(p => String(p.id) === String(product_id));
    updateEdit(orderId, es => ({
      ...es,
      items: es.items.map((it, i) => i === idx ? {
        ...it, product_id,
        item_series: prod?.item_series, variation: prod?.variation,
        brand_name: prod?.brand_name, brand_color: prod?.brand_color,
        unit_price: prod?.price_wholesale_sg,
      } : it),
    }));
  }

  function computeTotals(es) {
    const partner = partners.find(p => String(p.id) === String(es?.partnerId));
    const items = (es?.items || []).filter(it => it.product_id && it.qty > 0);
    const subtotal = items.reduce((s, it) => s + it.qty * (parseFloat(it.unit_price) || 0), 0);
    const discount = partner ? calcDiscount(partner, subtotal) : { amount: 0, label: null, type: 'none' };
    const discountAffectsTotal = discount.type !== 'credit_note' && discount.type !== 'credit_note_unmet';
    const netTotal = subtotal - (discountAffectsTotal ? discount.amount : 0);
    return { partner, items, subtotal, discount, discountAffectsTotal, netTotal };
  }

  async function handleApprove(order) {
    const es = editState[order.id];
    const { partner, items, subtotal, discount } = computeTotals(es);
    if (!partner) { setError('Select which partner this order belongs to before approving.'); return; }
    if (items.length === 0) { setError('Add at least one item before approving.'); return; }

    setBusyId(order.id); setError('');
    try {
      const payload = {
        partner_id: partner.id,
        items: items.map(it => {
          const feeAmt = getPerLineDiscountAmt(discount, subtotal, it);
          return {
            product_id: it.product_id,
            qty: parseInt(it.qty),
            unit_price: parseFloat(it.unit_price),
            platform_fee_pct: 0,
            platform_fee_amt: feeAmt,
          };
        }),
      };
      await ordersApi.approve(order.id, payload);
      setExpandedId(null);
      load();
    } catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  }

  async function handleReject(order) {
    if (!window.confirm(`Reject the order from "${order.company_name}"? This can't be undone.`)) return;
    setBusyId(order.id); setError('');
    try {
      await ordersApi.reject(order.id);
      setExpandedId(null);
      load();
    } catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  }

  async function handleSaveChanges(order) {
    const es = editState[order.id];
    setBusyId(order.id); setError('');
    try {
      await ordersApi.update(order.id, {
        partner_id: es.partnerId || null,
        items: es.items.filter(it => it.product_id && it.qty > 0).map(it => ({ product_id: it.product_id, qty: parseInt(it.qty) })),
      });
      load();
    } catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  }

  const pendingCount = tab === 'pending' ? orders.length : null;

  return (
    <Page title="PENDING ORDERS" subtitle="Review, amend, and approve orders submitted through the Order Portal">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ display: 'flex', gap: 8 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: '7px 16px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${tab === t.key ? 'var(--orange)' : 'var(--border)'}`,
                background: tab === t.key ? 'rgba(243,111,74,.15)' : 'transparent',
                color: tab === t.key ? 'var(--orange)' : 'var(--cream-60)',
              }}>
              {t.label}{t.key === 'pending' && pendingCount !== null ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)', fontSize: 13 }}>Loading…</div>
        ) : orders.length === 0 ? (
          <Card>
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)', fontSize: 13 }}>
              No {tab} orders.
            </div>
          </Card>
        ) : (
          orders.map(order => {
            const isOpen = expandedId === order.id;
            const es = editState[order.id];
            const totals = isOpen && es ? computeTotals(es) : null;
            return (
              <Card key={order.id}>
                <div onClick={() => tab === 'pending' && expand(order)}
                  style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: tab === 'pending' ? 'pointer' : 'default' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)' }}>{order.company_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--cream-30)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                      <Clock size={11} /> {new Date(order.submitted_at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {order.matched_partner_name && <span style={{ marginLeft: 8, color: 'var(--cream-60)' }}>· Matched: {order.matched_partner_name}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cream-60)' }}>{order.items.length} item{order.items.length !== 1 ? 's' : ''}</div>
                  {tab === 'pending' && (isOpen ? <ChevronUp size={16} color="var(--cream-30)"/> : <ChevronDown size={16} color="var(--cream-30)"/>)}
                </div>

                {!isOpen && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {order.items.map(it => (
                      <span key={it.id} style={{ fontSize: 11, color: 'var(--cream-60)', background: 'rgba(245,242,235,.05)', padding: '3px 8px', borderRadius: 5 }}>
                        {it.item_series}{it.variation ? ` · ${it.variation}` : ''} × {it.qty}
                      </span>
                    ))}
                  </div>
                )}

                {isOpen && es && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                    {order.notes && (
                      <div style={{ fontSize: 12, color: 'var(--cream-60)', padding: '12px 0 0' }}>
                        <strong style={{ color: 'var(--cream-30)', fontWeight: 600 }}>Notes:</strong> {order.notes}
                      </div>
                    )}

                    <div style={{ paddingTop: 12, maxWidth: 320 }}>
                      <Select label="Match to Partner *" value={es.partnerId}
                        onChange={e => updateEdit(order.id, prev => ({ ...prev, partnerId: e.target.value }))}>
                        <option value="">— Select partner —</option>
                        {partners.slice().sort((a,b)=>a.company_name.localeCompare(b.company_name)).map(p =>
                          <option key={p.id} value={p.id}>{p.company_name}</option>
                        )}
                      </Select>
                    </div>

                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {es.items.map((it, idx) => {
                        const isNewEmptyLine = !it.product_id;
                        return (
                          <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            {isNewEmptyLine ? (
                              <>
                                <Select value={it.brand_id_temp || ''} onChange={e => updateNewLineBrand(order.id, idx, e.target.value)} style={{ width: 140 }}>
                                  <option value="">Brand</option>
                                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </Select>
                                <Select value={it.product_id} disabled={!it.brand_id_temp}
                                  onChange={e => updateNewLineProduct(order.id, idx, e.target.value, it.brand_id_temp)} style={{ flex: 1, minWidth: 160 }}>
                                  <option value="">— Select SKU —</option>
                                  {(pbb[it.brand_id_temp] || []).map(p => <option key={p.id} value={p.id}>{p.item_series}{p.variation ? ' · ' + p.variation : ''}</option>)}
                                </Select>
                              </>
                            ) : (
                              <div style={{ flex: 1, fontSize: 12.5, color: 'var(--cream)' }}>
                                <span style={{ color: it.brand_color || 'var(--cream-30)', fontWeight: 600, fontSize: 10.5, textTransform: 'uppercase', marginRight: 8 }}>{it.brand_name}</span>
                                {it.item_series}{it.variation ? ` · ${it.variation}` : ''}
                                <span style={{ color: 'var(--cream-30)', marginLeft: 8, fontSize: 11 }}>{fmt.sgd(it.unit_price)}/u</span>
                              </div>
                            )}
                            <Input type="number" min="1" value={it.qty} onChange={e => updateItemQty(order.id, idx, e.target.value)} style={{ width: 70 }}/>
                            <button onClick={() => removeItem(order.id, idx)} style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,.7)', cursor: 'pointer', padding: 4 }}>
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        );
                      })}
                      <Btn size="sm" variant="ghost" onClick={() => addLine(order.id)} style={{ alignSelf: 'flex-start' }}>
                        <Plus size={12}/> Add another product
                      </Btn>
                    </div>

                    {totals && totals.partner && (
                      <div style={{ marginTop: 14, padding: 12, background: 'rgba(245,242,235,.03)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                          <span style={{ color: 'var(--cream-60)' }}>Subtotal</span>
                          <span style={{ color: 'var(--cream)' }}>{fmt.sgd(totals.subtotal)}</span>
                        </div>
                        {totals.discount.label && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                            <span style={{ color: '#7fc93e' }}>{totals.discount.label}</span>
                            {totals.discountAffectsTotal && totals.discount.amount > 0 && (
                              <span style={{ color: '#7fc93e', fontWeight: 700 }}>− {fmt.sgd(totals.discount.amount)}</span>
                            )}
                          </div>
                        )}
                        <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }}/>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
                          <span style={{ color: 'var(--cream)' }}>Net Total</span>
                          <span style={{ color: 'var(--orange)' }}>{fmt.sgd(totals.netTotal)}</span>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div style={{ marginTop: 12, background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#f87171' }}>
                        {error}
                      </div>
                    )}

                    <div style={{ marginTop: 14, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <Btn variant="ghost" size="sm" disabled={busyId === order.id} onClick={() => handleReject(order)}>
                        <XCircle size={14}/> Reject
                      </Btn>
                      <Btn variant="secondary" size="sm" disabled={busyId === order.id} onClick={() => handleSaveChanges(order)}>
                        Save Changes
                      </Btn>
                      <Btn size="sm" disabled={busyId === order.id} onClick={() => handleApprove(order)}>
                        <CheckCircle size={14}/> Approve &amp; Create Sale
                      </Btn>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </Page>
  );
}
