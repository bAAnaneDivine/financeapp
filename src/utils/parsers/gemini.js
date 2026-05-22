import { categorize, cleanLibelle, makeId, computeIsExceptionnel } from '../parser.js'
import { extractGenericPdfText } from './pdf-extract.js'
import { readFileText, xlsxToText } from './csv.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

// Limite de texte envoyé à Gemini (~50k chars ≈ 12k tokens, largement suffisant pour un relevé)
const MAX_TEXT_CHARS = 50_000

const PROMPT = `Tu es un parseur de relevé bancaire. Extrais TOUTES les transactions du texte ci-dessous.

Retourne UNIQUEMENT un tableau JSON valide, sans autre texte ni bloc markdown :
[{"date":"YYYY-MM-DD","label":"description lisible","amount":-45.20,"confidence":"high"}]

Règles strictes :
- amount : négatif pour débit/dépense, positif pour crédit/revenu
- date : format YYYY-MM-DD obligatoire
- label : texte propre et lisible (supprimer codes techniques, références SEPA, identifiants)
- confidence : "high" si clair, "medium" si ambigu, "low" si très incertain
- Inclure TOUTES les transactions, même incertaines
- Ne PAS inclure les soldes (solde initial, solde final, solde nouveau)
- Si une ligne est clairement un en-tête ou un total, l'ignorer

Relevé bancaire :
`

// ─── Extraction texte générique ───────────────────────────────────────────────
/**
 * Extrait le contenu textuel d'un fichier selon son extension.
 * Route vers l'extracteur approprié sans appliquer de mise en forme bancaire.
 *
 * @param {File} file – Fichier PDF, XLSX ou CSV déposé par l'utilisateur
 * @returns {Promise<string>} Texte brut lisible par le LLM
 */
export async function extractFileText(file) {
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext === 'pdf')               return extractGenericPdfText(file)
  if (ext === 'xlsx' || ext === 'xls') return xlsxToText(file)
  return readFileText(file)
}

// ─── Appel API Gemini ─────────────────────────────────────────────────────────
/**
 * Envoie le texte à Gemini Flash et retourne le tableau JSON brut.
 * @param {string} text
 * @param {string} apiKey
 * @returns {Promise<Array>}
 */
export async function callGemini(text, apiKey) {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), 30_000)

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT + text.slice(0, MAX_TEXT_CHARS) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) throw Object.assign(
        new Error('Quota Gemini dépassé — réessaie demain (1 500 req/jour gratuit)'),
        { code: 'GEMINI_QUOTA' }
      )
      if (res.status === 400 || res.status === 403) throw Object.assign(
        new Error('Clé API invalide ou expirée — vérifie dans ⚙️ Paramètres'),
        { code: 'GEMINI_AUTH' }
      )
      throw Object.assign(
        new Error(`Erreur Gemini ${res.status} : ${data.error?.message || res.statusText}`),
        { code: 'GEMINI_ERROR' }
      )
    }

    const data    = await res.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Extraire le JSON (Gemini peut envelopper dans des fences markdown)
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw Object.assign(
      new Error('Réponse Gemini invalide — aucun JSON trouvé. Réessaie ou simplifie le fichier.'),
      { code: 'GEMINI_PARSE' }
    )

    try {
      return JSON.parse(jsonMatch[0])
    } catch {
      throw Object.assign(
        new Error('Réponse Gemini invalide — JSON malformé'),
        { code: 'GEMINI_PARSE' }
      )
    }
  } catch (e) {
    if (e.name === 'AbortError') throw Object.assign(
      new Error('Timeout — Gemini n\'a pas répondu en 30 secondes'),
      { code: 'GEMINI_TIMEOUT' }
    )
    throw e
  } finally {
    clearTimeout(timeoutId)
  }
}

// ─── Parseur principal Gemini ─────────────────────────────────────────────────
/**
 * Parse n'importe quel fichier bancaire via Gemini Flash.
 *
 * Interface parseur :
 *   Entrée  : file (File) + apiKey (string) + userConfig ({ nom, devise }) + customRules
 *   Sortie  : { transactions[], soldeInitial, compte, banque, devise, parserUsed, anomalies[] }
 *
 * anomalies : liste de { id, flags[] } pour l'écran de validation utilisateur.
 *
 * @param {File}   file
 * @param {string} apiKey
 * @param {Object} userConfig
 * @param {Array}  customRules
 */
export async function parseWithGemini(file, apiKey, userConfig = {}, customRules = []) {
  const text = await extractFileText(file)
  const raw  = await callGemini(text, apiKey)

  const devise      = userConfig.devise || 'EUR'
  const transactions = []
  const anomalies    = []

  for (const t of raw) {
    if (!t.date || !t.label || t.amount == null) continue

    const montant = parseFloat(t.amount)
    if (isNaN(montant) || !isFinite(montant)) continue

    const isCredit   = montant > 0
    const libelleRaw = String(t.label).trim()
    if (!libelleRaw) continue

    const libelle = cleanLibelle(libelleRaw)
    const catRes  = categorize(libelleRaw, isCredit, customRules, userConfig.nom || '')
    const id      = makeId(t.date, libelleRaw, String(montant))

    const tx = {
      id, dateOpe: t.date, libelleRaw, libelle, montant, isCredit,
      isExceptionnel: computeIsExceptionnel(Math.abs(montant), catRes.cat, catRes.sub),
      ...catRes,
      // Garde la confiance IA si elle est plus basse que la confiance de catégorisation
      confidence: t.confidence === 'low' ? 'low' : catRes.confidence,
      compte: null, banque: 'Import IA (Gemini)', devise,
      compteId: 'default', corrected: false,
    }

    // Détecter les anomalies pour l'écran de validation
    const flags = []
    if (montant === 0)                      flags.push('Montant à zéro')
    if (new Date(t.date) > new Date())      flags.push('Date dans le futur')
    if (!libelleRaw || libelleRaw.length < 3) flags.push('Libellé trop court')
    if (t.confidence === 'low')             flags.push('Confiance IA faible')
    if (flags.length) anomalies.push({ id, flags })

    transactions.push(tx)
  }

  return {
    transactions: transactions.sort((a, b) => new Date(a.dateOpe) - new Date(b.dateOpe)),
    soldeInitial: null,
    compte:       null,
    banque:       'Import IA (Gemini)',
    devise,
    parserUsed:   'gemini',
    fileType:     file.name.toLowerCase().split('.').pop(),
    anomalies,
  }
}
