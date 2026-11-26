import React, { useState, useEffect } from 'react';
import { Download, ShieldCheck, AlertTriangle } from 'lucide-react';
import { backupApi, authApi } from '../api';
import { Page, Btn } from '../components/ui';

const AMBER = '#f5a524';

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtWhen(iso) {
  return new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function StaffAccess() {
  const [roles, setRoles] = useState(null);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => authApi.roles().then(setRoles).catch(() => {});
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await authApi.setRolePin('ops', pin);
      setPin(''); setMsg({ ok: true, text: 'Operations PIN saved. Anyone signed in with the old operations PIN has been signed out.' });
      load();
    } catch (e) { setMsg({ ok: false, text: e.message || 'Could not save.' }); }
    finally { setBusy(false); }
  }
  async function turnOff() {
    if (!window.confirm('Turn off the Operations PIN? Anyone signed in with it will be signed out.')) return;
    setBusy(true); setMsg(null);
    try { await authApi.clearRolePin('ops'); setMsg({ ok: true, text: 'Operations PIN turned off.' }); load(); }
    catch (e) { setMsg({ ok: false, text: e.message || 'Could not turn off.' }); }
    finally { setBusy(false); }
  }

  const isSet = roles?.ops?.is_set;
  return (
    <div style={{ background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 22, maxWidth: 640, marginTop: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream)', marginBottom: 6 }}>Staff access: Operations PIN</div>
      <div style={{ fontSize: 12.5, color: 'var(--cream-60)', lineHeight: 1.6, marginBottom: 14 }}>
        A separate 6-digit PIN for operations staff. It only opens Pending Orders, Inventory (without Restock In), Restock Checklist,
        Consignment, Customers and Enquiries. Costs, profit and everything else stay hidden. Your own PIN keeps full access.
        {' '}<b style={{ color: isSet ? '#7fc93e' : 'var(--cream-30)' }}>{roles ? (isSet ? 'Currently ON.' : 'Currently OFF.') : ''}</b>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="password" inputMode="numeric" maxLength={6} value={pin} placeholder="6 digits"
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          style={{ width: 150, background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', color: 'var(--cream)', fontSize: 14, letterSpacing: 4 }} />
        <Btn onClick={save} disabled={busy || pin.length !== 6}>{isSet ? 'Change PIN' : 'Turn on'}</Btn>
        {isSet && <Btn variant="ghost" onClick={turnOff} disabled={busy}>Turn off</Btn>}
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 12.5, color: msg.ok ? '#7fc93e' : '#f87171' }}>{msg.text}</div>}
    </div>
  );
}

export default function Settings() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => backupApi.status().then(setStatus).catch(() => {});
  useEffect(() => { load(); }, []);

  async function download() {
    setBusy(true); setMsg('');
    try {
      const { blob, filename } = await backupApi.download();
      saveBlob(blob, filename || 'pawvy-backup.db');
      const s = await backupApi.confirm();   // only after the file really arrived
      setStatus(s);
      window.dispatchEvent(new Event('pawvy:backup-updated'));
      setMsg(`Saved ${filename}. Keep it somewhere private.`);
    } catch (e) {
      setMsg(`Backup failed: ${e.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  const overdue = status?.overdue;
  let line = 'Checking…';
  if (status) {
    line = status.last_downloaded_at
      ? `Last downloaded: ${fmtWhen(status.last_downloaded_at)} (${status.days_since === 0 ? 'today' : `${status.days_since} day${status.days_since === 1 ? '' : 's'} ago`})`
      : 'No backup has been downloaded yet.';
  }

  return (
    <Page title="Settings" subtitle="Backup">
      <div style={{ background: 'var(--navy)', border: `1px solid ${overdue ? AMBER : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: 22, maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          {overdue ? <AlertTriangle size={18} color={AMBER} /> : <ShieldCheck size={18} color="#7fc93e" />}
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream)' }}>Database backup</div>
        </div>
        <div style={{ fontSize: 13, color: overdue ? AMBER : 'var(--cream-60)', fontWeight: overdue ? 600 : 400, marginBottom: 6 }}>{line}</div>
        {overdue && status && (
          <div style={{ fontSize: 12, color: AMBER, marginBottom: 6 }}>
            It has been {status.last_downloaded_at ? `${status.overdue_after_days}+ days` : 'a while'} — please download a fresh one. "Settings" in the side menu stays amber until you do.
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--cream-60)', lineHeight: 1.6, margin: '12px 0 16px' }}>
          Saves a full copy of everything in the Pawvy App (products, sales, customers, invoices…) as one file. Download one about once a week.
          The file contains customer details, so keep it somewhere private — not a shared folder, and never in a chat or email.
        </div>
        <Btn onClick={download} disabled={busy} size="lg"><Download size={15} /> {busy ? 'Preparing…' : 'Download backup'}</Btn>
        {msg && <div style={{ marginTop: 12, fontSize: 12, color: msg.startsWith('Backup failed') ? '#f87171' : '#7fc93e' }}>{msg}</div>}
      </div>
      <StaffAccess />
    </Page>
  );
}
