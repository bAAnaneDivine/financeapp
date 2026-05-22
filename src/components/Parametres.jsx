/**
 * @file Parametres.jsx
 * @description Écran de configuration et de gestion des données personnelles.
 *
 * Sections :
 *  - Profil utilisateur (nom, banque, devise, langue)
 *  - Revenus et objectifs d'épargne
 *  - Clé API Gemini (import IA)
 *  - Protection par mot de passe (chiffrement AES-256)
 *  - Données et confidentialité (export, suppression, révocation consentement)
 */

import { useState } from 'react'
import { C, S }     from '../theme.js'
import { CATEGORIES } from '../utils/parser.js'
import { KEY_CONSENT } from '../constants.js'
import { exportCSV, downloadJSON } from '../helpers.js'

function Parametres({ profile, apiKey, transactions = [], onSaveProfile, onSetApiKey, onExportJSON, onReset, onEnableEncryption, onDisableEncryption, isEncrypted = false }) {
  const [form, setForm]       = useState({ ...profile })
  const [key, setKey]         = useState(apiKey || '')
  const [saved, setSaved]     = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [encPwd, setEncPwd]   = useState('')
  const [encPwd2, setEncPwd2] = useState('')
  const [encLoading, setEncLoading] = useState(false)
  const [encError, setEncError]     = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    onSaveProfile(form)
    if (key !== (apiKey || '')) onSetApiKey(key.trim() || null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const Section = ({ title, children }) => (
    <div style={{ ...S.card, padding: '1.4rem', marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  )

  const Field = ({ label, hint, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 4, opacity: 0.7 }}>{hint}</div>}
    </div>
  )

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h2 style={{ fontSize: 22, color: C.text, marginBottom: 20, fontFamily: "'Georgia', serif" }}>⚙️ Paramètres</h2>

      <Section title="Profil">
        <Field label="Nom complet" hint="Utilisé pour détecter tes virements entre comptes">
          <input value={form.nom || ''} onChange={e => set('nom', e.target.value)} placeholder="Marie Dupont" style={S.input} />
        </Field>
        <Field label="Banque principale" hint="Optionnel">
          <input value={form.banque || ''} onChange={e => set('banque', e.target.value)} placeholder="BNP Paribas, Crédit Agricole…" style={S.input} />
        </Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Devise">
            <select value={form.devise || 'EUR'} onChange={e => set('devise', e.target.value)}
              style={{ ...S.input, width: 'auto' }}>
              {['EUR', 'GBP', 'CHF', 'DKK', 'SEK', 'NOK', 'PLN'].map(d => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Langue">
            <select value={form.langue || 'fr'} onChange={e => set('langue', e.target.value)}
              style={{ ...S.input, width: 'auto' }}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Revenus & objectifs">
        <Field label="Revenu mensuel net (€)">
          <input value={form.revenu || ''} onChange={e => set('revenu', e.target.value)} type="number" placeholder="2 000" style={S.input} />
        </Field>
        <Field label="Type de revenu">
          <div style={{ display: 'flex', gap: 8 }}>
            {['fixe', 'variable'].map(t => (
              <button key={t} onClick={() => set('type_revenu', t)} style={{
                ...S.ghost, flex: 1, fontSize: 12, padding: '7px 10px',
                background: (form.type_revenu || 'variable') === t ? C.gold : 'transparent',
                color: (form.type_revenu || 'variable') === t ? '#080814' : C.muted,
                border: `1px solid ${(form.type_revenu || 'variable') === t ? C.gold : C.border}`
              }}>
                {t === 'fixe' ? '💼 Revenu fixe' : '📊 Variable'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Charges fixes mensuelles (€)">
          <input value={form.charges || ''} onChange={e => set('charges', e.target.value)} type="number" placeholder="800" style={S.input} />
        </Field>
        <Field label="Objectif d'épargne mensuel (€)">
          <input value={form.epargne || ''} onChange={e => set('epargne', e.target.value)} type="number" placeholder="200" style={S.input} />
        </Field>
      </Section>

      <Section title="Clé API Gemini">
        <Field label="Clé API" hint={<>Gratuite sur <strong>aistudio.google.com</strong> · Permet d'importer des relevés de n'importe quelle banque via l'IA</>}>
          <input value={key} onChange={e => setKey(e.target.value)} placeholder="AIza…" type="password" style={S.input} />
        </Field>
        {apiKey && (
          <div style={{ fontSize: 12, color: C.success, marginBottom: 8 }}>✅ Clé configurée</div>
        )}
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          🔒 Sans clé API, l'import fonctionne uniquement pour les relevés CA (PDF) et les formats CSV/XLSX standards.
        </div>
      </Section>

      <Section title="Protection par mot de passe">
        {!isEncrypted ? (
          <>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>
              ⚠️ Tes données sont actuellement stockées <strong style={{ color: C.warn }}>en clair</strong> dans le navigateur. Toute extension ou personne ayant accès à ce navigateur peut les lire.
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={encPwd} onChange={e => setEncPwd(e.target.value)} type="password" placeholder="Nouveau mot de passe" style={{ ...S.input, flex: 1 }} />
              <input value={encPwd2} onChange={e => setEncPwd2(e.target.value)} type="password" placeholder="Confirmer" style={{ ...S.input, flex: 1 }} />
            </div>
            {encError && <div style={{ color: C.danger, fontSize: 12, marginBottom: 8 }}>{encError}</div>}
            <div style={{ fontSize: 11, color: C.warn, marginBottom: 10 }}>⚠ Si tu oublie ce mot de passe, tes données seront irrécupérables. Fais une sauvegarde JSON d'abord.</div>
            <button onClick={async () => {
              if (encPwd.length < 8) { setEncError('8 caractères minimum.'); return }
              if (encPwd !== encPwd2) { setEncError('Les mots de passe ne correspondent pas.'); return }
              setEncLoading(true); setEncError('')
              try { await onEnableEncryption(encPwd); setEncPwd(''); setEncPwd2('') }
              catch { setEncError('Erreur lors du chiffrement.') }
              setEncLoading(false)
            }} disabled={!encPwd || !encPwd2 || encLoading}
              style={{ ...S.btn, opacity: (!encPwd || !encPwd2 || encLoading) ? 0.5 : 1, fontSize: 13 }}>
              {encLoading ? 'Chiffrement…' : '🔒 Activer le chiffrement'}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: C.success, marginBottom: 12 }}>✅ Données chiffrées avec AES-256-GCM — seul ton mot de passe permet de les lire.</div>
            <button onClick={onDisableEncryption} style={{ ...S.ghost, fontSize: 12, borderColor: 'rgba(224,85,85,0.4)', color: C.danger }}>
              🔓 Désactiver le chiffrement (données en clair)
            </button>
          </>
        )}
      </Section>

      <Section title="Données & confidentialité">
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
          Toutes tes données financières restent sur ton appareil (localStorage du navigateur). Aucun serveur.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button onClick={onExportJSON} style={{ ...S.ghost, fontSize: 12 }}>
            ⬇ Exporter JSON (sauvegarde complète)
          </button>
          <button onClick={() => exportCSV(transactions)} style={{ ...S.ghost, fontSize: 12 }}>
            ⬇ Exporter CSV (transactions)
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          <strong style={{ color: C.text }}>Consentement Gemini :</strong>{' '}
          {localStorage.getItem(KEY_CONSENT) === 'true'
            ? <>Accordé — <button onClick={() => { localStorage.removeItem(KEY_CONSENT); window.location.reload() }} style={{ background: 'none', border: 'none', color: C.warn, cursor: 'pointer', fontSize: 12, padding: 0, textDecoration: 'underline' }}>Révoquer</button></>
            : 'Non accordé'}
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 8 }}>
          {!resetConfirm
            ? <button onClick={() => setResetConfirm(true)} style={{ ...S.ghost, fontSize: 12, borderColor: 'rgba(224,85,85,0.4)', color: C.danger }}>
                🗑 Supprimer toutes les données
              </button>
            : <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: C.danger }}>Confirmer la suppression ? Cette action est irréversible.</span>
                <button onClick={() => setResetConfirm(false)} style={{ ...S.ghost, fontSize: 12 }}>Annuler</button>
                <button onClick={() => { onReset(); setResetConfirm(false) }} style={{ ...S.ghost, fontSize: 12, background: 'rgba(224,85,85,0.15)', color: C.danger, borderColor: 'rgba(224,85,85,0.4)' }}>Supprimer</button>
              </div>
          }
        </div>
      </Section>

      <button onClick={handleSave} style={{ ...S.btn, width: '100%', padding: '13px' }}>
        {saved ? '✅ Enregistré' : 'Enregistrer les modifications'}
      </button>
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: C.muted }}>
        FinanceApp v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'} · MIT · Open source
      </div>
    </div>
  )
}

export default Parametres
