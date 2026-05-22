/**
 * @file Forensic.jsx
 * @description Outil d'exploration avancée des transactions (mode "forensic").
 *
 * Fonctionnalités :
 *  - KPIs : total dépensé, montant moyen, plus grosse dépense
 *  - Filtres : mois, catégorie, sous-catégorie
 *  - Top 20 commerçants par total (normalisés, fusionnés)
 *  - Dépenses par jour de la semaine
 *  - Section PayPal avec détection des abonnements récurrents
 *  - Recherche plein texte sur libellé
 */

import { useState, useMemo } from 'react'
import { CATEGORIES, cleanLibelle } from '../utils/parser.js'
import { C, S, fmt, fmtD } from '../theme.js'

function Forensic({ transactions }) {
  const [search, setSearch] = useState('')
  const [monthF, setMonthF] = useState('all')
  const [catF, setCatF] = useState('all')
  const [subCatF, setSubCatF] = useState('all')

  const allMonths = useMemo(
    () => [...new Set(transactions.map(t => t.dateOpe.slice(0, 7)))].sort().reverse(),
    [transactions]
  )

  const dep = useMemo(
    () => transactions.filter(t => !t.isCredit && (monthF === 'all' || t.dateOpe.startsWith(monthF))),
    [transactions, monthF]
  )
  const allDep = useMemo(() => transactions.filter(t => !t.isCredit), [transactions])

  // Base filtrée hors virements/PEA (pour les dropdowns)
  const depBase = useMemo(() => dep.filter(t =>
    t.cat !== 'virement_interne' &&
    t.sub !== 'Épargne & investissement' &&
    t.sub !== 'Virement entre comptes'
  ), [dep])

  // Dépenses de consommation pure — filtre catégorie + sous-catégorie
  const depConso = useMemo(() => depBase.filter(t =>
    (catF === 'all' || t.cat === catF) &&
    (subCatF === 'all' || t.sub === subCatF)
  ), [depBase, catF, subCatF])

  // Catégories disponibles (pour dropdown catégorie)
  const availableCats = useMemo(() => {
    const cats = new Set(depBase.map(t => t.cat))
    return [...cats].sort((a, b) => (CATEGORIES[a]?.label || a).localeCompare(CATEGORIES[b]?.label || b))
  }, [depBase])

  // Sous-catégories disponibles pour la catégorie sélectionnée
  const availableSubCats = useMemo(() => {
    if (catF === 'all') return []
    const subs = new Set(depBase.filter(t => t.cat === catF && t.sub).map(t => t.sub))
    return [...subs].sort()
  }, [depBase, catF])

  // Recherche full-text (sur toutes les tx, pas juste le filtre mois)
  const searchResults = useMemo(() => {
    if (search.length < 2) return []
    const q = search.toLowerCase()
    return transactions
      .filter(t => t.libelle.toLowerCase().includes(q) || (t.libelleRaw || '').toLowerCase().includes(q))
      .sort((a, b) => b.dateOpe.localeCompare(a.dateOpe))
      .slice(0, 50)
  }, [search, transactions])

  // Top commerçants — virements/PEA exclus · variantes normalisées (DAB, loyer, PayPal, Leclerc…)
  // Stratégie de normalisation :
  //   Certains commerçants génèrent plusieurs libellés légèrement différents (artefacts PDF,
  //   numéros de magasin, dates en suffix…). On les fusionne via des clés canoniques __xxx__
  //   pour que le classement par total soit représentatif de la vraie dépense chez ce commerçant.
  const topMerchants = useMemo(() => {
    const by = {}
    depConso.forEach(t => {
      let key, label, cat = t.cat
      if (/^Ret DAB|^retrait dab/i.test(t.libelle)) {
        key = '__dab__'; label = '💳 Retraits espèces (DAB)'; cat = 'non_categorise'
      } else if (t.cat === 'logement' && t.sub === 'Loyer') {
        // Tous les libellés de loyer (artefacts PDF variables) → une seule ligne
        key = '__loyer__'; label = 'Loyer mensuel'
      } else if (/paypal/i.test(t.libelle) || /paypal/i.test(t.libelleRaw || '')) {
        // PayPal masque le vrai bénéficiaire → on consolide toutes les variantes
        key = '__paypal__'; label = 'Paypal'
      } else if (/leclerc/i.test(t.libelle)) {
        // E.Leclerc / E. Leclerc / E.leclere → clé unique
        key = '__leclerc__'; label = 'E.Leclerc'
      } else {
        key = t.libelle.slice(0, 32); label = t.libelle.slice(0, 32)
      }
      if (!by[key]) by[key] = { label, cat, total: 0, count: 0 }
      by[key].total += Math.abs(t.montant)
      by[key].count++
    })
    return Object.values(by).sort((a, b) => b.total - a.total).slice(0, 20)
  }, [depConso])

  // PayPal — filtré par mois si sélectionné, sinon toute la période
  const paypalTxs = useMemo(() =>
    dep.filter(t => /paypal/i.test(t.libelle) || /paypal/i.test(t.libelleRaw || ''))
       .sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant)),
    [dep])

  const paypalAboMap = useMemo(() => {
    // Buckets par montant arrondi à 1€ — si ≥ 3 occurrences = abo probable
    const buckets = {}
    paypalTxs.forEach(t => {
      const bucket = Math.round(Math.abs(t.montant))
      if (!buckets[bucket]) buckets[bucket] = 0
      buckets[bucket]++
    })
    return buckets
  }, [paypalTxs])

  // Répartition par jour de la semaine (0=Lun)
  const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  const byWeekday = useMemo(() => {
    const totals = Array(7).fill(0); const counts = Array(7).fill(0)
    depConso.forEach(t => {
      const dow = (new Date(t.dateOpe).getDay() + 6) % 7
      totals[dow] += Math.abs(t.montant); counts[dow]++
    })
    return DAYS.map((name, i) => ({ name, total: totals[i], count: counts[i] }))
  }, [depConso])
  const maxDay = Math.max(...byWeekday.map(d => d.total), 1)

  // Stats rapides — sur conso pure (hors virements + PEA)
  const totalDep = depConso.reduce((s, t) => s + Math.abs(t.montant), 0)
  const avgTx    = depConso.length ? totalDep / depConso.length : 0
  const maxTx    = depConso.length ? Math.max(...depConso.map(t => Math.abs(t.montant))) : 0

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, color: C.text, marginBottom: 4, fontFamily: "'Georgia', serif" }}>🔬 Mode Forensic</h2>
          <p style={{ color: C.muted, fontSize: 13 }}>
            {depConso.length} dépenses conso
            {monthF !== 'all' ? ` · ${fmtMonth(monthF)}` : ' · toute la période'}
            {catF !== 'all' ? ` · ${CATEGORIES[catF]?.icon || ''} ${CATEGORIES[catF]?.label || catF}` : ''}
            {subCatF !== 'all' ? ` › ${subCatF}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <select value={catF} onChange={e => { setCatF(e.target.value); setSubCatF('all') }}
            style={{ background: C.card, border: `1px solid ${catF !== 'all' ? C.gold : C.border}`, color: catF !== 'all' ? C.gold : C.text, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }}>
            <option value="all">Toutes catégories</option>
            {availableCats.map(c => (
              <option key={c} value={c}>{CATEGORIES[c]?.icon || '•'} {CATEGORIES[c]?.label || c}</option>
            ))}
          </select>
          {catF !== 'all' && availableSubCats.length > 1 && (
            <select value={subCatF} onChange={e => setSubCatF(e.target.value)}
              style={{ background: C.card, border: `1px solid ${subCatF !== 'all' ? C.gold : C.border}`, color: subCatF !== 'all' ? C.gold : C.text, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }}>
              <option value="all">Toutes sous-cat.</option>
              {availableSubCats.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select value={monthF} onChange={e => setMonthF(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }}>
            <option value="all">Toute la période</option>
            {allMonths.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs rapides */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Dépenses conso', val: fmt(totalDep), color: C.danger },
          { label: 'Montant moyen/tx', val: fmt(avgTx), color: C.text },
          { label: 'Plus grosse dépense', val: fmt(maxTx), color: C.warn },
        ].map(k => (
          <div key={k.label} style={{ ...S.card, padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Recherche */}
      <div style={{ ...S.card, padding: '1.25rem', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.gold, fontWeight: 500, marginBottom: 10 }}>🔎 Recherche de transaction</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chercher un commerçant, libellé…"
          style={{ width: '100%', background: '#080814', border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.55rem 1rem', color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        {search.length >= 2 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{searchResults.length} résultat{searchResults.length !== 1 ? 's' : ''}</div>
            {searchResults.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: C.text }}>{t.libelle}</span>
                  <span style={{ fontSize: 10, color: C.muted, marginLeft: 8 }}>{t.dateOpe}</span>
                  <span style={{ fontSize: 10, color: C.gold, marginLeft: 6, background: '#1a1a30', padding: '1px 5px', borderRadius: 99 }}>
                    {CATEGORIES[t.cat]?.label || t.cat || '?'}
                  </span>
                  {t.confidence === 'low' && !t.corrected && <span style={{ fontSize: 10, color: C.warn, marginLeft: 4 }}>⚠</span>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.isCredit ? C.success : C.danger, flexShrink: 0, marginLeft: 8 }}>
                  {t.isCredit ? '+' : '-'}{fmt(Math.abs(t.montant))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top commerçants + Jour de la semaine */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ ...S.card, padding: '1.25rem' }}>
          <div style={{ fontSize: 13, color: C.gold, fontWeight: 500, marginBottom: 12 }}>🏪 Top commerçants (par total)</div>
          {topMerchants.map((m, i) => {
            const catColor = CATEGORIES[m.cat]?.color || C.muted
            const bar = totalDep > 0 ? m.total / topMerchants[0].total * 100 : 0
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 10, color: C.muted, width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 12, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.danger, flexShrink: 0, marginLeft: 6 }}>{fmt(m.total)}</span>
                  </div>
                  <div style={{ height: 3, background: '#080814', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${bar}%`, background: catColor, borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 9, color: catColor, marginTop: 1 }}>{CATEGORIES[m.cat]?.label || m.cat} · {m.count}×</div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ ...S.card, padding: '1.25rem' }}>
          <div style={{ fontSize: 13, color: C.gold, fontWeight: 500, marginBottom: 12 }}>📅 Dépenses par jour de la semaine</div>
          {byWeekday.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <span style={{ fontSize: 12, color: C.muted, width: 28, flexShrink: 0 }}>{d.name}</span>
              <div style={{ flex: 1, background: '#080814', borderRadius: 3, height: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${d.total / maxDay * 100}%`, background: C.danger, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11, color: C.text, width: 72, textAlign: 'right', flexShrink: 0 }}>{fmt(d.total)}</span>
              <span style={{ fontSize: 10, color: C.muted, width: 22, flexShrink: 0 }}>{d.count}×</span>
            </div>
          ))}
        </div>
      </div>

      {/* Liste transactions filtrées (quand catégorie sélectionnée) */}
      {catF !== 'all' && depConso.length > 0 && (
        <div style={{ ...S.card, padding: '1.25rem', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: C.gold, fontWeight: 500 }}>
              {CATEGORIES[catF]?.icon || '•'} Transactions {CATEGORIES[catF]?.label || catF}
              {subCatF !== 'all' && <span style={{ color: C.muted, fontWeight: 400 }}> › {subCatF}</span>}
              <span style={{ color: C.muted, fontWeight: 400, marginLeft: 6 }}>({depConso.length})</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>Total : <span style={{ color: C.danger, fontWeight: 600 }}>{fmt(totalDep)}</span></div>
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {[...depConso].sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant)).map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, color: C.muted, flexShrink: 0, width: 68 }}>{fmtD(t.dateOpe)}</span>
                <span style={{ flex: 1, fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.libelle}</span>
                {t.sub && <span style={{ fontSize: 10, color: C.muted, background: '#080814', padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>{t.sub}</span>}
                <span style={{ fontSize: 13, fontWeight: 600, color: C.danger, flexShrink: 0 }}>{fmt(Math.abs(t.montant))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PayPal */}
      {paypalTxs.length > 0 && (
        <div style={{ ...S.card, padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 13, color: C.gold, fontWeight: 500 }}>🅿 Transactions PayPal ({paypalTxs.length})</div>
            <div style={{ fontSize: 11, color: C.muted }}>Total : {fmt(paypalTxs.reduce((s, t) => s + Math.abs(t.montant), 0))}</div>
          </div>
          {/* Abonnements probables détectés */}
          {(() => {
            const abos = Object.entries(paypalAboMap).filter(([, n]) => n >= 3).sort((a, b) => b[0] - a[0])
            if (!abos.length) return null
            return (
              <div style={{ background: 'rgba(232,168,56,0.07)', border: '1px solid rgba(232,168,56,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.gold, fontWeight: 600, marginBottom: 6 }}>🔁 Abonnements récurrents probables</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {abos.map(([amt, n]) => (
                    <span key={amt} style={{ background: 'rgba(232,168,56,0.12)', border: '1px solid rgba(232,168,56,0.3)', borderRadius: 99, padding: '2px 10px', fontSize: 11, color: C.gold }}>
                      ~{amt}€ · {n}× — {fmt(parseInt(amt) * 12)}/an
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Ces transactions opaques nécessitent une correction manuelle (onglet Transactions).</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
            {paypalTxs.slice(0, 24).map(t => {
              const bucket = Math.round(Math.abs(t.montant))
              const isAbo = (paypalAboMap[bucket] || 0) >= 3
              return (
                <div key={t.id} style={{ background: '#080814', borderRadius: 8, padding: '8px 12px', border: `1px solid ${isAbo ? 'rgba(232,168,56,0.35)' : t.confidence === 'low' && !t.corrected ? '#3a2a10' : C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.danger }}>{fmt(Math.abs(t.montant))}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>{t.dateOpe}</span>
                  </div>
                  {isAbo && <div style={{ fontSize: 9, color: C.gold, marginBottom: 2 }}>🔁 abo récurrent</div>}
                  <div style={{ fontSize: 10, color: t.corrected ? C.success : t.confidence === 'low' ? C.warn : C.muted }}>
                    {t.corrected ? `✓ ${CATEGORIES[t.cat]?.label || t.cat}` : t.confidence === 'low' ? '⚠ À clarifier' : CATEGORIES[t.cat]?.label || t.cat}
                  </div>
                  {t.sub && <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{t.sub}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── APP ──────────────────────────────────────────────────────────────────────
const KEY_API = 'financeapp_apikey'

// ─── Backup JSON ──────────────────────────────────────────────────────────────
/**
 * Déclenche le téléchargement d'un objet JSON dans le navigateur.
 * Même pattern que exportCSV : création d'un Blob + URL temporaire + clic simulé.
 * L'URL est révoquée immédiatement après le clic pour libérer la mémoire.
 */
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default Forensic
