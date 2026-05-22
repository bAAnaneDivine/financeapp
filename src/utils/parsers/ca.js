/**
 * @file ca.js
 * @description Parseur de relevés de compte courant Crédit Agricole (format PDF propriétaire).
 *
 * Le format CA utilise des marqueurs propriétaires (§ pour les montants, ¤ pour les crédits)
 * produits par extractPdfText via une analyse des colonnes X dans le PDF.
 * Ce parseur est spécifique au CA et ne fonctionnera pas pour d'autres banques.
 *
 * Pour les autres banques : utiliser parsers/gemini.js (IA universelle) ou
 * parsers/csv.js (import CSV/XLSX avec détection auto ou mapping manuel).
 */

import { categorize, cleanLibelle, makeId, computeIsExceptionnel } from '../parser.js'

/**
 * Parse un relevé de compte courant Crédit Agricole (texte extrait via extractPdfText).
 *
 * Interface parseur :
 *   Entrée  : text (string) + customRules (array) + userFullName (string)
 *   Sortie  : { transactions[], soldeInitial, compte, banque, devise, year }
 *
 * @param {string} text         – Texte brut formaté par extractPdfText()
 * @param {Array}  customRules  – Règles personnalisées transmises à categorize()
 * @param {string} userFullName – Nom complet de l'utilisateur (détection virements internes)
 * @returns {{ transactions, soldeInitial, compte, banque, devise, year }}
 */
export function parseCA(text, customRules = [], userFullName = '') {
  // Extraction de l'année — plusieurs formats CA possibles
  const yearPatterns = [
    /Date d.arrêté\s*:?\s*\d{1,2}\s+\w+\s+(\d{4})/i,
    /Date d.arrêté\s*:?\s*\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4})/i,
    /arrêté\s+au\s+\d{1,2}\s+\w+\s+(\d{4})/i,
    /relevé\s+du\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-](\d{4})/i,
  ]
  let year = null
  for (const pat of yearPatterns) {
    const m = text.match(pat)
    if (m) { year = parseInt(m[1]); break }
  }
  if (!year) year = new Date().getFullYear()

  const compteM = text.match(/Compte Chèque n°\s*(\d+)/i)
  const compte  = compteM ? compteM[1] : '?'

  const soldeM = text.match(/Ancien solde créditeur au[\s\S]*?([\d\s]+,\d{2})/i)
  const soldeInitial = soldeM
    ? parseFloat(soldeM[1].replace(/\s/g, '').replace(',', '.'))
    : null

  const start   = text.indexOf('Ancien solde')
  const end     = text.indexOf('Total des opérations')
  const section = (start > -1 && end > -1) ? text.slice(start, end) : text

  const lines = section.split(/\n+/).map(l => l.trim()).filter(Boolean)
  const transactions = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const dm   = line.match(/^(\d{2}\.\d{2})\s+(\d{2}\.\d{2})\s+(.+)$/)
    if (!dm) { i++; continue }

    let parts = [dm[3]]
    let j = i + 1
    while (j < lines.length) {
      const next = lines[j]
      if (/^\d{2}\.\d{2}\s+\d{2}\.\d{2}/.test(next)) break
      if (/^(Total|Nouveau solde|Page|CA Anjou|Conditions|Vos inf)/i.test(next)) break
      parts.push(next)
      j++
    }

    let montantM = null, isCredit_col = false, amountIdx = -1
    for (let k = parts.length - 1; k >= 0; k--) {
      const pClean = parts[k].replace(/¤/g, '')
      const m = pClean.match(/§(\d{1,3}(?:\s\d{3})*,\d{2})\s*$/)
      if (m) { montantM = m; isCredit_col = /¤/.test(parts[k]); amountIdx = k; break }
    }
    if (!montantM) { i = j; continue }

    const montant = parseFloat(montantM[1].replace(/\s/g, '').replace(',', '.'))
    if (isNaN(montant) || montant <= 0) { i = j; continue }

    const libelleRaw = parts.map((p, k) => {
      const c = p.replace(/¤/g, '')
      return k === amountIdx ? c.slice(0, c.lastIndexOf(montantM[0])).trim() : c
    }).filter(Boolean).join(' ')

    const isCredit = isCredit_col
    const libelle  = cleanLibelle(libelleRaw)
    const catRes   = categorize(libelleRaw, isCredit, customRules, userFullName)

    const [d, m] = dm[1].split('.')
    const dateOpe = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    const id      = makeId(dateOpe, libelleRaw, String(montant))

    transactions.push({
      id, dateOpe, libelleRaw, libelle,
      montant: isCredit ? montant : -montant,
      isCredit,
      isExceptionnel: computeIsExceptionnel(montant, catRes.cat, catRes.sub),
      ...catRes,
      compte,
      banque: 'Crédit Agricole',
      devise: 'EUR',
      compteId: 'default',
      corrected: false,
    })

    i = j
  }

  // Sanity check : correction des dates tombant dans le futur (relevés sur deux années)
  const today = new Date()
  transactions.forEach(t => {
    if (new Date(t.dateOpe) > today) {
      const correctedYear = parseInt(t.dateOpe.slice(0, 4)) - 1
      t.dateOpe = `${correctedYear}-${t.dateOpe.slice(5)}`
      t.id = makeId(t.dateOpe, t.libelleRaw, String(Math.abs(t.montant)))
    }
  })

  return {
    transactions: transactions.sort((a, b) => new Date(a.dateOpe) - new Date(b.dateOpe)),
    soldeInitial,
    compte,
    banque: 'Crédit Agricole',
    devise: 'EUR',
    year,
  }
}
