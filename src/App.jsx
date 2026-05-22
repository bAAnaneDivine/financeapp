/**
 * @file App.jsx
 * @description Point d'entrée principal de FinanceApp.
 *
 * Ce fichier contient :
 *  - La couche de persistance (localStorage, chiffrement AES-256, migrations de schéma)
 *  - Le composant App qui orchestre la navigation et l'état global
 *
 * Architecture :
 *  App.jsx (orchestrateur)
 *    ├── theme.js          → palette, styles, formatters
 *    ├── constants.js      → clés localStorage, PACK_FRANCE, COL_OPTIONS
 *    ├── helpers.js        → calcSavedForGoal, exportCSV, downloadJSON, analyseLocale
 *    ├── utils/parser.js   → catégorisation, stats, nettoyage libellés
 *    ├── utils/crypto.js   → chiffrement AES-256-GCM
 *    └── components/       → Dashboard, Transactions, Budget, Epargne, Partage,
 *                            Analyse, Forensic, Import, Parametres, Onboarding,
 *                            UnlockForm, ResetButton, ChatIA, MappingUI
 */

import { useState, useEffect } from 'react'
import { categorize, cleanLibelle, computeIsExceptionnel } from './utils/parser.js'
import { deriveKey, encrypt, decrypt, newSalt }             from './utils/crypto.js'
import { C, S }                                             from './theme.js'
import { KEY, KEY_BACKUP, KEY_ENCRYPTION, KEY_API, SCHEMA_VERSION } from './constants.js'
import { downloadJSON }                                     from './helpers.js'

// ─── Composants extraits ───────────────────────────────────────────────────────
import Dashboard    from './components/Dashboard.jsx'
import Transactions from './components/Transactions.jsx'
import Budget       from './components/Budget.jsx'
import Epargne      from './components/Epargne.jsx'
import Partage      from './components/Partage.jsx'
import Analyse      from './components/Mensuel.jsx'
import Forensic     from './components/Forensic.jsx'
import Import       from './components/Import.jsx'
import Parametres   from './components/Parametres.jsx'
import Onboarding   from './components/Onboarding.jsx'
import UnlockForm   from './components/UnlockForm.jsx'
import Toast        from './components/Toast.jsx'

// ─── Helpers internes ─────────────────────────────────────────────────────────
/**
 * Déduplique un tableau de transactions par identifiant unique.
 * Garde la première occurrence en cas de doublon résiduel.
 * Nécessaire après un merge ou une restauration depuis localStorage.
 *
 * @param {Array} txs – Tableau de transactions potentiellement dupliquées
 * @returns {Array} Tableau sans doublons
 */
const dedupeById = (txs) => {
  const seen = new Set()
  return txs.filter(t => seen.has(t.id) ? false : seen.add(t.id))
}

// ─── Migrations de schéma ─────────────────────────────────────────────────────
/**
 * Migre un state chargé depuis localStorage vers la version courante du schéma.
 * Chaque migration est idempotente (safe à appliquer plusieurs fois).
 *
 * Historique des migrations :
 *  v1 → v2 : ajout comptes PEA + mode partage couple
 *  v2 → v3 : profil étendu (banque, devise, langue) + compteId sur les transactions
 *             + format customRules enrichi (isRegex, actif)
 *             + backup automatique avant migration (rollback possible via KEY_BACKUP)
 *
 * @param {Object} d – State brut lu depuis localStorage
 * @returns {Object} State migré vers SCHEMA_VERSION
 */
