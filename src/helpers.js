/**
 * @file helpers.js
 * @description Fonctions utilitaires partagées entre plusieurs composants.
 *
 * Ce fichier regroupe les helpers qui ne peuvent pas aller dans theme.js
 * (qui n'a pas de dépendances métier) ni dans un composant unique
 * (car utilisés par plusieurs composants).
 *
 * Fonctions exportées :
 *  - calcSavedForGoal – calcul de progression vers un objectif d'épargne
 *  - exportCSV        – téléchargement des transactions au format CSV
 *  - downloadJSON     – téléchargement de données au format JSON
 *  - analyseLocale    – moteur d'insights financiers sans API
 */

import { computeStats, CATEGORIES } from './utils/parser.js'
import { fmt, fmtMonth, ABO_CATS }   from './theme.js'

// ─── Calcul de progression objectif d'épargne ─────────────────────────────────
/**
 * Calcule le montant épargné vers un objectif depuis sa date de création.
 *
 * Deux modes de calcul selon la configuration de l'objectif :
 *  - Contribution fixe (goal.contrib > 0) : contrib × nb_mois_depuis_création,
 *    plafonné à goal.cible. Simple et prédictible pour l'utilisateur.
 *  - Contribution automatique : somme du solde net positif (rev − dep) de chaque mois
 *    depuis la création. Reflète l'épargne réelle mais dépend de la catégorisation.
 *
 * @param {Object} goal         – Objectif { contrib, created, cible, … }
 * @param {Array}  transactions – Toutes les transactions de l'app
 * @param {Array}  allMonths    – Liste des mois 'YYYY-MM' disponibles (triés ASC)
 * @returns {number} Montant épargné en euros
 */
export function calcSavedForGoal(goal, transactions, allMonths) {
  if (goal.contrib && parseFloat(goal.contrib) > 0) {
    const startM = goal.created.slice(0, 7)
    const nMois  = allMonths.filter(m => m >= startM).length
    return Math.min(parseFloat(goal.contrib) * nMois, goal.cible)
  }
  const startM = goal.created.slice(0, 7)
  return allMonths.filter(m => m >= startM).reduce((s, m) => {
    const ms = computeStats(transactions.filter(t => t.dateOpe.startsWith(m)))
    return s + Math.max(0, ms.totalRev - ms.totalDep)
  }, 0)
}

// ─── Export CSV ────────────────────────────────────────────────────────────────
/**
 * Génère et télécharge les transactions au format CSV compatible Excel français.
 *
 * Conventions :
 *  - BOM UTF-8 (﻿) pour que Excel FR ouvre sans problème d'encodage
 *  - Séparateur point-virgule (standard FR)
 *  - Montants avec virgule décimale
 *  - Toutes les valeurs texte entre guillemets doubles (les guillemets internes sont doublés)
 *
 * @param {Array}  txs      – Tableau de transactions à exporter
 * @param {string} filename – Nom du fichier téléchargé (défaut : 'transactions.csv')
 */
