import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Card, Btn, Input, Select, FormRow, Badge } from '../components/ui';

// Starting presets only — base FX rate and buffer % are always editable, since
// real rates drift and KT already flagged the flat buffer as a rough planning
// number, not gospel. Buffer here covers GST + shipping + import permit + misc
// fees ONLY. FX markup (the "purposely put higher" rate) is a separate input —
// it is NOT baked into these buffer percentages.
const COUNTRY_PRESETS = {
  korea:  { label: 'Korea (KRW)',  buffer: 20, fx: 0.0057 },
  china:  { label: 'China (CNY)',  buffer: 10, fx: 0.19 },
  europe: { label: 'Europe / US',  buffer: 30, fx: 1.72 },
};

function statusFor(pawvyMargin) {
  if (pawvyMargin >= 25) return { label: 'Healthy', color: '#7fc93e' };
  if (pawvyMargin >= 15) return { label: 'Watch',   color: '#F7B731' };
  return                       { label: 'Risky',    color: '#f87171' };
}

const fmtSgd = (v) => (isFinite(v) ? `S$${v.toFixed(2)}` : '—');
const fmtPct = (v) => (isFinite(v) ? `${v.toFixed(1)}%` : '—');

// Parses one pasted line into { name, cost, msrp } — handles three real-world
// formats without asking the person to pick one:
//   1. Simple:        "Salmon Oil 250ml, 8, 24"                  (comma, 3 fields)
//   2. Excel tab-paste: "SKU\tFreeze Dried\tPollack\t125g\t$11.24\t96\t$31.50"
//   3. Plain-text paste (columns aligned with runs of spaces), same shape as #2
// Strategy: split into cells using whichever delimiter the line actually has
// (tab > multi-space > comma), then find price columns by their $ prefix —
// first $ value is cost, last $ value is MSRP. Everything else becomes the
// name, except bare integer cells (like a case-quantity column, e.g. "96"),
// which are dropped since they're not descriptive text.
function splitCells(line) {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim());
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map(c => c.trim());
  return line.split(',').map(c => c.trim());
}

function parseNumeric(cell) {
  const n = parseFloat(String(cell).replace(/[$,]/g, '').trim());
  return isNaN(n) ? null : n;
}

function parsePriceListLine(line) {
  const cells = splitCells(line).filter(c => c !== '');
  if (cells.length < 2) return null;

  const dollarIdx = [];
  cells.forEach((c, i) => { if (/^\$/.test(c) && parseNumeric(c) !== null) dollarIdx.push(i); });

  let costIdx, msrpIdx;
  if (dollarIdx.length >= 2) {
    costIdx = dollarIdx[0];
    msrpIdx = dollarIdx[dollarIdx.length - 1];
  } else if (cells.length === 3) {
    // Legacy simple format: name, cost, msrp — no $ signs needed
    costIdx = 1; msrpIdx = 2;
  } else {
    const numericIdx = [];
    cells.forEach((c, i) => { if (parseNumeric(c) !== null) numericIdx.push(i); });
    if (numericIdx.length < 2) return null;
    costIdx = numericIdx[0];
    msrpIdx = numericIdx[numericIdx.length - 1];
  }

  const cost = parseNumeric(cells[costIdx]);
  const msrp = parseNumeric(cells[msrpIdx]);
  if (cost === null || msrp === null) return null;

  const name = cells
    .filter((c, i) => i !== costIdx && i !== msrpIdx && !/^\d+$/.test(c)) // drop bare-integer qty columns
    .join(' ')
    .trim();

  return { name: name || `SKU ${cost}/${msrp}`, cost, msrp };
}

const cellInput = {
  background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '6px 8px', color: 'var(--cream)', fontSize: 12,
};

let nextId = 1;

