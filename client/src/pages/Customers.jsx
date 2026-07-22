import React, { useState, useEffect } from 'react';
import { customerAdminApi } from '../api';
import { Page, Card, Badge, Btn, Table, Modal, Input } from '../components/ui';

// Internal, staff-only view of the customer database (behind the normal
// staff PIN, unlike everything under /api/customers which is meant for
// public website visitors — see server/routes/customerAdmin.js). Exists
// mainly as a stand-in for the email service that doesn't exist yet: staff
// can pull a customer's pending verify link here and test/send it manually
// until real transactional email is wired up.
export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [linkModal, setLinkModal] = useState(null); // { customer, token, expires_at }
  const [stampModal, setStampModal] = useState(null); // { customer, note, result }
  const [busyId, setBusyId]       = useState(null);
  const [stampBusy, setStampBusy] = useState(false);
  const [copied, setCopied]       = useState(false);

  const load = () => customerAdminApi.getAll().then(d => setCustomers(d.customers)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function getVerifyLink(customer) {
    setBusyId(customer.id);
    setCopied(false);
    try {
      const { token, expires_at } = await customerAdminApi.resendVerify(customer.id);
      setLinkModal({ customer, token, expires_at });
    } finally {
      setBusyId(null);
    }
  }

  function copyCurl() {
    if (!linkModal) return;
    const cmd = `curl -X POST %APP_URL%/api/customers/verify -H "Content-Type: application/json" -d "{\\"token\\":\\"${linkModal.token}\\"}"`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
  }

  async function submitStamp() {
    setStampBusy(true);
    try {
      const result = await customerAdminApi.awardStamp(stampModal.customer.id, {
        approved_by: 'Staff', note: stampModal.note || null,
      });
      setStampModal(m => ({ ...m, result, error: null }));
      load(); // refresh so the Stamps column and BUTTONS balance update immediately
    } catch (err) {
      setStampModal(m => ({ ...m, error: err?.message || 'Could not award stamp — weekly cap may be reached.' }));
    } finally {
      setStampBusy(false);
    }
  }

  const cols = [
    { key: 'name', label: 'Pawrent' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    {
      key: 'account_status', label: 'Status',
      render: v => <Badge color={v === 'verified' ? '#7fc93e' : '#f59e0b'}>{v === 'verified' ? 'Verified' : 'Unverified'}</Badge>,
    },
    { key: 'buttons_balance', label: 'BUTTONS', align: 'right', render: v => `${v}B` },
    {
      key: 'stamp_count', label: 'Stamps', align: 'right',
      render: (v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <span>{v || 0}</span>
          <Btn size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setStampModal({ customer: row, note: '', result: null, error: null }); }}>
            + Stamp
          </Btn>
        </div>
      ),
    },
    { key: 'referral_code', label: 'Referral Code' },
    { key: 'signup_source', label: 'Source', render: v => v || '—' },
    {
      key: 'created_at', label: 'Signed Up',
      render: v => v ? new Date(v).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    },
    {
      key: 'id', label: '', align: 'right',
      render: (id, row) => (
        <Btn size="sm" variant="secondary" disabled={busyId === id} onClick={(e) => { e.stopPropagation(); getVerifyLink(row); }}>
          {busyId === id ? '...' : (row.account_status === 'verified' ? 'Resend login link' : 'Resend verify email')}
        </Btn>
      ),
    },
  ];

  return (
    <Page title="Customers" subtitle="Pawvy rewards accounts — signups from POS and (later) pawvy.co">
      <Card>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)', fontSize: 13 }}>Loading…</div>
        ) : (
          <Table cols={cols} rows={customers} emptyMsg="No customer signups yet." />
        )}
      </Card>

      {/* No email service exists yet (see Patch 97 notes) — this modal is
          the manual stand-in: staff can copy the token into a real
          POST /api/customers/verify call to test the flow, or relay the
          token to the customer directly (e.g. via WhatsApp) as a stopgap. */}
      <Modal open={!!linkModal} title="VERIFY / LOGIN LINK" onClose={() => setLinkModal(null)} width={480}>
        {linkModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--cream-30)' }}>
              For {linkModal.customer.name || linkModal.customer.email} — an email was just sent (if
              Gmail is configured on this deployment). Use the token below only if you need to test
              or send the link manually.
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--cream-30)', marginBottom: 4 }}>Token</div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--cream)', background: 'var(--navy)', padding: '8px 10px', borderRadius: 6, wordBreak: 'break-all' }}>
                {linkModal.token}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--cream-30)', marginBottom: 4 }}>
                Expires
              </div>
              <div style={{ fontSize: 12, color: 'var(--cream)' }}>{new Date(linkModal.expires_at).toLocaleString('en-SG')}</div>
            </div>
            <Btn onClick={copyCurl}>{copied ? 'Copied!' : 'Copy test command (Command Prompt)'}</Btn>
            <div style={{ fontSize: 10.5, color: 'rgba(245,242,235,.4)', lineHeight: 1.5 }}>
              Replace <code>%APP_URL%</code> with your Railway URL (e.g. pawvy-app-production.up.railway.app)
              before running — this modal can't know it automatically. Running it marks this account
              verified and issues a session, same as clicking a real emailed link would.
            </div>
          </div>
        )}
      </Modal>

      {/* Digital stamp card (Patch 105) — staff manually verify a customer's
          tagged social post, then award a stamp here. Every 5 stamps auto-
          credits 100B; capped at 7 stamps/week per customer (rolling
          window) — the backend enforces both, this just surfaces the
          result/error. */}
      <Modal open={!!stampModal} title="AWARD STAMP" onClose={() => setStampModal(null)} width={420}>
        {stampModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--cream-30)' }}>
              For {stampModal.customer.name || stampModal.customer.email} — currently{' '}
              <strong style={{ color: 'var(--cream)' }}>{stampModal.customer.stamp_count || 0} stamps</strong>.
              Only award after checking their tagged post yourself.
            </div>

            {stampModal.result ? (
              <div style={{ background: 'rgba(127,201,62,.12)', border: '1px solid rgba(127,201,62,.3)', borderRadius: 7, padding: '10px 12px', fontSize: 12.5, color: '#7fc93e', lineHeight: 1.6 }}>
                ✓ Stamp awarded — {stampModal.result.totalStamps} total, {stampModal.result.stampsUntilNextReward} until next reward.
                {stampModal.result.rewardsCredited > 0 && (
                  <div style={{ marginTop: 4, fontWeight: 700 }}>🎉 100 BUTTONS credited for hitting 5 stamps!</div>
                )}
              </div>
            ) : (
              <>
                <Input
                  label="Note (optional)"
                  value={stampModal.note}
                  onChange={e => setStampModal(m => ({ ...m, note: e.target.value }))}
                  placeholder="e.g. link to the IG story"
                />
                {stampModal.error && (
                  <div style={{ background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 7, padding: '10px 12px', fontSize: 12, color: '#f87171' }}>
                    {stampModal.error}
                  </div>
                )}
                <Btn onClick={submitStamp} disabled={stampBusy}>{stampBusy ? 'Awarding…' : 'Award Stamp'}</Btn>
              </>
            )}
          </div>
        )}
      </Modal>
    </Page>
  );
}
