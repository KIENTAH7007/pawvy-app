import React from 'react'

export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 24,
    }}>
      <div style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 'clamp(32px, 8vw, 56px)',
        letterSpacing: 1,
        color: 'var(--cream)',
      }}>
        PAWVY ORDER PORTAL
      </div>
      <div style={{
        marginTop: 12,
        fontSize: 14,
        color: 'rgba(245,242,235,.5)',
        maxWidth: 420,
      }}>
        This page is under construction. The full ordering catalogue is coming soon.
      </div>
      <div style={{
        marginTop: 28,
        width: 46,
        height: 3,
        background: 'var(--orange)',
        borderRadius: 2,
      }} />
    </div>
  )
}
