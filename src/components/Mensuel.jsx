/**
 * @file Analyse.jsx
 * @description Analyse mensuelle détaillée avec comparaison M vs M-1 et Conseiller IA.
 *
 * Fonctionnalités :
 *  - Comparaison mois courant vs mois précédent (double barres par catégorie)
 *  - Mini-scores par catégorie (évolution en % avec seuils colorés)
 *  - Taux d'épargne ajusté (epargneInvestie + solde net)
 *  - Insights analyseLocale intégrés
 *  - Conseiller IA (ChatIA) : streaming SSE avec contexte financier injecté
 *  - "Utilisation du budget" vs revenu déclaré
 */

import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { computeStats, CATEGORIES } from '../utils/parser.js'
import { C, S, fmt, fmtD, fmtMonth, ABO_CATS } from '../theme.js'
import { analyseLocale } from '../helpers.js'
import ChatIA from './ChatIA.jsx'

const CTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#11112a', border: '1px solid #1e1e3a', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
      {label && <div style={{ color: '#5a5a7a', marginBottom: 6 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#e2d9c8', marginBottom: 2 }}>
          {p.name} : <strong>{typeof p.value === 'number' ? p.value.toLocaleString('fr-FR') + ' €' : p.value}</strong>
        </div>
      ))}
    </div>
  )
}