function migrateState(d) {
  const v = d._v || 1

  if (v < 2) {
    d.comptes = d.comptes || []
    d.partage = d.partage || { membres: [], depenses: [], settlements: [] }
    d._v = 2
  }

  if (v < 3) {
    // Sauvegarde silencieuse avant migration — rollback possible en lisant KEY_BACKUP
    try { localStorage.setItem(KEY_BACKUP, JSON.stringify({ ...d, _v: 2 })) } catch {}

    d.profile = d.profile || {}
    if (!d.profile.banque) d.profile.banque = ''
    if (!d.profile.devise) d.profile.devise = 'EUR'
    if (!d.profile.langue) d.profile.langue = 'fr'

    // Prépare le multi-comptes : chaque transaction reçoit un identifiant de compte
    d.transactions = (d.transactions || []).map(t =>
      t.compteId ? t : { ...t, compteId: 'default' }
    )

    // Format enrichi des règles custom : isRegex (booléen) + actif (booléen)
    d.customRules = (d.customRules || []).map(r => ({
      ...r,
      isRegex: r.isRegex !== undefined ? r.isRegex : false,
      actif:   r.actif   !== undefined ? r.actif   : true,
    }))

    d._v = 3
  }

  return d
}

// ─── Persistance localStorage ─────────────────────────────────────────────────
/**
 * Charge, migre et nettoie le state depuis localStorage.
 * Retourne null si aucune donnée ou si les données sont chiffrées.
 *
 * @returns {Object|null} State migré, ou null si absent / chiffré
 */
const load = () => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY))
    if (!d) return null
    const migrated = migrateState(d)
    if (migrated.transactions) migrated.transactions = dedupeById(migrated.transactions)
    return migrated
  } catch { return null }
}

/**
 * Sauvegarde le state en clair dans localStorage.
 * Toujours inclure _v pour que la prochaine migration puisse identifier la version.
 *
 * @param {Object} s – State complet de l'application
 */
const save = (s) => {
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, _v: SCHEMA_VERSION })) } catch {}
}

// ─── Chiffrement AES-256-GCM ──────────────────────────────────────────────────
/**
 * Vérifie si le chiffrement est activé (présence de données chiffrées dans localStorage).
 * Utilisé au démarrage pour savoir si l'app doit démarrer en mode verrouillé.
 *
 * @returns {boolean}
 */
export const isEncryptionEnabled = () => {
  try { return !!localStorage.getItem(KEY_ENCRYPTION) } catch { return false }
}

/**
 * Chiffre et sauvegarde le state avec la clé dérivée du mot de passe.
 * Supprime la version en clair (KEY) après sauvegarde chiffrée réussie.
 *
 * @param {Object}    state     – State complet à chiffrer
 * @param {CryptoKey} cryptoKey – Clé AES-256-GCM dérivée via PBKDF2
 */
export async function saveEncrypted(state, cryptoKey) {
  const plaintext = JSON.stringify({ ...state, _v: SCHEMA_VERSION })
  const { iv, data } = await encrypt(plaintext, cryptoKey)
  // Réutilise le sel existant pour ne pas invalider la clé dérivée
  const salt = JSON.parse(localStorage.getItem(KEY_ENCRYPTION) || '{}').salt || newSalt()
  localStorage.setItem(KEY_ENCRYPTION, JSON.stringify({ salt, iv, data }))
  localStorage.removeItem(KEY)
}

/**
 * Déchiffre et retourne le state, ou lève une erreur si le mot de passe est incorrect.
 * En cas de succès, migre automatiquement le schéma si nécessaire.
 *
 * @param {string} password – Mot de passe saisi par l'utilisateur
 * @returns {Promise<{ state: Object, cryptoKey: CryptoKey }>}
 * @throws {Error} Si le mot de passe est incorrect (OperationError AES-GCM)
 */
export async function loadEncrypted(password) {
  const stored = JSON.parse(localStorage.getItem(KEY_ENCRYPTION))
  if (!stored) throw new Error('Aucune donnée chiffrée trouvée')
  const key       = await deriveKey(password, Uint8Array.from(atob(stored.salt), c => c.charCodeAt(0)))
  const plaintext = await decrypt(stored.data, stored.iv, key)
  const d         = JSON.parse(plaintext)
  const migrated  = migrateState(d)
  if (migrated.transactions) migrated.transactions = dedupeById(migrated.transactions)
  return { state: migrated, cryptoKey: key }
}

