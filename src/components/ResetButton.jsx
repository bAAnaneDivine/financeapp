/**
 * @file ResetButton.jsx
 * @description Bouton de réinitialisation des données avec confirmation double.
 */

import { useState } from 'react'
import { C, S } from '../theme.js'

function ResetButton({ onReset }) {
  const [confirm, setConfirm] = useState(false)
  if (confirm) return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ color: C.danger, fontSize: 13 }}>Confirmer ?</span>
      <button onClick={() => { onReset(); setConfirm(false) }} style={{ ...S.btn, background: C.danger, color: '#fff', padding: '7px 16px', fontSize: 13 }}>Oui, tout effacer</button>
      <button onClick={() => setConfirm(false)} style={{ ...S.ghost, padding: '7px 14px', fontSize: 13 }}>Annuler</button>
    </div>
  )
  return <button onClick={() => setConfirm(true)} style={{ ...S.ghost, color: C.danger, borderColor: 'rgba(224,85,85,0.4)', whiteSpace: 'nowrap', fontSize: 13 }}>🗑 Tout effacer</button>
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

export default ResetButton
