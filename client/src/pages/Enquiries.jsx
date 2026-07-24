import React, { useState, useEffect } from 'react';
import { enquiryAdminApi } from '../api';
import { Page, Card, Badge, Btn, Table } from '../components/ui';

// Staff view of website "Contact Us" submissions. Real-time notification
// already happens via Telegram the moment someone submits (see
// server/routes/enquiries.js) — this page is the follow-up record: the
// full history, and a way to mark one as handled once you've replied
// (over email/WhatsApp — replies themselves aren't sent from here).
export default function Enquiries() {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = () => enquiryAdminApi.getAll().then(d => setEnquiries(d.enquiries)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function markReplied(id) {
    setBusyId(id);
    try {
      await enquiryAdminApi.markReplied(id);
      load();
    } finally {
      setBusyId(null);
    }
  }

  const cols = [
    {
      key: 'created_at', label: 'Received',
      render: v => v ? new Date(v).toLocaleString('en-SG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—',
    },
    { key: 'name', label: 'Name', render: v => v || '—' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone', render: v => v || '—' },
    {
      key: 'message', label: 'Message',
      render: v => <div style={{ maxWidth: 320, whiteSpace: 'normal', lineHeight: 1.4 }}>{v}</div>,
    },
    {
      key: 'replied', label: 'Status',
      render: v => <Badge color={v ? '#7fc93e' : '#f59e0b'}>{v ? 'Replied' : 'New'}</Badge>,
    },
    {
      key: 'id', label: '', align: 'right',
      render: (id, row) => (
        !row.replied && (
          <Btn size="sm" variant="secondary" disabled={busyId === id} onClick={() => markReplied(id)}>
            {busyId === id ? '...' : 'Mark Replied'}
          </Btn>
        )
      ),
    },
  ];

  return (
    <Page title="Enquiries" subtitle="Submissions from the Contact form on Pawvy.co">
      <Card>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-30)', fontSize: 13 }}>Loading…</div>
        ) : (
          <Table cols={cols} rows={enquiries} emptyMsg="No enquiries yet." />
        )}
      </Card>
    </Page>
  );
}
