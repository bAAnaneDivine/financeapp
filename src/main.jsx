import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './i18n/index.js'
import { registerSW } from 'virtual:pwa-register'

// ─── Bandeau mise à jour PWA ──────────────────────────────────────────────────
function UpdateBanner() {
  const [show, setShow]           = useState(false)
  const [updateSW, setUpdateSW]   = useState(null)

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() { setShow(true) },
      onOfflineReady() {},
    })
    setUpdateSW(() => update)
  }, [])

  if (!show) return null
  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      background: '#11112a', border: '1px solid rgba(201,169,110,0.5)',
      borderRadius: 12, padding: '10px 18px', display: 'flex', alignItems: 'center',
      gap: 14, zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      fontSize: 13, color: '#e2d9c8'
    }}>
      <span>🔄 Mise à jour disponible</span>
      <button onClick={() => updateSW?.(true)} style={{
        background: '#c9a96e', border: 'none', color: '#080814',
        padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
        fontSize: 13, fontWeight: 600
      }}>Recharger</button>
      <button onClick={() => setShow(false)} style={{
        background: 'none', border: 'none', color: '#5a5a7a',
        cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1
      }}>×</button>
    </div>
  )
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a16', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#11112a', border: '1px solid #3a1a1a', borderRadius: 16, padding: '2.5rem', maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>💥</div>
          <div style={{ color: '#e2d9c8', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Une erreur inattendue s'est produite</div>
          <div style={{ color: '#5a5a7a', fontSize: 13, marginBottom: 20, fontFamily: 'monospace', background: '#080814', padding: '8px 12px', borderRadius: 8, wordBreak: 'break-all' }}>
            {this.state.error?.message || String(this.state.error)}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={() => this.setState({ error: null })}
              style={{ background: 'transparent', border: '1px solid #1e1e3a', color: '#5a5a7a', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
              Réessayer
            </button>
            <button
              onClick={() => { localStorage.removeItem('financeapp_v2'); window.location.reload() }}
              style={{ background: '#e05555', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Réinitialiser les données
            </button>
          </div>
        </div>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <UpdateBanner />
    </ErrorBoundary>
  </React.StrictMode>
)
