import { describe, it, expect } from 'vitest'
import {
  detectSeparator, parseCsvRows, parseDate, parseAmount,
  detectColumns, readFileText
} from './csv.js'

// ─── detectSeparator ─────────────────────────────────────────────────────────
describe('detectSeparator', () => {
  it('détecte ;', ()  => expect(detectSeparator('Date;Libellé;Montant')).toBe(';'))
  it('détecte ,', ()  => expect(detectSeparator('Date,Description,Amount')).toBe(','))
  it('détecte \\t', () => expect(detectSeparator('Date\tLibellé\tMontant')).toBe('\t'))
  it('préfère ; si ex-aequo avec ,', () => {
    // "1,234;5,678" → ; gagne (1) vs , (2) → , gagne ici
    expect(detectSeparator('a,b,c')).toBe(',')
  })
})

// ─── parseDate ────────────────────────────────────────────────────────────────
describe('parseDate', () => {
  it('parse DD/MM/YYYY', () => expect(parseDate('15/01/2026')).toBe('2026-01-15'))
  it('parse YYYY-MM-DD', () => expect(parseDate('2026-01-15')).toBe('2026-01-15'))
  it('parse DD.MM.YYYY', () => expect(parseDate('15.01.2026')).toBe('2026-01-15'))
  it('parse DD-MM-YYYY', () => expect(parseDate('15-01-2026')).toBe('2026-01-15'))
  it('parse YYYY/MM/DD', () => expect(parseDate('2026/01/15')).toBe('2026-01-15'))
  it('retourne null si invalide', () => expect(parseDate('pas une date')).toBeNull())
  it('retourne null si vide',    () => expect(parseDate('')).toBeNull())
  it('retourne null si null',    () => expect(parseDate(null)).toBeNull())
  it('jour > 12 → DD/MM/YYYY',  () => expect(parseDate('25/01/2026')).toBe('2026-01-25'))
})

// ─── parseAmount ──────────────────────────────────────────────────────────────
describe('parseAmount', () => {
  it('parse format FR virgule',        () => expect(parseAmount('1 234,56')).toBeCloseTo(1234.56))
  it('parse format EN point',          () => expect(parseAmount('1,234.56')).toBeCloseTo(1234.56))
  it('parse montant simple virgule',   () => expect(parseAmount('45,20')).toBeCloseTo(45.20))
  it('parse montant négatif',          () => expect(parseAmount('-45,20')).toBeCloseTo(-45.20))
  it('ignore le symbole €',            () => expect(parseAmount('45,20 €')).toBeCloseTo(45.20))
  it('retourne null si vide',          () => expect(parseAmount('')).toBeNull())
  it('retourne null si non numérique', () => expect(parseAmount('abc')).toBeNull())
  it('parse nombre entier',            () => expect(parseAmount('650')).toBe(650))
})

// ─── parseCsvRows ─────────────────────────────────────────────────────────────
describe('parseCsvRows', () => {
  it('parse CSV simple avec ;', () => {
    const rows = parseCsvRows('Date;Libellé;Montant\n15/01/2026;E.Leclerc;-45,20', ';')
    expect(rows).toHaveLength(2)
    expect(rows[1][1]).toBe('E.Leclerc')
  })

  it('retire les guillemets', () => {
    const rows = parseCsvRows('"Date";"Libellé"\n"15/01";"E.Leclerc"', ';')
    expect(rows[0][0]).toBe('Date')
    expect(rows[1][1]).toBe('E.Leclerc')
  })

  it('filtre les lignes vides', () => {
    const rows = parseCsvRows('a;b\n\n\nc;d', ';')
    expect(rows).toHaveLength(2)
  })
})

// ─── detectColumns ────────────────────────────────────────────────────────────
describe('detectColumns', () => {
  it('détecte colonnes standard FR (date, libellé, montant)', () => {
    const headers = ['Date', 'Libellé', 'Montant']
    const sample  = [['15/01/2026', 'E.Leclerc', '-45,20']]
    const { dateCol, descCol, amtCol, confidence } = detectColumns(headers, sample)
    expect(dateCol).toBe(0)
    expect(descCol).toBe(1)
    expect(amtCol).toBe(2)
    expect(confidence).toBe('high')
  })

  it('détecte colonnes débit/crédit séparés', () => {
    const headers = ['Date', 'Description', 'Debit', 'Credit']
    const sample  = [['15/01/2026', 'Loyer', '650,00', '']]
    const { debitCol, creditCol, confidence } = detectColumns(headers, sample)
    expect(debitCol).toBe(2)
    expect(creditCol).toBe(3)
    expect(confidence).toBe('high')
  })

  it('détecte colonnes EN (date, description, amount)', () => {
    const headers = ['Date', 'Description', 'Amount', 'Currency']
    const sample  = [['2026-01-15', 'Netflix', '-13.99', 'EUR']]
    const { dateCol, descCol, amtCol, confidence } = detectColumns(headers, sample)
    expect(dateCol).toBe(0)
    expect(descCol).toBe(1)
    expect(amtCol).toBe(2)
    expect(confidence).toBe('high')
  })

  it('confidence low si colonnes manquantes', () => {
    const headers = ['Col1', 'Col2']
    const sample  = [['abc', 'def']]
    const { confidence } = detectColumns(headers, sample)
    expect(confidence).toBe('low')
  })
})

// ─── readFileText ─────────────────────────────────────────────────────────────
describe('readFileText', () => {
  const makeFile = (content, type = 'text/csv') => {
    const blob = new Blob([content], { type })
    const ab   = blob.arrayBuffer.bind(blob)  // référence originale avant tout override
    return { name: 'test.csv', arrayBuffer: ab }
  }

  it('lit un fichier UTF-8', async () => {
    const file = makeFile('Date;Libellé\n15/01/2026;E.Leclerc')
    const text = await readFileText(file)
    expect(text).toContain('E.Leclerc')
  })

  it('lit un fichier UTF-8 avec BOM', async () => {
    const bom     = new Uint8Array([0xEF, 0xBB, 0xBF])
    const content = new TextEncoder().encode('Date;Libellé')
    const buf     = new Uint8Array([...bom, ...content])
    const blob    = new Blob([buf])
    const ab      = blob.arrayBuffer.bind(blob)
    const file    = { name: 'test.csv', arrayBuffer: ab }
    const text    = await readFileText(file)
    expect(text).toContain('Date')
  })
})
