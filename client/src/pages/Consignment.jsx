import React from 'react';
import { Page } from '../components/ui';
export default function Consignment() {
  return(
    <Page title="CONSIGNMENT" subtitle="Track stock placed with each consignee partner">
      <div style={{background:'var(--navy)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:48,textAlign:'center',color:'var(--cream-30)'}}>
        <div style={{fontSize:32,marginBottom:12}}>🏪</div>
        <div style={{fontSize:14,fontWeight:600,color:'var(--cream)',marginBottom:8}}>Coming in Phase 2</div>
        <div style={{fontSize:12,lineHeight:1.8}}>
          Will include: place stock at partner · track sold qty · generate consignment lists PDF<br/>
          Receive returns · produce Statement of Accounts (SOA) per partner
        </div>
      </div>
    </Page>
  );
}
