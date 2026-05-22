import * as XLSX from 'xlsx'
import { categorize, cleanLibelle, makeId, computeIsExceptionnel } from '../parser.js'

// ─── Lecture fichier avec détection d'encodage ────────────────────────────────
/**
 * Lit un fichier texte en détectant automatiquement son encodage.
 * Gère : UTF-8 (avec ou sans BOM), UTF-16 LE/BE, ISO-8859-1 (Windows-1252).
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function readFileText(file) {
  const buf   = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)

  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
    return new TextDecoder('utf-8').decode(buf)
  if (bytes[0] === 0xFF && bytes[1] === 0xFE)
    return new TextDecoder('utf-16le').decode(buf)
  if (bytes[0] === 0xFE && bytes[1] === 0xFF)
    return new TextDecoder('utf-16be').decode(buf)

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('iso-8859-1').decode(buf)
  }
}

// ─── Conversion XLSX → texte CSV ─────────────────────────────────────────────
export async function xlsxToText(file) {
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_csv(ws, { FS: ';', blankrows: false })
}

// ─── Détection du séparateur ──────────────────────────────────────────────────
export function detectSeparator(firstLine) {
  const counts = {
    ';':  (firstLine.match(/;/g)  || []).length,
    ',':  (firstLine.match(/,/g)  || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0]
}

// ─── Parsing CSV en tableau de lignes ─────────────────────────────────────────
export function parseCsvRows(text, sep) {
  return text
    .split(/\r?\n/)
    .map(line => line.split(sep).map(cell => cell.trim().replace(/^["']|["']$/g, '')))
    .filter(row => row.some(c => c.length > 0))
}

// ─── Parsing d'une date bancaire ──────────────────────────────────────────────
export function parseDate(str) {
  if (!str) return null
  const s = str.trim()
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY ou DD.MM.YYYY ou DD-MM-YYYY
  const m1 = s.match(/^(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
  // MM/DD/YYYY (si jour > 12, on sait que c'est DD/MM — sinon on suppose européen)
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m2) {
    const [, a, b, y] = m2
    if (parseInt(a) > 12) return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
    return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`
  }
  // YYYY/MM/DD
  const m3 = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`
  return null
}

// ─── Parsing d'un montant bancaire ────────────────────────────────────────────
export function parseAmount(str) {
  if (!str || !str.trim()) return null
  const s = str.trim()
    .replace(/[€$££€\s]/g, '')  // symboles monétaires
    .replace(/^[+-]/, m => m)             // garde le signe
  if (!s || s === '-' || s === '+') return null

  // Format FR : 1 234,56 ou 1.234,56
  if (/^-?\d{1,3}(?:[\s.]\d{3})*,\d{1,2}$/.test(s))
    return parseFloat(s.replace(/[\s.]/g, '').replace(',', '.'))
  // Format EN : 1,234.56
  if (/^-?\d{1,3}(?:,\d{3})*\.\d{1,2}$/.test(s))
    return parseFloat(s.replace(/,/g, ''))
  // Virgule seule comme décimal : 1234,56
  if (/^-?\d+,\d{1,2}$/.test(s))
    return parseFloat(s.replace(',', '.'))
  // Nombre simple
  return parseFloat(s) || null
}

// ─── Détection des colonnes ───────────────────────────────────────────────────
/**
 * Tente de reconnaître les colonnes date, libellé, montant, débit, crédit
 * à partir des en-têtes et d'un échantillon de lignes.
 *
 * @returns {{ dateCol, descCol, amtCol, debitCol, creditCol, confidence }}
 *   confidence : 'high' (toutes colonnes trouvées) | 'medium' | 'low'
 */
