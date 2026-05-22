/**
 * @file UnlockForm.jsx
 * @description Formulaire de déverrouillage affiché quand les données sont chiffrées.
 */

import { useState } from 'react'
import { C, S } from '../theme.js'

function UnlockForm({ onUnlock, loading, error }) {
  const [pwd, setPwd] = useState('')
  return (
    <div>
      <input value={pwd} onChange={e => setPwd(e.target.value)}
        type="password" placeholder="Mot de passe" autoFocus
        onKeyDown={e => e.key === 'Enter' && pwd && onUnlock(pwd)}
        style={{ ...S.input, marginBottom: 10 }} />
      {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <button onClick={() => onUnlock(pwd)} disabled={!pwd || loading}
        style={{ ...S.btn, width: '100%', opacity: (!pwd || loading) ? 0.5 : 1 }}>
        {loading ? 'Déchiffrement…' : 'Déverrouiller →'}
      </button>
    </div>
  )
}

export default UnlockForm
