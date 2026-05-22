import { describe, it, expect } from 'vitest'
import { parseCA } from './ca.js'
import { cleanLibelle, categorize, makeId } from '../parser.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtMontant(n) {
  // Format français avec séparateur milliers espace : 1877 → "1 877,00"
  return n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function makeLine(date, libelle, montant, isCredit = false) {
  return `${date} ${date} ${libelle} §${fmtMontant(montant)}${isCredit ? '¤' : ''}`
}

function makeReleve(lines, year = 2026, compte = '96432749131') {
  return [
    `Compte Chèque n° ${compte}`,
    `Date d'arrêté : 17 janvier ${year}`,
    'Ancien solde créditeur au 17/12/2025 1 200,00',
    ...lines,
    'Total des opérations',
  ].join('\n')
}

// ─── Tests parseCA ────────────────────────────────────────────────────────────
describe('parseCA', () => {
  it('parse une transaction débit simple', () => {
    const text = makeReleve([makeLine('15.01', 'E.Leclerc', 45.20)])
    const { transactions } = parseCA(text)
    expect(transactions).toHaveLength(1)
    expect(transactions[0].montant).toBe(-45.20)
    expect(transactions[0].isCredit).toBe(false)
    expect(transactions[0].dateOpe).toBe('2026-01-15')
  })

  it('parse une transaction crédit', () => {
    const text = makeReleve([makeLine('01.01', 'Virement entrant', 1877, true)])
    const { transactions } = parseCA(text)
    expect(transactions[0].montant).toBe(1877)
    expect(transactions[0].isCredit).toBe(true)
  })

  it('retourne le numéro de compte', () => {
    const text = makeReleve([makeLine('15.01', 'E.Leclerc', 45.20)])
    const { compte } = parseCA(text)
    expect(compte).toBe('96432749131')
  })

  it('extrait l\'année depuis l\'en-tête', () => {
    const text = makeReleve([makeLine('15.01', 'E.Leclerc', 45.20)], 2025)
    const { year } = parseCA(text)
    expect(year).toBe(2025)
  })

  it('ajoute compteId: default sur chaque transaction', () => {
    const text = makeReleve([makeLine('15.01', 'Netflix', 13.99)])
    const { transactions } = parseCA(text)
    expect(transactions[0].compteId).toBe('default')
  })

  it('ajoute devise: EUR sur chaque transaction', () => {
    const text = makeReleve([makeLine('15.01', 'Netflix', 13.99)])
    const { transactions } = parseCA(text)
    expect(transactions[0].devise).toBe('EUR')
  })

  it('détecte le virement interne via userFullName', () => {
    const text = makeReleve([makeLine('15.01', 'Vir Marie Dupont compte epargne', 500, true)])
    const { transactions } = parseCA(text, [], 'Marie Dupont')
    expect(transactions[0].cat).toBe('virement_interne')
  })

  it('ne détecte pas virement interne si userFullName vide', () => {
    const text = makeReleve([makeLine('15.01', 'Vir Marie Dupont compte epargne', 500, true)])
    const { transactions } = parseCA(text, [], '')
    expect(transactions[0].cat).toBe('revenus')
  })

  it('applique les customRules', () => {
    const text = makeReleve([makeLine('15.01', 'Hergibo Loyer', 650)])
    const rules = [{ id: 'r1', pattern: 'hergibo', isRegex: false, actif: true, cat: 'logement', sub: 'Loyer' }]
    const { transactions } = parseCA(text, rules)
    expect(transactions[0].cat).toBe('logement')
    expect(transactions[0].sub).toBe('Loyer')
  })

  it('ignore les customRules désactivées (actif: false)', () => {
    // Libellé sans mot "loyer" pour éviter la règle statique /\bloyer\b/
    const text = makeReleve([makeLine('15.01', 'Hergibo cabinet ABC', 650)])
    const rules = [{ id: 'r1', pattern: 'hergibo', isRegex: false, actif: false, cat: 'logement', sub: 'Loyer' }]
    const { transactions } = parseCA(text, rules)
    expect(transactions[0].cat).not.toBe('logement')
  })

  it('corrige les dates dans le futur (relevé sur deux années)', () => {
    const futureYear = new Date().getFullYear() + 1
    const text = makeReleve([makeLine('15.12', 'E.Leclerc', 45.20)], futureYear)
    const { transactions } = parseCA(text)
    const txYear = parseInt(transactions[0].dateOpe.slice(0, 4))
    expect(txYear).toBeLessThanOrEqual(new Date().getFullYear())
  })

  it('retourne un tableau vide si aucune transaction', () => {
    const text = makeReleve([])
    const { transactions } = parseCA(text)
    expect(transactions).toHaveLength(0)
  })

  it('trie les transactions par date croissante', () => {
    const text = makeReleve([
      makeLine('20.01', 'Netflix', 13.99),
      makeLine('05.01', 'E.Leclerc', 45.20),
    ])
    const { transactions } = parseCA(text)
    expect(transactions[0].dateOpe).toBe('2026-01-05')
    expect(transactions[1].dateOpe).toBe('2026-01-20')
  })
})

