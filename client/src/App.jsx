import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, PlusCircle, Package, Store, Tag,
  FileText, Users, Receipt, Settings, TrendingUp, ClipboardList,
  ShoppingBag, Menu, X
} from 'lucide-react';

import Dashboard      from './pages/Dashboard';
import Sales          from './pages/Sales';
import RecordSale     from './pages/RecordSale';
import EventSale      from './pages/EventSale';
import Products       from './pages/Products';
import Inventory      from './pages/Inventory';
import Partners       from './pages/Partners';
import Costs          from './pages/Costs';
import Reports        from './pages/Reports';
import Consignment    from './pages/Consignment';

/* ── Nav config ─────────────────────────────────────────────────── */
const NAV = [
  { section: null,          items: [
    { path: '/',             label: 'Dashboard',       icon: LayoutDashboard },
  ]},
  { section: 'Operations',  items: [
    { path: '/sales/record', label: 'Record Sale',     icon: PlusCircle },
    { path: '/sales/event',  label: 'Event Sale',      icon: ShoppingBag },
    { path: '/sales',        label: 'Sales Ledger',    icon: ClipboardList },
    { path: '/inventory',    label: 'Inventory',       icon: Package },
    { path: '/consignment',  label: 'Consignment',     icon: Store },
  ]},
  { section: 'Catalogue',   items: [
    { path: '/products',     label: 'Products & Pricing', icon: Tag },
  ]},
  { section: 'Documents',   items: [
    { path: '/invoices',     label: 'Invoices & Docs', icon: FileText },
  ]},
  { section: 'Business',    items: [
    { path: '/partners',     label: 'Partners',        icon: Users },
    { path: '/costs',        label: 'Operating Costs', icon: Receipt },
    { path: '/reports',      label: 'Reports & P&L',   icon: TrendingUp },
  ]},
];

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return mobile;
}