export function exportCSV(txs, filename = 'transactions.csv') {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`

  const header = ['Date', 'Libellé', 'Montant', 'Type', 'Catégorie', 'Sous-catégorie', 'Confiance', 'Corrigé manuellement']

  const rows = txs.map(t => [
    t.dateOpe,
    esc(t.libelle),
    (t.isCredit ? '+' : '-') + String(Math.abs(t.montant)).replace('.', ','),
    t.isCredit ? 'Crédit' : 'Débit',
    esc(CATEGORIES[t.cat]?.label || t.cat || ''),
    esc(t.sub || ''),
    t.confidence === 'high' || t.corrected ? 'haute' : 'basse',
    t.corrected ? 'oui' : 'non',
  ].join(';'))

  const bom = '﻿'
  const csv = bom + [header.join(';'), ...rows].join('\n')

  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename)
}

// ─── Export JSON ───────────────────────────────────────────────────────────────
/**
 * Déclenche le téléchargement d'un objet JavaScript sérialisé en JSON.
 * Utilisé pour la sauvegarde complète de l'état de l'application.
 *
 * @param {*}      data     – Données à sérialiser (sera passé à JSON.stringify)
 * @param {string} filename – Nom du fichier téléchargé
 */
export function downloadJSON(data, filename) {
  triggerDownload(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' }),
    filename
  )
}

/**
 * Crée un lien temporaire et simule un clic pour déclencher un téléchargement navigateur.
 * L'URL de l'objet est immédiatement révoquée pour libérer la mémoire.
 *
 * @param {Blob}   blob     – Contenu binaire à télécharger
 * @param {string} filename – Nom suggéré pour le fichier
 */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Moteur d'analyse locale (sans API) ───────────────────────────────────────
/**
 * Génère une liste d'insights financiers textuels sans appel à une API externe.
 *
 * Analyse le mois sélectionné (ou le dernier mois disponible) et produit jusqu'à
 * 11 types de diagnostics, chacun conditionnel aux données disponibles :
 *
 *  1. Taux d'épargne (PEA + solde net) — vert ≥ 20%, orange ≥ 10%, rouge sinon
 *  2. Objectif épargne mensuel du profil
 *  3. Évolution des dépenses vs mois précédent (seuil ±15%)
 *  4. Poste de dépense dominant (si ≥ 35% du total, hors logement)
 *  5. Total des charges fixes récurrentes (seuil 50% du revenu déclaré)
 *  6. Transactions à clarifier (confidence='low', non corrigées)
 *  7. Dépenses exceptionnelles (> 200€ hors catégories incompressibles)
 *  8. Restaurants & sorties (si ≥ 3 transactions ce mois)
 *  9. Mois sans revenu (message adapté selon le type fixe/variable)
 * 10. Bon mois de revenus (revenu variable uniquement, si > 115% du déclaré)
 * 11. Situation saine (affiché uniquement si aucune alerte warn/danger)
 *
 * @param {Array}   transactions  – Toutes les transactions (non filtrées par mois)
 * @param {Object}  profile       – Profil utilisateur { revenu, epargne, type_revenu }
 * @param {string}  selectedMonth – Mois ciblé 'YYYY-MM' (défaut : dernier disponible)
 * @returns {Array<{ type: string, icon: string, title: string, body: string }>}
 */
export function analyseLocale(transactions, profile, selectedMonth = null) {
  if (!transactions.length) return []

  const months    = [...new Set(transactions.map(t => t.dateOpe.slice(0, 7)))].sort()
  const lastM     = selectedMonth || months[months.length - 1]
  const lastMIdx  = months.indexOf(lastM)
  const prevM     = lastMIdx > 0 ? months[lastMIdx - 1] : null
  const allStats  = computeStats(transactions)
  const lmTxs     = transactions.filter(t => t.dateOpe.startsWith(lastM))
  const lmStats   = computeStats(lmTxs)
  const prevStats = prevM ? computeStats(transactions.filter(t => t.dateOpe.startsWith(prevM))) : null
  const insights  = []

  const revenuCible = profile?.revenu ? parseFloat(profile.revenu) : null
  const epargne     = profile?.epargne ? parseFloat(profile.epargne) : null
  const typeRevenu  = profile?.type_revenu || 'variable'

  // 1. Taux d'épargne du mois ──────────────────────────────────────────────────
  const netLm         = lmStats.totalRev - lmStats.totalDep
  const epargneTotale = (lmStats.epargneInvestie || 0) + Math.max(0, netLm)
  const tauxEp        = lmStats.totalRev > 0 ? (epargneTotale / lmStats.totalRev) * 100 : 0

  if (lmStats.totalRev > 0) {
    if (tauxEp >= 20) {
      insights.push({ type: 'success', icon: '🎯', title: 'Excellent taux d\'épargne', body: `Tu as épargné ${Math.round(tauxEp)}% de tes revenus en ${fmtMonth(lastM)} (PEA + solde net) — au-dessus du seuil recommandé de 20%.` })
    } else if (tauxEp >= 10) {
      const manque = lmStats.totalRev * 0.2 - epargneTotale
      insights.push({ type: 'warn', icon: '💡', title: 'Taux d\'épargne correct', body: `${Math.round(tauxEp)}% d'épargne en ${fmtMonth(lastM)}. Pour atteindre 20%, il faudrait ${fmt(manque)} de plus ce mois.` })
    } else if (netLm < 0) {
      insights.push({ type: 'danger', icon: '⚠️', title: 'Mois déficitaire', body: `Tes dépenses dépassent tes revenus de ${fmt(Math.abs(netLm))} en ${fmtMonth(lastM)}. Regarde les catégories en cause dans Analyse.` })
    } else {
      insights.push({ type: 'warn', icon: '⚠️', title: 'Taux d\'épargne faible', body: `Seulement ${Math.round(tauxEp)}% d'épargne en ${fmtMonth(lastM)}. Vise au moins 10% — il manque ${fmt(lmStats.totalRev * 0.1 - epargneTotale)}.` })
    }
  }

  // 2. Objectif épargne mensuel ─────────────────────────────────────────────────
  if (epargne && netLm < epargne && lmStats.totalRev > 0) {
    const manque = epargne - netLm
    insights.push({ type: 'warn', icon: '🎯', title: 'Objectif épargne non atteint', body: `Il te manque ${fmt(manque)} pour atteindre ton objectif de ${fmt(epargne)}/mois en ${fmtMonth(lastM)}.` })
  } else if (epargne && netLm >= epargne) {
    insights.push({ type: 'success', icon: '✅', title: 'Objectif épargne atteint', body: `Tu as dépassé ton objectif de ${fmt(epargne)}/mois en ${fmtMonth(lastM)} — bravo !` })
  }

  // 3. Évolution vs mois précédent ──────────────────────────────────────────────
  if (prevStats && prevStats.totalDep > 0) {
    const diffDep = lmStats.totalDep - prevStats.totalDep
    const pctDep  = Math.round(diffDep / prevStats.totalDep * 100)
    if (pctDep >= 15) {
      insights.push({ type: 'danger', icon: '📈', title: `Dépenses en hausse de ${pctDep}%`, body: `Tes dépenses de conso ont augmenté de ${fmt(diffDep)} par rapport à ${fmtMonth(prevM)}. Vérifie les catégories en cause.` })
    } else if (pctDep <= -10) {
      insights.push({ type: 'success', icon: '📉', title: `Dépenses en baisse de ${Math.abs(pctDep)}%`, body: `Tu as dépensé ${fmt(Math.abs(diffDep))} de moins qu'en ${fmtMonth(prevM)} — bonne maîtrise du budget !` })
    }
  }

  // 4. Poste de dépense dominant ─────────────────────────────────────────────────
  const depConsoLm = lmStats.totalDep
  const topCat     = Object.entries(lmStats.parCat)
    .filter(([cat]) => cat !== 'non_categorise' && cat !== 'virement_interne')
    .sort((a, b) => b[1] - a[1])[0]
  if (topCat && depConsoLm > 0) {
    const [cat, val] = topCat
    const pct = Math.round(val / depConsoLm * 100)
    if (pct >= 35 && cat !== 'logement') {
      insights.push({ type: 'warn', icon: CATEGORIES[cat]?.icon || '📊', title: `${CATEGORIES[cat]?.label} : ${pct}% du budget`, body: `La catégorie ${CATEGORIES[cat]?.label} représente ${fmt(val)} — soit ${pct}% de tes dépenses ce mois-ci.` })
    }
  }

  // 5. Charges fixes récurrentes ────────────────────────────────────────────────
  const aboRaw  = allStats.recurrentes.filter(r => ABO_CATS.has(r.cat) && r.count >= 2 && r.sub !== 'Épargne & investissement').sort((a, b) => b.montantMoyen - a.montantMoyen)
  const seenAbo = []
  const abos    = aboRaw.filter(r => {
    const dup = seenAbo.find(s => s.cat === r.cat && Math.abs(s.montantMoyen - r.montantMoyen) <= 1)
    if (dup) return false
    seenAbo.push(r); return true
  })
  const totalAbo = abos.reduce((s, r) => s + r.montantMoyen, 0)
  if (revenuCible && totalAbo > revenuCible * 0.5) {
    insights.push({ type: 'danger', icon: '🔒', title: 'Charges fixes élevées', body: `Tes charges récurrentes représentent ${fmt(totalAbo)}/mois — soit ${Math.round(totalAbo / revenuCible * 100)}% de ton revenu déclaré. C'est au-dessus du seuil recommandé de 50%.` })
  } else if (totalAbo > 0) {
    insights.push({ type: 'info', icon: '📋', title: 'Charges fixes détectées', body: `${abos.length} charges récurrentes détectées pour un total de ${fmt(totalAbo)}/mois (${fmt(totalAbo * 12)}/an).` })
  }

  // 6. Transactions à clarifier ────────────────────────────────────────────────
  const aClarifier = transactions.filter(t => t.confidence === 'low' && !t.corrected && !t.isCredit)
  if (aClarifier.length > 0) {
    const montantTotal = aClarifier.reduce((s, t) => s + Math.abs(t.montant), 0)
    insights.push({ type: 'warn', icon: '❓', title: `${aClarifier.length} transactions à clarifier`, body: `${fmt(montantTotal)} de dépenses restent non catégorisées. Corrige-les depuis l'onglet Transactions pour des stats précises.` })
  }

  // 7. Dépenses exceptionnelles ────────────────────────────────────────────────
  const except = lmStats.exceptionnelles
  if (except.length > 0) {
    const total = except.reduce((s, t) => s + Math.abs(t.montant), 0)
    insights.push({ type: 'warn', icon: '🔴', title: `${except.length} dépense${except.length > 1 ? 's' : ''} exceptionnelle${except.length > 1 ? 's' : ''}`, body: `${except.map(t => t.libelle).join(', ')} · total ${fmt(total)} en ${fmtMonth(lastM)}.` })
  }

  // 8. Restaurants & sorties ───────────────────────────────────────────────────
  const restoLm = lmTxs.filter(t => t.sub === 'Restaurant & café' || t.sub === 'Sorties entre amis' || t.sub === 'Sorties & événements')
  if (restoLm.length >= 3) {
    const total = restoLm.reduce((s, t) => s + Math.abs(t.montant), 0)
    insights.push({ type: 'info', icon: '🍽️', title: `${restoLm.length} sorties ce mois`, body: `Restaurants, cafés et sorties : ${fmt(total)} répartis sur ${restoLm.length} transactions en ${fmtMonth(lastM)}.` })
  }

  // 9. Mois sans revenu ────────────────────────────────────────────────────────
  if (lmStats.totalRev === 0 && lmTxs.length > 0) {
    const currentYM  = new Date().toISOString().slice(0, 7)
    const isRecent   = lastM >= currentYM
    const isVariable = typeRevenu === 'variable'
    insights.push({
      type: isRecent ? 'warn' : (isVariable ? 'warn' : 'danger'),
      icon: isRecent ? '💡' : '💸',
      title: isRecent
        ? (isVariable ? 'Virement pas encore reçu ?' : 'Salaire pas encore reçu ?')
        : (isVariable ? 'Mois sans virement entrant' : 'Aucun revenu détecté'),
      body: isRecent
        ? `Aucun virement entrant détecté en ${fmtMonth(lastM)}. Le mois est peut-être incomplet ou le virement n'a pas encore été reçu.`
        : isVariable
          ? `Aucun virement entrant en ${fmtMonth(lastM)}. Pour un revenu variable, les mois creux sont normaux.`
          : `Aucun virement entrant détecté en ${fmtMonth(lastM)}. Si ton salaire a été versé, il n'a peut-être pas été reconnu automatiquement.`
    })
  }

  // 10. Bon mois de revenus (variable uniquement) ──────────────────────────────
  if (typeRevenu === 'variable' && revenuCible && lmStats.totalRev > revenuCible * 1.15 && lmStats.totalRev > 0) {
    const surplus = lmStats.totalRev - revenuCible
    insights.push({ type: 'info', icon: '📈', title: 'Bon mois de revenus', body: `Tes revenus de ${fmtMonth(lastM)} (${fmt(lmStats.totalRev)}) dépassent ta moyenne déclarée de ${fmt(surplus)}. C'est l'occasion d'épargner davantage.` })
  }

  // 11. Situation saine (affiché uniquement s'il n'y a aucune alerte) ──────────
  if (insights.filter(i => i.type === 'danger' || i.type === 'warn').length === 0 && transactions.length > 5) {
    insights.push({ type: 'success', icon: '🌟', title: 'Situation financière saine', body: `Tes finances sont bien gérées. Continue sur cette lancée et augmente progressivement ton taux d'épargne.` })
  }

  return insights
}
