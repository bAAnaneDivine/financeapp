/**
 * @file Import.jsx
 * @description Onglet d'importation des relevés bancaires.
 *
 * Supporte trois modes d'import :
 *  1. Standard (drag & drop) : PDF Crédit Agricole, CSV/XLSX avec détection auto
 *  2. IA Gemini : n'importe quelle banque via l'API Google Gemini Flash
 *  3. Mapping assisté (4c) : colonnes CSV non reconnues → mapping manuel mémorisé
 *
 * Flux par mode :
 *  - PDF/CSV/XLSX → detectAndParse → confirmation colonnes → deduplication → import
 *  - IA Gemini → consentement → parseWithGemini → validation anomalies → import
 *  - CSV confiance basse → MappingUI → parseWithMapping → confirmation → import
 *
 * Inclut également : règles de catégorisation personnalisées (ajout/toggle/suppression
 * /export/import/Pack France) et la gestion de la sauvegarde/restauration JSON.
 */

import { useState, useRef } from 'react'
import { detectAndParse, extractPeaText, parsePEA } from '../utils/parsers/index.js'
import { parseWithGemini } from '../utils/parsers/gemini.js'
import { parseWithMapping } from '../utils/parsers/csv.js'
import { deduplicate, CATEGORIES } from '../utils/parser.js'
import { C, S, fmt, fmtD } from '../theme.js'
import { KEY_CONSENT, KEY_CSV_MAPPINGS, PACK_FRANCE } from '../constants.js'
import MappingUI from './MappingUI.jsx'