/* ── Sidebar ─────────────────────────────────────────────────────── */
function Sidebar({ open, onClose }) {
  const loc      = useLocation();
  const isMobile = useIsMobile();

  const sidebarStyle = {
    width: 196, flexShrink: 0,
    background: 'var(--navy)',
    borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column',
    height: '100%', overflow: 'hidden',
    // Mobile: absolute overlay that slides in/out
    ...(isMobile ? {
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 200,
      transform: open ? 'translateX(0)' : 'translateX(-100%)',
      transition: 'transform 0.25s ease',
      boxShadow: open ? '4px 0 24px rgba(0,0,0,.5)' : 'none',
    } : {}),
  };

  return (
    <>
      {/* Overlay (mobile only) */}
      {isMobile && open && (
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0, zIndex: 199,
          background: 'rgba(0,0,0,.45)',
        }}/>
      )}

      <nav style={sidebarStyle}>
        {/* Logo + close button (mobile) */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)', display:'flex', alignItems:'center', gap:10, justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:30, height:30, background:'var(--orange)', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", color:'#fff', fontSize:20, lineHeight:1 }}>P</span>
            </div>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--cream)', letterSpacing:2, lineHeight:1 }}>PAWVY</div>
              <div style={{ fontSize:8, color:'var(--cream-30)', letterSpacing:1.2, textTransform:'uppercase', marginTop:2 }}>Make Informed Choices</div>
            </div>
          </div>
          {isMobile && (
            <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--cream-60)', cursor:'pointer', padding:4, display:'flex' }}>
              <X size={18}/>
            </button>
          )}
        </div>

        {/* Nav items */}
        <div style={{ flex:1, overflowY:'auto', padding:'10px 0', scrollbarWidth:'none' }}>
          {NAV.map((group, gi) => (
            <div key={gi}>
              {group.section && (
                <div style={{ fontSize:8.5, letterSpacing:1.3, textTransform:'uppercase', color:'var(--cream-30)', padding:'10px 16px 4px' }}>
                  {group.section}
                </div>
              )}
              {group.items.map(item => {
                const Icon   = item.icon;
                const active = item.path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.path);
                return (
                  <NavLink key={item.path} to={item.path} onClick={isMobile ? onClose : undefined} style={{ textDecoration:'none' }}>
                    <div style={{
                      display:'flex', alignItems:'center', gap:9,
                      padding:'9px 16px', fontSize:12, fontWeight:500,
                      color: active ? 'var(--orange)' : 'var(--cream-60)',
                      background: active ? 'rgba(243,111,74,.09)' : 'transparent',
                      borderLeft: `2px solid ${active ? 'var(--orange)' : 'transparent'}`,
                      transition:'all .15s', cursor:'pointer',
                    }}>
                      <Icon size={15} />
                      {item.label}
                    </div>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div style={{ padding:'10px 8px', borderTop:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9, padding:'8px', fontSize:12, fontWeight:500, color:'var(--cream-30)', borderRadius:7, cursor:'pointer' }}>
            <Settings size={15} /> Settings
          </div>
        </div>
      </nav>
    </>
  );
}

/* ── Top bar ─────────────────────────────────────────────────────── */
function Topbar({ onMenuToggle }) {
  const today    = new Date().toLocaleDateString('en-SG', { weekday:'short', day:'numeric', month:'long', year:'numeric' });
  const isMobile = useIsMobile();
  return (
    <div style={{
      height:50, flexShrink:0,
      background:'var(--navy)', borderBottom:'1px solid var(--border)',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 16px',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {/* Hamburger — always visible, opens/closes sidebar */}
        <button onClick={onMenuToggle} style={{
          background:'none', border:'none', color:'var(--cream-60)', cursor:'pointer',
          padding:4, display:'flex', alignItems:'center',
        }}>
          <Menu size={20}/>
        </button>
        {!isMobile && <div style={{ fontSize:11, color:'var(--cream-30)' }}>{today}</div>}
      </div>
      <div style={{ display:'flex', gap:5 }}>
        {['SG','MY','AU'].map((m,i) => (
          <span key={m} style={{
            fontSize:9, fontWeight:700, padding:'3px 8px', borderRadius:3, letterSpacing:.5,
            background: i===0 ? 'var(--navy-light)' : 'transparent',
            color: i===0 ? 'var(--cream)' : 'var(--cream-30)',
            border: '1px solid var(--border)',
          }}>{m}</span>
        ))}
      </div>
    </div>
  );
}

/* ── App Shell ───────────────────────────────────────────────────── */
export default function App() {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  // When screen size changes, sync sidebar state
  useEffect(() => { setSidebarOpen(!isMobile); }, [isMobile]);

  const toggleSidebar = () => setSidebarOpen(v => !v);

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      {/* Sidebar — on desktop it's always in flow; on mobile it's position:fixed */}
      {!isMobile && (
        <div style={{
          width: sidebarOpen ? 196 : 0,
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'width 0.25s ease',
        }}>
          <Sidebar open={true} onClose={() => setSidebarOpen(false)}/>
        </div>
      )}
      {isMobile && (
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}/>
      )}

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#0c1726' }}>
        <Topbar onMenuToggle={toggleSidebar}/>
        <main style={{ flex:1, overflowY:'auto', padding: isMobile ? '14px 12px' : 24 }}>
          <Routes>
            <Route path="/"              element={<Dashboard />} />
            <Route path="/sales/record"  element={<RecordSale />} />
            <Route path="/sales/event"   element={<EventSale />} />
            <Route path="/sales"         element={<Sales />} />
            <Route path="/inventory"     element={<Inventory />} />
            <Route path="/consignment"   element={<Consignment />} />
            <Route path="/products"      element={<Products />} />
            <Route path="/invoices"      element={<div style={{color:'var(--cream)',padding:20}}>Invoices — coming in Phase 3</div>} />
            <Route path="/partners"      element={<Partners />} />
            <Route path="/costs"         element={<Costs />} />
            <Route path="/reports"       element={<Reports />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
