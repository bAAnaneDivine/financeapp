/**
 * @file Dashboard.jsx
 * @description Vue principale de synthèse financière.
 *
 * Affiche pour le mois sélectionné (ou la vue globale) :
 *  - KPIs clés : revenus, dépenses conso, épargne investie, solde net
 *  - Score de santé financière 0-100 avec 5 sous-indicateurs
 *  - Graphe d'évolution mensuelle (barres revenus/dépenses/épargne)
 *  - Répartition des dépenses par catégorie (camembert)
 *  - Top catégories, charges fixes, dépenses exceptionnelles
 *  - Insights automatiques (analyseLocale)
 *  - Alertes de dérive budgétaire
 *  - Projection patrimoniale 3/6/12 mois
 *  - KPI autonomie financière (nb mois sans revenus)
 */

import { useState, useMemo, useDeferredValue } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
  LineChart, Line, Legend
} from 'recharts'
import { computeStats, CATEGORIES } from '../utils/parser.js'
import { C, S, fmt, fmtD, fmtMonth, ABO_CATS } from '../theme.js'
import { calcSavedForGoal, analyseLocale } from '../helpers.js'

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

function Dashboard({ transactions, profile, objectifs = [], budgets = {}, comptes = [], onNavigate }) {
  const currentYM = new Date().toISOString().slice(0, 7)
  const deferredTxs = useDeferredValue(transactions)

  const months = useMemo(
    () => [...new Set(deferredTxs.map(t => t.dateOpe.slice(0, 7)))].sort().reverse(),
    [deferredTxs]
  )
  const allMonthsAsc = useMemo(
    () => [...new Set(deferredTxs.map(t => t.dateOpe.slice(0, 7)))].sort(),
    [deferredTxs]
  )
  const completedMonths = useMemo(
    () => { const c = allMonthsAsc.filter(m => m < currentYM); return c.length ? c : allMonthsAsc },
    [allMonthsAsc]
  )
  const completedTxs = useMemo(
    () => allMonthsAsc.some(m => m >= currentYM)
      ? deferredTxs.filter(t => t.dateOpe.slice(0, 7) < currentYM)
      : deferredTxs,
    [deferredTxs, allMonthsAsc]
  )
  const completedStats = useMemo(() => computeStats(completedTxs), [completedTxs])

  // Cache stats par mois — évite N×computeStats dans evolutionData et prevStats
  const statsParMois = useMemo(() => {
    const cache = {}
    allMonthsAsc.forEach(m => {
      cache[m] = computeStats(deferredTxs.filter(t => t.dateOpe.startsWith(m)))
    })
    return cache
  }, [transactions, allMonthsAsc])

  // Progression des objectifs — recalcul seulement quand transactions ou objectifs changent
  const objectifsProgress = useMemo(() =>
    objectifs.map(obj => {
      const saved  = calcSavedForGoal(obj, transactions, allMonthsAsc)
      const pct    = Math.min(Math.round(saved / obj.cible * 100), 100)
      const remain = Math.max(0, obj.cible - saved)
      const done   = saved >= obj.cible
      return { ...obj, saved, pct, remain, done }
    }),
    [objectifs, transactions, allMonthsAsc]
  )

  // null = toute la période, sinon index dans months[]
  const [moisIdx, setMoisIdx] = useState(null)

  const mois = moisIdx !== null ? months[moisIdx] : null
  const txs   = useMemo(() => mois ? transactions.filter(t => t.dateOpe.startsWith(mois)) : transactions, [mois, transactions])
  const stats = useMemo(() => computeStats(txs), [txs])
  const net    = stats.totalRev - stats.totalDep
  const tauxEp  = stats.totalRev > 0 ? Math.round((stats.epargneInvestie || 0) / stats.totalRev * 100) : 0
  const epargne = profile?.epargne ? parseFloat(profile.epargne) : 0
  const nClarifyDash = txs.filter(t => t.confidence === 'low' && !t.corrected && !t.isCredit).length

  // Delta vs mois précédent (seulement quand un mois est sélectionné)
  const prevMois  = moisIdx !== null && moisIdx < months.length - 1 ? months[moisIdx + 1] : null
  const prevStats = useMemo(
    () => prevMois ? (statsParMois[prevMois] || null) : null,
    [prevMois, statsParMois]
  )

  const pct = (cur, prev) => {
    if (!prev || prev === 0) return null
    return Math.round((cur - prev) / prev * 100)
  }

  const Delta = ({ cur, prev, inverse = false }) => {
    const p = pct(cur, prev)
    if (p === null) return null
    const good  = inverse ? p < 0 : p > 0
    const color = good ? C.success : C.danger
    return (
      <span style={{ fontSize: 10, color, background: `${color}22`, padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>
        {p > 0 ? '+' : ''}{p}%
      </span>
    )
  }

  const pieData = useMemo(() =>
    Object.entries(stats.parCat)
      .filter(([, v]) => v > 0)
      .map(([cat, value]) => ({ name: CATEGORIES[cat]?.label || cat, value: Math.round(value), cat, color: CATEGORIES[cat]?.color || '#555' }))
      .sort((a, b) => b.value - a.value),
    [stats]
  )

  // Graphique évolution mensuelle (chronologique) — utilise le cache statsParMois
  const evolutionData = useMemo(() =>
    [...months].reverse().map(m => {
      const s = statsParMois[m] || { totalRev: 0, totalDep: 0, epargneInvestie: 0 }
      return {
        name:     new Date(m + '-01').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        month:    m,   // clé pour onClick
        revenus:  Math.round(s.totalRev),
        dépenses: Math.round(s.totalDep),
        épargne:  Math.round(s.epargneInvestie || 0),
        active:   m === mois
      }
    }),
    [statsParMois, months, mois]
  )
  const avgEpargne = useMemo(() => {
    if (!evolutionData.length) return 0
    const nonZero = evolutionData.filter(d => d.épargne > 0)
    return nonZero.length ? Math.round(nonZero.reduce((s, d) => s + d.épargne, 0) / nonZero.length) : 0
  }, [evolutionData])

  // Abonnements & charges récurrentes (toujours sur l'ensemble des données)
  const globalStats   = useMemo(() => computeStats(transactions), [transactions])
  const abonnements   = useMemo(() => {
    const raw = globalStats.recurrentes
      .filter(r => ABO_CATS.has(r.cat) && r.count >= 2 && r.sub !== 'Épargne & investissement')
      .sort((a, b) => b.montantMoyen - a.montantMoyen)
    // Déduplication : si deux entrées de même catégorie ont un montant identique (à 1€ près),
    // c'est probablement le même créancier avec deux variantes de libellé → on garde le plus fréquent
    const seen = []
    return raw.filter(r => {
      const dup = seen.find(s => s.cat === r.cat && Math.abs(s.montantMoyen - r.montantMoyen) <= 1)
      if (dup) return false
      seen.push(r)
      return true
    })
  }, [globalStats])
  const totalAboMensuel = abonnements.reduce((s, r) => s + r.montantMoyen, 0)

  // Score santé financière (0–100) — basé sur mois COMPLÉTÉS uniquement
  // Décomposition en 5 critères pondérés :
  //   Taux d'épargne     → 30 pts  (critère principal, seuil cible 20%)
  //   Équilibre mensuel  → 22 pts  (rev > dep)
  //   Charges fixes      → 18 pts  (abos+assu+santé / revenus < 18%)
  //   Projets épargne    → 15 pts  (objectifs définis et en bonne voie)
  //   Historique         → 15 pts  (≥ 6 mois complets = données fiables)
  const healthScore = useMemo(() => {
    if (!transactions.length || !months.length) return null
    const gs = completedStats.totalRev > 0 ? completedStats : globalStats
    const nMois = completedMonths.length || months.length
    const totalNet = gs.totalRev - gs.totalDep
    const tauxGlobal = gs.totalRev > 0 ? (gs.epargneInvestie || 0) / gs.totalRev * 100 : 0
    const avgRev = gs.totalRev / nMois
    const avgNet = totalNet / nMois

    // 1. Taux d'épargne (30 pts)
    const epScore = tauxGlobal >= 20 ? 30 : tauxGlobal >= 15 ? 22 : tauxGlobal >= 10 ? 16 : tauxGlobal >= 5 ? 10 : tauxGlobal >= 0 ? 4 : 0

    // 2. Équilibre revenus/dépenses (22 pts)
    const eqScore = avgNet > 0 ? 22 : avgNet > -avgRev * 0.05 ? 8 : 0

    // 3. Maîtrise abonnements hors loyer (18 pts) — on exclut logement pour éviter le double-comptage
    const avgAbo = ((gs.parCat?.abonnements || 0) + (gs.parCat?.assurances || 0) + (gs.parCat?.sante || 0)) / nMois
    const fixedRatio = avgRev > 0 ? avgAbo / avgRev * 100 : 100
    const fixScore = fixedRatio < 10 ? 18 : fixedRatio < 18 ? 11 : fixedRatio < 28 ? 5 : 0

    // 4. Projets d'épargne (15 pts)
    let projScore = 0
    let projInfo = 'Aucun objectif'
    // Progression détaillée par objectif (pour affichage dans la jauge)
    const objProgress = objectifs.map(obj => {
      const saved = calcSavedForGoal(obj, transactions, months)
      const pct   = Math.min(Math.round(saved / obj.cible * 100), 100)
      const remain = Math.max(0, obj.cible - saved)
      const rate   = obj.contrib && parseFloat(obj.contrib) > 0 ? parseFloat(obj.contrib) : Math.max(avgNet, 0)
      const moisR  = rate > 0 && remain > 0 ? Math.ceil(remain / rate) : null
      const finDate = moisR !== null ? (() => {
        const d = new Date(); d.setMonth(d.getMonth() + moisR)
        return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
      })() : null
      return { nom: obj.nom, cible: obj.cible, saved, pct, remain, moisR, finDate }
    })
    if (objectifs.length > 0) {
      projScore = 5
      projInfo = `${objectifs.length} objectif${objectifs.length > 1 ? 's' : ''} défini${objectifs.length > 1 ? 's' : ''}`
      if (avgNet > 0) {
        projScore = 10
        const onTrack = objProgress.some(o => o.moisR !== null && o.moisR <= 36)
        if (onTrack) { projScore = 15; projInfo = `${objectifs.length} objectif${objectifs.length > 1 ? 's' : ''} · en bonne voie` }
        else projInfo = `${objectifs.length} objectif${objectifs.length > 1 ? 's' : ''} · épargne positive`
      }
    }

    // 5. Profondeur historique (15 pts)
    const histScore = nMois >= 6 ? 15 : nMois >= 3 ? 10 : nMois >= 2 ? 6 : 3

    const total = epScore + eqScore + fixScore + projScore + histScore
    const grade = total >= 80 ? 'Excellent 🌟' : total >= 65 ? 'Bon 👍' : total >= 50 ? 'Correct 📊' : total >= 35 ? 'À améliorer ⚡' : 'Fragile ⚠'
    const color = total >= 80 ? C.success : total >= 65 ? '#6db87a' : total >= 50 ? C.warn : total >= 35 ? '#e8682a' : C.danger
    return {
      total, grade, color, avgNet, avgRev,
      details: [
        { label: "Taux d'épargne", score: epScore, max: 30, info: `${Math.round(tauxGlobal)}%`, ok: tauxGlobal >= 10 ? 2 : tauxGlobal >= 0 ? 1 : 0 },
        { label: 'Équilibre mensuel', score: eqScore, max: 22, info: avgNet > 0 ? `+${fmt(avgNet).replace(' €','€')}/mois` : `${fmt(avgNet).replace(' €','€')}/mois`, ok: avgNet > 0 ? 2 : 0 },
        { label: 'Charges fixes', score: fixScore, max: 18, info: `${Math.round(fixedRatio)}% des revenus`, ok: fixedRatio < 25 ? 2 : fixedRatio < 35 ? 1 : 0 },
        { label: 'Projets épargne', score: projScore, max: 15, info: projInfo, ok: projScore >= 15 ? 2 : projScore > 0 ? 1 : 0, objProgress },
        { label: 'Historique', score: histScore, max: 15, info: `${nMois} mois complets`, ok: nMois >= 3 ? 2 : 1 },
      ]
    }
  }, [completedStats, globalStats, completedMonths, months, totalAboMensuel, objectifs, transactions])

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 960, margin: '0 auto' }}>

      {/* ── En-tête + navigation mensuelle ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 28, color: C.text, marginBottom: 4, fontFamily: "'Georgia', serif" }}>
            Bonjour{profile?.nom ? `, ${profile.nom}` : ''} 👋
          </h2>
          <p style={{ color: C.muted, fontSize: 13 }}>{transactions.length} transactions · {months.length} mois de données</p>
        </div>

        {months.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {moisIdx !== null && (
              <button
                onClick={() => setMoisIdx(null)}
                style={{ ...S.ghost, fontSize: 11, padding: '5px 10px', color: C.gold, borderColor: 'rgba(201,169,110,0.4)' }}
              >Vue globale</button>
            )}
            <button
              onClick={() => setMoisIdx(i => i === null ? 0 : Math.min(i + 1, months.length - 1))}
              disabled={moisIdx === months.length - 1}
              style={{ ...S.ghost, padding: '7px 12px', opacity: moisIdx === months.length - 1 ? 0.3 : 1 }}
            >←</button>
            <div style={{
              minWidth: 155, textAlign: 'center', fontSize: 14, color: C.text, fontWeight: 500,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 14px'
            }}>
              {mois ? fmtMonth(mois) : 'Toute la période'}
            </div>
            <button
              onClick={() => setMoisIdx(i => i === null ? null : Math.max(i - 1, 0))}
              disabled={moisIdx === null || moisIdx === 0}
              style={{ ...S.ghost, padding: '7px 12px', opacity: (moisIdx === null || moisIdx === 0) ? 0.3 : 1 }}
            >→</button>
          </div>
        )}
      </div>

      {/* ── Bandeau mois en cours (données partielles) ── */}
      {mois === currentYM && (
        <div style={{ background: 'rgba(232,168,56,0.07)', border: '1px solid rgba(232,168,56,0.25)', borderRadius: 10, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.warn }}>
          <span>📅</span>
          <span>Mois en cours — données partielles · les comparaisons avec le mois précédent peuvent être sous-estimées</span>
        </div>
      )}

      {/* ── KPIs ── */}
      {(() => {
        // Autonomie financière = patrimoine total (comptes épargne importés) / dépenses mensuelles moyennes
        // Numérateur : valorisation totale de tous les comptes épargne (dernier relevé de chaque compte)
        const patrimoineTotal = comptes.reduce((s, c) => s + (c.historique.at(-1)?.valorisationTotale || 0), 0)
        // Dénominateur : moyenne des dépenses de conso sur les mois complets (hors PEA, hors virements)
        const avgDepMensuel = completedMonths.length > 0
          ? completedStats.totalDep / completedMonths.length
          : 0
        // On n'affiche le KPI que si on a du patrimoine importé ET des données de dépenses
        const autonomieMois = patrimoineTotal > 0 && avgDepMensuel > 0
          ? patrimoineTotal / avgDepMensuel
          : null
        const autonomieLabel = autonomieMois === null
          ? (comptes.length === 0 ? 'Importer un relevé' : 'Insuf. données')
          : autonomieMois < 1 ? `${Math.round(autonomieMois * 30)} jours`
          : autonomieMois >= 12 ? `${(autonomieMois / 12).toFixed(1)} ans`
          : `${autonomieMois.toFixed(1)} mois`
        const autonomieColor = autonomieMois === null ? C.muted : autonomieMois >= 12 ? C.success : autonomieMois >= 6 ? C.warn : C.danger

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 10, marginBottom: 18 }}>
            {[
              {
                label: 'Revenus', val: fmt(stats.totalRev), color: C.success,
                delta: <Delta cur={stats.totalRev} prev={prevStats?.totalRev} />
              },
              {
                label: 'Dépenses', val: fmt(stats.totalDep), color: C.danger,
                delta: <Delta cur={stats.totalDep} prev={prevStats?.totalDep} inverse />
              },
              {
                label: 'Solde net', val: fmt(net), color: net >= 0 ? C.success : C.danger,
                delta: <Delta cur={net} prev={prevStats ? prevStats.totalRev - prevStats.totalDep : null} />
              },
              {
                label: "Taux d'épargne", val: `${tauxEp}%`,
                color: tauxEp >= 20 ? C.success : tauxEp >= 10 ? C.warn : C.danger,
                sub: stats.epargneInvestie > 0 ? `${fmt(stats.epargneInvestie)} investis` : 'Aucun versement épargne'
              },
              {
                label: 'Autonomie', val: autonomieLabel, color: autonomieColor,
                sub: patrimoineTotal > 0
                  ? `${fmt(patrimoineTotal)} / ${fmt(Math.round(avgDepMensuel))}/mois`
                  : 'Importe un relevé épargne',
                title: `Combien de temps ton patrimoine (${fmt(patrimoineTotal)}) couvrirait tes dépenses moyennes (${fmt(Math.round(avgDepMensuel))}/mois) sans aucun revenu.`,
                nav: comptes.length === 0 ? 'epargne' : undefined,
                navColor: C.muted
              },
              ...(epargne > 0 ? [{ label: 'Objectif épargne', val: fmt(epargne), color: '#8577e8' }] : []),
              ...(comptes.length > 0 ? [{
                label: 'Patrimoine', color: '#28b888',
                val: fmt(comptes.reduce((s, c) => s + (c.historique.at(-1)?.valorisationTotale || 0), 0)),
                sub: `${comptes.length} compte${comptes.length > 1 ? 's' : ''}`, nav: 'epargne', navColor: '#28b888'
              }] : []),
              ...(nClarifyDash > 0 ? [{ label: 'À clarifier', val: `${nClarifyDash} tx`, color: C.warn, sub: '⚠ action requise', nav: 'transactions', navColor: C.warn }] : []),
            ].map(({ label, val, color, sub, delta, nav, title, navColor }) => (
              <div key={label}
                onClick={nav ? () => onNavigate?.(nav) : undefined}
                title={title}
                style={{ ...S.card, padding: '1rem 1.1rem', cursor: nav ? 'pointer' : 'default',
                  ...(nav ? { borderColor: navColor || C.warn, transition: 'border-color 0.15s' } : {}) }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 600, color, fontFamily: "'Georgia', serif", display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                  {val}{delta}
                </div>
                {sub && <div style={{ fontSize: 11, color: nav ? (navColor || C.warn) : C.muted, marginTop: 3 }}>{sub}</div>}
                {nav && <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>→ Voir{nav === 'epargne' ? ' l\'épargne' : nav === 'transactions' ? ' les transactions' : ''}</div>}
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Alertes dérive budget (mois sélectionné + budgets définis) ── */}
      {mois && Object.keys(budgets).length > 0 && (() => {
        const today = new Date()
        const year = parseInt(mois.slice(0, 4))
        const month = parseInt(mois.slice(5, 7)) - 1
        const joursTotal = new Date(year, month + 1, 0).getDate()
        const isCurrentMois = mois === currentYM
        const joursEcoulés = isCurrentMois ? today.getDate() : joursTotal
        const ratio = joursEcoulés / joursTotal

        const alertes = Object.entries(budgets)
          .filter(([cat, lim]) => parseFloat(lim) > 0 && stats.parCat[cat] > 0)
          .map(([cat, lim]) => {
            const actual = stats.parCat[cat] || 0
            const limite = parseFloat(lim)
            const pctUtilise = actual / limite
            const rythme = ratio > 0 ? actual / limite / ratio : 0  // % du budget à ce rythme en fin de mois
            return { cat, actual, limite, pctUtilise, rythme, depassement: actual > limite }
          })
          // Mois courant : dépassement réel OU rythme projeté dépassant 110%
          // Mois passés : uniquement les dépassements réels (le rythme n'est plus pertinent)
          .filter(a => a.depassement || (isCurrentMois && a.rythme > 1.1))
          .sort((a, b) => b.rythme - a.rythme)

        if (!alertes.length) return null
        return (
          <div style={{ ...S.card, padding: '1rem 1.1rem', marginBottom: 14, borderColor: 'rgba(224,85,85,0.35)' }}>
            <div style={{ fontSize: 13, color: C.danger, fontWeight: 500, marginBottom: 8 }}>
              ⚠ {isCurrentMois ? 'Dérives de budget détectées' : 'Budgets dépassés'}
              {isCurrentMois && <span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginLeft: 6 }}>· jour {joursEcoulés}/{joursTotal}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {alertes.map(a => (
                <div key={a.cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14 }}>{CATEGORIES[a.cat]?.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, color: C.text }}>{CATEGORIES[a.cat]?.label}</span>
                      <span style={{ fontSize: 12, color: a.depassement ? C.danger : C.warn, fontWeight: 600 }}>
                        {fmt(a.actual)} / {fmt(a.limite)}
                        {!a.depassement && a.rythme > 0 && <span style={{ color: C.muted, fontWeight: 400 }}> · ~{fmt(a.limite * a.rythme)} estimé</span>}
                      </span>
                    </div>
                    <div style={{ height: 3, background: '#1e1e3a', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(a.pctUtilise * 100, 100)}%`, background: a.depassement ? C.danger : C.warn, borderRadius: 2 }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: a.depassement ? C.danger : C.warn, flexShrink: 0 }}>
                    {a.depassement ? `+${fmt(a.actual - a.limite)}` : `${Math.round(a.rythme * 100)}% rythme`}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              → <span style={{ cursor: 'pointer', color: C.gold, textDecoration: 'underline' }} onClick={() => onNavigate?.('budget')}>Gérer les enveloppes</span>
            </div>
          </div>
        )
      })()}

      {/* ── Graphique évolution ── */}
      {evolutionData.length >= 2 && (
        <div style={{ ...S.card, padding: '1.25rem', marginBottom: 14 }}>
          <div style={{ fontSize: 15, color: C.text, marginBottom: 4, fontFamily: "'Georgia', serif" }}>Évolution mensuelle</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Revenus vs dépenses par mois</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={evolutionData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
              style={{ cursor: 'pointer' }}
              onClick={data => {
                const m = data?.activePayload?.[0]?.payload?.month
                if (m) setMoisIdx(months.indexOf(m))
              }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.muted }} tickFormatter={v => `${v}€`} width={52} axisLine={false} tickLine={false} />
              <Tooltip content={<CTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="revenus"  name="Revenus"  fill={C.success}   radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="dépenses" name="Dépenses" fill={C.danger}    radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="épargne"  name="Épargne nette"  fill={'#8577e8'}   radius={[3, 3, 0, 0]} maxBarSize={28} />
              <ReferenceLine y={avgEpargne} stroke="#8577e8" strokeDasharray="5 3" strokeOpacity={0.5}
                label={{ value: `moy. ${avgEpargne > 0 ? '+' : ''}${avgEpargne}€`, position: 'insideTopRight', fontSize: 10, fill: '#8577e8', opacity: 0.8 }} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 8 }}>
            {[['Revenus', C.success], ['Dépenses', C.danger], ['Épargne nette', '#8577e8']].map(([label, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Score santé financière ── */}
      {healthScore && (
        <div style={{ ...S.card, padding: '1.25rem', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            {/* Gauge circulaire */}
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{
                width: 92, height: 92, borderRadius: '50%',
                background: `conic-gradient(${healthScore.color} ${healthScore.total * 3.6}deg, #1a1a30 ${healthScore.total * 3.6}deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto'
              }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: healthScore.color, fontFamily: "'Georgia', serif", lineHeight: 1 }}>{healthScore.total}</span>
                  <span style={{ fontSize: 9, color: C.muted }}>/100</span>
                </div>
              </div>
              <div style={{ marginTop: 7, fontSize: 11, color: healthScore.color, fontWeight: 600 }}>{healthScore.grade}</div>
            </div>

            {/* Détails */}
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 15, color: C.text, fontFamily: "'Georgia', serif", marginBottom: 10 }}>🏥 Score santé financière</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 8 }}>
                {healthScore.details.map(d => {
                  const barColor = d.ok === 2 ? C.success : d.ok === 1 ? C.warn : C.danger
                  const hasProj = d.objProgress && d.objProgress.length > 0
                  return (
                    <div key={d.label} style={{ background: '#080814', borderRadius: 8, padding: '0.5rem 0.75rem', border: `1px solid ${hasProj && d.ok >= 1 ? 'rgba(201,169,110,0.25)' : C.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: C.muted }}>{d.label}</span>
                        <span style={{ fontSize: 10, color: barColor, fontWeight: 700 }}>{d.score}/{d.max}</span>
                      </div>
                      <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                        <div style={{ height: '100%', width: `${d.score / d.max * 100}%`, background: barColor, borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 10, color: '#aaa' }}>{d.info}</div>
                      {/* Projection par objectif */}
                      {hasProj && d.objProgress.map(o => (
                        <div key={o.nom} style={{ marginTop: 7, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.muted, marginBottom: 3 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{o.nom}</span>
                            <span style={{ color: o.pct >= 100 ? C.success : C.gold, fontWeight: 600 }}>{o.pct}%</span>
                          </div>
                          <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
                            <div style={{ height: '100%', width: `${o.pct}%`, background: o.pct >= 100 ? C.success : C.gold, borderRadius: 2, transition: 'width 0.4s' }} />
                          </div>
                          <div style={{ fontSize: 9, color: C.muted }}>
                            {fmt(o.saved)} / {fmt(o.cible)}
                            {o.finDate && <span style={{ color: C.gold, marginLeft: 4 }}>→ {o.finDate}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Projection patrimoniale 3/6/12 mois ── */}
      {!mois && healthScore && healthScore.avgNet !== undefined && (() => {
        const avgNet   = healthScore.avgNet
        const avgEp    = (completedStats.epargneInvestie || 0) / (completedMonths.length || 1)
        const gainMens = avgNet + avgEp   // ce qui s'accumule réellement par mois
        const cumActuel = globalStats.totalRev - globalStats.totalDep + (globalStats.epargneInvestie || 0)
        if (gainMens <= 0 && cumActuel <= 0) return null
        const proj = [3, 6, 12].map(n => ({
          n,
          val: cumActuel + gainMens * n,
          label: (() => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) })()
        }))
        return (
          <div style={{ ...S.card, padding: '1rem 1.25rem', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: C.text, fontFamily: "'Georgia', serif" }}>📈 Projection patrimoniale</div>
              <div style={{ fontSize: 11, color: C.muted }}>À rythme constant · +{fmt(gainMens)}/mois</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {proj.map(p => (
                <div key={p.n} style={{ background: '#080814', borderRadius: 8, padding: '0.6rem 0.85rem', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Dans {p.n} mois · {p.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: p.val >= 0 ? C.success : C.danger, fontFamily: "'Georgia', serif" }}>{fmt(p.val)}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    {p.val >= cumActuel ? `+${fmt(p.val - cumActuel)}` : fmt(p.val - cumActuel)} vs aujourd'hui
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#2a2a3a', marginTop: 8 }}>Cumul actuel : {fmt(cumActuel)} · hypothèse linéaire basée sur {completedMonths.length} mois complets</div>
          </div>
        )
      })()}

      {/* ── Répartition + Top catégories ── */}
      {pieData.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ ...S.card, padding: '1.25rem' }}>
            <div style={{ fontSize: 15, color: C.text, marginBottom: 16, fontFamily: "'Georgia', serif" }}>Répartition</div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={78} dataKey="value" stroke="none">
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip content={<CTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginTop: 8 }}>
              {pieData.slice(0, 6).map(d => (
                <div key={d.cat} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  <span style={{ color: '#ccc', fontWeight: 500 }}>{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...S.card, padding: '1.25rem' }}>
            <div style={{ fontSize: 15, color: C.text, marginBottom: 16, fontFamily: "'Georgia', serif" }}>Top catégories</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pieData.slice(0, 6)} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={105} tick={{ fontSize: 11, fill: C.muted }} />
                <Tooltip content={<CTooltip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {pieData.slice(0, 6).map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div style={{ ...S.card, padding: '4rem', textAlign: 'center', color: C.muted, fontSize: 14, marginBottom: 14 }}>
          Aucune donnée · Commence par importer un relevé 📤
        </div>
      )}

      {/* ── Abonnements & charges récurrentes ── */}
      {abonnements.length > 0 && (
        <div style={{ ...S.card, padding: '1.25rem', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 15, color: C.text, fontFamily: "'Georgia', serif" }}>📱 Abonnements & charges fixes</div>
            <div style={{ fontSize: 12, color: C.muted }}>
              <span style={{ color: C.warn, fontWeight: 500 }}>{fmt(totalAboMensuel)}/mois</span>
              <span style={{ color: '#3a3a55', marginLeft: 8 }}>· {fmt(totalAboMensuel * 12)}/an</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
            {abonnements.map(r => (
              <div key={r.label} style={{ background: '#0a0a16', borderRadius: 10, padding: '0.65rem 0.85rem', border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 13 }}>{CATEGORIES[r.cat]?.icon || '🔁'}</span>
                  <span style={{ color: '#ccc', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: C.muted }}>{r.count}× détecté · {fmt(r.montantMoyen * 12)}/an</span>
                  <span style={{ color: CATEGORIES[r.cat]?.color || C.gold, fontWeight: 600, fontSize: 13 }}>{fmt(r.montantMoyen)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Objectifs d'épargne ── */}
      {objectifsProgress.length > 0 && (
        <div style={{ ...S.card, padding: '1.25rem', marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 12, fontFamily: "'Georgia', serif" }}>🏆 Objectifs d'épargne</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(objectifsProgress.length, 3)}, 1fr)`, gap: 10 }}>
            {objectifsProgress.map(({ id, emoji, label, cible, saved, pct, remain, done, contrib, created, dateTarget }) => {
              const hasContrib = contrib && parseFloat(contrib) > 0
              const notStarted = saved === 0 && hasContrib
              // Calcul projection si contrib fixe
              const monthsLeft = hasContrib && remain > 0 ? Math.ceil(remain / parseFloat(contrib)) : null
              const projFinDate = monthsLeft ? (() => {
                const d = new Date(); d.setMonth(d.getMonth() + monthsLeft)
                return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
              })() : null
              return (
                <div key={id} style={{ background: '#080814', borderRadius: 10, padding: '0.85rem', border: `1px solid ${done ? 'rgba(109,184,122,0.3)' : notStarted ? 'rgba(201,169,110,0.2)' : C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>{emoji || '🎯'}</span>
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {done && <span style={{ fontSize: 10, color: C.success }}>🎉</span>}
                    {notStarted && <span style={{ fontSize: 9, color: C.gold, background: 'rgba(201,169,110,0.12)', padding: '1px 5px', borderRadius: 99 }}>À démarrer</span>}
                  </div>
                  <div style={{ background: C.card, borderRadius: 99, height: 5, marginBottom: 5 }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, transition: 'width 0.4s',
                      background: done ? C.success : pct >= 75 ? C.gold : pct >= 40 ? C.warn : '#4a4a6a'
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: done ? C.success : C.muted }}>{pct}%</span>
                    <span style={{ color: C.muted }}>{fmt(saved)} / {fmt(cible)}</span>
                  </div>
                  {notStarted && (
                    <div style={{ fontSize: 10, color: C.gold, marginTop: 4 }}>
                      {fmt(parseFloat(contrib))}/mois · fin {projFinDate || '…'}
                    </div>
                  )}
                  {!done && !notStarted && remain > 0 && (
                    <div style={{ fontSize: 10, color: '#3a3a5a', marginTop: 3 }}>
                      reste {fmt(remain)}{projFinDate ? ` · fin ${projFinDate}` : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Dépenses exceptionnelles ── */}
      {stats.exceptionnelles.length > 0 && (
        <div style={{ ...S.card, padding: '1.25rem', marginBottom: 14, borderColor: 'rgba(232,168,56,0.4)' }}>
          <div style={{ color: C.warn, fontSize: 13, fontWeight: 500, marginBottom: 10 }}>⚠ Dépenses exceptionnelles</div>
          {stats.exceptionnelles.map(tx => (
            <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid #0d0d20`, fontSize: 13 }}>
              <div><span style={{ color: '#ccc' }}>{tx.libelle}</span><span style={{ color: C.muted, fontSize: 11, marginLeft: 8 }}>{fmtD(tx.dateOpe)}</span></div>
              <span style={{ color: C.danger, fontWeight: 500 }}>{fmt(Math.abs(tx.montant))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

export default Dashboard