// ─── IMPORT ───────────────────────────────────────────────────────────────────
function Import({ transactions, customRules = [], imports = [], recatFeedback = null, nom = '', apiKey = null, onImport, onReset, onRecategorize, onSaveCustomRules, onExportJSON, onRestoreJSON }) {
  const [drag, setDrag]               = useState(false)
  const [loading, setLoading]         = useState(false)
  const [preview, setPreview]         = useState(null)
  const [csvConfirm, setCsvConfirm]   = useState(null)
  const [aiConfirm, setAiConfirm]     = useState(null)
  const [mappingState, setMappingState] = useState(null) // { headers, sampleRows, rawText, sep, filename }
  const [showConsent, setShowConsent] = useState(false)
  const [pendingAiFile, setPendingAiFile] = useState(null)
  const [result, setResult]           = useState(null)
  const [rulesOpen, setRulesOpen]     = useState(false)
  const [ruleForm, setRuleForm]       = useState({ pattern: '', cat: 'alimentation', sub: '', isRegex: false })
  const [ruleError, setRuleError]     = useState('')
  const rulesImportRef = useRef()
  const fileRef    = useRef()
  const aiFileRef  = useRef()
  const restoreRef = useRef()

  const validatePattern = (pat) => {
    if (!pat.trim()) { setRuleError(''); return true }
    try { new RegExp(pat, 'i'); setRuleError(''); return true }
    catch (e) { setRuleError(`Regex invalide : ${e.message.split(':').pop().trim()}`); return false }
  }

  const process = async (file) => {
    if (!file) return
    setLoading(true); setResult(null); setPreview(null); setCsvConfirm(null)
    try {
      const parsed = await detectAndParse(file, { nom }, customRules)
      if (parsed.type === 'PEA') {
        setResult({ error: 'Relevé PEA détecté — import PEA géré dans l\'onglet Épargne.' })
        setLoading(false); return
      }
      // CSV/XLSX : étape de confirmation avant import définitif
      if (parsed.fileType === 'csv' || parsed.fileType === 'xlsx' || parsed.fileType === 'xls') {
        setCsvConfirm({ parsed, filename: file.name })
        setLoading(false); return
      }
      const { added, dupes } = deduplicate(transactions, parsed.transactions)
      setPreview({ added, dupes, filename: file.name, compte: parsed.compte })
    } catch (e) {
      console.error(e)
      let msg = 'Impossible de lire ce fichier. Vérifie qu\'il s\'agit d\'un relevé bancaire valide.'
      if (e.code === 'CSV_LOW_CONFIDENCE') {
        // Vérifier d'abord si un mapping mémorisé existe pour ces en-têtes
        const fingerprint = (e.headers || []).join('|').toLowerCase()
        const saved = JSON.parse(localStorage.getItem(KEY_CSV_MAPPINGS) || '{}')
        if (saved[fingerprint]) {
          // Mapping connu → parser directement
          try {
            const parsed = parseWithMapping(e.rawText, e.sep, saved[fingerprint], { nom }, customRules)
            if (parsed.fileType === 'csv' || parsed.parserUsed === 'csv-manual') {
              setCsvConfirm({ parsed, filename: 'import.csv' })
              setLoading(false); return
            }
          } catch {}
        }
        setMappingState({ headers: e.headers, sampleRows: e.sample, rawText: e.rawText, sep: e.sep, filename: 'import.csv' })
        setLoading(false); return
      } else if (e.code === 'CSV_EMPTY' || e.code === 'CSV_NO_DATA')
        msg = `Fichier vide ou sans données : ${e.message}`
      setResult({ error: msg })
    }
    setLoading(false)
  }

  const confirmCsv = () => {
    if (!csvConfirm) return
    const { parsed, filename } = csvConfirm
    const { added, dupes } = deduplicate(transactions, parsed.transactions)
    setCsvConfirm(null)
    setPreview({ added, dupes, filename, compte: parsed.compte || filename })
  }

  // ── Gemini ────────────────────────────────────────────────────────────────
  const startGemini = (file) => {
    if (!file) return
    const hasConsent = localStorage.getItem(KEY_CONSENT) === 'true'
    if (!hasConsent) { setPendingAiFile(file); setShowConsent(true); return }
    runGemini(file)
  }

  const acceptConsent = () => {
    localStorage.setItem(KEY_CONSENT, 'true')
    setShowConsent(false)
    if (pendingAiFile) { runGemini(pendingAiFile); setPendingAiFile(null) }
  }

  const runGemini = async (file) => {
    setLoading(true); setResult(null); setPreview(null); setCsvConfirm(null); setAiConfirm(null)
    try {
      const parsed = await parseWithGemini(file, apiKey, { nom }, customRules)
      setAiConfirm({ parsed, filename: file.name })
    } catch (e) {
      console.error(e)
      const msgs = {
        GEMINI_QUOTA:   e.message,
        GEMINI_AUTH:    e.message,
        GEMINI_TIMEOUT: e.message,
        GEMINI_PARSE:   e.message,
        GEMINI_ERROR:   e.message,
      }
      setResult({ error: msgs[e.code] || `Erreur IA : ${e.message}` })
    }
    setLoading(false)
  }

  const confirmAi = () => {
    if (!aiConfirm) return
    const { parsed, filename } = aiConfirm
    const { added, dupes } = deduplicate(transactions, parsed.transactions)
    setAiConfirm(null)
    setPreview({ added, dupes, filename, compte: 'Import IA' })
  }

  // ── Mapping assisté (4c) ───────────────────────────────────────────────────
  const applyMapping = (mapping, save) => {
    if (!mappingState) return
    const { rawText, sep, headers, filename } = mappingState
    try {
      if (save) {
        const fingerprint = headers.join('|').toLowerCase()
        const saved = JSON.parse(localStorage.getItem(KEY_CSV_MAPPINGS) || '{}')
        saved[fingerprint] = mapping
        localStorage.setItem(KEY_CSV_MAPPINGS, JSON.stringify(saved))
      }
      const parsed = parseWithMapping(rawText, sep, mapping, { nom }, customRules)
      setMappingState(null)
      setCsvConfirm({ parsed, filename })
    } catch (e) {
      setMappingState(null)
      setResult({ error: `Erreur de mapping : ${e.message}` })
    }
  }

  const confirm = () => {
    if (!preview) return
    const { added, filename, dupes } = preview
    setPreview(null)
    onImport(added, filename)
    setResult({ ok: true, n: added.length, d: dupes.length })
  }

  const addRule = () => {
    if (!ruleForm.pattern.trim() || !ruleForm.sub) return
    if (!validatePattern(ruleForm.pattern)) return
    const newRule = { id: Date.now().toString(36), pattern: ruleForm.pattern.trim(), isRegex: ruleForm.isRegex, actif: true, cat: ruleForm.cat, sub: ruleForm.sub }
    onSaveCustomRules([...customRules, newRule])
    setRuleForm(f => ({ ...f, pattern: '', sub: '', isRegex: false }))
    setRuleError('')
  }

  const deleteRule  = (id) => onSaveCustomRules(customRules.filter(r => r.id !== id))
  const toggleRule  = (id) => onSaveCustomRules(customRules.map(r => r.id === id ? { ...r, actif: !r.actif } : r))

  const exportRules = () => {
    const data = { version: '1.0', exportDate: new Date().toISOString().slice(0, 10), rules: customRules }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'regles_categorisation.json'
    a.click(); URL.revokeObjectURL(url)
  }

  const importRules = async (file) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      // Supporte le format backup (Phase 0) ET le format export direct
      const incoming = (data.rules || data)
        .filter(r => r.pattern && r.cat && r.sub)
        .map(r => ({
          id:      r.id || Date.now().toString(36) + Math.random().toString(36).slice(2),
          pattern: r.pattern,
          isRegex: r.isRegex ?? false,
          actif:   r.actif   ?? true,
          cat:     r.cat,
          sub:     r.sub,
        }))
      const existingPatterns = new Set(customRules.map(r => r.pattern))
      const newRules = incoming.filter(r => !existingPatterns.has(r.pattern))
      onSaveCustomRules([...customRules, ...newRules])
    } catch (e) {
      alert(`Erreur import règles : ${e.message}`)
    }
  }

  const hasConsent = localStorage.getItem(KEY_CONSENT) === 'true'
  const modeLabel  = !apiKey ? '🔒 Local uniquement' : hasConsent ? '☁️ Gemini disponible' : '☁️ Clé API configurée'

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 760, margin: '0 auto' }}>

      {/* ── Modal de consentement Gemini ───────────────────────────────── */}
      {showConsent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ ...S.card, maxWidth: 500, padding: '2rem' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 12 }}>☁️ Import via IA — Consentement requis</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              Pour analyser ce fichier, son contenu textuel sera envoyé à <strong style={{ color: C.text }}>Google Gemini Flash</strong> (API externe).
            </div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
              <strong style={{ color: C.warn }}>Ce qui est transmis :</strong> le texte extrait du relevé (libellés, dates, montants). Ton nom et tes données de compte restent sur ton appareil.
            </div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>
              Google peut conserver les données selon ses <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" style={{ color: C.gold }}>conditions d'utilisation de l'API</a>. En mode sans clé (Gratuit), les données peuvent être utilisées pour améliorer les modèles.
            </div>
            <div style={{ fontSize: 12, color: C.muted, background: '#080814', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
              💡 Alternative sans envoi de données : <strong style={{ color: C.text }}>Ollama</strong> (IA locale, installation requise).
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowConsent(false); setPendingAiFile(null) }} style={S.ghost}>Annuler</button>
              <button onClick={acceptConsent} style={S.btn}>Comprendre et accepter →</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <h2 style={{ fontSize: 26, color: C.text, fontFamily: "'Georgia', serif", margin: 0 }}>Importer un relevé</h2>
        <span style={{ fontSize: 11, color: apiKey ? C.success : C.muted, background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`, borderRadius: 99, padding: '3px 10px', marginTop: 6 }}>{modeLabel}</span>
      </div>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 28 }}>PDF · CSV · XLSX · Déduplication automatique</p>

      <div
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); process(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${drag ? C.gold : C.border}`, borderRadius: 16,
          padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer',
          background: drag ? 'rgba(201,169,110,0.05)' : C.card, marginBottom: 16, transition: 'all 0.2s'
        }}
      >
        <div style={{ fontSize: 42, marginBottom: 12 }}>📄</div>
        <div style={{ color: C.text, fontSize: 16, marginBottom: 6 }}>Glisse ton relevé ici</div>
        <div style={{ color: C.muted, fontSize: 13 }}>ou clique pour sélectionner · PDF · CSV · XLSX</div>
        <input ref={fileRef} type="file" accept=".pdf,.csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => process(e.target.files[0])} />
      </div>

      {/* ── Bouton Import via IA (visible seulement si clé API configurée) ── */}
      {apiKey && (
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <button onClick={() => aiFileRef.current?.click()}
            style={{ ...S.ghost, fontSize: 13, borderColor: 'rgba(201,169,110,0.4)', color: C.gold }}>
            🤖 Import via IA (Gemini) — n'importe quelle banque
          </button>
          <input ref={aiFileRef} type="file" accept=".pdf,.csv,.xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { startGemini(e.target.files[0]); e.target.value = '' }} />
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', color: C.gold, padding: '1.5rem', fontSize: 14 }}>⏳ Analyse en cours…</div>}

      {/* ── Validation IA : transactions extraites + anomalies ─────────── */}
      {aiConfirm && (() => {
        const { parsed, filename } = aiConfirm
        const anomalyIds = new Set(parsed.anomalies.map(a => a.id))
        const anomalyMap = Object.fromEntries(parsed.anomalies.map(a => [a.id, a.flags]))
        return (
          <div style={{ ...S.card, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ padding: '0.9rem 1.25rem', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ color: C.gold, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                🤖 Résultat Gemini — {filename}
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>
                {parsed.transactions.length} transactions extraites
                {parsed.anomalies.length > 0 && <span style={{ color: C.warn, marginLeft: 8 }}>⚠ {parsed.anomalies.length} anomalie{parsed.anomalies.length > 1 ? 's' : ''} à vérifier</span>}
              </div>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {parsed.transactions.map(tx => (
                <div key={tx.id} style={{
                  padding: '0.6rem 1.25rem', borderBottom: `1px solid #0d0d20`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: anomalyIds.has(tx.id) ? 'rgba(232,168,56,0.05)' : 'transparent'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#ccc', fontSize: 13 }}>{tx.libelle}</div>
                    <div style={{ fontSize: 11, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ color: C.muted }}>{fmtD(tx.dateOpe)}</span>
                      <span style={{ color: CATEGORIES[tx.cat]?.color || C.muted }}>{CATEGORIES[tx.cat]?.label}</span>
                      {anomalyIds.has(tx.id) && anomalyMap[tx.id].map(f => (
                        <span key={f} style={{ color: C.warn }}>⚠ {f}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ color: tx.montant < 0 ? C.danger : C.success, fontWeight: 500, fontSize: 14, marginLeft: 12 }}>{fmt(tx.montant)}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '0.9rem 1.25rem', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${C.border}` }}>
              <button onClick={() => setAiConfirm(null)} style={S.ghost}>Annuler</button>
              <button onClick={confirmAi} style={S.btn}>Confirmer l'import → ({parsed.transactions.length} tx)</button>
            </div>
          </div>
        )
      })()}

      {/* ── Mapping assisté (4c) : colonnes non reconnues ─────────────── */}
      {mappingState && <MappingUI
        headers={mappingState.headers}
        sampleRows={mappingState.sampleRows}
        onApply={applyMapping}
        onCancel={() => setMappingState(null)}
      />}

      {/* ── Confirmation CSV : colonnes détectées + aperçu avant import ── */}
      {csvConfirm && (() => {
        const { parsed, filename } = csvConfirm
        const { detected } = parsed
        const colName = i => detected.headers[i] ?? `Colonne ${i}`
        return (
          <div style={{ ...S.card, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ padding: '0.9rem 1.25rem', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ color: C.gold, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                📋 Colonnes détectées — {filename}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {detected.dateCol   >= 0 && <span style={{ fontSize: 12, color: C.muted }}>📅 Date → <strong style={{ color: C.text }}>{colName(detected.dateCol)}</strong></span>}
                {detected.descCol   >= 0 && <span style={{ fontSize: 12, color: C.muted }}>📝 Libellé → <strong style={{ color: C.text }}>{colName(detected.descCol)}</strong></span>}
                {detected.amtCol    >= 0 && <span style={{ fontSize: 12, color: C.muted }}>💶 Montant → <strong style={{ color: C.text }}>{colName(detected.amtCol)}</strong></span>}
                {detected.debitCol  >= 0 && <span style={{ fontSize: 12, color: C.muted }}>🔴 Débit → <strong style={{ color: C.text }}>{colName(detected.debitCol)}</strong></span>}
                {detected.creditCol >= 0 && <span style={{ fontSize: 12, color: C.muted }}>🟢 Crédit → <strong style={{ color: C.text }}>{colName(detected.creditCol)}</strong></span>}
                <span style={{ fontSize: 11, color: detected.confidence === 'high' ? C.success : C.warn }}>
                  {detected.confidence === 'high' ? '✅ Confiance haute' : '⚠ Confiance moyenne — vérifiez'}
                </span>
              </div>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {parsed.transactions.slice(0, 5).map(tx => (
                <div key={tx.id} style={{ padding: '0.55rem 1.25rem', borderBottom: `1px solid #0d0d20`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#ccc', fontSize: 13 }}>{tx.libelle}</div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                      {fmtD(tx.dateOpe)} · <span style={{ color: CATEGORIES[tx.cat]?.color || C.muted }}>{CATEGORIES[tx.cat]?.label}</span>
                    </div>
                  </div>
                  <div style={{ color: tx.montant < 0 ? C.danger : C.success, fontWeight: 500, fontSize: 14 }}>{fmt(tx.montant)}</div>
                </div>
              ))}
              {parsed.transactions.length > 5 && (
                <div style={{ textAlign: 'center', color: C.muted, fontSize: 12, padding: '0.5rem' }}>
                  … et {parsed.transactions.length - 5} autres transactions ({parsed.transactions.length} au total)
                </div>
              )}
            </div>
            <div style={{ padding: '0.9rem 1.25rem', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${C.border}` }}>
              <button onClick={() => setCsvConfirm(null)} style={S.ghost}>Annuler</button>
              <button onClick={confirmCsv} style={S.btn}>Confirmer l'import → ({parsed.transactions.length} tx)</button>
            </div>
          </div>
        )
      })()}

      {preview && (
        <div style={{ ...S.card, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ padding: '0.9rem 1.25rem', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>{preview.filename}</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Compte {preview.compte}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ background: 'rgba(109,184,122,0.2)', color: C.success, padding: '3px 10px', borderRadius: 99, fontSize: 12 }}>+{preview.added.length} nouvelles</span>
              {preview.dupes.length > 0 && <span style={{ background: 'rgba(224,85,85,0.2)', color: C.danger, padding: '3px 10px', borderRadius: 99, fontSize: 12 }}>{preview.dupes.length} doublons ignorés</span>}
            </div>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {preview.added.slice(0, 8).map(tx => (
              <div key={tx.id} style={{ padding: '0.6rem 1.25rem', borderBottom: `1px solid #0d0d20`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#ccc', fontSize: 13 }}>{tx.libelle}</div>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                    {fmtD(tx.dateOpe)} · <span style={{ color: CATEGORIES[tx.cat]?.color || C.muted }}>{CATEGORIES[tx.cat]?.label}</span>
                    {tx.confidence === 'low' && <span style={{ color: C.danger, marginLeft: 6 }}>⚠ à clarifier</span>}
                  </div>
                </div>
                <div style={{ color: tx.montant < 0 ? C.danger : C.success, fontWeight: 500, fontSize: 14 }}>{fmt(tx.montant)}</div>
              </div>
            ))}
            {preview.added.length > 8 && (
              <div style={{ textAlign: 'center', color: C.muted, fontSize: 12, padding: '0.5rem' }}>… et {preview.added.length - 8} autres transactions</div>
            )}
          </div>
          <div style={{ padding: '0.9rem 1.25rem', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: `1px solid ${C.border}` }}>
            <button onClick={() => setPreview(null)} style={S.ghost}>Annuler</button>
            <button onClick={confirm} disabled={!preview.added.length}
              style={{ ...S.btn, opacity: preview.added.length ? 1 : 0.5 }}>
              {preview.added.length ? 'Confirmer l\'import →' : 'Déjà à jour ✓'}
            </button>
          </div>
        </div>
      )}

      {result?.ok    && <div style={{ background: 'rgba(109,184,122,0.15)', border: '1px solid rgba(109,184,122,0.4)', borderRadius: 12, padding: '1rem 1.25rem', color: C.success, fontSize: 14 }}>✓ {result.n} transactions importées{result.d > 0 ? ` · ${result.d} doublons ignorés` : ''}</div>}
      {result?.error && <div style={{ background: 'rgba(224,85,85,0.15)', border: '1px solid rgba(224,85,85,0.4)', borderRadius: 12, padding: '1rem 1.25rem', color: C.danger, fontSize: 14 }}>⚠ {result.error}</div>}

      {/* ── Recatégoriser ────────────────────────────────────────────── */}
      {transactions.length > 0 && (
        <div style={{ marginTop: 32, ...S.card, padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>🔄 Appliquer les nouvelles règles</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>Recatégorise les transactions non corrigées manuellement avec les règles actuelles</div>
          </div>
          <button onClick={onRecategorize} style={{ ...S.btn, whiteSpace: 'nowrap', fontSize: 13 }}>Recatégoriser</button>
        </div>
      )}

      {/* ── Règles de catégorisation personnalisées ───────────────────── */}
      <div style={{ marginTop: 16 }}>
        <div
          onClick={() => setRulesOpen(o => !o)}
          style={{ ...S.card, padding: '0.85rem 1.1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: rulesOpen ? 'rgba(201,169,110,0.4)' : C.border }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚙️</span>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>Règles de catégorisation</span>
            {customRules.length > 0 && <span style={{ background: 'rgba(201,169,110,0.15)', color: C.gold, fontSize: 11, padding: '1px 7px', borderRadius: 99 }}>{customRules.length}</span>}
            <span style={{ fontSize: 11, color: C.muted }}>· Priorité sur les règles automatiques</span>
          </div>
          <span style={{ color: C.muted, fontSize: 13 }}>{rulesOpen ? '▲' : '▼'}</span>
        </div>

        {rulesOpen && (
          <div style={{ ...S.card, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: '1.1rem' }}>

            {/* Barre d'outils export / import */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {customRules.length > 0 && (
                <button onClick={exportRules} style={{ ...S.ghost, fontSize: 11, padding: '4px 10px' }}>⬇ Exporter (.json)</button>
              )}
              <button onClick={() => rulesImportRef.current?.click()} style={{ ...S.ghost, fontSize: 11, padding: '4px 10px' }}>⬆ Importer (.json)</button>
              <input ref={rulesImportRef} type="file" accept=".json" style={{ display: 'none' }}
                onChange={e => { if (e.target.files[0]) importRules(e.target.files[0]); e.target.value = '' }} />
              <button onClick={() => onSaveCustomRules([...customRules, ...PACK_FRANCE.filter(p => !customRules.some(r => r.pattern === p.pattern))])}
                style={{ ...S.ghost, fontSize: 11, padding: '4px 10px', color: C.gold, borderColor: 'rgba(201,169,110,0.3)' }}>
                🇫🇷 Pack France
              </button>
            </div>

            {/* Liste des règles existantes */}
            {customRules.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {customRules.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.border}`, opacity: r.actif !== false ? 1 : 0.45 }}>
                    <button onClick={() => toggleRule(r.id)} title={r.actif !== false ? 'Désactiver' : 'Activer'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, color: r.actif !== false ? C.success : C.muted }}>
                      {r.actif !== false ? '●' : '○'}
                    </button>
                    <span style={{ flex: 1, fontSize: 12, color: C.text, fontFamily: 'monospace' }}>
                      {r.isRegex ? '/' : '"'}{r.pattern}{r.isRegex ? '/i' : '"'}
                    </span>
                    <span style={{ fontSize: 10, color: CATEGORIES[r.cat]?.color || C.muted, background: '#080814', padding: '2px 7px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                      {CATEGORIES[r.cat]?.icon} {r.sub || CATEGORIES[r.cat]?.label}
                    </span>
                    <button onClick={() => deleteRule(r.id)} style={{ background: 'transparent', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {customRules.length === 0 && <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Aucune règle — importe ton fichier de sauvegarde ou ajoute des règles ci-dessous.</div>}

            {/* Formulaire d'ajout */}
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Nouvelle règle · si le libellé contient :</div>
            {ruleError && <div style={{ fontSize: 11, color: C.danger, marginBottom: 6, background: 'rgba(224,85,85,0.1)', padding: '4px 8px', borderRadius: 6 }}>⚠ {ruleError}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <input
                value={ruleForm.pattern}
                onChange={e => { setRuleForm(f => ({ ...f, pattern: e.target.value })); validatePattern(e.target.value) }}
                placeholder={ruleForm.isRegex ? 'ex: biocoop|naturalia' : 'ex: biocoop, Naturalia, Zara…'}
                style={{ ...S.input, flex: 1, minWidth: 160, fontSize: 13, padding: '7px 10px', borderColor: ruleError ? C.danger : C.border }}
                onKeyDown={e => e.key === 'Enter' && addRule()}
              />
              <select value={ruleForm.cat} onChange={e => setRuleForm(f => ({ ...f, cat: e.target.value, sub: '' }))}
                style={{ background: '#080814', border: `1px solid ${C.border}`, color: C.text, padding: '7px 10px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
                {Object.entries(CATEGORIES).filter(([k]) => k !== 'revenus').map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
              <select value={ruleForm.sub} onChange={e => setRuleForm(f => ({ ...f, sub: e.target.value }))}
                style={{ background: '#080814', border: `1px solid ${ruleForm.sub ? C.gold : C.border}`, color: ruleForm.sub ? C.text : C.muted, padding: '7px 10px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
                <option value="">— sous-catégorie —</option>
                {(CATEGORIES[ruleForm.cat]?.subs || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={addRule} disabled={!ruleForm.pattern.trim() || !ruleForm.sub || !!ruleError}
                style={{ ...S.btn, padding: '7px 16px', fontSize: 13, opacity: (!ruleForm.pattern.trim() || !ruleForm.sub || !!ruleError) ? 0.4 : 1 }}>
                + Ajouter
              </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={ruleForm.isRegex} onChange={e => setRuleForm(f => ({ ...f, isRegex: e.target.checked, pattern: '' }))} />
              Mode regex (ex: <code style={{ fontFamily: 'monospace', color: C.text }}>burger|mcdonald</code>)
            </label>
            {customRules.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>
                → Clique <strong style={{ color: C.gold }}>Recatégoriser</strong> ci-dessus pour appliquer aux transactions existantes
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Feedback recatégorisation ────────────────────────────────── */}
      {recatFeedback && (
        <div style={{ marginTop: 12, background: 'rgba(109,184,122,0.12)', border: '1px solid rgba(109,184,122,0.3)', borderRadius: 10, padding: '0.75rem 1.1rem', fontSize: 13, color: C.success, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>✓ Recatégorisation terminée · <strong>{recatFeedback.changed}</strong> transaction{recatFeedback.changed !== 1 ? 's' : ''} modifiée{recatFeedback.changed !== 1 ? 's' : ''} sur {recatFeedback.total} non corrigées</span>
          <button onClick={() => setRecatFeedback(null)} style={{ background: 'none', border: 'none', color: C.success, cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1, opacity: 0.7 }} title="Fermer">✕</button>
        </div>
      )}

      {/* ── Historique des relevés importés ──────────────────────────── */}
      {imports.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Relevés importés ({imports.length})</div>
          <div style={{ ...S.card, overflow: 'hidden' }}>
            {[...imports].reverse().map((imp, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', borderBottom: i < imports.length - 1 ? `1px solid #0d0d20` : 'none' }}>
                <span style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{imp.filename}</span>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: C.muted, flexShrink: 0, marginLeft: 10 }}>
                  <span style={{ color: C.success }}>{imp.n} tx</span>
                  <span>{new Date(imp.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sauvegarde / Restauration JSON ───────────────────────────── */}
      {transactions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Sauvegarde</div>
          <div style={{ ...S.card, padding: '1rem 1.25rem', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>💾 Exporter / Restaurer</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Sauvegarde complète : transactions, corrections, budgets, objectifs, journal</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onExportJSON} style={{ ...S.ghost, fontSize: 12, padding: '6px 14px', color: C.gold, borderColor: 'rgba(201,169,110,0.4)' }}>
                ⬇ Exporter .json
              </button>
              <button onClick={() => restoreRef.current?.click()} style={{ ...S.ghost, fontSize: 12, padding: '6px 14px' }}>
                ⬆ Restaurer .json
              </button>
              <input ref={restoreRef} type="file" accept=".json" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files[0]; if (f) onRestoreJSON(f); e.target.value = '' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Zone de réinitialisation ─────────────────────────────────── */}
      {transactions.length > 0 && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Zone dangereuse</div>
          <div style={{ ...S.card, padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>Réinitialiser toutes les données</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{transactions.length} transactions · budgets · objectifs · notes — tout sera effacé</div>
            </div>
            <ResetButton onReset={onReset} />
          </div>
        </div>
      )}
    </div>
  )
}

export default Import
