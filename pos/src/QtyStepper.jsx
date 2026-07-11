import React, { useState, useEffect } from 'react'
import { Minus, Plus } from 'lucide-react'

// Defined once, at module scope — never nested inside a parent component.
// That's the fix for input-focus-loss bugs (proven this session in the
// internal app): a component redefined on every parent render gets remounted
// by React, wiping any input's focus after a single keystroke.
//
// Separately: the number is kept as a local string ("raw") while typing, and
// only parsed/clamped to a valid integer on blur or Enter — not on every
// keystroke. Clamping mid-typing is what caused the field to snap back to
// "1" the instant it was cleared, making it impossible to type a fresh
// multi-digit value (typing "20" landed as "120" because the "1" never left).
export default function QtyStepper({ value, onChange, disabled }) {
  const [raw, setRaw] = useState(String(value));

  // Keep the displayed text in sync when the value changes from outside
  // (e.g. the +/- buttons, or the cart updating elsewhere) — but never while
  // the person is actively typing into this field.
  useEffect(() => { setRaw(String(value)); }, [value]);

  function commit() {
    const n = parseInt(raw, 10);
    if (!raw || isNaN(n) || n < 1) { setRaw('1'); onChange(1); return; }
    onChange(n);
    setRaw(String(n));
  }

  function step(delta) {
    const next = Math.max(1, value + delta);
    setRaw(String(next));
    onChange(next);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: disabled ? 0.4 : 1 }}>
      <button type="button" disabled={disabled} onClick={() => step(-1)} style={btnStyle}>
        <Minus size={14} />
      </button>
      <input
        type="number"
        min="1"
        value={raw}
        disabled={disabled}
        onChange={e => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { commit(); e.target.blur(); } }}
        style={inputStyle}
      />
      <button type="button" disabled={disabled} onClick={() => step(1)} style={btnStyle}>
        <Plus size={14} />
      </button>
    </div>
  );
}

const btnStyle = {
  width: 28, height: 28, borderRadius: 6,
  border: '1px solid rgba(245,242,235,.18)',
  background: 'rgba(245,242,235,.06)',
  color: 'var(--cream)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', flexShrink: 0,
};

const inputStyle = {
  width: 44, height: 28, textAlign: 'center',
  borderRadius: 6, border: '1px solid rgba(20,33,61,.15)',
  background: 'var(--cream)', color: 'var(--navy)',
  fontSize: 14, fontWeight: 600,
};
