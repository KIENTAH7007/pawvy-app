import React, { useState } from 'react'
import { ImageOff, Check, X } from 'lucide-react'
import QtyStepper from './QtyStepper.jsx'

const STOCK_LABEL = {
  available:    { text: 'Available',    color: '#7fc93e' },
  low_stock:    { text: 'Low Stock',    color: '#fbbf24' },
  out_of_stock: { text: 'Out of Stock', color: '#f87171' },
};

const sgd = v => `SGD ${parseFloat(v || 0).toFixed(2)}`;

export default function ProductCard({ product, cartQty, onAdd, onUpdateQty, onRemove, compact }) {
  const [pendingQty, setPendingQty] = useState(1);
  const stock = STOCK_LABEL[product.stock_status] || STOCK_LABEL.available;
  const outOfStock = product.stock_status === 'out_of_stock';
  const inCart = cartQty > 0;

  return (
    <div style={{
      border: '1px solid rgba(245,242,235,.1)',
      borderRadius: 10,
      background: 'rgba(245,242,235,.03)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      opacity: outOfStock ? 0.55 : 1,
    }}>
      <div style={{
        aspectRatio: '1 / 1', background: 'rgba(245,242,235,.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {product.image_data
          ? <img src={product.image_data} alt={product.item_series} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <ImageOff size={28} style={{ color: 'rgba(245,242,235,.2)' }} />}
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <span style={{
          alignSelf: 'flex-start', fontSize: 9.5, fontWeight: 700, letterSpacing: .5,
          textTransform: 'uppercase', padding: '2px 8px', borderRadius: 20,
          background: `${product.brand_color}22`, color: product.brand_color,
        }}>
          {product.brand_name}
        </span>

        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', lineHeight: 1.3 }}>
          {product.item_series}
          {product.variation && <span style={{ color: 'rgba(245,242,235,.5)' }}> · {product.variation}</span>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 2 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .4, textTransform: 'uppercase', color: 'rgba(245,242,235,.35)' }}>Your Price</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--orange)' }}>{sgd(product.price_wholesale_sg)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: .4, textTransform: 'uppercase', color: 'rgba(245,242,235,.35)' }}>RRP</div>
            <div style={{ fontSize: 12, color: 'rgba(245,242,235,.5)' }}>{sgd(product.price_rrp_sg)}</div>
          </div>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 600, color: stock.color, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: stock.color, display: 'inline-block' }} />
          {stock.text}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'stretch' : 'center', gap: 8 }}>
          {inCart ? (
            <>
              <QtyStepper value={cartQty} onChange={q => onUpdateQty(product.id, q)} disabled={outOfStock} />
              <button
                onClick={() => onRemove(product.id)}
                style={{ marginLeft: compact ? 0 : 'auto', display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start', gap: 4, fontSize: 11, color: 'rgba(248,113,113,.8)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={13} /> Remove
              </button>
            </>
          ) : outOfStock ? (
            <div style={{ width: '100%', textAlign: 'center', fontSize: 11.5, color: 'rgba(245,242,235,.35)', padding: '6px 0' }}>
              Currently unavailable
            </div>
          ) : (
            <>
              <QtyStepper value={pendingQty} onChange={setPendingQty} />
              <button
                onClick={() => { onAdd(product, pendingQty); setPendingQty(1); }}
                style={{
                  marginLeft: compact ? 0 : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontSize: 12, fontWeight: 700, color: 'var(--navy)', background: 'var(--orange)',
                  border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
                }}
              >
                <Check size={13} /> Add
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