/**
 * Active le chiffrement sur les données existantes.
 * Dérive une clé depuis le mot de passe, chiffre le state, supprime la version en clair.
 *
 * @param {Object} state    – State courant à chiffrer
 * @param {string} password – Mot de passe choisi par l'utilisateur (min 8 chars)
 * @returns {Promise<CryptoKey>} Clé dérivée (à conserver en mémoire pour saveEncrypted)
 */
export async function enableEncryption(state, password) {
  const salt      = newSalt()
  const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0))
  const key       = await deriveKey(password, saltBytes)
  const plaintext = JSON.stringify({ ...state, _v: SCHEMA_VERSION })
  const { iv, data } = await encrypt(plaintext, key)
  localStorage.setItem(KEY_ENCRYPTION, JSON.stringify({ salt, iv, data }))
  localStorage.removeItem(KEY)
  return key
}

/**
 * Désactive le chiffrement : restaure les données en clair et supprime le bloc chiffré.
 *
 * @param {Object} state – State courant (déjà déchiffré en mémoire)
 */
export function disableEncryption(state) {
  save(state)
  localStorage.removeItem(KEY_ENCRYPTION)
}

// ─── État initial par défaut ───────────────────────────────────────────────────
/**
 * Construit l'état initial vide pour un nouvel utilisateur ou après réinitialisation.
 * Toutes les clés doivent être présentes pour éviter les erreurs de déstructuration.
 *
 * @returns {Object} État complet avec valeurs par défaut
 */
const defaultState = () => ({
  _v:           SCHEMA_VERSION,
  transactions: [],
  profile:      { banque: '', devise: 'EUR', langue: 'fr', _onboardingDone: false },
  imports:      [],
  budgets:      {},
  objectifs:    [],
  notes:        {},
  journal:      [],
  customRules:  [],
  comptes:      [],
  partage:      { membres: [], depenses: [], settlements: [] },
})

// ─── Composant principal ───────────────────────────────────────────────────────
/**
 * Composant racine de l'application.
 *
 * Responsabilités :
 *  - Gestion de l'état global (transactions, profil, budgets, objectifs…)
 *  - Persistance automatique (localStorage en clair ou chiffré selon les préférences)
 *  - Chiffrement : démarrage verrouillé si données chiffrées → UnlockForm
 *  - Onboarding : affiché si aucun profil configuré
 *  - Navigation principale entre les onglets
 *  - Handlers d'événements transmis aux composants enfants via props
 */
