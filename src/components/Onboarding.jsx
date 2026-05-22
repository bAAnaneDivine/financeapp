/**
 * @file Onboarding.jsx
 * @description Flux de configuration initiale collectant le profil utilisateur étape par étape.
 */

import { useState } from 'react'
import { C, S } from '../theme.js'

function Onboarding({ onDone, onSetApiKey }) {
  const [step, setStep] = useState(0)
  const [d, setD] = useState({ nom: '', banque: '', revenu: '', type_revenu: 'variable', charges: '', epargne: '', devise: 'EUR', langue: 'fr', _apikey: '' })
  const set = (k, v) => setD(p => ({ ...p, [k]: v }))

  const steps = [
    { title: 'Bienvenue 👋', desc: 'Quelques questions pour calibrer l\'app. Tout reste sur ton appareil, rien n\'est envoyé.' },
    { key: 'nom',      title: 'Ton nom complet ?',               placeholder: 'Marie Dupont',      hint: 'Utilisé pour détecter automatiquement tes virements entre comptes' },
    { key: 'banque',   title: 'Ta banque principale ?',          placeholder: 'BNP, Boursorama…',  hint: 'Optionnel — aide à choisir le bon parseur pour tes relevés', optional: true },
    { key: 'revenu',   title: 'Ton revenu mensuel net ?',        placeholder: '2 000', type: 'number', hint: 'Montant reçu après impôts chaque mois' },
    { key: 'charges',  title: 'Tes charges fixes mensuelles ?',  placeholder: '800',   type: 'number', hint: 'Loyer, abonnements, assurances — ce qui part quoi qu\'il arrive' },
    { key: 'epargne',  title: 'Objectif d\'épargne mensuel ?',   placeholder: '200',   type: 'number', hint: 'Montant idéal à mettre de côté chaque mois' },
    { key: '_apikey',  title: 'Clé API Gemini ?',                placeholder: 'AIza…',             hint: 'Optionnel — permet d\'importer des relevés de n\'importe quelle banque via l\'IA. Gratuite sur aistudio.google.com', optional: true },
  ]
  const cur = steps[step]

  const handleDone = () => {
    const { _apikey, ...profile } = d
    if (_apikey) onSetApiKey(_apikey)
    onDone({ ...profile })
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 460, padding: '2.5rem', ...S.card }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: '2.5rem' }}>
          {steps.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: i <= step ? C.gold : C.border, transition: 'background 0.3s' }} />
          ))}
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, color: C.text, marginBottom: 8, fontFamily: "'Georgia', serif" }}>{cur.title}</div>
        {cur.desc && <div style={{ fontSize: 14, color: C.muted, marginBottom: 28, lineHeight: 1.6 }}>{cur.desc}</div>}
        {cur.hint && <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>{cur.hint}</div>}
        {cur.key && (
          <input value={d[cur.key]} onChange={e => set(cur.key, e.target.value)}
            placeholder={cur.placeholder} type={cur.type || 'text'}
            style={{ ...S.input, fontSize: 16, marginBottom: 12 }} />
        )}
        {cur.key === 'revenu' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {['fixe', 'variable'].map(t => (
              <button key={t} onClick={() => set('type_revenu', t)} style={{
                ...S.ghost, flex: 1, fontSize: 12, padding: '7px 10px',
                background: d.type_revenu === t ? C.gold : 'transparent',
                color: d.type_revenu === t ? '#080814' : C.muted,
                border: `1px solid ${d.type_revenu === t ? C.gold : C.border}`
              }}>
                {t === 'fixe' ? '💼 Revenu fixe' : '📊 Variable (portage, freelance…)'}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          {step > 0 ? <button onClick={() => setStep(s => s - 1)} style={S.ghost}>← Retour</button> : <div />}
          <div style={{ display: 'flex', gap: 8 }}>
            {cur.optional && step < steps.length - 1 && (
              <button onClick={() => setStep(s => s + 1)} style={{ ...S.ghost, fontSize: 12 }}>Passer</button>
            )}
            {step < steps.length - 1
              ? <button onClick={() => setStep(s => s + 1)} style={S.btn}>Continuer →</button>
              : <button onClick={handleDone} style={S.btn}>Commencer →</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Onboarding
