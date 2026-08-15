import React, { useState, useEffect } from 'react';
import { Trash2, Edit2 } from 'lucide-react';
import { campaignsApi, tickerMessagesApi, instagramPostsApi, homepageBannersApi } from '../api';
import { Page, Table, Badge, Btn, Modal, FormRow, Input, Select, fmt } from '../components/ui';

const CAMPAIGN_EMPTY = { name: '', multiplier: '2', applies_to: 'both', start_date: new Date().toISOString().slice(0, 10), end_date: '', is_active: true, email_frequency_days: '' };
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
      <HomepageBannerSection />
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
      applies_to: row.scope === 'channel' ? (row.scope_value || 'both') : 'both',
      start_date: row.start_date, end_date: row.end_date, is_active: !!row.is_active,
      email_frequency_days: row.email_frequency_days ? String(row.email_frequency_days) : '',
    });
    setModal(true);
  }

  async function save() {
    if (!form.name.trim() || !form.multiplier || !form.start_date || !form.end_date) return;
    setSaving(true);
    try {
      const { applies_to, ...rest } = form;
      const scope = applies_to === 'both' ? 'site_wide' : 'channel';
      const scope_value = applies_to === 'both' ? null : applies_to;
      const email_frequency_days = form.email_frequency_days ? parseInt(form.email_frequency_days, 10) : null;
      const body = { ...rest, multiplier: parseFloat(form.multiplier), scope, scope_value, email_frequency_days };
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
    {
      key: 'applies_to', label: 'Applies to',
      render: (_, row) => row.scope === 'channel'
        ? <Badge color={row.scope_value === 'pos' ? '#BA7517' : '#3B82F6'}>{row.scope_value === 'pos' ? 'POS only' : 'Website only'}</Badge>
        : <Badge color="#888">Both</Badge>,
    },
    { key: 'start_date', label: 'Starts', render: v => fmt.date(v) },
    { key: 'end_date', label: 'Ends', render: v => fmt.date(v) },
    {
      key: 'email_frequency_days', label: 'Reminder emails',
      render: v => v ? <Badge color="#1D9E75">Every {v}d</Badge> : <Badge color="#888">Off</Badge>,
    },
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
            A "live" campaign overrides the normal $1 = 1B earn rate for every purchase, for its multiplier
            instead — unless a customer's birthday-month bonus (1.5×) happens to be higher, in which case they get
            whichever is higher (never both stacked). Choose whether it applies to the website, POS/event sales, or
            both — so e.g. a Website campaign and a separate, higher POS campaign can run at the same time without
            conflicting. A site-wide (Both) campaign also drives the birthday/campaign badge on the website's nav.
            Optionally set a reminder frequency to email verified customers about a live campaign while it runs
            (worded for whichever channel it applies to) — birthday-month customers get their own reminder instead,
            whichever bonus is higher.
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
          <Select label="Applies to" value={form.applies_to} onChange={e => sf('applies_to', e.target.value)}>
            <option value="both">Both (Website + POS)</option>
            <option value="website">Website only</option>
            <option value="pos">POS / event sales only</option>
          </Select>
          <FormRow cols={2}>
            <Input label="Start date *" type="date" value={form.start_date} onChange={e => sf('start_date', e.target.value)} />
            <Input label="End date *" type="date" value={form.end_date} onChange={e => sf('end_date', e.target.value)} />
          </FormRow>
          <div>
            <Input label="Remind customers by email every ___ days" type="number" min="1" step="1"
              placeholder="Leave blank for no reminder emails"
              value={form.email_frequency_days} onChange={e => sf('email_frequency_days', e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--cream-30)', marginTop: 4 }}>
              e.g. 1 = daily (good for a short event like Pet Expo), 7 = weekly (good for a month-long campaign). Leave blank to never email customers about this campaign.
            </div>
          </div>
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
  const [form, setForm] = useState({ image_data: '', image_url: '', link_url: '', sort_order: 0, is_active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => instagramPostsApi.getAll().then(d => setPosts(d.posts));
  useEffect(() => { load(); }, []);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function openNew() {
    setEditing(null);
    setError('');
    const maxOrder = posts.reduce((m, r) => Math.max(m, r.sort_order), 0);
    setForm({ image_data: '', image_url: '', link_url: '', sort_order: maxOrder + 1, is_active: true });
    setModal(true);
  }
  function openEdit(row) {
    setEditing(row);
    setError('');
    // image_data stays empty until a NEW file is picked (see handleFile
    // below) — image_url carries the already-saved bucket image, if any.
    setForm({ image_data: '', image_url: row.image_url || '', link_url: row.link_url || '', sort_order: row.sort_order, is_active: !!row.is_active });
    setModal(true);
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Image must be under 2MB. Please resize and try again.'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = ev => sf('image_data', ev.target.result);
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!form.image_data && !form.image_url) { setError('Please upload an image.'); return; }
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
    if (!window.confirm('Remove this photo from the homepage?')) return;
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
    {
      key: 'image_url', label: 'Photo', render: v => v
        ? <img src={v} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
        : <span style={{ color: 'var(--cream-30)', fontSize: 12 }}>No image</span>,
    },
    {
      key: 'link_url', label: 'Links to', render: v => v
        ? <span style={{ wordBreak: 'break-all', fontSize: 12 }}>{v}</span>
        : <span style={{ color: 'var(--cream-30)', fontSize: 12 }}>Pawvy Instagram profile (default)</span>,
    },
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
            Upload the photos you want shown on the homepage, in a plain image grid — no live Instagram embed, so it
            always looks exactly like what you upload. Each photo can optionally link to a specific Instagram post;
            leave the link blank and it'll point to the Pawvy Instagram profile instead. Aim for 5 photos for the
            current layout.
          </div>
        </div>
        <Btn onClick={openNew}><span style={{ fontSize: 16 }}>+</span> Add Photo</Btn>
      </div>

      <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <Table cols={cols} rows={sortedPosts} emptyMsg="No photos added yet — the homepage Instagram section will be empty until you add some" />
      </div>

      <Modal open={modal} title={editing ? 'EDIT PHOTO' : 'ADD PHOTO'} onClose={() => setModal(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--cream-30)', marginBottom: 10 }}>Photo *</div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {(form.image_data || form.image_url) ? (
                <img src={form.image_data || form.image_url} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
              ) : (
                <div style={{ width: 120, height: 120, borderRadius: 8, border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--cream-30)', fontSize: 11, gap: 4 }}>
                  <span style={{ fontSize: 28 }}>📷</span>
                  <span>No image</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, color: 'var(--cream-60)', background: 'transparent' }}>
                  <span>📁</span>
                  {(form.image_data || form.image_url) ? 'Replace Photo' : 'Upload Photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleFile} />
                </label>
                {(form.image_data || form.image_url) && (
                  <button onClick={() => { sf('image_data', ''); sf('image_url', ''); }}
                    style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid rgba(248,113,113,.3)', cursor: 'pointer', fontSize: 12, color: '#f87171', background: 'transparent', textAlign: 'left' }}>
                    🗑 Remove Photo
                  </button>
                )}
                <div style={{ fontSize: 10, color: 'var(--cream-30)', lineHeight: 1.5, maxWidth: 200 }}>JPG, PNG, or WebP. Under 2MB.</div>
              </div>
            </div>
          </div>
          <Input label="Link (optional)" value={form.link_url} onChange={e => sf('link_url', e.target.value)}
            placeholder="https://www.instagram.com/p/xxxxxxxxx/" />
          {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
          <Btn onClick={save} disabled={saving} size="lg" style={{ justifyContent: 'center' }}>
            {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Photo')}
          </Btn>
        </div>
      </Modal>
    </>
  );
}

// Reusable full-width homepage takeover banner — built for announcing a
// new brand (Wild Balance being the first case), designed so the actual
// launch is just filling in this form, not a code deploy. Kept as a small
// history table like InstagramSection above (see the CREATE TABLE comment
// in server/database.js), rather than a single settings row, so past
// launches stay on record. Only one is meant to be genuinely live at a
// time (checked by the public endpoint via is_active + date window), but
// nothing here prevents keeping several around, e.g. one just-ended and
// one being prepped for next time.
//
// Recommended image size (shown to whoever's uploading, so the design
// team knows the target without needing to ask): 1920×1080px minimum,
// ideally supplied larger for sharpness on big screens — see the help
// text below the upload control.
function HomepageBannerSection() {
  const [banners, setBanners] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ image_data: '', image_url: '', image_data_mobile: '', image_url_mobile: '', headline: '', link_url: '', start_date: '', end_date: '', is_active: true, sort_order: 0, show_caption: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => homepageBannersApi.getAll().then(d => setBanners(d.banners));
  useEffect(() => { load(); }, []);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function openNew() {
    setEditing(null);
    setError('');
    setForm({ image_data: '', image_url: '', image_data_mobile: '', image_url_mobile: '', headline: '', link_url: '', start_date: todayStr(), end_date: '', is_active: true, sort_order: banners.length, show_caption: true });
    setModal(true);
  }
  function openEdit(row) {
    setEditing(row);
    setError('');
    setForm({
      image_data: '', image_url: row.image_url || '', image_data_mobile: '', image_url_mobile: row.image_url_mobile || '',
      headline: row.headline || '', link_url: row.link_url || '',
      start_date: row.start_date || '', end_date: row.end_date || '', is_active: !!row.is_active, sort_order: row.sort_order ?? 0,
      show_caption: row.show_caption !== 0,
    });
    setModal(true);
  }

  function handleFile(e, field = 'image_data') {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setError('Image must be under 3MB. Please resize and try again.'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = ev => sf(field, ev.target.result);
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!form.image_data && !form.image_url) { setError('Please upload a banner image.'); return; }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError('End date must be on or after the start date.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, start_date: form.start_date || null, end_date: form.end_date || null };
      if (editing) await homepageBannersApi.update(editing.id, payload);
      else await homepageBannersApi.create(payload);
      load();
      setModal(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Remove this banner? This cannot be undone.')) return;
    await homepageBannersApi.delete(id);
    load();
  }

  async function toggleActive(row) {
    await homepageBannersApi.update(row.id, { is_active: !row.is_active });
    load();
  }

  // Mirrors the exact is_active + date-window check the public endpoint
  // uses server-side, purely for the status badge — so what staff see
  // here always matches what's actually live on the website, same
  // reasoning as isLive() for campaigns near the top of this file.
  function isCurrentlyLive(row) {
    const today = todayStr();
    return !!row.is_active
      && (!row.start_date || row.start_date <= today)
      && (!row.end_date || row.end_date >= today);
  }

  const cols = [
    {
      key: 'sort_order', label: 'Order',
      render: (v, row) => {
        const isFirst = row.id === [...banners].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)[0]?.id;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12.5 }}>{v ?? 0}</span>
            {isFirst && <span title="This banner's headline is the page's real H1" style={{ fontSize: 9, fontWeight: 700, color: 'var(--orange)', border: '1px solid var(--orange)', padding: '1px 5px', borderRadius: 3 }}>H1</span>}
          </div>
        );
      },
    },
    {
      key: 'image_url', label: 'Banner', render: v => v
        ? <img src={v} alt="" style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
        : <span style={{ color: 'var(--cream-30)', fontSize: 12 }}>No image</span>,
    },
    {
      key: 'headline', label: 'Headline',
      render: (v, row) => v
        ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12.5 }}>{v}</span>
            {row.show_caption === 0 && <span title="Not shown as a visible caption — still used as the page heading/alt text" style={{ fontSize: 9, fontWeight: 700, color: 'var(--cream-30)', border: '1px solid var(--cream-30)', padding: '1px 5px', borderRadius: 3 }}>HIDDEN</span>}
          </div>
        )
        : <span style={{ color: 'var(--cream-30)', fontSize: 12 }}>—</span>,
    },
    {
      key: 'link_url', label: 'Links to', render: v => v
        ? <span style={{ wordBreak: 'break-all', fontSize: 12 }}>{v}</span>
        : <span style={{ color: 'var(--cream-30)', fontSize: 12 }}>Brand gallery (default)</span>,
    },
    {
      key: 'window', label: 'Active window',
      render: (_, row) => (
        <span style={{ fontSize: 12, color: 'var(--cream-60)' }}>
          {row.start_date ? fmt.date(row.start_date) : 'Anytime'} → {row.end_date ? fmt.date(row.end_date) : 'Open-ended'}
        </span>
      ),
    },
    {
      key: 'status', label: 'Status',
      render: (_, row) => isCurrentlyLive(row) ? <Badge color="#1D9E75">Live now</Badge> : (row.is_active ? <Badge color="#fbbf24">Scheduled</Badge> : <Badge color="#888">Off</Badge>),
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <Btn variant="ghost" size="sm" onClick={() => toggleActive(row)}>{row.is_active ? 'Turn Off' : 'Turn On'}</Btn>
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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, letterSpacing: 1, color: 'var(--cream)' }}>HOMEPAGE BANNER CAROUSEL</div>
          <div style={{ fontSize: 12, color: 'var(--cream-30)', marginTop: 2, maxWidth: 640 }}>
            Replaces the old single-banner takeover and the generic-text hero below it — every active banner now
            shows as an auto-rotating carousel at the very top of the homepage, in "Order" sequence. Leave the link
            blank to send clicks to the brand gallery instead of a specific page.
          </div>
        </div>
        <Btn onClick={openNew}><span style={{ fontSize: 16 }}>+</span> Add Banner</Btn>
      </div>

      <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <Table cols={cols} rows={banners} emptyMsg="No banners yet — the homepage shows a plain fallback heading until you add at least one" />
      </div>

      <Modal open={modal} title={editing ? 'EDIT BANNER' : 'ADD BANNER'} onClose={() => setModal(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--cream-30)', marginBottom: 10 }}>Desktop Image *</div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {(form.image_data || form.image_url) ? (
                <img src={form.image_data || form.image_url} alt="" style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
              ) : (
                <div style={{ width: 160, height: 90, borderRadius: 8, border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--cream-30)', fontSize: 11, gap: 4 }}>
                  <span style={{ fontSize: 28 }}>🖼️</span>
                  <span>No image</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, color: 'var(--cream-60)', background: 'transparent' }}>
                  <span>📁</span>
                  {(form.image_data || form.image_url) ? 'Replace Image' : 'Upload Image'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => handleFile(e, 'image_data')} />
                </label>
                {(form.image_data || form.image_url) && (
                  <button onClick={() => { sf('image_data', ''); sf('image_url', ''); }}
                    style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid rgba(248,113,113,.3)', cursor: 'pointer', fontSize: 12, color: '#f87171', background: 'transparent', textAlign: 'left' }}>
                    🗑 Remove Image
                  </button>
                )}
                <div style={{ fontSize: 10, color: 'var(--cream-30)', lineHeight: 1.5, maxWidth: 240 }}>
                  1920×1080px (16:9), shown on PC and larger screens. JPG, PNG, or WebP, under 3MB.
                </div>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--cream-30)', marginBottom: 10 }}>Mobile Image (optional)</div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {(form.image_data_mobile || form.image_url_mobile) ? (
                <img src={form.image_data_mobile || form.image_url_mobile} alt="" style={{ width: 90, height: 112, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
              ) : (
                <div style={{ width: 90, height: 112, borderRadius: 8, border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--cream-30)', fontSize: 11, gap: 4, textAlign: 'center', padding: '0 6px' }}>
                  <span style={{ fontSize: 24 }}>🖼️</span>
                  <span>Uses desktop image if left blank</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, color: 'var(--cream-60)', background: 'transparent' }}>
                  <span>📁</span>
                  {(form.image_data_mobile || form.image_url_mobile) ? 'Replace Image' : 'Upload Image'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => handleFile(e, 'image_data_mobile')} />
                </label>
                {(form.image_data_mobile || form.image_url_mobile) && (
                  <button onClick={() => { sf('image_data_mobile', ''); sf('image_url_mobile', ''); }}
                    style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid rgba(248,113,113,.3)', cursor: 'pointer', fontSize: 12, color: '#f87171', background: 'transparent', textAlign: 'left' }}>
                    🗑 Remove Image
                  </button>
                )}
                <div style={{ fontSize: 10, color: 'var(--cream-30)', lineHeight: 1.5, maxWidth: 240 }}>
                  A version composed specifically for phones (2:3, portrait) so nothing gets cropped on a narrow
                  screen. Skip this and the desktop image will be used on mobile too. JPG, PNG, or WebP, under 3MB.
                </div>
              </div>
            </div>
          </div>

          <Input label="Headline" value={form.headline} onChange={e => sf('headline', e.target.value)}
            placeholder="e.g. Chew toys that are better for your dog" />

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.show_caption} onChange={e => sf('show_caption', e.target.checked)} />
            <span style={{ fontSize: 13, color: 'var(--cream-60)' }}>Show this headline as a caption on the banner image</span>
          </label>
          <div style={{ fontSize: 10, color: 'var(--cream-30)', marginTop: -8, lineHeight: 1.5 }}>
            {form.show_caption
              ? 'Overlays the headline in the bottom-left of this banner — turn off if the image already has its own text baked in.'
              : "Headline stays off-screen — still counts as this banner's real page heading (and image description) for search engines, just not visible on the image."}
          </div>

          <Input label="Link (optional)" value={form.link_url} onChange={e => sf('link_url', e.target.value)}
            placeholder="/brands/betterbone-nylon-free-dog-chew#shop" />
          <div>
            <Input label="Order (lower shows first)" type="number" value={form.sort_order} onChange={e => sf('sort_order', parseInt(e.target.value, 10) || 0)} />
            <div style={{ fontSize: 10, color: 'var(--cream-30)', marginTop: 4, lineHeight: 1.5 }}>
              Whichever active banner has the lowest number shows first in the carousel — and its headline becomes
              the real page heading search engines read, so worth writing something specific rather than generic.
            </div>
          </div>

          <FormRow cols={2}>
            <Input label="Start date" type="date" value={form.start_date} onChange={e => sf('start_date', e.target.value)} />
            <Input label="End date (leave blank for open-ended)" type="date" value={form.end_date} onChange={e => sf('end_date', e.target.value)} />
          </FormRow>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!form.is_active}
              onChange={e => sf('is_active', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--orange)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--cream)' }}>Turn on (shows on the homepage once saved, if within the active window)</span>
          </label>

          {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
          <Btn onClick={save} disabled={saving} size="lg" style={{ justifyContent: 'center' }}>
            {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Banner')}
          </Btn>
        </div>
      </Modal>
    </>
  );
}