// ─── Tests cleanLibelle ───────────────────────────────────────────────────────
describe('cleanLibelle', () => {
  it('supprime le préfixe CARTE X', () => {
    expect(cleanLibelle('Carte x1234 E.Leclerc')).toBe('E.Leclerc')
  })

  it('normalise E.Leclerc', () => {
    expect(cleanLibelle('E. Leclerc')).toBe('E.Leclerc')
    expect(cleanLibelle('E.leclere')).toBe('E.Leclerc')
  })

  it('est idempotent', () => {
    const raw = 'Prlv Bouygues Telecom'
    expect(cleanLibelle(cleanLibelle(raw))).toBe(cleanLibelle(raw))
  })

  it('capitalise la première lettre', () => {
    expect(cleanLibelle('carrefour market')[0]).toBe('C')
  })
})

// ─── Tests makeId ─────────────────────────────────────────────────────────────
describe('makeId', () => {
  it('retourne un string non vide', () => {
    expect(typeof makeId('2026-01-15', 'E.Leclerc', '45.2')).toBe('string')
    expect(makeId('2026-01-15', 'E.Leclerc', '45.2').length).toBeGreaterThan(0)
  })

  it('est déterministe', () => {
    const id1 = makeId('2026-01-15', 'E.Leclerc', '45.2')
    const id2 = makeId('2026-01-15', 'E.Leclerc', '45.2')
    expect(id1).toBe(id2)
  })

  it('varie si date différente', () => {
    expect(makeId('2026-01-15', 'E.Leclerc', '45.2')).not.toBe(makeId('2026-01-16', 'E.Leclerc', '45.2'))
  })
})

// ─── Tests categorize ─────────────────────────────────────────────────────────
describe('categorize', () => {
  it('catégorise Netflix en streaming vidéo', () => {
    const { cat, sub } = categorize('Netflix', false)
    expect(cat).toBe('abonnements')
    expect(sub).toBe('Streaming vidéo')
  })

  it('détecte PayPal comme non catégorisé', () => {
    const { cat, sub } = categorize('PayPal Europe S.a.r.l.', false)
    expect(cat).toBe('non_categorise')
    expect(sub).toBe('PayPal opaque')
  })

  it('catégorise un crédit comme revenu', () => {
    const { cat } = categorize('Virement salaire', true)
    expect(cat).toBe('revenus')
  })

  it('respecte isRegex: true dans customRules', () => {
    const rules = [{ id: 'r1', pattern: 'her\\w+', isRegex: true, actif: true, cat: 'logement', sub: 'Loyer' }]
    const { cat } = categorize('Hergibo loyer', false, rules)
    expect(cat).toBe('logement')
  })
})
