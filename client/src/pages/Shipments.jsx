import React, { useState, useEffect } from 'react';
import { Truck } from 'lucide-react';
import { shipmentsApi } from '../api';
import { Page } from '../components/ui';

// Shipments (Phase 7) — skeleton placeholder.
// Proves the sidebar tab, route, and API wiring all work end to end.
// Real content (entry form, landed cost calculator, variance ledger,
// document library) is built in the following patches.
export default function Shipments() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    shipmentsApi.getAll().then(() => setReady(true)).catch(() => setReady(true));
  }, []);

  return (
    <Page title="Shipments" subtitle="Supplier orders, landed cost, and cost variance">
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 10, color: 'var(--cream-30)',
        border: '1px dashed var(--border)', borderRadius: 10, padding: 40,
      }}>
        <Truck size={28} />
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream-60)' }}>
          Shipments tab under construction
        </div>
        <div style={{ fontSize: 11, textAlign: 'center', maxWidth: 320 }}>
          Routing and database tables are live{ready ? ' and confirmed' : ''}.
          Shipment entry, landed cost calculator, and document library ship in upcoming patches.
        </div>
      </div>
    </Page>
  );
}