// Defined at module scope, not nested inside NewBrandPricing — nested row
// components remount on every parent render and wipe input focus on each
// keystroke (bit the team before on Restock Checklist / Cost Reference).
function SkuRow({ sku, calc, universal, globalMargin, onChange, onRemove }) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(245,242,235,.06)' }}>
      <td style={{ padding: '6px 4px' }}>
        <input type="checkbox" checked={sku.selected}
          onChange={e => onChange(sku.id, 'selected', e.target.checked)}
          style={{ width: 14, height: 14 }} />
      </td>
      <td style={{ padding: '6px 4px' }}>
        <input value={sku.name} onChange={e => onChange(sku.id, 'name', e.target.value)}
          style={{ ...cellInput, width: 160 }} />
      </td>
      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
        <input type="number" step="0.1" value={sku.cost}
          onChange={e => onChange(sku.id, 'cost', parseFloat(e.target.value) || 0)}
          style={{ ...cellInput, width: 72, textAlign: 'right' }} />
      </td>
      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
        <input type="number" step="1" value={sku.msrp}
          onChange={e => onChange(sku.id, 'msrp', parseFloat(e.target.value) || 0)}
          style={{ ...cellInput, width: 72, textAlign: 'right' }} />
      </td>
      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
        {universal
          ? <span style={{ color: 'var(--cream-30)' }}>{globalMargin}%</span>
          : <input type="number" step="1" value={sku.retMargin}
              onChange={e => onChange(sku.id, 'retMargin', parseFloat(e.target.value) || 0)}
              style={{ ...cellInput, width: 56, textAlign: 'right' }} />}
      </td>
      <td style={{ padding: '6px 4px', textAlign: 'right', color: 'var(--cream-60)' }}>{fmtSgd(calc.landedCost)}</td>
      <td style={{ padding: '6px 4px', textAlign: 'right', color: 'var(--cream)' }}>{fmtSgd(calc.rrp)}</td>
      <td style={{ padding: '6px 4px', textAlign: 'right', color: 'var(--cream)' }}>{fmtSgd(calc.wholesale)}</td>
      <td style={{ padding: '6px 4px', textAlign: 'right', color: 'var(--cream)' }}>{fmtPct(calc.pawvyMargin)}</td>
      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
        <Badge color={calc.status.color}>{calc.status.label}</Badge>
      </td>
      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
        <button onClick={() => onRemove(sku.id)} aria-label="Remove SKU"
          style={{ background: 'none', border: 'none', color: 'var(--cream-30)', cursor: 'pointer', fontSize: 14 }}>
          🗑
        </button>
      </td>
    </tr>
  );
}

function thStyle(align = 'left') {
  return {
    padding: '9px 6px', textAlign: align, fontSize: 9.5, fontWeight: 700,
    letterSpacing: .7, textTransform: 'uppercase', color: 'var(--cream-30)',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  };
}

