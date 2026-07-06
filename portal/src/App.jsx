import React, { useState, useEffect, useMemo } from 'react'
import { Search, ShoppingCart, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { portalApi } from './api.js'
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

export default function App() {
  const isMobile = useIsMobile();
  const [catalogue, setCatalogue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [activeBrand, setActiveBrand] = useState('All');
  const [cart, setCart] = useState({}); // { [product_id]: qty }
  const [view, setView] = useState('catalogue'); // catalogue | review | success
  const [companyName, setCompanyName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    portalApi.getCatalogue()
      .then(setCatalogue)
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
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
      .map(([id, qty]) => ({ product: byId[id], qty }))
      .filter(l => l.product);
  }, [cart, byId]);

  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const cartSubtotal = cartLines.reduce((s, l) => s + l.qty * (l.product.price_wholesale_sg || 0), 0);

  function addToCart(product, qty) {
    setCart(prev => ({ ...prev, [product.id]: (prev[product.id] || 0) + qty }));
  }
  function updateQty(productId, qty) {
    setCart(prev => ({ ...prev, [productId]: qty }));
  }
  function removeFromCart(productId) {
    setCart(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  async function handleSubmit() {
    if (!companyName.trim()) { setSubmitError('Please enter your company name.'); return; }
    if (cartLines.length === 0) { setSubmitError('Your cart is empty.'); return; }
    setSubmitting(true); setSubmitError('');
    try {
      await portalApi.submitOrder({
        company_name: companyName.trim(),
        notes: notes.trim() || null,
        items: cartLines.map(l => ({ product_id: l.product.id, qty: l.qty })),
      });
      setView('success');
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
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
    return (
      <Centered>
        <div style={{ textAlign: 'center', maxWidth: 360, padding: 24 }}>
          <CheckCircle2 size={48} style={{ color: '#7fc93e', marginBottom: 16 }} />
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 1, marginBottom: 8 }}>ORDER SENT</div>
          <div style={{ fontSize: 13.5, color: 'rgba(245,242,235,.6)', lineHeight: 1.6 }}>
            Thanks — we've received your order. Applicable discounts will be reflected in your invoice.
            We'll be in touch shortly.
          </div>
        </div>
      </Centered>
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
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: l.product.brand_color, flexShrink: 0, width: 60 }}>
                    {l.product.brand_name}
                  </div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>
                    {l.product.item_series}
                    {l.product.variation && <span style={{ color: 'rgba(245,242,235,.5)' }}> · {l.product.variation}</span>}
                    <div style={{ fontSize: 11, color: 'rgba(245,242,235,.4)', fontWeight: 400, marginTop: 2 }}>
                      SGD {parseFloat(l.product.price_wholesale_sg).toFixed(2)} / unit
                    </div>
                  </div>
                  <QtyStepper value={l.qty} onChange={q => updateQty(l.product.id, q)} />
                  <button onClick={() => removeFromCart(l.product.id)} style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,.7)', cursor: 'pointer', padding: 4 }}>✕</button>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(245,242,235,.6)', padding: '8px 4px' }}>
                <span>Subtotal (before any applicable discount)</span>
                <strong style={{ color: 'var(--cream)' }}>SGD {cartSubtotal.toFixed(2)}</strong>
              </div>

              <div style={{
                marginTop: 4, marginBottom: 4, padding: 14,
                border: '1px solid rgba(245,242,235,.1)', borderRadius: 10, background: 'rgba(245,242,235,.03)',
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream)', marginBottom: 8, textDecoration: 'underline' }}>Delivery</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li style={{ fontSize: 12, color: 'rgba(245,242,235,.75)' }}>Order &gt; $200 — FOC Delivery</li>
                  <li style={{ fontSize: 12, color: 'rgba(245,242,235,.75)' }}>Order &gt; $400 — Cash rebate $12 off</li>
                  <li style={{ fontSize: 12, color: 'rgba(245,242,235,.75)' }}>Order &gt; $600 — Cash rebate $30 off</li>
                </ul>
                <div style={{ fontSize: 10.5, color: 'rgba(245,242,235,.35)', marginTop: 8 }}>
                  *Relevant discount (where applicable) will be reflected in the invoice directly.
                </div>
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
                <Field label="Notes (optional)">
                  <input
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. delivery timing, special instructions"
                    style={fieldInputStyle}
                  />
                </Field>
              </div>

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
      </div>
    );
  }

  // catalogue view
  return (
    <div style={{ minHeight: '100vh', paddingBottom: cartCount > 0 ? 84 : 24 }}>
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
                cartQty={cart[p.id] || 0}
                onAdd={addToCart}
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
          <button onClick={() => setView('review')} style={{ ...submitBtnStyle, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ShoppingCart size={16} />
            Review Order — {cartCount} item{cartCount !== 1 ? 's' : ''}
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

const submitBtnStyle = {
  height: 46, borderRadius: 10, border: 'none', background: 'var(--orange)',
  color: 'var(--navy)', fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
};
