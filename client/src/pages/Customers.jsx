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
  const [detailModal, setDetailModal] = useState(null); // { customer, pet }
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyId, setBusyId]       = useState(null);
  const [stampBusy, setStampBusy] = useState(false);
  const [copied, setCopied]       = useState(false);

  const load = () => customerAdminApi.getAll().then(d => setCustomers(d.customers)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function openDetail(row) {
    setDetailLoading(true);
    setDetailModal({ customer: row, pet: null, buttons_ledger: [] });
    try {
      const { customer, pet, buttons_ledger } = await customerAdminApi.get(row.id);
      setDetailModal({ customer, pet, buttons_ledger });
    } finally {
      setDetailLoading(false);
    }
  }

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
    {
      key: 'profile_bonus_claimed', label: 'Profile',
      render: v => <Badge color={v ? '#7fc93e' : '#888'}>{v ? 'Complete' : 'Incomplete'}</Badge>,
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
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Btn size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openDetail(row); }}>
            View Details
          </Btn>
          <Btn size="sm" variant="secondary" disabled={busyId === id} onClick={(e) => { e.stopPropagation(); getVerifyLink(row); }}>
            {busyId === id ? '...' : (row.account_status === 'verified' ? 'Resend login link' : 'Resend verify email')}
          </Btn>
          <Btn
            size="sm" variant="secondary"
            style={{ color: '#f87171', borderColor: 'rgba(248,113,113,.3)' }}
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Permanently delete ${row.name || row.email}? This can't be undone — mainly meant for cleaning up test accounts.`)) {
                customerAdminApi.delete(id).then(load);
              }
            }}
          >
            Delete
          </Btn>
        </div>
      ),
    },
  ];

  return (
    <Page title="Customers" subtitle="Pawvy rewards accounts — signups from POS and (later) pawvy.co">
      <Card>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)', fontSize: 13 }}>Loading…</div>
        ) : (
          <Table cols={cols} rows={customers} emptyMsg="No customer signups yet." onRowClick={openDetail} />
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

      {/* Customer detail view — deliberately a modal, not more table
          columns. Pet profile (7 fields) + Instagram + contact preference
          + PDPA consent record would make the list unreadable as columns;
          this keeps the list scannable and puts full depth here instead,
          only loaded when staff actually opens one customer. */}
      <Modal open={!!detailModal} title="CUSTOMER DETAILS" onClose={() => setDetailModal(null)} width={480}>
        {detailModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {detailLoading ? (
              <div style={{ fontSize: 13, color: 'var(--cream-30)' }}>Loading…</div>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--cream-30)', marginBottom: 8 }}>Pawrent</div>
                  <DetailRow label="Name" value={detailModal.customer.name} />
                  <DetailRow label="Email" value={detailModal.customer.email} />
                  <DetailRow label="Phone" value={detailModal.customer.phone} />
                  <DetailRow label="Address" value={detailModal.customer.address} />
                  <DetailRow label="Instagram" value={detailModal.customer.instagram_handle} />
                  <DetailRow label="Preferred Contact" value={detailModal.customer.preferred_contact_channel} />
                  <DetailRow label="Password Set" value={detailModal.customer.password_hash ? 'Yes' : 'No — magic link only'} />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--cream-30)', marginBottom: 8 }}>Pet</div>
                  {detailModal.pet ? (
                    <>
                      <DetailRow label="Name" value={detailModal.pet.name} />
                      <DetailRow label="Breed" value={detailModal.pet.breed} />
                      <DetailRow label="Weight" value={detailModal.pet.weight ? `${detailModal.pet.weight} kg` : null} />
                      <DetailRow label="Birthday" value={detailModal.pet.birthday} />
                      <DetailRow label="Allergies" value={detailModal.pet.allergies} />
                      <DetailRow label="Favorite Item" value={detailModal.pet.favorite_item} />
                      <DetailRow label="Chew Power" value={detailModal.pet.chew_power} />
                    </>
                  ) : (
                    <div style={{ fontSize: 12.5, color: 'var(--cream-30)' }}>Not filled in yet.</div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--cream-30)', marginBottom: 8 }}>PDPA Consent</div>
                  <DetailRow label="Given" value={detailModal.customer.pdpa_consent ? 'Yes' : 'No'} />
                  <DetailRow label="When" value={detailModal.customer.pdpa_consent_at ? new Date(detailModal.customer.pdpa_consent_at).toLocaleString('en-SG') : null} />
                  {detailModal.customer.pdpa_consent_text && (
                    <div style={{ fontSize: 11, color: 'var(--cream-30)', marginTop: 6, fontStyle: 'italic', lineHeight: 1.5 }}>
                      "{detailModal.customer.pdpa_consent_text}"
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--cream-30)', marginBottom: 8 }}>
                    BUTTONS Ledger
                  </div>
                  {(!detailModal.buttons_ledger || detailModal.buttons_ledger.length === 0) ? (
                    <div style={{ fontSize: 12.5, color: 'var(--cream-30)' }}>No BUTTONS activity yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                      {detailModal.buttons_ledger.map(b => <ButtonsLedgerRow key={b.id} batch={b} />)}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </Page>
  );
}

// Turns raw source/source_type into what staff actually want to read —
// e.g. "Purchase (Direct Online Sale #12)" instead of source_type/source_id
// as separate opaque values.
function buttonsLedgerLabel(b) {
  const SOURCE_LABELS = {
    purchase: 'Purchase', first_purchase_bonus: 'First-purchase bonus', referral: 'Referral bonus',
    signup: 'Signup bonus', stamp_reward: 'Stamp card reward', profile_bonus: 'Profile completion bonus',
  };
  const label = SOURCE_LABELS[b.source] || b.source;
  if (b.source_type === 'website_order' && b.source_id) return `${label} (Order #${b.source_id})`;
  return label;
}

function ButtonsLedgerRow({ batch: b }) {
  const statusColor = { pending: '#f59e0b', credited: '#7fc93e', voided: '#f87171' }[b.status] || '#888';
  const statusLabel = { pending: 'Pending (7-day hold)', credited: 'Credited', voided: 'Voided' }[b.status] || b.status;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, fontSize: 12, padding: '6px 0', borderBottom: '1px solid rgba(245,242,235,.06)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--cream)' }}>{buttonsLedgerLabel(b)}</div>
        <div style={{ color: 'var(--cream-30)', fontSize: 10.5, marginTop: 2 }}>
          Earned {new Date(b.earned_at).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })}
          {b.status === 'pending' && (
            <> — credits {new Date(new Date(b.earned_at).getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })}</>
          )}
          {b.status === 'credited' && b.expires_at && (
            <> — expires {new Date(b.expires_at).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })}</>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ color: 'var(--cream)', fontWeight: 700 }}>{b.amount}B</div>
        <Badge color={statusColor}>{statusLabel}</Badge>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid rgba(245,242,235,.06)' }}>
      <span style={{ color: 'var(--cream-30)' }}>{label}</span>
      <span style={{ color: value ? 'var(--cream)' : 'var(--cream-30)', textAlign: 'right' }}>{value || '—'}</span>
    </div>
  );
}