function Analyse({ transactions, profile, journal, apiKey, onSetApiKey, budgets = {} }) {
  const months  = useMemo(
    () => [...new Set(transactions.map(t => t.dateOpe.slice(0, 7)))].sort().reverse(),
    [transactions]
  )
  const [moisF, setMoisF] = useState(() => {
    const all = [...new Set(transactions.map(t => t.dateOpe.slice(0, 7)))].sort()
    return all[all.length - 1] || null
  })

  // Cache stats par mois — évite N×computeStats dans trendData, statsPrev et stats
  // Pattern identique au Dashboard et au Budget pour cohérence
  const statsParMois = useMemo(() => {
    const cache = {}
    months.forEach(m => { cache[m] = computeStats(transactions.filter(t => t.dateOpe.startsWith(m))) })
    return cache
  }, [transactions, months])

  const txsF   = useMemo(
    () => moisF ? transactions.filter(t => t.dateOpe.startsWith(moisF)) : transactions,
    [transactions, moisF]
  )
  const insights = useMemo(() => analyseLocale(transactions, profile, moisF), [transactions, profile, moisF])

  // Statistiques détaillées du mois sélectionné (ou toute la période si moisF=null)
  const stats     = useMemo(() => computeStats(txsF), [txsF])
  const net    = stats.totalRev - stats.totalDep
  const tauxEp = stats.totalRev > 0 ? Math.round((stats.epargneInvestie || 0) / stats.totalRev * 100) : 0
  const revenu = profile?.revenu ? parseFloat(profile.revenu) : null
  const epargne = profile?.epargne ? parseFloat(profile.epargne) : null

  // Top 5 dépenses du mois (conso uniquement — hors PEA et virements internes)
  const topDep = useMemo(() => txsF
    .filter(t => !t.isCredit && t.cat !== 'virement_interne' && t.sub !== 'Épargne & investissement' && t.sub !== 'Virement entre comptes')
    .sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant))
    .slice(0, 5),
    [txsF]
  )

  // Dépenses par catégorie triées
  const catData = useMemo(() => Object.entries(stats.parCat)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => ({ cat, val, label: CATEGORIES[cat]?.label || cat, color: CATEGORIES[cat]?.color || '#555', icon: CATEGORIES[cat]?.icon || '•', pct: stats.totalDep > 0 ? Math.round(val / stats.totalDep * 100) : 0 })),
    [stats]
  )

  // Mois précédent pour comparaison (M-1 = index+1 car months est trié DESC)
  const moisIdx  = months.indexOf(moisF)
  const prevMois = moisIdx >= 0 && moisIdx < months.length - 1 ? months[moisIdx + 1] : null
  // Lu depuis le cache — pas de recalcul si statsParMois est déjà à jour
  const statsPrev = useMemo(
    () => prevMois ? (statsParMois[prevMois] || null) : null,
    [prevMois, statsParMois]
  )

  // Tendance par catégorie sur les 6 derniers mois complétés (exclut mois en cours partiel)
  // Entièrement alimenté par le cache statsParMois — zéro computeStats() en boucle
  const trendData = useMemo(() => {
    const currentYM = new Date().toISOString().slice(0, 7)
    // months est trié DESC → on filtre les mois passés, on prend les 6 plus récents, on remet en chrono
    const last6 = months.filter(m => m < currentYM).slice(0, 6).reverse()
    if (last6.length < 2) return null

    // Top 5 catégories sur toute la période (agrégé depuis le cache — même résultat que computeStats(transactions))
    const globalPar = {}
    Object.values(statsParMois).forEach(s => {
      Object.entries(s.parCat).forEach(([cat, v]) => { globalPar[cat] = (globalPar[cat] || 0) + v })
    })
    const topCats = Object.entries(globalPar)
      .filter(([c]) => !['revenus', 'virement_interne', 'non_categorise'].includes(c))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c]) => c)

    return {
      cats: topCats,
      points: last6.map(m => {
        // Lecture dans le cache — O(1) par mois
        const s = statsParMois[m] || { parCat: {} }
        const pt = { name: new Date(m + '-01').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) }
        topCats.forEach(c => { pt[c] = Math.round(s.parCat[c] || 0) })
        return pt
      })
    }
  }, [statsParMois, months])

  // Deltas catégories (ce mois vs M-1)
  const catDeltas = useMemo(() => {
    if (!statsPrev) return []
    const allCats = new Set([...Object.keys(stats.parCat), ...Object.keys(statsPrev.parCat)])
    return [...allCats]
      .filter(cat => cat !== 'revenus')
      .map(cat => ({
        cat,
        cur:  stats.parCat[cat]  || 0,
        prev: statsPrev.parCat[cat] || 0,
        delta: (stats.parCat[cat] || 0) - (statsPrev.parCat[cat] || 0),
        label: CATEGORIES[cat]?.label || cat,
        color: CATEGORIES[cat]?.color || '#555',
        icon:  CATEGORIES[cat]?.icon  || '•',
      }))
      .filter(d => d.cur > 0 || d.prev > 0)
      .sort((a, b) => b.cur - a.cur)
  }, [stats, statsPrev])

  const TYPE_COLOR = { success: C.success, warn: C.warn, danger: C.danger, info: '#8577e8' }
  const TYPE_BG    = { success: 'rgba(109,184,122,0.1)', warn: 'rgba(232,168,56,0.1)', danger: 'rgba(224,85,85,0.1)', info: 'rgba(133,119,232,0.1)' }

  if (!transactions.length) {
    return (
      <div style={{ padding: '4rem 2.5rem', textAlign: 'center', color: C.muted, fontSize: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📤</div>
        Importe d'abord un relevé pour voir l'analyse.
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 960, margin: '0 auto' }}>

      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 26, color: C.text, marginBottom: 4, fontFamily: "'Georgia', serif" }}>🔍 Analyse financière</h2>
          <p style={{ color: C.muted, fontSize: 13 }}>
            {moisF ? `Analyse de ${fmtMonth(moisF)}` : 'Toute la période · insights basés sur le dernier mois'}
          </p>
        </div>
        <select value={moisF || ''} onChange={e => setMoisF(e.target.value || null)}
          style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, padding: '8px 14px', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          <option value="">Toute la période</option>
          {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
      </div>

      {/* ── Bandeau comparatif M vs M-1 ── */}
      {statsPrev && (() => {
        // totalDep/totalRev sont déjà nets (hors PEA + virements internes)
        const depCur  = stats.totalDep
        const depPrev = statsPrev.totalDep
        // Épargne investie = versements PEA/AV explicites (définition user)
        const netCur  = stats.epargneInvestie || 0
        const netPrev = statsPrev.epargneInvestie || 0
        const delta = (cur, prev) => prev !== 0 ? Math.round((cur - prev) / Math.abs(prev) * 100) : null
        const dDep = depPrev > 0  ? delta(depCur, depPrev) : null
        const dRev = statsPrev.totalRev > 0 ? delta(stats.totalRev, statsPrev.totalRev) : null
        const dNet = netPrev > 0 ? delta(netCur, netPrev) : null

        const KpiCmp = ({ label, cur, prev, d, inverse = false }) => {
          const good = inverse ? (d !== null && d < 0) : (d !== null && d > 0)
          const color = d === null ? C.muted : good ? C.success : C.danger
          return (
            <div style={{ ...S.card, padding: '0.85rem 1rem', flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: "'Georgia', serif", marginBottom: 4 }}>{fmt(cur)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: C.muted }}>vs {fmtMonth(prevMois)} :</span>
                <span style={{ fontSize: 11, color, fontWeight: 600, background: `${color}18`, padding: '1px 6px', borderRadius: 4 }}>
                  {d === null ? '—' : `${d > 0 ? '+' : ''}${d}%`}
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#3a3a55', marginTop: 3 }}>{fmt(prev)} le mois précédent</div>
            </div>
          )
        }

        return (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <KpiCmp label="Dépenses conso"  cur={depCur}         prev={depPrev}             d={dDep} inverse />
            <KpiCmp label="Revenus"          cur={stats.totalRev} prev={statsPrev.totalRev}  d={dRev} />
            <KpiCmp label="Épargne investie" cur={netCur}         prev={netPrev}             d={dNet} />
          </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* ── Colonne gauche : insights ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: C.muted, fontWeight: 500, marginBottom: 2 }}>💡 Diagnostics</div>
          {insights.length === 0 && (
            <div style={{ ...S.card, padding: '1.5rem', textAlign: 'center', color: C.muted, fontSize: 13 }}>
              Pas assez de données pour générer des insights.
            </div>
          )}
          {insights.map((ins, i) => (
            <div key={i} style={{
              background: TYPE_BG[ins.type] || 'rgba(255,255,255,0.03)',
              border: `1px solid ${TYPE_COLOR[ins.type] || C.border}44`,
              borderRadius: 12, padding: '0.85rem 1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <span style={{ fontSize: 16 }}>{ins.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: TYPE_COLOR[ins.type] || C.text }}>{ins.title}</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{ins.body}</div>
            </div>
          ))}

          {/* ── Barre de budget ── */}
          {revenu && stats.totalDep > 0 && (
            <div style={{ ...S.card, padding: '1rem 1.1rem', marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>Utilisation du budget</span>
                <span style={{ fontSize: 10, color: C.muted }}>Revenu déclaré : {fmt(revenu)}/mois</span>
              </div>
              {[
                { label: 'Dépenses conso', val: stats.totalDep, max: revenu, color: C.danger, hint: 'hors épargne & virements internes' },
                ...(epargne ? [{ label: `Épargne réalisée`, val: Math.max(0, net), max: epargne, color: C.success, hint: `objectif ${fmt(epargne)}/mois` }] : [])
              ].map(b => {
                const pct = Math.min(Math.round(b.val / b.max * 100), 100)
                const over = b.val > b.max
                return (
                  <div key={b.label} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 4 }}>
                      <span>{b.label} <span style={{ color: '#2a2a4a' }}>— {b.hint}</span></span>
                      <span style={{ color: over ? C.danger : C.text, fontWeight: 500 }}>
                        {fmt(b.val)} <span style={{ color: C.muted, fontWeight: 400 }}>/ {fmt(b.max)}</span>
                        <span style={{ marginLeft: 5, color: over ? C.danger : C.muted }}>({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ background: '#0a0a16', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: over ? C.danger : b.color, borderRadius: 99, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Colonne droite : détails ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Répartition par catégorie (avec comparaison M-1 si dispo) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <div style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>📊 Dépenses par catégorie</div>
            {statsPrev && (
              <div style={{ display: 'flex', gap: 10, fontSize: 10, color: C.muted }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#4a4a7a', marginRight: 4 }} />M-1</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: C.gold, marginRight: 4 }} />Ce mois</span>
              </div>
            )}
          </div>
          <div style={{ ...S.card, padding: '1rem 1.1rem' }}>
            {(statsPrev ? catDeltas : catData).length === 0
              ? <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '1rem' }}>Aucune dépense ce mois</div>
              : (statsPrev ? catDeltas : catData).map(d => {
                  const cur  = statsPrev ? d.cur  : d.val
                  const prev = statsPrev ? d.prev : 0
                  const maxVal = statsPrev ? Math.max(...catDeltas.map(x => Math.max(x.cur, x.prev)), 1) : stats.totalDep
                  const curPct  = Math.round(cur  / maxVal * 100)
                  const prevPct = Math.round(prev / maxVal * 100)
                  const deltaSign = cur - prev
                  const deltaColor = deltaSign > 0 ? C.danger : deltaSign < 0 ? C.success : C.muted
                  return (
                    <div key={d.cat || d.cat} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: C.muted }}>{d.icon} {d.label}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: d.color, fontWeight: 500 }}>{fmt(cur)}</span>
                          {statsPrev && deltaSign !== 0 && (
                            <span style={{ fontSize: 10, color: deltaColor }}>
                              {deltaSign > 0 ? '▲' : '▼'} {fmt(Math.abs(deltaSign))}
                            </span>
                          )}
                        </span>
                      </div>
                      {/* Barre M-1 (ghost) */}
                      {statsPrev && prev > 0 && (
                        <div style={{ background: '#0a0a16', borderRadius: 99, height: 3, marginBottom: 2 }}>
                          <div style={{ width: `${prevPct}%`, height: '100%', background: '#4a4a7a', borderRadius: 99, opacity: 0.7 }} />
                        </div>
                      )}
                      {/* Barre ce mois */}
                      <div style={{ background: '#0a0a16', borderRadius: 99, height: 4 }}>
                        <div style={{ width: `${curPct}%`, height: '100%', background: d.color, borderRadius: 99 }} />
                      </div>
                    </div>
                  )
                })
            }
          </div>

          {/* Top 5 dépenses */}
          {topDep.length > 0 && (
            <>
              <div style={{ fontSize: 13, color: C.muted, fontWeight: 500, marginTop: 4, marginBottom: 2 }}>💸 Top dépenses du mois</div>
              <div style={{ ...S.card, overflow: 'hidden' }}>
                {topDep.map((tx, i) => (
                  <div key={tx.id} style={{ padding: '0.6rem 1rem', borderBottom: i < topDep.length - 1 ? `1px solid #0d0d20` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#ccc', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{tx.libelle}</div>
                      <div style={{ fontSize: 10, color: CATEGORIES[tx.cat]?.color || C.muted, marginTop: 1 }}>{CATEGORIES[tx.cat]?.label} · {fmtD(tx.dateOpe)}</div>
                    </div>
                    <span style={{ color: C.danger, fontWeight: 600, fontSize: 13 }}>{fmt(Math.abs(tx.montant))}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Tendances vs mois précédent */}
          {statsPrev && catDeltas.length > 0 && (() => {
            const movers = catDeltas
              .filter(d => d.prev > 0 || d.cur > 0)
              .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
              .slice(0, 4)
            return (
              <>
                <div style={{ fontSize: 13, color: C.muted, fontWeight: 500, marginTop: 4, marginBottom: 2 }}>📈 Tendances vs {fmtMonth(prevMois)}</div>
                <div style={{ ...S.card, overflow: 'hidden' }}>
                  {movers.map((d, i) => {
                    const pctChange = d.prev > 0 ? Math.round((d.cur - d.prev) / d.prev * 100) : null
                    const up = d.delta > 0
                    const arrowColor = up ? C.danger : C.success
                    return (
                      <div key={d.cat} style={{ padding: '0.55rem 1rem', borderBottom: i < movers.length - 1 ? `1px solid #0d0d20` : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{d.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: C.muted }}>{d.label}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 12, color: d.color, fontWeight: 500 }}>{fmt(d.cur)}</div>
                          <div style={{ fontSize: 10, color: arrowColor }}>
                            {up ? '▲' : '▼'} {fmt(Math.abs(d.delta))}
                            {pctChange !== null && <span style={{ color: '#3a3a55', marginLeft: 3 }}>({pctChange > 0 ? '+' : ''}{pctChange}%)</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}

          {/* Comparaison Budget vs Réel */}
          {moisF && Object.keys(budgets).length > 0 && (() => {
            const comparaison = Object.entries(budgets)
              .filter(([, lim]) => parseFloat(lim) > 0)
              .map(([cat, lim]) => {
                const limite = parseFloat(lim)
                const actual = stats.parCat[cat] || 0
                const diff   = actual - limite          // positif = dépassement
                const pct    = Math.round(actual / limite * 100)
                return { cat, limite, actual, diff, pct }
              })
              .filter(r => r.actual > 0 || r.limite > 0)   // n'affiche que les cats pertinentes
              .sort((a, b) => b.pct - a.pct)               // tri par taux d'utilisation DESC

            if (!comparaison.length) return null
            return (
              <>
                <div style={{ fontSize: 13, color: C.muted, fontWeight: 500, marginTop: 4, marginBottom: 2 }}>📊 Budget vs Réel</div>
                <div style={{ ...S.card, overflow: 'hidden' }}>
                  {comparaison.map((r, i) => {
                    const over  = r.diff > 0
                    const barW  = Math.min(r.pct, 100)
                    const barColor = over ? C.danger : r.pct >= 80 ? C.warn : C.success
                    return (
                      <div key={r.cat} style={{ padding: '0.65rem 1rem', borderBottom: i < comparaison.length - 1 ? `1px solid #0d0d20` : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontSize: 14 }}>{CATEGORIES[r.cat]?.icon}</span>
                          <span style={{ fontSize: 12, color: C.text, flex: 1 }}>{CATEGORIES[r.cat]?.label}</span>
                          <span style={{ fontSize: 12, color: barColor, fontWeight: 600 }}>
                            {fmt(r.actual)} <span style={{ color: C.muted, fontWeight: 400 }}>/ {fmt(r.limite)}</span>
                          </span>
                          <span style={{ fontSize: 11, color: barColor, minWidth: 44, textAlign: 'right', fontWeight: over ? 600 : 400 }}>
                            {over ? `+${fmt(r.diff)}` : `${r.pct}%`}
                          </span>
                        </div>
                        <div style={{ height: 3, background: '#1e1e3a', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: `${barW}%`, height: '100%', background: barColor, borderRadius: 99, transition: 'width 0.4s' }} />
                        </div>
                        {over && r.actual > 0 && (
                          <div style={{ fontSize: 10, color: C.danger, marginTop: 3 }}>
                            ⚠ Dépassement de {fmt(r.diff)} ({r.pct - 100}% au-dessus)
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}

          {/* Score santé financière */}
          {stats.totalRev > 0 && (
            <>
              <div style={{ fontSize: 13, color: C.muted, fontWeight: 500, marginTop: 4, marginBottom: 2 }}>🏅 Score santé</div>
              <div style={{ ...S.card, padding: '1rem 1.1rem' }}>
                {[
                  { label: "Taux d'épargne",      score: tauxEp >= 20 ? 2 : tauxEp >= 10 ? 1 : 0,  max: 2, hint: `${tauxEp}% · objectif ≥ 20%` },
                  { label: 'Dépenses maîtrisées', score: (() => { const dep = stats.totalDep; return revenu ? (dep <= revenu * 0.8 ? 2 : dep <= revenu ? 1 : 0) : 1 })(), max: 2, hint: revenu ? `${fmt(stats.totalDep)} de conso / ${fmt(revenu)} de revenu` : 'Revenu non renseigné' },
                  { label: 'Catégorisation', score: (() => { const n = txsF.filter(t => t.confidence === 'low' && !t.corrected && !t.isCredit).length; return n === 0 ? 2 : n <= 3 ? 1 : 0 })(), max: 2, hint: (() => { const n = txsF.filter(t => t.confidence === 'low' && !t.corrected && !t.isCredit).length; return `${n} tx à clarifier ce mois` })() },
                ].map(({ label, score, max, hint }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: C.text, marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{hint}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {Array.from({ length: max }).map((_, j) => (
                        <div key={j} style={{ width: 10, height: 10, borderRadius: '50%', background: j < score ? (score === max ? C.success : C.warn) : '#1e1e3a' }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Tendance par catégorie · 6 mois ── */}
      {trendData && trendData.points.length >= 2 && (
        <div style={{ ...S.card, padding: '1.25rem', marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: C.gold, fontWeight: 500, marginBottom: 12 }}>📊 Tendance par catégorie · 6 mois</div>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={trendData.points} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.muted }} tickFormatter={v => `${v}€`} width={52} axisLine={false} tickLine={false} />
              <Tooltip content={<CTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
              {trendData.cats.map(cat => (
                <Line key={cat} type="monotone" dataKey={cat}
                  name={CATEGORIES[cat]?.label || cat}
                  stroke={CATEGORIES[cat]?.color || '#888'}
                  strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Panneau IA optionnel ── */}
      <ChatIA transactions={transactions} profile={profile} journal={journal} apiKey={apiKey} onSetApiKey={onSetApiKey} />
    </div>
  )
}

// ─── BUDGET & OBJECTIFS ───────────────────────────────────────────────────────

export default Analyse
