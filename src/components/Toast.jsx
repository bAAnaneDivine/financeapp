import { useEffect } from 'react'
import { C } from '../theme.js'

const STYLES = {
  error:   { bg: '#2a0a0a', border: C.danger,  icon: '❌' },
  success: { bg: '#0a2a0a', border: C.success, icon: '✅' },
  warn:    { bg: '#2a1a00', border: C.warn,    icon: '⚠️' },
  info:    { bg: '#0a0a2a', border: C.border,  icon: 'ℹ️' },
}

/**
 * Toast de notification auto-disparaissant (4s).
 * Supporte un bouton de confirmation pour remplacer les confirm() bloquants.
 *
 * @param {{ message, type?, onClose, onConfirm?, confirmLabel? }} props
 * - Sans onConfirm : notification simple (remplace alert)
 * - Avec onConfirm : demande de confirmation (remplace confirm) — pas d'auto-dismiss
 */
export default function Toast({ message, type = 'error', onClose, onConfirm, confirmLabel = 'Confirmer' }) {
  useEffect(() => {
    if (onConfirm) return  // pas d'auto-dismiss si on attend une confirmation
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose, onConfirm])

  const s = STYLES[type] || STYLES.error

  return (
    <div role={onConfirm ? 'dialog' : 'alert'} aria-live="assertive" style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12,
      padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
      zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
      fontSize: 13, color: C.text, maxWidth: 520, whiteSpace: 'pre-wrap',
    }}>
      <span style={{ fontSize: 16 }}>{s.icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      {onConfirm && (
        <button onClick={() => { onConfirm(); onClose() }} style={{
          background: C.danger, border: 'none', color: '#fff',
          cursor: 'pointer', fontSize: 12, fontWeight: 600,
          padding: '4px 12px', borderRadius: 6,
        }}>{confirmLabel}</button>
      )}
      <button onClick={onClose} style={{
        background: 'none', border: 'none', color: C.muted,
        cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px',
      }}>×</button>
    </div>
  )
}
