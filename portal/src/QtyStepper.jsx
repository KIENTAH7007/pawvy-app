import React from 'react'
import { Minus, Plus } from 'lucide-react'

// Defined once, at module scope — never nested inside a parent component.
// That's the actual fix for input-focus-loss bugs (proven this session in the
// internal app): a component redefined on every parent render gets remounted
// by React, wiping any input's focus after a single keystroke. A stable,
// top-level component like this one can safely use a normal controlled input.
export default function QtyStepper({ value, onChange, disabled }) {
  function commit(raw) {
    const n = parseInt(raw, 10);
    if (!raw || isNaN(n) || n < 1) { onChange(1); return; }
    onChange(n);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: disabled ? 0.4 : 1 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(Math.max(1, value - 1))}
        style={btnStyle}
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        min="1"
        value={value}
        disabled={disabled}
        onChange={e => commit(e.target.value)}
        style={inputStyle}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        style={btnStyle}
      >
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
  // Light input background per the approved mockup — distinguishes the
  // editable field from the dark surrounding surface at a glance.
};
