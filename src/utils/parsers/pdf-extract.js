import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// ─── Extraction texte relevé courant CA ──────────────────────────────────────
/**
 * Extrait et ré-encode le texte d'un relevé CA depuis un File PDF.
 *
 * pdfjs restitue les éléments dans un ordre non garanti. On les regroupe par
 * ligne (même Y ±4px) puis on trie par X pour reconstruire l'ordre de lecture.
 *
 * Convention de sortie (lue par parseCA) :
 *  - Montants préfixés par '§', suffixés '¤' si crédit (colonne X ≥ 76%)
 *  - Caractères décoratifs CA (¨, □, þ) ignorés
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractPdfText(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  let fullText = ''

  for (let p = 1; p <= pdf.numPages; p++) {
    const page     = await pdf.getPage(p)
    const viewport = page.getViewport({ scale: 1 })
    const W        = viewport.width
    const content  = await page.getTextContent()

    const items = content.items
      .filter(item => item.str.trim())
      .sort((a, b) => b.transform[5] - a.transform[5])

    if (!items.length) continue

    const rows = []
    let row = [items[0]], anchorY = items[0].transform[5]
    for (let k = 1; k < items.length; k++) {
      const y = items[k].transform[5]
      if (anchorY - y > 4) { rows.push(row); row = [items[k]]; anchorY = y }
      else row.push(items[k])
    }
    if (row.length) rows.push(row)

    const creditX    = W * 0.76
    const CA_MARKERS = new Set(['¨', '□', 'þ'])
    const AMT_RE     = /^\d{1,3}(?:\s\d{3})*,\d{2}$/

    for (const r of rows) {
      r.sort((a, b) => a.transform[4] - b.transform[4])

      let amtIdx = -1, isCredit = false
      for (let idx = r.length - 1; idx >= 0; idx--) {
        const x = r[idx].transform[4]
        const s = r[idx].str.trim()
        if (x >= W * 0.6 && AMT_RE.test(s)) {
          amtIdx = idx; isCredit = x >= creditX; break
        }
      }

      let line
      if (amtIdx >= 0) {
        const amtStr = r[amtIdx].str.trim() + (isCredit ? '¤' : '')
        const other  = r.filter((it, i) => i !== amtIdx && !CA_MARKERS.has(it.str.trim())).map(it => it.str.trim()).join(' ')
        line = (other ? other + ' ' : '') + '§' + amtStr
      } else {
        line = r.filter(it => !CA_MARKERS.has(it.str.trim())).map(it => it.str.trim()).join(' ')
      }
      fullText += line + '\n'
    }
  }
  return fullText
}

// ─── Extraction texte relevé PEA / épargne CA ────────────────────────────────
/**
 * Décode le Private Use Area (PUA) des PDFs CA Compart Docponent.
 * charCode - 0xe002 → codepoint ASCII/Latin-1 original.
 */
/**
 * Décode l'encodage Private Use Area (PUA) utilisé par les PDFs CA Compart Docponent.
 *
 * Le CA encode ses relevés PEA dans une plage Unicode privée (U+E000–U+E0FF).
 * Chaque caractère PUA est converti vers son équivalent ASCII/Latin-1 via la formule :
 * charCode − 0xE002 → codepoint original.
 * Les caractères hors plage PUA sont restitués sans modification.
 *
 * @param {string} str – Chaîne potentiellement encodée PUA
 * @returns {string}   – Chaîne décodée en Latin-1 / ASCII lisible
 */
function decodePUA(str) {
  if (!str) return ''
  return [...str].map(c => {
    const code = c.charCodeAt(0)
    return (code >= 0xe000 && code <= 0xe0ff) ? String.fromCharCode(code - 0xe002) : c
  }).join('')
}

/**
 * Extrait le texte d'un relevé PEA / épargne CA en décodant l'encodage PUA.
 * Pas de marqueurs §/¤ — le texte brut décodé suffit pour parsePEA().
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractPeaText(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  let fullText = ''

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p)
    const content = await page.getTextContent({ disableNormalization: true })

    const items = content.items
      .filter(it => it.str !== undefined && it.width > 0.5)
      .sort((a, b) => b.transform[5] - a.transform[5])

    if (!items.length) continue

    const rows = []
    let row = [items[0]], anchorY = items[0].transform[5]
    for (let k = 1; k < items.length; k++) {
      const y = items[k].transform[5]
      if (anchorY - y > 4) { rows.push(row); row = [items[k]]; anchorY = y }
      else row.push(items[k])
    }
    if (row.length) rows.push(row)

    for (const r of rows) {
      r.sort((a, b) => a.transform[4] - b.transform[4])
      const line = r.map(it => decodePUA(it.str).trim()).filter(Boolean).join(' ')
      if (line) fullText += line + '\n'
    }
  }
  return fullText
}

// ─── Extraction PDF générique (sans marqueurs CA) ─────────────────────────────
/**
 * Extrait le texte brut d'un PDF sans mise en forme CA.
 * Utilisé par le parseur Gemini pour envoyer un texte lisible à l'IA.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractGenericPdfText(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  let fullText = ''

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p)
    const content = await page.getTextContent()

    const items = content.items
      .filter(item => item.str.trim())
      .sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5]
        return Math.abs(yDiff) > 4 ? yDiff : a.transform[4] - b.transform[4]
      })

    let line = '', prevY = null
    for (const item of items) {
      const y = Math.round(item.transform[5])
      if (prevY !== null && Math.abs(prevY - y) > 4) {
        if (line.trim()) fullText += line.trim() + '\n'
        line = ''
      }
      line += item.str + ' '
      prevY = y
    }
    if (line.trim()) fullText += line.trim() + '\n'
    fullText += '\n'
  }
  return fullText
}