export default function NewBrandPricing() {
  const navigate = useNavigate();

  const [country, setCountry]     = useState('europe');
  const [fxBase, setFxBase]       = useState(COUNTRY_PRESETS.europe.fx);
  const [fxMarkup, setFxMarkup]   = useState(5);
  const [countryBuffer, setCountryBuffer] = useState(COUNTRY_PRESETS.europe.buffer);
  const [universal, setUniversal] = useState(true);
  const [globalMargin, setGlobalMargin] = useState(40);
  const [csvText, setCsvText]     = useState('');
  const [importWarning, setImportWarning] = useState('');
  const [skus, setSkus] = useState([
    { id: nextId++, name: 'Sample SKU', cost: 10, msrp: 30, retMargin: 40, selected: true },
  ]);

  function handleCountryChange(key) {
    setCountry(key);
    setCountryBuffer(COUNTRY_PRESETS[key].buffer);
    setFxBase(COUNTRY_PRESETS[key].fx);
  }

  function updateSku(id, field, value) {
    setSkus(list => list.map(s => (s.id === id ? { ...s, [field]: value } : s)));
  }
  function removeSku(id) {
    setSkus(list => list.filter(s => s.id !== id));
  }
  function addSku() {
    setSkus(list => [...list, { id: nextId++, name: 'New SKU', cost: 10, msrp: 30, retMargin: globalMargin, selected: true }]);
  }
  function importPriceList() {
    const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
    const added = [];
    const failed = [];
    lines.forEach(line => {
      const parsed = parsePriceListLine(line);
      if (parsed) {
        added.push({ id: nextId++, name: parsed.name, cost: parsed.cost, msrp: parsed.msrp, retMargin: globalMargin, selected: true });
      } else {
        failed.push(line);
      }
    });
    if (added.length) setSkus(list => [...list, ...added]);
    setImportWarning(failed.length ? `Couldn't read ${failed.length} line(s) — check they have at least a cost and an MSRP value.` : '');
    setCsvText('');
  }

  // RRP conversion uses the base market rate only — no FX markup, no country
  // buffer — since RRP should reflect a real market conversion, not a padded
  // cost figure. FX markup applies to the cost side only, per KT's confirmed
  // formula: Landed Cost = Cost × FX (marked up) × (1 + country buffer%).
  const fxEffective = fxBase * (1 + fxMarkup / 100);

  function calcFor(sku) {
    const rowMargin = universal ? globalMargin : sku.retMargin;
    const landedCost = sku.cost * fxEffective * (1 + countryBuffer / 100);
    const rrp = sku.msrp * fxBase;
    const wholesale = rrp * (1 - rowMargin / 100);
    const pawvyMargin = wholesale > 0 ? ((wholesale - landedCost) / wholesale) * 100 : 0;
    return { landedCost, rrp, wholesale, pawvyMargin, status: statusFor(pawvyMargin) };
  }

  function addSelectedToProducts() {
    const selected = skus.filter(s => s.selected);
    if (!selected.length) return;
    const pendingImport = selected.map(s => {
      const c = calcFor(s);
      return {
        item_series: s.name,
        unit_cost: c.landedCost.toFixed(2),
        price_wholesale_sg: c.wholesale.toFixed(2),
        price_rrp_sg: c.rrp.toFixed(2),
      };
    });
    // Nothing is written to the database here — this hands off pre-filled
    // values to the normal Add Product form, one SKU at a time, so brand,
    // barcode, images, and market pricing still get reviewed before saving.
    navigate('/products', { state: { pendingImport } });
  }

  const selectedCount = skus.filter(s => s.selected).length;

  return (
    <Page title="NEW BRAND PRICING"
      subtitle="What-if calculator for pricing a new brand's price list — nothing saves until you add it to Products & Pricing">

      <Card title="Shared Settings">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormRow cols={3}>
            <Select label="Country" value={country} onChange={e => handleCountryChange(e.target.value)}>
              {Object.entries(COUNTRY_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}, {v.buffer}% buffer</option>
              ))}
            </Select>
            <Input label="Base market FX rate (to SGD)" type="number" step="0.001"
              value={fxBase} onChange={e => setFxBase(parseFloat(e.target.value) || 0)} />
            <Input label="FX markup % (cost only, purposely higher)" type="number" step="1"
              value={fxMarkup} onChange={e => setFxMarkup(parseFloat(e.target.value) || 0)} />
          </FormRow>

          <FormRow cols={2}>
            <Input label="Country buffer % (GST + shipping + permit + misc)" type="number" step="1"
              value={countryBuffer} onChange={e => setCountryBuffer(parseFloat(e.target.value) || 0)} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cream-60)', letterSpacing: .5, textTransform: 'uppercase' }}>
                  Retailer margin target
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--cream-30)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={universal} onChange={e => setUniversal(e.target.checked)}
                    style={{ width: 13, height: 13 }} />
                  Universal
                </label>
              </div>
              <input type="number" step="1" value={globalMargin}
                onChange={e => setGlobalMargin(parseFloat(e.target.value) || 0)}
                style={{ width: '100%', background: 'var(--navy-light)', border: '1px solid var(--border)',
                  borderRadius: 7, padding: '9px 12px', color: 'var(--cream)', fontSize: 13 }} />
              {!universal && (
                <div style={{ fontSize: 10, color: 'var(--cream-30)', marginTop: 5 }}>
                  Uncheck applies per-row — edit each SKU's margin in the table below.
                </div>
              )}
            </div>
          </FormRow>

          <div style={{ fontSize: 11, color: 'var(--cream-30)' }}>
            Effective FX for cost (with markup): <strong style={{ color: 'var(--cream-60)' }}>{fxEffective.toFixed(3)}</strong>
            {' '}— RRP conversion uses the base rate only, no markup or buffer applied.
          </div>
        </div>
      </Card>

      <Card title="Paste Price List">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--cream-30)' }}>
            Paste directly from Excel, plain text, or type manually — cost and MSRP are found automatically
            from values with a $ sign; everything else becomes the SKU name (quantity/case-count columns are dropped).
          </div>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={5}
            placeholder={'Works with any of these, pasted directly:\nSalmon Oil 250ml, 8, 24\nEFDF-Pollack125\tFreeze Dried\tPollack\t125g\t$11.24\t96\t$31.50'}
            style={{ width: '100%', background: 'var(--navy-light)', border: '1px solid var(--border)',
              borderRadius: 7, padding: '9px 12px', color: 'var(--cream)', fontSize: 12,
              fontFamily: 'monospace', resize: 'vertical', whiteSpace: 'pre' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Btn variant="secondary" size="sm" onClick={importPriceList} disabled={!csvText.trim()}>Import Rows</Btn>
            {importWarning && <span style={{ fontSize: 11, color: '#F7B731' }}>⚠ {importWarning}</span>}
          </div>
        </div>
      </Card>

      <Card title={`SKUs (${skus.length})`} action={<Btn size="sm" variant="ghost" onClick={addSku}>+ Add SKU</Btn>}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 840 }}>
            <thead>
              <tr>
                <th style={thStyle()}></th>
                <th style={thStyle()}>SKU</th>
                <th style={thStyle('right')}>Cost (FCY)</th>
                <th style={thStyle('right')}>MSRP (FCY)</th>
                <th style={thStyle('right')}>Ret. Margin</th>
                <th style={thStyle('right')}>Landed Cost</th>
                <th style={thStyle('right')}>RRP</th>
                <th style={thStyle('right')}>Wholesale</th>
                <th style={thStyle('right')}>Pawvy Margin</th>
                <th style={thStyle('right')}>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {skus.length === 0
                ? <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: 'var(--cream-30)' }}>
                    No SKUs yet — paste a price list above or add one manually.
                  </td></tr>
                : skus.map(sku => (
                    <SkuRow key={sku.id} sku={sku} calc={calcFor(sku)} universal={universal} globalMargin={globalMargin}
                      onChange={updateSku} onRemove={removeSku} />
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 8 }}>
        <Btn size="lg" onClick={addSelectedToProducts} disabled={selectedCount === 0}>
          Add {selectedCount > 0 ? `${selectedCount} Selected ` : ''}to Products &amp; Pricing →
        </Btn>
      </div>
    </Page>
  );
}
