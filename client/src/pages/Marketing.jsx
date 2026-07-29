import React, { useState, useEffect } from 'react';
import { Trash2, Edit2 } from 'lucide-react';
import { campaignsApi, tickerMessagesApi, instagramPostsApi } from '../api';
import { Page, Table, Badge, Btn, Modal, FormRow, Input, Select, fmt } from '../components/ui';

const CAMPAIGN_EMPTY = { name: '', multiplier: '2', start_date: new Date().toISOString().slice(0, 10), end_date: '', is_active: true };
const MESSAGE_EMPTY = { text: '', sort_order: 0, is_active: true };

function todayStr() { return new Date().toISOString().slice(0, 10); }

// A campaign is "live" right now if it's marked active AND today falls
// inside its date range — this is exactly the same condition
// getActiveMultiplier() checks server-side, just re-derived here for the
// status badge so what staff see matches what customers actually get.
function isLive(c) {
  const today = todayStr();
  return c.is_active && c.start_date <= today && c.end_date >= today;
}

// Kept as one page rather than two separate ones — a campaign (e.g. an
// event weekend at 2× BUTTONS) and its ticker announcement ("Now boothing
// at Pet Expo!") are almost always set up together, so splitting them
// across different nav items just adds clicking back and forth.
export default function Marketing() {
  return (
    <Page title="MARKETING" subtitle="Campaigns, ticker announcements, and other on-and-off promo content">
      <CampaignsSection />
      <TickerSection />
      <InstagramSection />
    </Page>
  );
}

