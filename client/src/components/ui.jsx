import React from 'react';

/* ── Tokens ────────────────────────────────────────────────────── */
const s = {
  card: {
    background: 'var(--navy)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  },
  cardHead: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 14,
    letterSpacing: 1,
    color: 'var(--cream)',
  },
  cardBody: { padding: '16px' },
};

/* ── Card ──────────────────────────────────────────────────────── */
export function Card({ title, action, children, style }) {
  return (
    <div style={{ ...s.card, ...style }}>
      {title && (
        <div style={s.cardHead}>
          <span style={s.cardTitle}>{title}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── Button ────────────────────────────────────────────────────── */
export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', style }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: 'none', borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: "'Montserrat', sans-serif", fontWeight: 600, transition: 'opacity .15s',
    opacity: disabled ? 0.5 : 1,
  };
  const sizes   = { sm: { fontSize: 11, padding: '5px 10px' }, md: { fontSize: 12, padding: '8px 16px' }, lg: { fontSize: 13, padding: '10px 20px' } };
  const variants = {
    primary:  { background: 'var(--orange)',     color: '#fff' },
    secondary:{ background: 'var(--cream-10)',   color: 'var(--cream)' },
    danger:   { background: 'rgba(220,50,50,.15)', color: '#f87171' },
    ghost:    { background: 'transparent',       color: 'var(--cream-60)', border: '1px solid var(--border)' },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

/* ── Badge ─────────────────────────────────────────────────────── */
export function Badge({ children, color = '#888', textColor }) {
  const bg = color + '22';
  const tc = textColor || color;
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:4,
      fontSize:10, fontWeight:700, letterSpacing:.5, background:bg, color:tc }}>
      {children}
    </span>
  );
}

/* ── Input ─────────────────────────────────────────────────────── */
export function Input({ label, error, ...props }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:5 }}>
      {label && <span style={{ fontSize:11, fontWeight:600, color:'var(--cream-60)', letterSpacing:.5, textTransform:'uppercase' }}>{label}</span>}
      <input style={{
        background:'var(--navy-light)', border:`1px solid ${error?'#f87171':'var(--border)'}`,
        borderRadius:7, padding:'9px 12px', color:'var(--cream)', fontSize:13,
        outline:'none', width:'100%',
      }} {...props} />
      {error && <span style={{ fontSize:11, color:'#f87171' }}>{error}</span>}
    </label>
  );
}

/* ── Select ────────────────────────────────────────────────────── */
export function Select({ label, children, error, ...props }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:5 }}>
      {label && <span style={{ fontSize:11, fontWeight:600, color:'var(--cream-60)', letterSpacing:.5, textTransform:'uppercase' }}>{label}</span>}
      <select style={{
        background:'var(--navy-light)', border:`1px solid ${error?'#f87171':'var(--border)'}`,
        borderRadius:7, padding:'9px 12px', color:'var(--cream)', fontSize:13,
        outline:'none', width:'100%', cursor:'pointer',
      }} {...props}>
        {children}
      </select>
    </label>
  );
}

/* ── Modal ─────────────────────────────────────────────────────── */
export function Modal({ open, title, onClose, children, width = 560 }) {
  if (!open) return null;
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:999,
      background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background:'var(--navy)', border:'1px solid var(--border)',
        borderRadius:14, width, maxWidth:'95vw', maxHeight:'90vh',
        overflowY:'auto', boxShadow:'0 24px 60px rgba(0,0,0,.5)',
      }}>
        <div style={{ ...s.cardHead, padding:'14px 20px' }}>
          <span style={{ ...s.cardTitle, fontSize:16 }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--cream-60)', cursor:'pointer', fontSize:20, lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:20 }}>{children}</div>
      </div>
    </div>
  );
}

/* ── Table ─────────────────────────────────────────────────────── */
export function Table({ cols, rows, keyField = 'id', onRowClick, emptyMsg = 'No data yet' }) {
  if (!rows?.length) return (
    <div style={{ padding:40, textAlign:'center', color:'var(--cream-30)', fontSize:13 }}>{emptyMsg}</div>
  );
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{
                padding:'9px 14px', textAlign: c.align||'left',
                fontSize:10, fontWeight:600, letterSpacing:.8, textTransform:'uppercase',
                color:'var(--cream-30)', borderBottom:'1px solid var(--border)',
                whiteSpace:'nowrap',
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row[keyField] ?? i}
              onClick={() => onRowClick?.(row)}
              style={{ borderBottom:'1px solid var(--cream-05)', cursor: onRowClick ? 'pointer' : 'default', transition:'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--cream-05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {cols.map(c => (
                <td key={c.key} style={{ padding:'10px 14px', color:'var(--cream)', verticalAlign:'middle', textAlign:c.align||'left' }}>
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── KPI Card ──────────────────────────────────────────────────── */
export function KpiCard({ label, value, sub, featured, trend, trendUp }) {
  return (
    <div style={{
      background: featured ? 'var(--navy)' : 'var(--navy-light)',
      border: featured ? `1px solid var(--orange)` : '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '14px 16px',
    }}>
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', color:'var(--cream-30)', marginBottom:8 }}>{label}</div>
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color: featured ? 'var(--orange)' : 'var(--cream)', letterSpacing:.5, lineHeight:1 }}>{value}</div>
      {sub   && <div style={{ fontSize:10, color:'var(--cream-30)', marginTop:5 }}>{sub}</div>}
      {trend && (
        <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700,
          padding:'2px 8px', borderRadius:4,
          background: trendUp ? 'rgba(99,153,34,.15)' : 'rgba(248,113,113,.12)',
          color: trendUp ? '#7fc93e' : '#f87171' }}>
          {trendUp ? '↑' : '↓'} {trend}
        </div>
      )}
    </div>
  );
}

/* ── Page Layout ───────────────────────────────────────────────── */
export function Page({ title, subtitle, action, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, height:'100%' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:1.5, color:'var(--cream)' }}>{title}</h1>
          {subtitle && <div style={{ fontSize:11, color:'var(--cream-30)', marginTop:3 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ── Form Row ──────────────────────────────────────────────────── */
export function FormRow({ children, cols = 2 }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:14 }}>
      {children}
    </div>
  );
}

/* ── Divider ───────────────────────────────────────────────────── */
export function Divider({ label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, margin:'4px 0' }}>
      {label && <span style={{ fontSize:10, fontWeight:700, letterSpacing:1, textTransform:'uppercase', color:'var(--cream-30)', whiteSpace:'nowrap' }}>{label}</span>}
      <div style={{ flex:1, height:1, background:'var(--border)' }} />
    </div>
  );
}

/* ── Currency formatter ────────────────────────────────────────── */
export const fmt = {
  sgd:  (v) => v == null ? '—' : `SGD ${parseFloat(v).toFixed(2)}`,
  myr:  (v) => v == null ? '—' : `MYR ${parseFloat(v).toFixed(2)}`,
  aud:  (v) => v == null ? '—' : `AUD ${parseFloat(v).toFixed(2)}`,
  num:  (v) => v == null ? '—' : parseFloat(v).toLocaleString(),
  pct:  (v) => v == null ? '—' : `${parseFloat(v).toFixed(1)}%`,
  date: (v) => v ? new Date(v).toLocaleDateString('en-SG', { day:'numeric', month:'short', year:'numeric' }) : '—',
};