export function detectColumns(headers, sampleRows) {
  const h = headers.map(s => s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''))  // sans accents

  const find = (...terms) => h.findIndex(col => terms.some(t => col.includes(t)))

  const dateCol   = find('date', 'datum', 'fecha', 'data')
  const descCol   = find('libel', 'description', 'label', 'payee', 'merchant',
                         'beneficiai', 'motif', 'detail', 'objet', 'narrative',
                         'wording', 'transaction')
  const amtCol    = find('amount', 'montant', 'betrag', 'importe', 'valeur', 'sum')
  const debitCol  = find('debit', 'withdrawal', 'ausgabe', 'retrait')
  const creditCol = find('credit', 'deposit', 'einnahme', 'entree')

  // Fallback : inférence par les valeurs si pas d'en-tête explicite
  if (dateCol === -1 || descCol === -1) {
    for (let c = 0; c < headers.length; c++) {
      const vals = sampleRows.map(r => r[c] || '').filter(Boolean)
      if (vals.length === 0) continue
      if (dateCol === -1 && vals.every(v => parseDate(v) !== null))
        return { dateCol: c, descCol, amtCol, debitCol, creditCol, confidence: 'medium' }
    }
  }

  const found = [dateCol, descCol, (amtCol >= 0 || (debitCol >= 0 && creditCol >= 0))]
    .filter(v => v !== -1 && v !== false).length
  const confidence = found >= 3 ? 'high' : found === 2 ? 'medium' : 'low'

  return { dateCol, descCol, amtCol, debitCol, creditCol, confidence }
}

// ─── Parseur CSV/XLSX principal ───────────────────────────────────────────────
/**
 * Parse un fichier CSV ou XLSX vers la sortie normalisée.
 *
 * Interface parseur :
 *   Entrée  : file (File) + userConfig ({ nom, devise }) + customRules (array)
 *   Sortie  : { transactions[], compte, banque, devise, parserUsed, fileType, detected }
 *
 * Le champ `detected` contient le mapping colonnes + échantillon pour l'écran
 * de confirmation utilisateur avant import définitif.
 *
 * @param {File}   file
 * @param {Object} userConfig
 * @param {Array}  customRules
 */
export async function parseCsvFile(file, userConfig = {}, customRules = []) {
  const ext = file.name.toLowerCase().split('.').pop()

  let text
  if (ext === 'xlsx' || ext === 'xls') {
    text = await xlsxToText(file)
  } else {
    text = await readFileText(file)
  }

  // Nettoyer les lignes vides en début de fichier (certaines banques ajoutent des métadonnées)
  const allLines = text.split(/\r?\n/).filter(l => l.trim())
  if (allLines.length < 2) throw Object.assign(
    new Error('Fichier trop court — aucune donnée détectée'),
    { code: 'CSV_EMPTY' }
  )

  const sep = detectSeparator(allLines[0])

  // Chercher la ligne d'en-tête (première ligne avec plusieurs colonnes non-numériques)
  let headerIdx = 0
  for (let i = 0; i < Math.min(5, allLines.length); i++) {
    const cols = allLines[i].split(sep)
    if (cols.length >= 2 && cols.some(c => /[a-zA-Z]/.test(c))) {
      headerIdx = i; break
    }
  }

  const rows = parseCsvRows(allLines.slice(headerIdx).join('\n'), sep)
  if (rows.length < 2) throw Object.assign(
    new Error('Aucune ligne de données détectée après l\'en-tête'),
    { code: 'CSV_NO_DATA' }
  )

  const headers    = rows[0]
  const dataRows   = rows.slice(1).filter(r => r.length >= 2)
  const sampleRows = dataRows.slice(0, 5)
  const detected   = detectColumns(headers, sampleRows)

  if (detected.confidence === 'low') {
    const err    = new Error('Colonnes non reconnues — mapping manuel requis')
    err.code     = 'CSV_LOW_CONFIDENCE'
    err.detected = detected
    err.headers  = headers
    err.sample   = sampleRows
    err.rawText  = allLines.slice(headerIdx).join('\n')
    err.sep      = sep
    throw err
  }

  const transactions = rowsToTransactions(dataRows, detected, userConfig, customRules)

  return {
    transactions: transactions.sort((a, b) => new Date(a.dateOpe) - new Date(b.dateOpe)),
    soldeInitial: null,
    compte: null,
    banque: 'Import CSV',
    devise: userConfig.devise || 'EUR',
    parserUsed: ext === 'xlsx' || ext === 'xls' ? 'xlsx' : 'csv',
    fileType: ext,
    detected: { ...detected, headers, sampleRows, separator: sep },
  }
}

