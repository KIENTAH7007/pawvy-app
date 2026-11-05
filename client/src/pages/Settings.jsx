import React, { useState, useEffect } from 'react';
import { Download, ShieldCheck, AlertTriangle } from 'lucide-react';
import { backupApi } from '../api';
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
    </Page>
  );
}
