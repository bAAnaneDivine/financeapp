import { describe, it, expect } from 'vitest'
import { analyseLocale } from './helpers.js'
import { computeIsExceptionnel } from './utils/parser.js'

// ─── IE3 — Tests analyseLocale ────────────────────────────────────────────────

const PROFILE = { revenu: 2500, epargne: 300, type_revenu: 'variable' }

// Fabrique une transaction minimale avec isExceptionnel correct
function tx(dateOpe, montant, isCredit, cat = 'alimentation', sub = 'Courses supermarché') {
  return {
    id: Math.random().toString(36),
    dateOpe, montant, isCredit, cat, sub,
    libelle: 'Test', libelleRaw: 'Test',
    confidence: 'high', corrected: false,
    banque: 'Crédit Agricole', devise: 'EUR', compteId: 'default',
    isExceptionnel: !isCredit && computeIsExceptionnel(Math.abs(montant), cat, sub),
  }
}

const MONTH = '2025-01'
const PREV  = '2024-12'

describe('analyseLocale — 0 transaction', () => {
  it('retourne un tableau vide si aucune transaction', () => {
    expect(analyseLocale([], PROFILE, MONTH)).toEqual([])
  })
})

describe('analyseLocale — taux d\'épargne', () => {
  it('taux épargne ≥ 20% → insight success "Excellent"', () => {
    const txs = [
      tx(`${MONTH}-01`, 3000, true, 'revenus', 'Salaire'),  // revenu
      tx(`${MONTH}-15`, -500, false),                        // dépense
    ]
    const insights = analyseLocale(txs, PROFILE, MONTH)
    const ep = insights.find(i => i.type === 'success' && i.title.includes('pargne'))
    expect(ep).toBeDefined()
  })

  it('taux épargne entre 10% et 20% → insight warn', () => {
    const txs = [
      tx(`${MONTH}-01`, 2500, true, 'revenus', 'Salaire'),
      tx(`${MONTH}-15`, -2100, false),
    ]
    const insights = analyseLocale(txs, PROFILE, MONTH)
    const ep = insights.find(i => i.type === 'warn' && i.title.includes('pargne'))
    expect(ep).toBeDefined()
  })

  it('mois déficitaire (dépenses > revenus) → insight danger', () => {
    const txs = [
      tx(`${MONTH}-01`, 1000, true, 'revenus', 'Salaire'),
      tx(`${MONTH}-15`, -1500, false),
    ]
    const insights = analyseLocale(txs, PROFILE, MONTH)
    const def = insights.find(i => i.type === 'danger')
    expect(def).toBeDefined()
  })
})

describe('analyseLocale — objectif épargne', () => {
  it('objectif épargne atteint → insight success', () => {
    const txs = [
      tx(`${MONTH}-01`, 2500, true, 'revenus', 'Salaire'),
      tx(`${MONTH}-15`, -1000, false),
    ]
    const insights = analyseLocale(txs, PROFILE, MONTH)
    const ok = insights.find(i => i.type === 'success' && i.title.includes('Objectif'))
    expect(ok).toBeDefined()
  })

  it('objectif épargne non atteint → insight warn', () => {
    const txs = [
      tx(`${MONTH}-01`, 2500, true, 'revenus', 'Salaire'),
      tx(`${MONTH}-15`, -2400, false),
    ]
    const insights = analyseLocale(txs, PROFILE, MONTH)
    const nok = insights.find(i => i.type === 'warn' && i.title.includes('Objectif'))
    expect(nok).toBeDefined()
  })
})

describe('analyseLocale — bon mois de revenus (variable)', () => {
  it('revenus > 115% du déclaré → insight info bon mois', () => {
    const txs = [
      tx(`${MONTH}-01`, 3000, true, 'revenus', 'Salaire'), // > 2500 * 1.15
      tx(`${MONTH}-15`, -500, false),
    ]
    const insights = analyseLocale(txs, { ...PROFILE, type_revenu: 'variable' }, MONTH)
    const bon = insights.find(i => i.type === 'info' && i.title.includes('Bon mois'))
    expect(bon).toBeDefined()
  })
})

describe('analyseLocale — situation saine', () => {
  it('aucune alerte → insight "Situation financière saine"', () => {
    // Dépenses réparties sur plusieurs catégories pour éviter le warn "poste dominant" (> 35%)
    const txs = Array.from({ length: 6 }, (_, i) => ([
      tx(`202${i}-01-01`, 2500, true,  'revenus',      'Salaire'),
      tx(`202${i}-01-10`, -300, false, 'logement',     'Loyer'),
      tx(`202${i}-01-15`, -200, false, 'alimentation', 'Courses supermarché'),
      tx(`202${i}-01-20`, -100, false, 'transport',    'Transports en commun'),
      tx(`202${i}-01-25`, -50,  false, 'abonnements',  'Streaming vidéo'),
    ])).flat()
    const insights = analyseLocale(txs, PROFILE)
    const sain = insights.find(i => i.title.toLowerCase().includes('saine'))
    expect(sain).toBeDefined()
    expect(sain.type).toBe('success')
  })
})