export default function App() {
  // ── Chiffrement ─────────────────────────────────────────────────────────────
  // Si des données chiffrées existent, l'app démarre verrouillée.
  // L'utilisateur doit saisir son mot de passe pour accéder à ses données.
  const [cryptoKey,   setCryptoKey]   = useState(null)
  const [isLocked,    setIsLocked]    = useState(() => isEncryptionEnabled())
  const [lockError,   setLockError]   = useState('')
  const [lockLoading, setLockLoading] = useState(false)

  /**
   * Tente de déchiffrer les données avec le mot de passe saisi.
   * En cas de succès, hydrate le state et retire le verrou.
   */
  const handleUnlock = async (password) => {
    setLockLoading(true); setLockError('')
    try {
      const { state: decrypted, cryptoKey: key } = await loadEncrypted(password)
      const cr  = decrypted.customRules || []
      const nom = decrypted.profile?.nom || ''
      // Recatégorisation au démarrage pour prendre en compte les nouvelles règles
      const txs = decrypted.transactions
        ? dedupeById(decrypted.transactions.map(t =>
            t.corrected ? t : { ...t, libelle: cleanLibelle(t.libelleRaw || t.libelle), ...categorize(t.libelleRaw, t.isCredit, cr, nom) }
          ))
        : []
      setState({ ...defaultState(), ...decrypted, transactions: txs })
      setCryptoKey(key)
      setIsLocked(false)
    } catch {
      setLockError('Mot de passe incorrect.')
    }
    setLockLoading(false)
  }

  // ── État global ─────────────────────────────────────────────────────────────
  const [state, setState] = useState(() => {
    // Si chiffrement actif → état vide (l'app sera verrouillée jusqu'à handleUnlock)
    if (isEncryptionEnabled()) return defaultState()

    const saved = load()
    if (!saved) return defaultState()

    // Recatégorisation automatique au démarrage :
    // - Ré-applique cleanLibelle() pour profiter des nouvelles règles de nettoyage
    // - Ré-applique categorize() avec les customRules sauvegardées
    // - Ignore les transactions corrigées manuellement (corrected: true)
    const cr  = saved.customRules || []
    const nom = saved.profile?.nom || ''
    const txs = saved.transactions
      ? dedupeById(saved.transactions.map(t =>
          t.corrected ? t : { ...t, libelle: cleanLibelle(t.libelleRaw || t.libelle), ...categorize(t.libelleRaw, t.isCredit, cr, nom) }
        ))
      : []
    return { ...defaultState(), ...saved, transactions: txs }
  })

  const [page,          setPage]          = useState('dashboard')
  const [apiKey,        setApiKey]        = useState(() => { try { return localStorage.getItem(KEY_API) || null } catch { return null } })
  const [recatFeedback, setRecatFeedback] = useState(null)
  const [toast,         setToast]         = useState(null)

  const showToast = (message, type = 'error') => setToast({ message, type })

  // Persistance automatique à chaque changement de state
  useEffect(() => {
    const handleQuota = (e) => {
      if (e?.name === 'QuotaExceededError' || e?.code === 22) {
        showToast('Stockage navigateur plein — exporte tes données en JSON puis supprime les anciennes importations.', 'warn')
      }
    }
    if (cryptoKey) {
      saveEncrypted(state, cryptoKey).catch((e) => {
        try { save(state) } catch (e2) { handleQuota(e2) }
      })
    } else {
      try { save(state) } catch (e) { handleQuota(e) }
    }
  }, [state, cryptoKey])

  // ── Handlers d'événements ───────────────────────────────────────────────────

  /** Persiste la clé API Gemini séparément du state (non chiffrée) */
  const onSetApiKey = (key) => {
    setApiKey(key)
    try { if (key) localStorage.setItem(KEY_API, key); else localStorage.removeItem(KEY_API) } catch {}
  }

  /** Met à jour le profil utilisateur */
  const onProfile = (profile) => setState(s => ({ ...s, profile }))

  /**
   * Ajoute les nouvelles transactions importées au state en évitant les doublons.
   * Redirige vers le Dashboard après import.
   */
  const onImport = (added, filename) => {
    setState(s => {
      const merged = [...s.transactions, ...added]
      const seen   = new Set()
      const unique = merged.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
      return {
        ...s,
        transactions: unique.sort((a, b) => new Date(a.dateOpe) - new Date(b.dateOpe)),
        imports: [...(s.imports || []), { filename, date: new Date().toISOString(), n: added.length }]
      }
    })
    setPage('dashboard')
  }

  /**
   * Applique une correction manuelle de catégorie sur une transaction.
   * Marque la transaction comme corrigée (corrected: true) pour la préserver
   * des recatégorisations automatiques futures.
   */
  const onCorrect = (id, cat, sub) =>
    setState(s => ({
      ...s,
      transactions: s.transactions.map(t => t.id !== id ? t : {
        ...t, cat, sub, corrected: true, confidence: 'high',
        isExceptionnel: computeIsExceptionnel(Math.abs(t.montant), cat, sub)
      })
    }))

  const onSaveBudgets   = (budgets)   => setState(s => ({ ...s, budgets }))
  const onSaveObjectifs = (objectifs) => setState(s => ({ ...s, objectifs }))
  const onSaveNote      = (mois, txt) => setState(s => ({ ...s, notes: { ...s.notes, [mois]: txt } }))
  const onSaveJournal   = (journal)   => setState(s => ({ ...s, journal }))
  const onSaveComptes   = (comptes)   => setState(s => ({ ...s, comptes }))
  const onSavePartage   = (partage)   => setState(s => ({ ...s, partage }))
  const onSaveCustomRules = (customRules) => setState(s => ({ ...s, customRules }))

  /** Réinitialise toutes les transactions et données en gardant le profil */
  const onReset = () => setState({
    ...defaultState(),
    profile: state.profile,
  })

  /**
   * Ré-applique categorize() + cleanLibelle() sur les transactions non corrigées.
   * Le comptage `changed` est calculé avant setState pour éviter la closure stale.
   */
  const onRecategorize = () => {
    const cr = state.customRules || []
    let changed = 0
    const newTxs = dedupeById(state.transactions.map(t => {
      if (t.corrected) return t
      const newLibelle = cleanLibelle(t.libelleRaw || t.libelle)
      const newCatRes  = categorize(t.libelleRaw, t.isCredit, cr, state.profile?.nom || '')
      if (newCatRes.cat !== t.cat || newCatRes.sub !== t.sub) changed++
      return { ...t, libelle: newLibelle, ...newCatRes }
    }))
    setState(s => ({ ...s, transactions: newTxs }))
    setRecatFeedback({ changed, total: newTxs.filter(t => !t.corrected).length })
  }

  /** Exporte la sauvegarde complète (JSON) */
  const onExportJSON = () =>
    downloadJSON(state, `financeapp_backup_${new Date().toISOString().slice(0, 10)}.json`)

  /** Active le chiffrement et conserve la clé dérivée en mémoire */
  const onEnableEncryption = async (password) => {
    const key = await enableEncryption(state, password)
    setCryptoKey(key)
  }

  /** Désactive le chiffrement et efface la clé mémoire */
  const onDisableEncryption = () => {
    disableEncryption(state)
    setCryptoKey(null)
  }

  /** Restaure le state depuis un fichier JSON de sauvegarde */
  const onRestoreJSON = async (file) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!Array.isArray(data.transactions)) throw new Error('Format invalide : champ transactions manquant')
      setState({ ...defaultState(), ...data, transactions: dedupeById(data.transactions) })
      setPage('dashboard')
    } catch (e) {
      showToast(`Erreur lors de la restauration : ${e.message}`)
    }
  }

  // ── Écrans bloquants (avant navigation principale) ──────────────────────────

  if (isLocked) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 400, ...S.card, padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', fontSize: 40, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 8, textAlign: 'center', fontFamily: "'Georgia', serif" }}>Application verrouillée</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 24, textAlign: 'center' }}>
          Tes données sont chiffrées. Saisis ton mot de passe pour y accéder.
        </div>
        <UnlockForm onUnlock={handleUnlock} loading={lockLoading} error={lockError} />
      </div>
    </div>
  )

  const isNewUser = !state.transactions?.length && !state.profile?.nom && !state.profile?.banque
  if (isNewUser) return <Onboarding onDone={(profile) => { onProfile({ ...profile, _onboardingDone: true }) }} onSetApiKey={onSetApiKey} />

  // ── Navigation principale ────────────────────────────────────────────────────

  /** Nombre de transactions non catégorisées affiché dans le badge nav */
  const toClarify = state.transactions.filter(t => t.confidence === 'low' && !t.isCredit && !t.corrected).length

  const NAV = [
    { id: 'dashboard',    label: 'Dashboard',    icon: '📊' },
    { id: 'transactions', label: 'Transactions', icon: '📋' },
    { id: 'budget',       label: 'Budget',       icon: '🎯' },
    { id: 'epargne',      label: 'Épargne',      icon: '🏦' },
    { id: 'partage',      label: 'Partage',      icon: '🤝' },
    { id: 'analyse',      label: 'Analyse',      icon: '🔍' },
    { id: 'forensic',     label: 'Forensic',     icon: '🔬' },
    { id: 'import',       label: 'Importer',     icon: '📤' },
    { id: 'parametres',   label: 'Paramètres',   icon: '⚙️' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <nav role="navigation" aria-label="Navigation principale"
        style={{ background: '#080814', borderBottom: `1px solid ${C.border}`, padding: '0 2.5rem', display: 'flex', alignItems: 'center', gap: 2 }}>
        <div role="banner"
          style={{ fontSize: 19, color: C.gold, padding: '1rem 0', marginRight: 24, fontWeight: 600, fontFamily: "'Georgia', serif", letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
          ◆ FinanceApp
        </div>
        {NAV.map(item => (
          <button key={item.id} onClick={() => setPage(item.id)}
            aria-current={page === item.id ? 'page' : undefined}
            aria-label={item.label}
            style={{
              background: 'transparent', border: 'none',
              color: page === item.id ? C.text : C.muted,
              padding: '1.1rem 13px', cursor: 'pointer', fontSize: 13,
              fontWeight: page === item.id ? 500 : 400,
              borderBottom: `2px solid ${page === item.id ? C.gold : 'transparent'}`,
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit', whiteSpace: 'nowrap'
            }}>
            {item.icon} {item.label}
            {item.id === 'transactions' && toClarify > 0 && (
              <span aria-label={`${toClarify} transactions à clarifier`}
                style={{ background: C.danger, color: '#fff', fontSize: 10, padding: '1px 5px', borderRadius: 99 }}>
                {toClarify}
              </span>
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#2a2a3a', marginRight: 12 }}>{state.transactions.length} tx</span>
        <button
          onClick={() => { if (confirm('Effacer toutes les données et recommencer l\'onboarding ?')) { localStorage.removeItem(KEY); window.location.reload() } }}
          style={{ background: 'transparent', border: 'none', color: '#2a2a3a', fontSize: 11, cursor: 'pointer', padding: '0 4px' }}
          title="Réinitialiser">↺
        </button>
      </nav>

      {/* ── Pages ────────────────────────────────────────────────────────────── */}
      {page === 'dashboard'    && <Dashboard    transactions={state.transactions} profile={state.profile} objectifs={state.objectifs || []} budgets={state.budgets || {}} comptes={state.comptes || []} onNavigate={setPage} />}
      {page === 'transactions' && <Transactions transactions={state.transactions} onCorrect={onCorrect} />}
      {page === 'budget'       && <Budget       transactions={state.transactions} budgets={state.budgets} objectifs={state.objectifs} notes={state.notes} journal={state.journal || []} onSaveBudgets={onSaveBudgets} onSaveObjectifs={onSaveObjectifs} onSaveNote={onSaveNote} onSaveJournal={onSaveJournal} />}
      {page === 'epargne'      && <Epargne      comptes={state.comptes || []} transactions={state.transactions} onSaveComptes={onSaveComptes} />}
      {page === 'partage'      && <Partage      partage={state.partage || { membres: [], depenses: [], settlements: [] }} onSavePartage={onSavePartage} showToast={showToast} />}
      {page === 'analyse'      && <Analyse      transactions={state.transactions} profile={state.profile} journal={state.journal || []} apiKey={apiKey} onSetApiKey={onSetApiKey} budgets={state.budgets || {}} />}
      {page === 'forensic'     && <Forensic     transactions={state.transactions} />}
      {page === 'import'       && <Import       transactions={state.transactions} customRules={state.customRules || []} imports={state.imports || []} recatFeedback={recatFeedback} nom={state.profile?.nom || ''} apiKey={apiKey} onImport={onImport} onReset={onReset} onRecategorize={onRecategorize} onSaveCustomRules={onSaveCustomRules} onExportJSON={onExportJSON} onRestoreJSON={onRestoreJSON} showToast={showToast} />}
      {page === 'parametres'   && <Parametres   profile={state.profile} apiKey={apiKey} transactions={state.transactions} onSaveProfile={onProfile} onSetApiKey={onSetApiKey} onExportJSON={onExportJSON} onReset={onReset} onEnableEncryption={onEnableEncryption} onDisableEncryption={onDisableEncryption} isEncrypted={!!cryptoKey} />}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
