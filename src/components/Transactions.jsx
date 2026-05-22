/**
 * @file Transactions.jsx
 * @description Liste paginée des transactions avec filtres, tri et correction manuelle.
 *
 * Fonctionnalités :
 *  - Filtres : mois, catégorie, "à clarifier", recherche plein texte
 *  - Tri : date croissante/décroissante, montant croissante/décroissante
 *  - Correction manuelle de catégorie/sous-catégorie avec badge "corrigé"
 *  - Pagination par pages de 50 transactions
 *  - Export CSV de la sélection filtrée
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { CATEGORIES, categorize, computeIsExceptionnel, cleanLibelle } from '../utils/parser.js'
import { C, S, fmt, fmtD } from '../theme.js'
import { exportCSV } from '../helpers.js'

function Transactions({ transactions, onCorrect }) {
  const [search, setSearch]         = useState('')
  const [catF, setCatF]             = useState('all')
  const [monthF, setMonthF]         = useState('all')
  const [clarifyOnly, setClarifyOnly] = useState(false)
  const [sortF, setSortF]           = useState('date-desc')
  const [editId, setEditId]         = useState(null)
  const [editCat, setEditCat]       = useState(null)
  const [page, setPage]             = useState(0)
  const PAGE_SIZE = 50

  const months    = [...new Set(transactions.map(t => t.dateOpe.slice(0, 7)))].sort().reverse()
  const nClarify  = transactions.filter(t => t.confidence === 'low' && !t.corrected && !t.isCredit).length

  // Réinitialise la page à chaque changement de filtre
  useEffect(() => { setPage(0) }, [catF, monthF, clarifyOnly, search, sortF])

  const filtered = useMemo(() => transactions
    .filter(t => catF === 'all' || t.cat === catF)
    .filter(t => monthF === 'all' || t.dateOpe.startsWith(monthF))
    .filter(t => !clarifyOnly || (t.confidence === 'low' && !t.corrected && !t.isCredit))
    .filter(t => !search || t.libelle.toLowerCase().includes(search.toLowerCase()) || (t.libelleRaw || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortF === 'date-desc') return b.dateOpe.localeCompare(a.dateOpe)
      if (sortF === 'date-asc')  return a.dateOpe.localeCompare(b.dateOpe)
      if (sortF === 'amt-desc')  return Math.abs(b.montant) - Math.abs(a.montant)
      if (sortF === 'amt-asc')   return Math.abs(a.montant) - Math.abs(b.montant)
      return 0
    }), [transactions, catF, monthF, clarifyOnly, search, sortF])

  const openEdit = (id) => {
    if (editId === id) { setEditId(null); setEditCat(null) }
    else { setEditId(id); setEditCat(null) }
  }

  const pickCat = (k) => setEditCat(k)

  const pickSub = (txId, cat, sub) => {
    onCorrect(txId, cat, sub)
    setEditId(null)
    setEditCat(null)
  }

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ fontSize: 26, color: C.text, marginBottom: 16, fontFamily: "'Georgia', serif" }}>Transactions</h2>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <input placeholder="🔍 Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...S.input, flex: 1, minWidth: 180, padding: '8px 12px', fontSize: 13 }} />
        <select value={catF} onChange={e => setCatF(e.target.value)}
          style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
          <option value="all">Toutes catégories</option>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <select value={monthF} onChange={e => setMonthF(e.target.value)}
          style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
          <option value="all">Tous les mois</option>
          {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
      </div>

      {/* Chip "À clarifier" + Tri + Export CSV */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setClarifyOnly(!clarifyOnly)} style={{
          background: clarifyOnly ? 'rgba(224,85,85,0.2)' : 'transparent',
          border: `1px solid ${clarifyOnly ? C.danger : C.border}`,
          color: clarifyOnly ? C.danger : C.muted,
          padding: '4px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
        }}>
          ⚠ À clarifier {nClarify > 0 && <span style={{ fontWeight: 600 }}>{nClarify}</span>}
        </button>
        <span style={{ color: C.muted, fontSize: 12 }}>{filtered.length} transaction{filtered.length > 1 ? 's' : ''}</span>
        {/* Tri */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
          {[
            { id: 'date-desc', label: '📅↓' },
            { id: 'date-asc',  label: '📅↑' },
            { id: 'amt-desc',  label: '€↓' },
            { id: 'amt-asc',   label: '€↑' },
          ].map(s => (
            <button key={s.id} onClick={() => setSortF(s.id)} title={s.id.replace('-', ' ')} style={{
              background: sortF === s.id ? 'rgba(201,169,110,0.15)' : 'transparent',
              border: `1px solid ${sortF === s.id ? C.gold : C.border}`,
              color: sortF === s.id ? C.gold : C.muted,
              padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit'
            }}>{s.label}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => {
            const mLabel = monthF !== 'all' ? `_${monthF}` : ''
            const catLabel = catF !== 'all' ? `_${catF}` : ''
            exportCSV(filtered, `transactions${mLabel}${catLabel}.csv`)
          }} style={{
            background: 'transparent', border: `1px solid ${C.border}`, color: C.muted,
            padding: '4px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 5
          }}>
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 12, color: C.muted }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}
          </span>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ ...S.ghost, padding: '4px 10px', fontSize: 12, opacity: page === 0 ? 0.3 : 1 }}>←</button>
          <button onClick={() => setPage(p => Math.min(Math.ceil(filtered.length / PAGE_SIZE) - 1, p + 1))}
            disabled={(page + 1) * PAGE_SIZE >= filtered.length}
            style={{ ...S.ghost, padding: '4px 10px', fontSize: 12, opacity: (page + 1) * PAGE_SIZE >= filtered.length ? 0.3 : 1 }}>→</button>
        </div>
      )}

      <div style={{ ...S.card, overflow: 'visible' }}>
        {filtered.length === 0
          ? <div style={{ textAlign: 'center', color: C.muted, padding: '3rem', fontSize: 13 }}>Aucune transaction trouvée</div>
          : filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((tx, i) => (
            <div key={tx.id} style={{
              padding: '0.7rem 1.1rem',
              borderBottom: i < Math.min(PAGE_SIZE, filtered.length - page * PAGE_SIZE) - 1 ? `1px solid #0d0d20` : 'none',
              background: editId === tx.id ? 'rgba(13,13,32,0.8)' : 'transparent',
            }}>
              {/* Ligne principale */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: CATEGORIES[tx.cat]?.color || '#555', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#d0ccc4', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.libelle}
                    {tx.isExceptionnel && <span style={{ background: 'rgba(232,168,56,0.2)', color: C.warn, fontSize: 10, padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>exceptionnel</span>}
                    {tx.corrected && <span style={{ background: 'rgba(72,200,184,0.15)', color: '#48c8b8', fontSize: 10, padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>✓ corrigé</span>}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {fmtD(tx.dateOpe)} ·{' '}
                    <span style={{ color: CATEGORIES[tx.cat]?.color || C.muted }}>{CATEGORIES[tx.cat]?.label}</span>
                    {tx.sub && <span style={{ color: '#4a4a6a' }}> · {tx.sub}</span>}
                    {tx.confidence === 'low' && !tx.corrected && <span style={{ color: C.danger, marginLeft: 6 }}>⚠ à clarifier</span>}
                  </div>
                </div>
                <div style={{ color: tx.montant < 0 ? C.danger : C.success, fontSize: 14, fontWeight: 500, flexShrink: 0 }}>{fmt(tx.montant)}</div>
                <button onClick={() => openEdit(tx.id)}
                  style={{ background: editId === tx.id ? 'rgba(201,169,110,0.15)' : 'transparent', border: `1px solid ${editId === tx.id ? C.gold : C.border}`, color: editId === tx.id ? C.gold : C.muted, padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                  {editId === tx.id ? '✕' : '✏'}
                </button>
              </div>

              {/* Panneau de correction inline */}
              {editId === tx.id && (
                <div style={{ marginTop: 10, marginLeft: 19, display: 'flex', gap: 8 }}>
                  {/* Colonne catégories */}
                  <div style={{ background: '#080814', border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.5rem', minWidth: 180, maxHeight: 260, overflowY: 'auto' }}>
                    <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, padding: '2px 6px 6px' }}>Catégorie</div>
                    {Object.entries(CATEGORIES).filter(([k]) => k !== 'revenus').map(([k, v]) => (
                      <div key={k} onClick={() => pickCat(k)}
                        style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                          color: (editCat || tx.cat) === k ? C.text : C.muted,
                          background: (editCat || tx.cat) === k ? 'rgba(255,255,255,0.05)' : 'transparent',
                          borderLeft: `2px solid ${(editCat || tx.cat) === k ? v.color : 'transparent'}` }}>
                        {v.icon} {v.label}
                      </div>
                    ))}
                  </div>
                  {/* Colonne sous-catégories */}
                  {(editCat || tx.cat) && (() => {
                    const selCat = editCat || tx.cat
                    const v = CATEGORIES[selCat]
                    if (!v) return null
                    return (
                      <div style={{ background: '#080814', border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.5rem', minWidth: 200, maxHeight: 260, overflowY: 'auto' }}>
                        <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, padding: '2px 6px 6px' }}>Sous-catégorie</div>
                        {v.subs.map(sub => (
                          <div key={sub} onClick={() => pickSub(tx.id, selCat, sub)}
                            style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                              color: tx.sub === sub && tx.cat === selCat ? C.text : C.muted,
                              background: tx.sub === sub && tx.cat === selCat ? 'rgba(255,255,255,0.05)' : 'transparent',
                              borderLeft: `2px solid ${tx.sub === sub && tx.cat === selCat ? v.color : 'transparent'}` }}>
                            {sub}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ─── FONCTIONS IA (optionnelles) ──────────────────────────────────────────────
/**
 * Construit le system prompt envoyé à Claude pour personnaliser les conseils.
 *
 * Structure du prompt (ordre intentionnel pour le cache Anthropic) :
 *  1. Rôle et identité du conseiller
 *  2. Profil utilisateur (revenu, charges, objectif épargne)
 *  3. Vue macro : nb transactions, plage temporelle, stats globales
 *  4. Dépenses par catégorie (triées DESC)
 *  5. Récurrences détectées (top 8)
 *  6. Stats du dernier mois
 *  7. Journal des décisions (5 dernières, ordre chronologique)
 *  8. Contrainte de réponse (langue, longueur)
 *
 * Le prompt est mémoïsé dans ChatIA via useMemo([transactions, profile, journal])
 * et bénéficie du prompt caching Anthropic (TTL 5 min) pour limiter les coûts.
 */
function buildContext(transactions, profile, journal = []) {
  if (!transactions.length) return ''
  const months   = [...new Set(transactions.map(t => t.dateOpe.slice(0, 7)))].sort()
  const allStats = computeStats(transactions)
  const lastM    = months[months.length - 1]
  let ctx = `Tu es le conseiller financier personnel de ${profile?.nom || 'l\'utilisateur'}.`
  ctx += `\n\nProfil : revenu ~${profile?.revenu || '?'}€/mois (${profile?.type_revenu || 'variable'}), charges fixes ~${profile?.charges || '?'}€/mois, objectif épargne ~${profile?.epargne || '?'}€/mois.`
  ctx += `\n\nDonnées : ${transactions.length} transactions · ${months.length} mois (${months[0]} → ${lastM}).`
  ctx += `\n\nStats globales : revenus ${fmt(allStats.totalRev)}, dépenses ${fmt(allStats.totalDep)}, net ${fmt(allStats.totalRev - allStats.totalDep)}.`
  const catLines = Object.entries(allStats.parCat).sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => `  ${CATEGORIES[cat]?.label || cat} : ${fmt(val)}`).join('\n')
  ctx += `\n\nDépenses par catégorie :\n${catLines}`
  if (allStats.recurrentes.length) {
    ctx += `\n\nRécurrences :\n` + allStats.recurrentes.slice(0, 8)
      .map(r => `  ${r.label} (${r.count}× · ~${fmt(r.montantMoyen)})`).join('\n')
  }
  const lmStats = computeStats(transactions.filter(t => t.dateOpe.startsWith(lastM)))
  ctx += `\n\nDernier mois (${lastM}) : revenus ${fmt(lmStats.totalRev)}, dépenses ${fmt(lmStats.totalDep)}, net ${fmt(lmStats.totalRev - lmStats.totalDep)}.`
  if (journal?.length) {
    const last5 = [...journal.slice(0, 5)].reverse()  // chrono : du plus ancien au plus récent
    ctx += `\n\nJournal des décisions récentes (chronologique) :\n` + last5.map(e => `  [${e.date}] ${e.text}`).join('\n')
  }
  ctx += `\n\nRéponds en français, de façon concise et actionnable. Maximum 250 mots sauf demande explicite.`
  return ctx
}

/**
 * Appelle l'API Anthropic en mode streaming (Server-Sent Events).
 *
 * Protocole SSE :
 *  - Chaque ligne commence par "data: " puis contient un objet JSON
 *  - On accumule les chunks dans un buffer pour gérer les lignes coupées par le réseau
 *  - On appelle onChunk() à chaque delta de texte reçu (mise à jour React en temps réel)
 *  - Le prompt caching Anthropic (ephemeral cache) est activé sur le system prompt
 *    pour réduire le coût des messages successifs dans la même session
 *
 * @param {string}   apiKey       – Clé API sk-ant-…
 * @param {string}   systemPrompt – Context complet produit par buildContext()
 * @param {Array}    messages     – Historique [{role, content}] sans la dernière réponse vide
 * @param {Function} onChunk      – Appelé avec chaque fragment texte reçu
 */
async function callClaudeStream(apiKey, systemPrompt, messages, onChunk) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'prompt-caching-2024-07-31'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      stream: true,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n'); buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') return
      try {
        const ev = JSON.parse(data)
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') onChunk(ev.delta.text)
      } catch {}
    }
  }
}

// Rendu markdown minimal (bold, italic, listes, code inline)
function MdText({ text }) {
  if (!text) return null
  // Découpe en paragraphes
  const paragraphs = text.split(/\n\n+/)
  return (
    <div>
      {paragraphs.map((para, pi) => {
        const lines = para.split('\n')
        const isList = lines.every(l => /^[-*•]\s/.test(l.trim()) || l.trim() === '')
        if (isList) {
          return (
            <ul key={pi} style={{ margin: '4px 0 4px 14px', padding: 0, listStyle: 'none' }}>
              {lines.filter(l => l.trim()).map((l, li) => (
                <li key={li} style={{ marginBottom: 2, display: 'flex', gap: 6 }}>
                  <span style={{ color: C.gold, flexShrink: 0 }}>·</span>
                  <span>{inlineMd(l.replace(/^[-*•]\s+/, ''))}</span>
                </li>
              ))}
            </ul>
          )
        }
        return <p key={pi} style={{ margin: '0 0 6px' }}>{lines.map((l, li) => <span key={li}>{inlineMd(l)}{li < lines.length - 1 ? <br /> : null}</span>)}</p>
      })}
    </div>
  )
}

function inlineMd(text) {
  // bold **...**  italic *...*  code `...`
  const parts = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2]) parts.push(<strong key={m.index} style={{ color: C.text }}>{m[2]}</strong>)
    else if (m[3]) parts.push(<em key={m.index} style={{ color: C.gold }}>{m[3]}</em>)
    else if (m[4]) parts.push(<code key={m.index} style={{ background: '#0a0a16', borderRadius: 3, padding: '0 3px', fontSize: '0.9em', color: C.gold }}>{m[4]}</code>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length > 0 ? parts : text
}

// ─── PANNEAU CHAT IA (sous-composant réutilisable) ────────────────────────────

export default Transactions
