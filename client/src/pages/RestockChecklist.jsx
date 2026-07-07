import React, { useState, useEffect } from 'react';
import { Plus, ArrowLeft, Trash2, Truck, Sparkles, Check, Search } from 'lucide-react';
import { restockApi, productsApi } from '../api';
import { Page, Card, Input, Select, Btn, Badge, Divider } from '../components/ui';

const DIRECTION_LABEL = { storhub_to_home: 'Storhub → Home', home_to_storhub: 'Home → Storhub' };
const STATUS_COLOR = { draft: '#888', in_progress: '#378ADD', completed: '#639922' };

export default function RestockChecklist() {
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null); // which checklist is open in detail view
  const [statusFilter, setStatusFilter] = useState('pending'); // 'all' | 'pending' | 'done'

  const load = () => restockApi.getAll().then(c => { setChecklists(c); setLoading(false); });
  useEffect(() => { load(); }, []);

  async function newChecklist() {
    const c = await restockApi.create({ direction: 'storhub_to_home' });
    await load();
    setOpenId(c.id);
  }

  if (openId) {
    return <ChecklistDetail id={openId} onBack={() => { setOpenId(null); load(); }} />;
  }

  const visible = checklists.filter(c => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'done') return c.status === 'completed';
    return c.status !== 'completed'; // pending = draft or in_progress
  });
  const pendingCount = checklists.filter(c => c.status !== 'completed').length;
  const doneCount = checklists.filter(c => c.status === 'completed').length;

  return (
    <Page
      title="Restock Checklist"
      subtitle="Prep a Storhub ↔ Home transfer, check items off as you collect them, then commit in one go"
      action={<Btn onClick={newChecklist}><Plus size={14} /> New checklist</Btn>}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[
          { key: 'pending', label: `Pending (${pendingCount})` },
          { key: 'done', label: `Done (${doneCount})` },
          { key: 'all', label: 'All' },
        ].map(t => (
          <button key={t.key} onClick={() => setStatusFilter(t.key)} style={{
            padding: '6px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${statusFilter === t.key ? 'var(--orange)' : 'var(--border)'}`,
            background: statusFilter === t.key ? 'rgba(243,111,74,.12)' : 'transparent',
            color: statusFilter === t.key ? 'var(--orange)' : 'var(--cream-60)',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)', fontSize: 13 }}>
          {statusFilter === 'pending' ? 'No pending checklists. Click "New checklist" to start one.' : 'Nothing here.'}
        </div></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(c => (
            <Card key={c.id}>
              <div onClick={() => setOpenId(c.id)} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <Truck size={18} style={{ color: 'var(--cream-30)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {c.label || `Checklist #${c.id}`}
                    <Badge color={STATUS_COLOR[c.status]}>{c.status.replace('_', ' ')}</Badge>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--cream-30)', marginTop: 3 }}>
                    {DIRECTION_LABEL[c.direction]} · {c.checked_count}/{c.item_count} checked
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}

function ChecklistDetail({ id, onBack }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [suggestions, setSuggestions] = useState(null); // null = not loaded, [] = loaded empty
  const [suggestionsPicked, setSuggestionsPicked] = useState({}); // product_id -> qty

  const refresh = () => restockApi.get(id).then(setData);
  useEffect(() => { refresh(); }, [id]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      productsApi.getAll({ search, active: true }).then(r => setSearchResults(r.slice(0, 8)));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  if (!data) return <Page title="Loading…"><div /></Page>;
  const isDraftOrProgress = data.status !== 'completed';

  async function addItem(product) {
    await restockApi.addItem(id, { product_id: product.id, qty_planned: 1 });
    setSearch(''); setSearchResults([]);
    refresh();
  }

  async function updateItem(itemId, fields) {
    await restockApi.updateItem(itemId, fields);
    refresh();
  }

  async function removeItem(itemId) {
    await restockApi.deleteItem(itemId);
    refresh();
  }

  async function toggleChecked(item) {
    // Checking an item defaults qty_taken to qty_planned if not already set
    const fields = { checked: item.checked ? 0 : 1 };
    if (!item.checked && item.qty_taken == null) fields.qty_taken = item.qty_planned;
    await updateItem(item.id, fields);
  }

  async function loadSuggestions() {
    setBusy(true);
    try {
      const s = await restockApi.suggestions();
      setSuggestions(s);
      const picked = {};
      s.forEach(sg => { picked[sg.product_id] = sg.suggested_qty; });
      setSuggestionsPicked(picked);
    } finally { setBusy(false); }
  }

  async function addPickedSuggestions() {
    const items = Object.entries(suggestionsPicked)
      .filter(([, qty]) => qty > 0)
      .map(([product_id, qty_planned]) => ({ product_id: parseInt(product_id), qty_planned }));
    if (!items.length) return;
    setBusy(true);
    try {
      await restockApi.addItemsBulk(id, items);
      setSuggestions(null);
      refresh();
    } finally { setBusy(false); }
  }

  async function complete() {
    setBusy(true); setError('');
    try {
      const result = await restockApi.complete(id);
      refresh();
      alert(`Transferred ${result.transferred.length} item${result.transferred.length !== 1 ? 's' : ''} — Inventory updated.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const checkedCount = data.items.filter(i => i.checked).length;

  return (
    <Page
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--cream-60)', cursor: 'pointer', padding: 4 }}><ArrowLeft size={20} /></button>
          {data.label || `Checklist #${data.id}`}
        </div>
      }
      subtitle={<Badge color={STATUS_COLOR[data.status]}>{data.status.replace('_', ' ')}</Badge>}
    >
      {error && (
        <div style={{ background: 'rgba(226,75,74,.1)', border: '1px solid rgba(226,75,74,.3)', color: '#E24B4A', padding: '10px 14px', borderRadius: 7, fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <Input label="Label" value={data.label || ''} placeholder="e.g. Storhub run — 6 Jul"
          onChange={e => setData(d => ({ ...d, label: e.target.value }))}
          onBlur={e => restockApi.update(id, { label: e.target.value })}
          disabled={!isDraftOrProgress} />
        <Select label="Direction" value={data.direction}
          onChange={e => { restockApi.update(id, { direction: e.target.value }); setData(d => ({ ...d, direction: e.target.value })); }}
          disabled={!isDraftOrProgress}>
          <option value="storhub_to_home">Storhub → Home (common)</option>
          <option value="home_to_storhub">Home → Storhub (rare)</option>
        </Select>
      </div>

      {isDraftOrProgress && (
        <>
          <Divider label="Add items" />

          {data.direction === 'storhub_to_home' && (
            <div style={{ marginBottom: 14 }}>
              {suggestions === null ? (
                <Btn size="sm" variant="secondary" onClick={loadSuggestions} disabled={busy}>
                  <Sparkles size={14} /> Add suggested transfers
                </Btn>
              ) : (
                <Card>
                  <div style={{ padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', marginBottom: 10 }}>
                      Suggested — running low at Home ({suggestions.length})
                    </div>
                    {suggestions.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--cream-30)' }}>Nothing looks low right now — Home stock looks healthy.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {suggestions.map(s => (
                          <div key={s.product_id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--cream-05)' }}>
                            <input type="checkbox" checked={suggestionsPicked[s.product_id] > 0}
                              onChange={e => setSuggestionsPicked(p => ({ ...p, [s.product_id]: e.target.checked ? s.suggested_qty : 0 }))}
                              style={{ width: 20, height: 20, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 600 }}>{s.item_series}{s.variation ? ` — ${s.variation}` : ''}</div>
                              <div style={{ fontSize: 11, color: 'var(--cream-30)' }}>
                                {s.brand_name} · Home: {s.home_qty} · Storhub: {s.storhub_qty}
                                {s.reason === 'out_of_stock' ? ' · Out of stock at Home' : ` · ~${s.days_remaining}d left at Home`}
                              </div>
                            </div>
                            <Input type="number" value={suggestionsPicked[s.product_id] || ''} style={{ width: 64 }}
                              onChange={e => setSuggestionsPicked(p => ({ ...p, [s.product_id]: parseInt(e.target.value) || 0 }))} />
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <Btn size="sm" onClick={addPickedSuggestions} disabled={busy}>Add selected</Btn>
                      <Btn size="sm" variant="secondary" onClick={() => setSuggestions(null)}>Cancel</Btn>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          <div style={{ position: 'relative', marginBottom: 14 }}>
            <Input
              label="Search SKU to add manually"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type a product name…"
            />
            {searchResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 260, overflowY: 'auto' }}>
                {searchResults.map(p => (
                  <div key={p.id} onClick={() => addItem(p)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--cream-05)', fontSize: 13, color: 'var(--cream)' }}>
                    {p.item_series}{p.variation ? ` — ${p.variation}` : ''}
                    <span style={{ color: 'var(--cream-30)', fontSize: 11 }}> · {p.brand_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <Divider label={`Checklist (${checkedCount}/${data.items.length} checked)`} />
      {data.items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--cream-30)', padding: '20px 0', textAlign: 'center' }}>
          No items yet — add some above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {data.items.map(item => (
            <Card key={item.id} style={item.checked ? { borderColor: 'rgba(99,153,34,.4)' } : undefined}>
              <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                {isDraftOrProgress ? (
                  <button onClick={() => toggleChecked(item)} style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0, border: `2px solid ${item.checked ? '#639922' : 'var(--border)'}`,
                    background: item.checked ? '#639922' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    {item.checked && <Check size={18} color="#fff" />}
                  </button>
                ) : (
                  item.checked && <Check size={18} color="#639922" style={{ flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--cream)' }}>
                    {item.item_series}{item.variation ? ` — ${item.variation}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--cream-30)' }}>{item.brand_name} · Planned: {item.qty_planned}</div>
                </div>
                {isDraftOrProgress ? (
                  <Input type="number" value={item.qty_taken ?? ''} placeholder={String(item.qty_planned)}
                    style={{ width: 64 }}
                    onChange={e => setData(d => ({ ...d, items: d.items.map(i => i.id === item.id ? { ...i, qty_taken: e.target.value } : i) }))}
                    onBlur={e => updateItem(item.id, { qty_taken: e.target.value ? parseInt(e.target.value) : item.qty_planned })} />
                ) : (
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{item.qty_taken ?? item.qty_planned}</div>
                )}
                {isDraftOrProgress && (
                  <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--cream-30)', cursor: 'pointer', padding: 6 }}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {isDraftOrProgress && data.items.length > 0 && (
        <Btn onClick={complete} disabled={busy || checkedCount === 0} style={{ width: '100%' }}>
          {busy ? 'Transferring…' : `Complete checklist & transfer (${checkedCount} item${checkedCount !== 1 ? 's' : ''})`}
        </Btn>
      )}
      {data.status === 'completed' && (
        <div style={{ fontSize: 12, color: 'var(--cream-30)', textAlign: 'center', padding: '10px 0' }}>
          Completed {data.completed_at ? new Date(data.completed_at).toLocaleString() : ''} — inventory was updated for {checkedCount} item{checkedCount !== 1 ? 's' : ''}.
        </div>
      )}
    </Page>
  );
}