function CampaignsSection() {
  const [campaigns, setCampaigns] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...CAMPAIGN_EMPTY });
  const [saving, setSaving] = useState(false);

  const load = () => campaignsApi.getAll().then(d => setCampaigns(d.campaigns));
  useEffect(() => { load(); }, []);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function openNew() {
    setEditing(null);
    setForm({ ...CAMPAIGN_EMPTY });
    setModal(true);
  }
  function openEdit(row) {
    setEditing(row);
    setForm({
      name: row.name, multiplier: String(row.multiplier),
      start_date: row.start_date, end_date: row.end_date, is_active: !!row.is_active,
    });
    setModal(true);
  }

  async function save() {
    if (!form.name.trim() || !form.multiplier || !form.start_date || !form.end_date) return;
    setSaving(true);
    try {
      const body = { ...form, multiplier: parseFloat(form.multiplier) };
      if (editing) await campaignsApi.update(editing.id, body);
      else await campaignsApi.create(body);
      load();
      setModal(false);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this campaign? This cannot be undone.')) return;
    await campaignsApi.delete(id);
    load();
  }

  async function toggleActive(row) {
    await campaignsApi.update(row.id, { is_active: !row.is_active });
    load();
  }

  const cols = [
    { key: 'name', label: 'Campaign' },
    { key: 'multiplier', label: 'Multiplier', render: v => <strong>{v}×</strong> },
    { key: 'start_date', label: 'Starts', render: v => fmt.date(v) },
    { key: 'end_date', label: 'Ends', render: v => fmt.date(v) },
    {
      key: 'status', label: 'Status',
      render: (_, row) => isLive(row)
        ? <Badge color="#1D9E75">LIVE NOW</Badge>
        : row.is_active
          ? <Badge color="#BA7517">Scheduled / Expired</Badge>
          : <Badge color="#888">Off</Badge>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <Btn variant="ghost" size="sm" onClick={() => toggleActive(row)}>{row.is_active ? 'Turn off' : 'Turn on'}</Btn>
          <button onClick={() => openEdit(row)} title="Edit"
            style={{ background: 'none', border: 'none', color: 'rgba(245,242,235,.5)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
            <Edit2 size={13} />
          </button>
          <button onClick={() => remove(row.id)} title="Delete"
            style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,.5)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(248,113,113,.5)'}>
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 1, color: 'var(--cream)' }}>CAMPAIGNS</div>
          <div style={{ fontSize: 12, color: 'var(--cream-30)', marginTop: 2, maxWidth: 640 }}>
            A "live" campaign overrides the normal $1 = 1B earn rate for every purchase, site-wide, for its multiplier
            instead — unless a customer's birthday-month bonus (1.5×) happens to be higher, in which case they get
            whichever is higher (never both stacked). This also drives the birthday/campaign badge on the website's nav.
          </div>
        </div>
        <Btn onClick={openNew}><span style={{ fontSize: 16 }}>+</span> New Campaign</Btn>
      </div>

      <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <Table cols={cols} rows={campaigns} emptyMsg="No campaigns yet" />
      </div>

      <Modal open={modal} title={editing ? 'EDIT CAMPAIGN' : 'NEW CAMPAIGN'} onClose={() => setModal(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Campaign name *" value={form.name} onChange={e => sf('name', e.target.value)}
            placeholder="e.g. Website Launch Week" />
          <FormRow cols={2}>
            <Input label="Multiplier *" type="number" step="0.1" min="1" value={form.multiplier}
              onChange={e => sf('multiplier', e.target.value)} />
            <Select label="Status" value={form.is_active ? 'on' : 'off'} onChange={e => sf('is_active', e.target.value === 'on')}>
              <option value="on">Active</option>
              <option value="off">Off</option>
            </Select>
          </FormRow>
          <FormRow cols={2}>
            <Input label="Start date *" type="date" value={form.start_date} onChange={e => sf('start_date', e.target.value)} />
            <Input label="End date *" type="date" value={form.end_date} onChange={e => sf('end_date', e.target.value)} />
          </FormRow>
          <Btn onClick={save} disabled={saving} size="lg" style={{ justifyContent: 'center' }}>
            {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create Campaign')}
          </Btn>
        </div>
      </Modal>
    </>
  );
}

function TickerSection() {
  const [messages, setMessages] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...MESSAGE_EMPTY });
  const [saving, setSaving] = useState(false);

  const load = () => tickerMessagesApi.getAll().then(d => setMessages(d.messages));
  useEffect(() => { load(); }, []);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function openNew() {
    setEditing(null);
    const maxOrder = messages.reduce((m, r) => Math.max(m, r.sort_order), 0);
    setForm({ ...MESSAGE_EMPTY, sort_order: maxOrder + 1 });
    setModal(true);
  }
  function openEdit(row) {
    setEditing(row);
    setForm({ text: row.text, sort_order: row.sort_order, is_active: !!row.is_active });
    setModal(true);
  }

  async function save() {
    if (!form.text.trim()) return;
    setSaving(true);
    try {
      if (editing) await tickerMessagesApi.update(editing.id, form);
      else await tickerMessagesApi.create(form);
      load();
      setModal(false);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this ticker message?')) return;
    await tickerMessagesApi.delete(id);
    load();
  }

  async function toggleActive(row) {
    await tickerMessagesApi.update(row.id, { is_active: !row.is_active });
    load();
  }

  async function move(row, direction) {
    const sorted = [...messages].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(m => m.id === row.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      tickerMessagesApi.update(row.id, { sort_order: other.sort_order }),
      tickerMessagesApi.update(other.id, { sort_order: row.sort_order }),
    ]);
    load();
  }

  const cols = [
    {
      key: 'order', label: '', render: (_, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => move(row, 'up')} title="Move up"
            style={{ background: 'none', border: 'none', color: 'rgba(245,242,235,.4)', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}>▲</button>
          <button onClick={() => move(row, 'down')} title="Move down"
            style={{ background: 'none', border: 'none', color: 'rgba(245,242,235,.4)', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}>▼</button>
        </div>
      ),
    },
    { key: 'text', label: 'Message' },
    {
      key: 'status', label: 'Status',
      render: (_, row) => row.is_active ? <Badge color="#1D9E75">Showing</Badge> : <Badge color="#888">Hidden</Badge>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <Btn variant="ghost" size="sm" onClick={() => toggleActive(row)}>{row.is_active ? 'Hide' : 'Show'}</Btn>
          <button onClick={() => openEdit(row)} title="Edit"
            style={{ background: 'none', border: 'none', color: 'rgba(245,242,235,.5)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
            <Edit2 size={13} />
          </button>
          <button onClick={() => remove(row.id)} title="Delete"
            style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,.5)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(248,113,113,.5)'}>
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  const sortedMessages = [...messages].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 1, color: 'var(--cream)' }}>TICKER MESSAGES</div>
          <div style={{ fontSize: 12, color: 'var(--cream-30)', marginTop: 2, maxWidth: 640 }}>
            The scrolling marquee on the website homepage. Only "Showing" messages appear, in the order below — hide
            or delete one once it's no longer relevant (e.g. an event has passed). Live on the website within a
            minute or two, no code changes needed.
          </div>
        </div>
        <Btn onClick={openNew}><span style={{ fontSize: 16 }}>+</span> New Message</Btn>
      </div>

      <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <Table cols={cols} rows={sortedMessages} emptyMsg="No ticker messages yet — the homepage ticker will be empty until you add one" />
      </div>

      <Modal open={modal} title={editing ? 'EDIT MESSAGE' : 'NEW MESSAGE'} onClose={() => setModal(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Message text *" value={form.text} onChange={e => sf('text', e.target.value)}
            placeholder="e.g. Now boothing at Pet Expo, Suntec Hall B, 12-14 Aug!" />
          <Btn onClick={save} disabled={saving} size="lg" style={{ justifyContent: 'center' }}>
            {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Message')}
          </Btn>
        </div>
      </Modal>
    </>
  );
}

function InstagramSection() {
  const [posts, setPosts] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ url: '', sort_order: 0, is_active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => instagramPostsApi.getAll().then(d => setPosts(d.posts));
  useEffect(() => { load(); }, []);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function openNew() {
    setEditing(null);
    setError('');
    const maxOrder = posts.reduce((m, r) => Math.max(m, r.sort_order), 0);
    setForm({ url: '', sort_order: maxOrder + 1, is_active: true });
    setModal(true);
  }
  function openEdit(row) {
    setEditing(row);
    setError('');
    setForm({ url: row.url, sort_order: row.sort_order, is_active: !!row.is_active });
    setModal(true);
  }

  async function save() {
    if (!form.url.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editing) await instagramPostsApi.update(editing.id, form);
      else await instagramPostsApi.create(form);
      load();
      setModal(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Remove this post from the homepage?')) return;
    await instagramPostsApi.delete(id);
    load();
  }

  async function toggleActive(row) {
    await instagramPostsApi.update(row.id, { is_active: !row.is_active });
    load();
  }

  async function move(row, direction) {
    const sorted = [...posts].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(p => p.id === row.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      instagramPostsApi.update(row.id, { sort_order: other.sort_order }),
      instagramPostsApi.update(other.id, { sort_order: row.sort_order }),
    ]);
    load();
  }

  const cols = [
    {
      key: 'order', label: '', render: (_, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => move(row, 'up')} title="Move left"
            style={{ background: 'none', border: 'none', color: 'rgba(245,242,235,.4)', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}>▲</button>
          <button onClick={() => move(row, 'down')} title="Move right"
            style={{ background: 'none', border: 'none', color: 'rgba(245,242,235,.4)', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}>▼</button>
        </div>
      ),
    },
    { key: 'url', label: 'Post URL', render: v => <span style={{ wordBreak: 'break-all' }}>{v}</span> },
    {
      key: 'status', label: 'Status',
      render: (_, row) => row.is_active ? <Badge color="#1D9E75">Showing</Badge> : <Badge color="#888">Hidden</Badge>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <Btn variant="ghost" size="sm" onClick={() => toggleActive(row)}>{row.is_active ? 'Hide' : 'Show'}</Btn>
          <button onClick={() => openEdit(row)} title="Edit"
            style={{ background: 'none', border: 'none', color: 'rgba(245,242,235,.5)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
            <Edit2 size={13} />
          </button>
          <button onClick={() => remove(row.id)} title="Remove"
            style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,.5)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(248,113,113,.5)'}>
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  const sortedPosts = [...posts].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 1, color: 'var(--cream)' }}>INSTAGRAM HIGHLIGHTS</div>
          <div style={{ fontSize: 12, color: 'var(--cream-30)', marginTop: 2, maxWidth: 640 }}>
            Hand-pick which Instagram posts show on the homepage. Paste the link from the "..." → Copy Link (or Embed)
            option on any post — the website loads it live and direct from Instagram, so it always shows the post's
            real current likes/caption, no separate refresh needed. Aim for 4 posts for the current layout.
          </div>
        </div>
        <Btn onClick={openNew}><span style={{ fontSize: 16 }}>+</span> Add Post</Btn>
      </div>

      <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <Table cols={cols} rows={sortedPosts} emptyMsg="No posts added yet — the homepage Instagram section will be empty until you add some" />
      </div>

      <Modal open={modal} title={editing ? 'EDIT POST' : 'ADD POST'} onClose={() => setModal(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Instagram post URL *" value={form.url} onChange={e => sf('url', e.target.value)}
            placeholder="https://www.instagram.com/p/xxxxxxxxx/" />
          {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
          <Btn onClick={save} disabled={saving} size="lg" style={{ justifyContent: 'center' }}>
            {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Post')}
          </Btn>
        </div>
      </Modal>
    </>
  );
}
