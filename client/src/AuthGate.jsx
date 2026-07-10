import React, { useState, useEffect, useRef } from 'react';
import { authApi } from './api';

export default function AuthGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed]     = useState(false);
  const [pin, setPin]           = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  const inputRef = useRef(null);

  async function checkSession() {
    const token = localStorage.getItem('pawvy_auth_token');
    if (!token) { setAuthed(false); setChecking(false); return; }
    try {
      await authApi.me();
      setAuthed(true);
    } catch {
      localStorage.removeItem('pawvy_auth_token');
      localStorage.removeItem('pawvy_auth_expires');
      setAuthed(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkSession();
    const onExpired = () => setAuthed(false);
    window.addEventListener('pawvy:session-expired', onExpired);
    return () => window.removeEventListener('pawvy:session-expired', onExpired);
  }, []);

  useEffect(() => {
    if (!authed && !checking) inputRef.current?.focus();
  }, [authed, checking]);

  async function submit(e) {
    e.preventDefault();
    if (pin.length !== 4) { setError('Enter your 4-digit PIN.'); return; }
    setBusy(true); setError('');
    try {
      const res = await authApi.login(pin);
      localStorage.setItem('pawvy_auth_token', res.token);
      localStorage.setItem('pawvy_auth_expires', res.expires_at);
      setAuthed(true);
    } catch (err) {
      setError(err.message || 'Incorrect PIN.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div style={{minHeight:'100vh',background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{color:'var(--cream-30)',fontSize:13}}>Loading…</span>
      </div>
    );
  }

  if (!authed) {
    return (
      <div style={{minHeight:'100vh',background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
        <form onSubmit={submit} style={{width:280,display:'flex',flexDirection:'column',alignItems:'center',gap:20}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:1, color:'var(--cream)', marginBottom:4}}>PAWVY</div>
            <div style={{fontSize:12,color:'var(--cream-30)'}}>Enter today's PIN to continue</div>
          </div>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,4))}
            style={{
              width:160, textAlign:'center', fontSize:32, letterSpacing:18,
              background:'var(--navy-light)', border:'1px solid var(--border)', borderRadius:10,
              padding:'12px 0 12px 18px', color:'var(--cream)',
            }}
            autoFocus
          />
          {error && <div style={{fontSize:12,color:'#f87171',textAlign:'center'}}>{error}</div>}
          <button type="submit" disabled={busy || pin.length !== 4}
            style={{
              width:'100%', padding:'11px 0', borderRadius:8, border:'none',
              background: busy || pin.length !== 4 ? 'var(--navy-light)' : 'var(--orange)',
              color: busy || pin.length !== 4 ? 'var(--cream-30)' : '#fff',
              fontWeight:700, fontSize:13, cursor: busy || pin.length !== 4 ? 'default' : 'pointer',
            }}>
            {busy ? 'Checking…' : 'Log In'}
          </button>
        </form>
      </div>
    );
  }

  return children;
}