// ─── Helper partagé : lignes → transactions ───────────────────────────────────
/**
 * Convertit des lignes CSV (tableau de tableaux) en transactions normalisées.
 * Fonction interne partagée par parseCsvFile et parseWithMapping.
 *
 * @param {Array}  dataRows   – Lignes de données (sans en-tête), chaque ligne est un tableau de strings
 * @param {Object} mapping    – { dateCol, descCol, amtCol, debitCol, creditCol } (index 0-based, -1 = absent)
 * @param {Object} userConfig – { nom: string, devise: string }
 * @param {Array}  customRules – Règles de catégorisation personnalisées
 * @returns {Array} Transactions normalisées (non triées)
 */
function rowsToTransactions(dataRows, mapping, userConfig, customRules) {
  const { dateCol, descCol, amtCol, debitCol, creditCol } = mapping
  const devise       = userConfig.devise || 'EUR'
  const transactions = []

  for (const row of dataRows) {
    const rawDate = dateCol >= 0 ? row[dateCol] : null
    const dateOpe = rawDate ? parseDate(rawDate) : null
    if (!dateOpe) continue

    const libelleRaw = descCol >= 0 ? (row[descCol] || '').trim() : ''
    if (!libelleRaw) continue

    let montant = null
    if (amtCol >= 0) {
      montant = parseAmount(row[amtCol])
    } else if (debitCol >= 0 || creditCol >= 0) {
      const deb = debitCol >= 0 ? parseAmount(row[debitCol]) : null
      const cre = creditCol >= 0 ? parseAmount(row[creditCol]) : null
      if (cre != null && cre > 0) montant = cre
      else if (deb != null) montant = deb < 0 ? deb : -deb
    }
    if (montant === null || isNaN(montant)) continue

    const isCredit = montant > 0
    const libelle  = cleanLibelle(libelleRaw)
    const catRes   = categorize(libelleRaw, isCredit, customRules, userConfig.nom || '')
    const id       = makeId(dateOpe, libelleRaw, String(montant))

    transactions.push({
      id, dateOpe, libelleRaw, libelle, montant, isCredit,
      isExceptionnel: computeIsExceptionnel(Math.abs(montant), catRes.cat, catRes.sub),
      ...catRes,
      compte: null, banque: 'Import CSV', devise,
      compteId: 'default', corrected: false,
    })
  }
  return transactions
}

// ─── Parseur avec mapping manuel ─────────────────────────────────────────────
/**
 * Parse un texte CSV avec un mapping de colonnes défini manuellement.
 * Utilisé par la Phase 4c (mapping assisté) quand la détection auto échoue.
 *
 * @param {string} text       – Texte CSV brut (après en-tête)
 * @param {string} sep        – Séparateur détecté
 * @param {Object} mapping    – { dateCol, descCol, amtCol, debitCol, creditCol }
 * @param {Object} userConfig
 * @param {Array}  customRules
 */
export function parseWithMapping(text, sep, mapping, userConfig = {}, customRules = []) {
  const rows     = parseCsvRows(text, sep)
  const dataRows = rows.slice(1).filter(r => r.length >= 2)

  const transactions = rowsToTransactions(dataRows, mapping, userConfig, customRules)

  return {
    transactions: transactions.sort((a, b) => new Date(a.dateOpe) - new Date(b.dateOpe)),
    soldeInitial: null,
    compte: null,
    banque: 'Import CSV',
    devise: userConfig.devise || 'EUR',
    parserUsed: 'csv-manual',
    fileType: 'csv',
  }
}
