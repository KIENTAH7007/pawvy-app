import React, { useState, useEffect, useMemo } from 'react'
import { Search, ShoppingCart, ArrowLeft, CheckCircle2, Loader2, ImageOff } from 'lucide-react'
import { portalApi, MARKET, CURRENCY, FOC_AMOUNT, MONEY_SYMBOL } from './api.js'
import { PAWVY_LOGO_WHITE } from './pawvyLogo.js'
import ProductCard from './ProductCard.jsx'
import QtyStepper from './QtyStepper.jsx'

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

const money = (n) => `${MONEY_SYMBOL}${Number(n).toFixed(2)}`;
const EMAIL_KEY = 'pawvy_portal_email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Free-delivery + rebate status for an order amount, worked out in whole cents so edge cases like
// 399.99 → "add 0.01" are exact. Rules (all ">="): FOC delivery from 200 (SG) / 600 (MY);
// SG cash rebate 12 from 400, 30 from 600. Nudges: 350.00–399.99 → add for the 12 rebate,
// 550.00–599.99 → add for the 30 rebate. MY has no rebate tiers.
function deliveryStatus(cents) {
  const focCents = FOC_AMOUNT * 100;
  const out = { focOk: cents >= focCents, focNeed: Math.max(0, focCents - cents) / 100, ticks: [], nudge: null };
  if (!out.focOk) return out;
  if (MARKET === 'MY') return out;
  if (cents >= 60000) out.ticks.push('S$30 cash rebate unlocked');
  else if (cents >= 40000) out.ticks.push('S$12 cash rebate unlocked');
  if (cents >= 35000 && cents < 40000) out.nudge = { amount: (40000 - cents) / 100, rebate: 'S$12', target: 400 };
  else if (cents >= 55000 && cents < 60000) out.nudge = { amount: (60000 - cents) / 100, rebate: 'S$30', target: 600 };
  return out;
}

