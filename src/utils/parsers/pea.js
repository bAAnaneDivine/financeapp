/**
 * @file pea.js
 * @description Parseur de relevés PEA Crédit Agricole (format Compart Docponent).
 *
 * Contrairement aux relevés courants, les PDFs PEA/AV du CA utilisent un encodage
 * PUA (Private Use Area Unicode) décodé par extractPeaText avant ce parseur.
 * Ce parseur est spécifique au CA et ne fonctionnera pas pour d'autres courtiers.
 */

/**
 * Parse un relevé PEA Crédit Agricole (format Compart Docponent).
 *
 * Interface parseur :
 *   Entrée  : text (string, décodé PUA via extractPeaText)
 *   Sortie  : objet PEA ou null si le texte ne correspond pas à ce format
 *
 * @param {string} text – Texte brut décodé PUA extrait du PDF
 * @returns {{ type, compte, dateReleve, versements, retraits, titres,
 *             valorisationTitres, soldeEspeces, valorisationTotale } | null}
 */
export function parsePEA(text) {
  if (!/PLAN D'EPARGNE EN ACTIONS/i.test(text)) return null

  const parseFrNum = s => parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0

  const compteM = text.match(/PLAN D'EPARGNE EN ACTIONS\s+n[°¯°]\s*(\d+)/i)
  const compte  = compteM ? compteM[1] : ''

  const dateM    = text.match(/SITUATION AU\s+(\d{2})\.(\d{2})\.(\d{4})/)
  const dateReleve = dateM ? `${dateM[3]}-${dateM[2]}-${dateM[1]}` : ''

  const versM      = text.match(/Total des versements\s+([\d\s]+,\d{2})/)
  const retM       = text.match(/Total des retraits\s+([\d\s]+,\d{2})/)
  const versements = versM ? parseFrNum(versM[1]) : 0
  const retraits   = retM  ? parseFrNum(retM[1])  : 0

  const titres = []
  for (const line of text.split('\n')) {
    const isinMatch = line.match(/\b([A-Z]{2}[A-Z0-9]{10})\b/)
    if (!isinMatch) continue

    const isin        = isinMatch[1]
    const designation = line.slice(0, isinMatch.index).trim()
    const afterIsin   = line.slice(isinMatch.index + isin.length).trim()

    const colRE = /^([\d][\d\s]*,\d{5})\s+([\d][\d\s]*,\d{5})\s+([\d][\d\s]*,\d{2})\s*([\d][\d\s]*)$/
    const colM  = afterIsin.match(colRE)
    if (!colM) continue

    titres.push({
      designation, isin,
      quantite:     parseFrNum(colM[1]),
      cours:        parseFrNum(colM[2]),
      valorisation: parseFrNum(colM[3]),
      prixRevient:  colM[4] ? parseFrNum(colM[4].replace(/\s/g, '')) : 0,
    })
  }

  const valPortM          = text.match(/TOTAL DU PORTEFEUILLE\s+([\d\s]+,\d{2})/)
  const valorisationTitres = valPortM ? parseFrNum(valPortM[1]) : titres.reduce((s, t) => s + t.valorisation, 0)

  const espM        = text.match(/SOLDE ESP[ÈE]CES PEA\s+([\d\s]+,\d{2})/)
  const soldeEspeces = espM ? parseFrNum(espM[1]) : 0

  return {
    type: 'PEA',
    compte,
    dateReleve,
    versements,
    retraits,
    titres,
    valorisationTitres,
    soldeEspeces,
    valorisationTotale: Math.round((valorisationTitres + soldeEspeces) * 100) / 100,
  }
}
