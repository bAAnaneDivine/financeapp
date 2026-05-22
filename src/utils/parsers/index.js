import { extractPdfText, extractPeaText } from './pdf-extract.js'
import { parseCA } from './ca.js'
import { parsePEA } from './pea.js'
import { parseCsvFile } from './csv.js'

/**
 * Détecte le format d'un fichier et le parse vers la sortie normalisée.
 *
 * Interface unique pour toutes les phases d'import :
 *   Entrée  : file (File) + userConfig ({ nom, devise }) + customRules (array)
 *   Sortie  : { transactions[], soldeInitial, compte, banque, devise, parserUsed, fileType, detected? }
 *
 * Formats supportés :
 *   - PDF  : relevé courant CA (parseCA) ou relevé PEA CA (parsePEA)
 *   - CSV  : détection auto colonnes (parseCsvFile) — lève CSV_LOW_CONFIDENCE si colonnes inconnues
 *   - XLSX : conversion SheetJS → CSV puis parseCsvFile
 *
 * @param {File}   file
 * @param {Object} userConfig  – { nom: string, devise: string }
 * @param {Array}  customRules
 * @returns {Promise<Object>}
 */
export async function detectAndParse(file, userConfig = {}, customRules = []) {
  const ext = file.name.toLowerCase().split('.').pop()

  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
    return parseCsvFile(file, userConfig, customRules)
  }

  if (ext !== 'pdf') {
    const err = new Error(`Format non reconnu : .${ext}`)
    err.code = 'FORMAT_UNKNOWN'
    throw err
  }

  // Tenter PEA en premier (détection rapide via regex signature)
  const peaText = await extractPeaText(file)
  const pea     = parsePEA(peaText)
  if (pea) return { ...pea, fileType: 'pdf', parserUsed: 'pea' }

  // Relevé courant CA
  const caText = await extractPdfText(file)
  const ca     = parseCA(caText, customRules, userConfig.nom || '')
  return { ...ca, fileType: 'pdf', parserUsed: 'ca' }
}

// Re-exports pour usage direct (tests, scripts)
export { parseCA } from './ca.js'
export { parsePEA } from './pea.js'
export { extractPdfText, extractPeaText } from './pdf-extract.js'