export default function App() {
  const isMobile = useIsMobile();
  const [catalogue, setCatalogue] = useState([]);
  const [topSellers, setTopSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [activeBrand, setActiveBrand] = useState('All');
  const [cart, setCart] = useState({}); // { [product_id]: { qty, source: 'catalogue'|'upsell' } }
  const [view, setView] = useState('catalogue'); // catalogue | review | success
  const [companyName, setCompanyName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { return ''; } });
  const [prompt, setPrompt] = useState(null); // null | 'foc' | 'rebate'
  const [sentPdf, setSentPdf] = useState(null);
  const [sentAt, setSentAt] = useState('');
  const [sentEmail, setSentEmail] = useState('');

  useEffect(() => {
    portalApi.getCatalogue()
      .then(setCatalogue)
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
    // Non-critical — if this fails, the upsell section just doesn't show.
    // Doesn't block the catalogue from loading and shouldn't surface an error.
    portalApi.getTopSellers().then(setTopSellers).catch(() => {});
  }, []);

  const byId = useMemo(() => {
    const m = {};
    catalogue.forEach(p => { m[p.id] = p; });
    return m;
  }, [catalogue]);

  const brands = useMemo(() => {
    const names = [...new Set(catalogue.map(p => p.brand_name))].sort();
    return ['All', ...names];
  }, [catalogue]);

  const brandColors = useMemo(() => {
    const m = {};
    catalogue.forEach(p => { m[p.brand_name] = p.brand_color; });
    return m;
  }, [catalogue]);

  const filtered = useMemo(() => {
    return catalogue.filter(p => {
      if (activeBrand !== 'All' && p.brand_name !== activeBrand) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${p.item_series} ${p.variation || ''} ${p.brand_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalogue, activeBrand, search]);

  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .map(([id, entry]) => ({ product: byId[id], qty: entry.qty, source: entry.source }))
      .filter(l => l.product);
  }, [cart, byId]);

  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const cartSubtotal = cartLines.reduce((s, l) => s + l.qty * (l.product.price_wholesale || 0), 0);
  const cartCents = cartLines.reduce((s, l) => s + Math.round((l.product.price_wholesale || 0) * 100) * l.qty, 0);
  const dStatus = deliveryStatus(cartCents);

  function scrollToTopSellers() {
    const el = document.getElementById('top-sellers');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // source defaults to 'catalogue'; the upsell grid passes 'upsell' explicitly.
  // If a product's already in the cart, the ORIGINAL source is kept even if
  // qty is increased from the other section — first add is what genuinely
  // reflects how the partner discovered it.
  function addToCart(product, qty, source = 'catalogue') {
    setCart(prev => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          qty: (existing?.qty || 0) + qty,
          source: existing?.source || source,
        },
      };
    });
  }
  function updateQty(productId, qty) {
    setCart(prev => ({ ...prev, [productId]: { ...prev[productId], qty } }));
  }
  function removeFromCart(productId) {
    setCart(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  // Validate, then — if the order is below the free-delivery amount — ask first (pop-up) before sending.
  function handleSubmit() {
    if (!companyName.trim()) { setSubmitError('Please enter your company name.'); return; }
    if (cartLines.length === 0) { setSubmitError('Your cart is empty.'); return; }
    if (email.trim() && !EMAIL_RE.test(email.trim())) { setSubmitError("That email address doesn't look right — please check it, or leave it blank."); return; }
    setSubmitError('');
    if (!dStatus.focOk) { setPrompt('foc'); return; }
    if (dStatus.nudge) { setPrompt('rebate'); return; }
    doSubmit();
  }

  async function doSubmit() {
    setPrompt(null);
    setSubmitting(true); setSubmitError('');
    try {
      const res = await portalApi.submitOrder({
        company_name: companyName.trim(),
        notes: notes.trim() || null,
        email: email.trim() || null,
        items: cartLines.map(l => ({ product_id: l.product.id, qty: l.qty, source: l.source })),
      });
      try { if (email.trim()) localStorage.setItem(EMAIL_KEY, email.trim()); } catch (e) {}
      setSentEmail(email.trim());
      setSentPdf(res && res.pdf_base64 ? res.pdf_base64 : null);
      setSentAt(new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }));
      setView('success');
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function downloadPdf() {
    if (!sentPdf) return;
    const bytes = Uint8Array.from(atob(sentPdf), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'Pawvy-Order-List.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (loading) {
    return (
      <Centered>
        <Loader2 className="spin" size={28} style={{ color: 'var(--orange)' }} />
      </Centered>
    );
  }

  if (loadError) {
    return (
      <Centered>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, marginBottom: 8 }}>Couldn't load the catalogue</div>
          <div style={{ fontSize: 13, color: 'rgba(245,242,235,.5)' }}>{loadError}</div>
        </div>
      </Centered>
    );
  }

  if (view === 'success') {
    const lab = { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#666', marginBottom: 5 };
    const th = (t, align) => <th style={{ fontSize: 10, letterSpacing: .6, textTransform: 'uppercase', color: '#14213d', padding: '7px 4px', borderBottom: '2px solid #14213d', textAlign: align }}>{t}</th>;
    const td = { padding: '7px 4px', borderBottom: '1px solid #e6e1d6', fontSize: 12, verticalAlign: 'middle' };
    const thumb = (u) => (u && u.startsWith('/api/uploads/') ? `${u}?trim=1&w=600` : u);
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '28px 12px 40px' }}>
        <div style={{ width: '100%', maxWidth: 640, textAlign: 'center' }}>
          <CheckCircle2 size={44} style={{ color: '#7fc93e', marginBottom: 10 }} />
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 1, marginBottom: 6 }}>ORDER SENT</div>
          <div style={{ fontSize: 13.5, color: 'rgba(245,242,235,.6)', lineHeight: 1.6, marginBottom: 16 }}>
            Thanks — we've received your order.
            {sentEmail && <> A copy has been emailed to <strong style={{ color: 'var(--cream)' }}>{sentEmail}</strong>.</>}
          </div>

          <div style={{ background: '#f5f2eb', padding: 10, borderRadius: 12, boxShadow: '0 6px 18px rgba(0,0,0,.45)' }}>
          <div style={{ background: '#fff', color: '#222', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,.2)', overflow: 'hidden', textAlign: 'left', fontFamily: 'Arial,Helvetica,sans-serif', fontSize: 12 }}>
            <div style={{ background: '#14213d', padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ width: 30, height: 30, background: 'var(--orange)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={PAWVY_LOGO_WHITE} alt="Pawvy" style={{ width: 20, height: 20, objectFit: 'contain' }} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>ORDER LIST</div>
                <div style={{ color: '#f36f4a', fontSize: 12, fontWeight: 600, marginTop: 3 }}>{sentAt}</div>
              </div>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: '2px solid #f0f2f5' }}>
              <div>
                <div style={lab}>From</div>
                <div style={{ fontSize: 11.5, color: '#444', lineHeight: 1.65 }}>
                  Pawvy Limited Partnership<br />39 Woodlands Close<br />Mega@Woodlands, #05-58, Unit 1H<br />Singapore 737856<br />
                  <strong style={{ color: '#14213d' }}>janicelee@pawvy.co</strong>
                </div>
              </div>
              <div>
                <div style={lab}>Ordered by</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#14213d' }}>{companyName.trim()}</div>
                {sentEmail && <div style={{ fontSize: 11.5, color: '#444', marginTop: 3 }}>{sentEmail}</div>}
              </div>
            </div>
            <div style={{ padding: '14px 22px 6px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{th('', 'left')}{th('Item', 'left')}{th('Qty', 'center')}{th('Unit price', 'right')}{th('Total', 'right')}</tr></thead>
                <tbody>
                  {cartLines.map(l => (
                    <tr key={l.product.id}>
                      <td style={{ ...td, width: 46 }}>
                        {l.product.image_url
                          ? <img src={thumb(l.product.image_url)} alt="" style={{ width: 38, height: 38, borderRadius: 6, border: '1px solid #dfe5ee', objectFit: 'contain', background: '#fff', display: 'block' }} />
                          : <div style={{ width: 38, height: 38, borderRadius: 6, background: '#eef2f7', border: '1px solid #dfe5ee' }} />}
                      </td>
                      <td style={td}>{l.product.item_series}{l.product.variation ? ` · ${l.product.variation}` : ''}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{l.qty}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{CURRENCY} {Number(l.product.price_wholesale || 0).toFixed(2)}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{CURRENCY} {(Number(l.product.price_wholesale || 0) * l.qty).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{ padding: '10px 4px', textAlign: 'right', fontSize: 13, color: '#14213d' }}>Subtotal</td>
                    <td style={{ padding: '10px 4px', textAlign: 'right', fontSize: 13, color: '#14213d', whiteSpace: 'nowrap', fontWeight: 700 }}>{CURRENCY} {(cartCents / 100).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              {notes.trim() && (
                <div style={{ background: '#f7f5ef', borderRadius: 8, padding: '9px 12px', fontSize: 11.5, color: '#445', margin: '10px 0' }}><strong>Notes:</strong> {notes.trim()}</div>
              )}
              <div style={{ fontSize: 11, color: '#667', lineHeight: 1.55, margin: '10px 0' }}>
                This is the list you submitted. Final prices, applicable discounts and any delivery fee will be reflected in your invoice. We'll be in touch shortly.
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: 14, fontStyle: 'italic', fontSize: 14, fontWeight: 600, color: '#14213d' }}>Thank you for the partnership !</div>
            <div style={{ background: '#f36f4a', height: 9 }} />
          </div>
          </div>

          {sentPdf && (
            <button onClick={downloadPdf} style={{ marginTop: 14, width: '100%', height: 44, borderRadius: 10, border: 'none', background: 'rgba(245,242,235,.1)', color: 'var(--cream)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              ⬇ Download PDF
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view === 'review') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <TopBar>
          <button onClick={() => setView('catalogue')} style={linkBtnStyle}>
            <ArrowLeft size={15} /> Back to catalogue
          </button>
        </TopBar>

        <div style={{ flex: 1, maxWidth: 640, width: '100%', margin: '0 auto', padding: '20px 16px 140px' }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 1, marginBottom: 16 }}>REVIEW YOUR ORDER</div>

          {cartLines.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(245,242,235,.4)', textAlign: 'center', padding: '40px 0' }}>
              Your cart is empty. <button onClick={() => setView('catalogue')} style={{ ...linkBtnStyle, display: 'inline' }}>Browse the catalogue</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cartLines.map(l => (
                <div key={l.product.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                  border: '1px solid rgba(245,242,235,.1)', borderRadius: 10, background: 'rgba(245,242,235,.03)',
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                    background: 'rgba(245,242,235,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {l.product.image_url
                      ? <img src={l.product.image_url} alt={l.product.item_series} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <ImageOff size={18} style={{ color: 'rgba(245,242,235,.2)' }} />}
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: l.product.brand_color, flexShrink: 0, width: 60 }}>
                    {l.product.brand_name}
                  </div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>
                    {l.product.item_series}
                    {l.product.variation && <span style={{ color: 'rgba(245,242,235,.5)' }}> · {l.product.variation}</span>}
                    <div style={{ fontSize: 11, color: 'rgba(245,242,235,.4)', fontWeight: 400, marginTop: 2 }}>
                      {CURRENCY} {parseFloat(l.product.price_wholesale).toFixed(2)} / unit
                    </div>
                  </div>
                  <QtyStepper value={l.qty} onChange={q => updateQty(l.product.id, q)} />
                  <button onClick={() => removeFromCart(l.product.id)} style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,.7)', cursor: 'pointer', padding: 4 }}>✕</button>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(245,242,235,.6)', padding: '8px 4px' }}>
                <span>Subtotal (before any applicable discount)</span>
                <strong style={{ color: 'var(--cream)' }}>{CURRENCY} {cartSubtotal.toFixed(2)}</strong>
              </div>

              {!dStatus.focOk ? (
                <div style={{ borderRadius: 10, padding: 12, fontSize: 12.5, lineHeight: 1.5, background: 'rgba(245,165,36,.1)', border: '1px solid rgba(245,165,36,.5)', color: '#ffd48a' }}>
                  Add <strong>{money(dStatus.focNeed)}</strong> more to get <strong>FOC delivery</strong>.
                  {topSellers.length > 0 && (
                    <div><button onClick={scrollToTopSellers} style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, color: 'var(--orange)', fontWeight: 700, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer' }}>See our top sellers ↓</button></div>
                  )}
                </div>
              ) : (
                <div style={{ borderRadius: 10, padding: 12, fontSize: 12.5, lineHeight: 1.6, background: 'rgba(127,201,62,.1)', border: '1px solid rgba(127,201,62,.45)', color: '#b9e68a' }}>
                  <div>✓ Free delivery unlocked</div>
                  {dStatus.ticks.map(t => <div key={t}>✓ {t}</div>)}
                  {dStatus.nudge && (
                    <div style={{ marginTop: 2 }}>
                      Add <strong>{money(dStatus.nudge.amount)}</strong> more to get a <strong>{dStatus.nudge.rebate} cash rebate</strong>.
                      {topSellers.length > 0 && (
                        <div><button onClick={scrollToTopSellers} style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, color: 'var(--orange)', fontWeight: 700, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer' }}>See our top sellers ↓</button></div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{
                marginTop: 4, marginBottom: 4, padding: 14,
                border: '1px solid rgba(245,242,235,.1)', borderRadius: 10, background: 'rgba(245,242,235,.03)',
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream)', marginBottom: 8, textDecoration: 'underline' }}>Delivery</div>
                {MARKET === 'MY' ? (
                  <>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <li style={{ fontSize: 12, color: 'rgba(245,242,235,.75)' }}>West Malaysia: order MYR 600 and above — free delivery</li>
                      <li style={{ fontSize: 12, color: 'rgba(245,242,235,.75)' }}>West Malaysia: order below MYR 600 — MYR 25 delivery fee</li>
                    </ul>
                    <div style={{ fontSize: 10.5, color: 'rgba(245,242,235,.35)', marginTop: 8 }}>
                      *Final delivery arrangement will be reflected in the invoice.
                    </div>
                  </>
                ) : (
                  <>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <li style={{ fontSize: 12, color: 'rgba(245,242,235,.75)' }}>Order $200 and above — FOC Delivery</li>
                      <li style={{ fontSize: 12, color: 'rgba(245,242,235,.75)' }}>Order $400 and above — Cash rebate $12 off</li>
                      <li style={{ fontSize: 12, color: 'rgba(245,242,235,.75)' }}>Order $600 and above — Cash rebate $30 off</li>
                    </ul>
                    <div style={{ fontSize: 10.5, color: 'rgba(245,242,235,.35)', marginTop: 8 }}>
                      *Relevant discount (where applicable) will be reflected in the invoice directly.
                    </div>
                  </>
                )}
              </div>

              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="Company Name *">
                  <input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Pawvy"
                    style={fieldInputStyle}
                  />
                </Field>
                <Field label="Email (optional) — send me a copy of this order">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@yourshop.com"
                    style={fieldInputStyle}
                  />
                </Field>
                <Field label="Notes (optional)">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. delivery timing, special instructions"
                    rows={3}
                    style={textareaStyle}
                  />
                </Field>
              </div>

              {topSellers.length > 0 && (
                <div id="top-sellers" style={{ marginTop: 14, scrollMarginTop: 70 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--cream)', marginBottom: 3 }}>
                    🔥 Our Top Sellers
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(245,242,235,.4)', marginBottom: 10, lineHeight: 1.4 }}>
                    Popular with other retailers over the last 3 months — worth adding to your order?
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                    gap: 10,
                  }}>
                    {topSellers.slice(0, isMobile ? 6 : 8).map(p => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        rank={p.rank}
                        cartQty={cart[p.id]?.qty || 0}
                        onAdd={(prod, qty) => addToCart(prod, qty, 'upsell')}
                        onUpdateQty={updateQty}
                        onRemove={removeFromCart}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}

              {submitError && (
                <div style={{ background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 7, padding: '10px 12px', fontSize: 12, color: '#f87171' }}>
                  {submitError}
                </div>
              )}
            </div>
          )}
        </div>

        {cartLines.length > 0 && (
          <BottomBar>
            <button onClick={handleSubmit} disabled={submitting} style={{ ...submitBtnStyle, width: '100%' }}>
              {submitting ? 'Submitting…' : 'Submit Order'}
            </button>
          </BottomBar>
        )}

        {prompt && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(5,10,22,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div role="dialog" aria-modal="true" style={{ background: '#1b2c4d', border: '1px solid rgba(245,242,235,.12)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 380 }}>
              {prompt === 'foc' ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Add {money(dStatus.focNeed)} for FOC delivery?</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(245,242,235,.65)', marginBottom: 16 }}>
                    Your current order is <strong style={{ color: 'var(--cream)' }}>{money(cartCents / 100)}</strong>. A delivery fee may apply to orders below {MONEY_SYMBOL}{FOC_AMOUNT}{MARKET === 'MY' ? ' (West Malaysia)' : ''}.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Add {money(dStatus.nudge.amount)} for a {dStatus.nudge.rebate} cash rebate?</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(245,242,235,.65)', marginBottom: 16 }}>
                    Your current order is <strong style={{ color: 'var(--cream)' }}>{money(cartCents / 100)}</strong>. Orders of {MONEY_SYMBOL}{dStatus.nudge.target} and above get a {dStatus.nudge.rebate} cash rebate.
                  </div>
                </>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => { setPrompt(null); setView('catalogue'); }} style={{ ...submitBtnStyle, width: '100%' }}>Add more items</button>
                <button onClick={doSubmit} style={{ height: 44, borderRadius: 10, border: 'none', background: 'rgba(245,242,235,.1)', color: 'var(--cream)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{prompt === 'foc' ? 'Proceed anyway' : 'Continue to submit'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // catalogue view
  return (
    <div style={{ minHeight: '100vh', paddingBottom: cartCount > 0 ? 112 : 24 }}>
      <TopBar>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: 'var(--orange)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={PAWVY_LOGO_WHITE} alt="Pawvy" style={{ width: 22, height: 22, objectFit: 'contain' }}/>
          </div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 1 }}>PAWVY ORDER PORTAL</div>
        </div>
      </TopBar>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '16px 16px 0' }}>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(245,242,235,.35)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            style={{ ...fieldInputStyle, width: '100%', paddingLeft: 36 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 14, WebkitOverflowScrolling: 'touch' }}>
          {brands.map(b => {
            const isAll = b === 'All';
            const color = isAll ? 'var(--orange)' : (brandColors[b] || 'var(--orange)');
            const active = activeBrand === b;
            return (
              <button
                key={b}
                onClick={() => setActiveBrand(b)}
                style={{
                  flexShrink: 0, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${active ? color : `${color}44`}`,
                  background: active ? `${color}22` : `${color}11`,
                  color, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {b}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', fontSize: 13, color: 'rgba(245,242,235,.35)' }}>
            No products match your search.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, paddingBottom: 20 }}>
            {filtered.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                cartQty={cart[p.id]?.qty || 0}
                onAdd={(prod, qty) => addToCart(prod, qty, 'catalogue')}
                onUpdateQty={updateQty}
                onRemove={removeFromCart}
                compact={isMobile}
              />
            ))}
          </div>
        )}
      </div>

      {cartCount > 0 && (
        <BottomBar>
          <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 7, color: dStatus.focOk ? '#7fc93e' : '#f5a524' }}>
            {!dStatus.focOk
              ? `Add ${money(dStatus.focNeed)} more for FOC delivery`
              : dStatus.nudge
                ? `Add ${money(dStatus.nudge.amount)} more for ${dStatus.nudge.rebate} cash rebate`
                : `✓ FOC delivery${dStatus.ticks.length ? ' · ✓ ' + dStatus.ticks[0].replace(' unlocked', '') : ''}`}
          </div>
          <button onClick={() => setView('review')} style={{ ...submitBtnStyle, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ShoppingCart size={16} />
            Review Order — {cartCount} item{cartCount !== 1 ? 's' : ''} · {money(cartCents / 100)}
          </button>
        </BottomBar>
      )}
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>;
}

function TopBar({ children }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--navy)', borderBottom: '1px solid rgba(245,242,235,.08)', padding: '14px 16px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  );
}

function BottomBar({ children }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10,
      background: 'var(--navy)', borderTop: '1px solid rgba(245,242,235,.1)',
      padding: '12px 16px', boxShadow: '0 -4px 16px rgba(0,0,0,.3)',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'rgba(245,242,235,.45)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

const linkBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
  color: 'rgba(245,242,235,.6)', fontSize: 13, cursor: 'pointer', padding: 4,
};

const fieldInputStyle = {
  height: 38, borderRadius: 8, border: '1px solid rgba(20,33,61,.15)',
  background: 'var(--cream)', color: 'var(--navy)', fontSize: 13.5,
  padding: '0 12px', fontFamily: "'Montserrat',sans-serif",
};

const textareaStyle = {
  minHeight: 76, borderRadius: 8, border: '1px solid rgba(20,33,61,.15)',
  background: 'var(--cream)', color: 'var(--navy)', fontSize: 13.5,
  padding: '10px 12px', fontFamily: "'Montserrat',sans-serif",
  resize: 'vertical', width: '100%', boxSizing: 'border-box',
};

const submitBtnStyle = {
  height: 46, borderRadius: 10, border: 'none', background: 'var(--orange)',
  color: 'var(--navy)', fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
};
