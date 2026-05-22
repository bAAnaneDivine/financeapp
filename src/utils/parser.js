// ─── Référentiel de catégories ────────────────────────────────────────────────
export const CATEGORIES = {
  alimentation: {
    label: 'Alimentation', icon: '🛒', color: '#6aaa28',
    subs: ['Courses supermarché', 'Marché & épicerie', 'Restaurant & café', 'Livraison de repas', 'Boulangerie & snack', 'Titres-resto']
  },
  logement: {
    label: 'Logement', icon: '🏠', color: '#2878d4',
    subs: ['Loyer', 'Charges & eau', 'Électricité & gaz', 'Internet & téléphone fixe', 'Entretien & réparation']
  },
  transport: {
    label: 'Transport', icon: '🚗', color: '#e8a838',
    subs: ['Transports en commun', 'Taxi & VTC', 'Vélo & trottinette', 'Carburant', 'Parking & péage', 'Train & avion', 'Équipement moto', 'Entretien moto/auto']
  },
  abonnements: {
    label: 'Abonnements', icon: '📱', color: '#8577e8',
    subs: ['Streaming vidéo', 'Streaming musique', 'Presse & livres', 'Logiciels & cloud', 'Téléphone mobile', 'Salle de sport', 'Autre abonnement']
  },
  sante: {
    label: 'Santé', icon: '❤️', color: '#e06030',
    subs: ['Médecin & spécialiste', 'Pharmacie', 'Mutuelle & assurance santé', 'Optique & dentaire', 'Vétérinaire & animaux']
  },
  loisirs: {
    label: 'Loisirs', icon: '🎉', color: '#28b888',
    subs: ['Sorties & événements', 'Voyages & hôtels', 'Jeux vidéo', 'Livres & magazines', 'Hobbies & activités', 'Sorties entre amis']
  },
  shopping: {
    label: 'Shopping', icon: '👗', color: '#d45888',
    subs: ['Vêtements & chaussures', 'Électronique & high-tech', 'Maison & décoration', 'Beauté & soins', 'Cadeaux']
  },
  assurances: {
    label: 'Assurances & finances', icon: '🛡️', color: '#8a8878',
    subs: ['Assurance habitation', 'Assurance auto/moto', 'Épargne & investissement', 'Frais bancaires', 'Impôts & taxes']
  },
  famille: {
    label: 'Famille & proches', icon: '👨‍👩‍👧', color: '#48c8b8',
    subs: ['Partage de frais', 'Remboursement', 'Cadeau famille']
  },
  revenus: {
    label: 'Revenus', icon: '💰', color: '#3a8818',
    subs: ['Salaire', 'Virement entrant', 'Remboursement reçu']
  },
  virement_interne: {
    label: 'Virement interne', icon: '🔄', color: '#5a5a7a',
    subs: ['Entre mes comptes']
  },
  non_categorise: {
    label: 'Non catégorisé', icon: '❓', color: '#e04848',
    subs: ['À clarifier', 'Virement entre comptes', 'Espèces', 'PayPal opaque']
  }
}

// ─── Règles de catégorisation universelles ───────────────────────────────────
// Seuls les marchands/services reconnaissables sans contexte personnel.
// Les règles propres à chaque utilisateur (nom du bailleur, contacts, commerces locaux)
// sont à ajouter via l'UI "Règles personnalisées" dans l'onglet Import.
const RULES = [
  // Logement
  { r: /\bloyer\b/i,                                            cat: 'logement',    sub: 'Loyer' },
  { r: /metropole.*amendes/i,                                   cat: 'logement',    sub: 'Charges & eau' },
  { r: /butagaz|engie|edf\b|direct energie|primagaz|antargaz|veolia|suez\b/i, cat: 'logement', sub: 'Électricité & gaz' },
  { r: /free telecom|free haut/i,                               cat: 'logement',    sub: 'Internet & téléphone fixe' },
  // Abonnements
  { r: /bouygues|auchan telecom/i,                              cat: 'abonnements', sub: 'Téléphone mobile' },
  { r: /netflix|disney|canal/i,                                 cat: 'abonnements', sub: 'Streaming vidéo' },
  { r: /spotify|deezer|apple music/i,                           cat: 'abonnements', sub: 'Streaming musique' },
  { r: /icloud|google one|dropbox|microsoft 365/i,              cat: 'abonnements', sub: 'Logiciels & cloud' },
  // Assurances & finances
  { r: /macif|maif|axa|allianz|groupama/i,                      cat: 'assurances',  sub: 'Assurance auto/moto' },
  { r: /versement sur pea|fortuneo|boursorama|degiro|bourse direct/i, cat: 'assurances', sub: 'Épargne & investissement' },
  { r: /tresor public|impot|dgfip|direction generale des finances/i,  cat: 'assurances', sub: 'Impôts & taxes' },
  // Transport
  { r: /uber|bolt|vtc/i,                                        cat: 'transport',   sub: 'Taxi & VTC' },
  { r: /sncf|ratp|navigo|keolis/i,                              cat: 'transport',   sub: 'Transports en commun' },
  { r: /parking|vincipark|saemes|indigo park/i,                 cat: 'transport',   sub: 'Parking & péage' },
  { r: /total\b|bp\b|shell\b|esso\b|intermarche.*carb|leclerc.*carb/i, cat: 'transport', sub: 'Carburant' },
  { r: /garage\b|carrosserie|garagiste/i,                       cat: 'transport',   sub: 'Entretien moto/auto' },
  // Alimentation - courses
  { r: /leclerc|carrefour(?!.*market.*le\s)|super u|monoprix|franprix|intermarche|lidl|aldi|auchan/i, cat: 'alimentation', sub: 'Courses supermarché' },
  { r: /carrefour market/i,                                     cat: 'alimentation', sub: 'Courses supermarché' },
  { r: /feuillette|fournil|fourmi.*boul|boulang|patisserie|boulpat/i, cat: 'alimentation', sub: 'Boulangerie & snack' },
  { r: /swile/i,                                                cat: 'alimentation', sub: 'Titres-resto' },
  { r: /deliveroo|ubereats|just.eat/i,                          cat: 'alimentation', sub: 'Livraison de repas' },
  { r: /burger king|mcdonald|quick\b|kfc\b|five guys|domino|papa john/i, cat: 'alimentation', sub: 'Restaurant & café' },
  { r: /sushi|ramen|wok\b|thai\b|japonais/i,                   cat: 'alimentation', sub: 'Restaurant & café' },
  { r: /cave.*vin|nicolas\b|o.chateau/i,                        cat: 'alimentation', sub: 'Marché & épicerie' },
  // Santé
  { r: /pharmacie|pharmacal/i,                                  cat: 'sante',        sub: 'Pharmacie' },
  { r: /veterinaire|vétérinaire|clinique veter|cabinet veter/i, cat: 'sante',        sub: 'Vétérinaire & animaux' },
  { r: /docteur\b|dr\.\s|medecin\b/i,                          cat: 'sante',        sub: 'Médecin & spécialiste' },
  // Loisirs
  { r: /cinema|fnac|cultura\b/i,                                cat: 'loisirs',      sub: 'Sorties & événements' },
  { r: /steam\b|playstation|nintendo|epic games/i,              cat: 'loisirs',      sub: 'Jeux vidéo' },
  // Shopping
  { r: /bonobo|zara|h&m|primark|uniqlo/i,                       cat: 'shopping',     sub: 'Vêtements & chaussures' },
  { r: /foir.fouille|ikea|maisons du monde/i,                   cat: 'shopping',     sub: 'Maison & décoration' },
  { r: /brocant|braderie/i,                                     cat: 'shopping',     sub: 'Maison & décoration' },
  { r: /la poste|laposte\b/i,                                   cat: 'shopping',     sub: 'Cadeaux' },
]

// ─── Helpers métier partagés ──────────────────────────────────────────────────
/**
 * Détermine si une transaction est « exceptionnelle » (dépense ponctuelle notable).
 * Centralisé ici pour être utilisé à la fois dans parseCA() et dans onCorrect() de l'app.
 *
 * Règle : montant > 200 € ET catégorie hors logement/revenus/virement_interne
 *         ET sous-catégorie hors épargne/espèces.
 *
 * @param {number} montantAbs – Valeur absolue du montant
 * @param {string} cat        – Catégorie
 * @param {string} sub        – Sous-catégorie
 * @returns {boolean}
 */
export function computeIsExceptionnel(montantAbs, cat, sub) {
  return montantAbs > 200
    && !['logement', 'revenus', 'virement_interne'].includes(cat)
    && sub !== 'Épargne & investissement'
    && sub !== 'Espèces'
}

// ─── Moteur de catégorisation ─────────────────────────────────────────────────
/**
 * Catégorise une transaction à partir de son libellé brut et de son sens débit/crédit.
 *
 * Ordre de priorité :
 *  1. Court-circuits spéciaux (PayPal opaque, DAB, virement interne, revenus)
 *  2. Règles utilisateur (customRules) — permettent de surcharger les règles statiques
 *  3. Règles statiques RULES (référentiel basé sur les relevés CA réels)
 *  4. Fallback : non_categorise / À clarifier
 *
 * @param {string}   libelleRaw   – Libellé brut extrait du PDF (avant cleanLibelle)
 * @param {boolean}  isCredit     – true si la colonne « Crédit » du relevé est remplie
 * @param {Array}    customRules  – Règles personnalisées : [{ pattern, cat, sub }]
 * @param {string}   userFullName – Nom complet de l'utilisateur pour détecter ses virements internes
 * @returns {{ cat: string, sub: string, confidence: 'high'|'medium'|'low' }}
 */
export function categorize(libelleRaw, isCredit, customRules = [], userFullName = '') {
  if (/paypal/i.test(libelleRaw))
    return { cat: 'non_categorise', sub: 'PayPal opaque', confidence: 'low' }
  if (/ret dab|retrait/i.test(libelleRaw))
    return { cat: 'non_categorise', sub: 'Espèces', confidence: 'medium' }
  // Virements entre comptes propres — détectés via le nom configuré par l'utilisateur
  if (userFullName) {
    const escaped = userFullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(escaped, 'i').test(libelleRaw))
      return { cat: 'virement_interne', sub: 'Entre mes comptes', confidence: 'high' }
  }
  if (isCredit)
    return { cat: 'revenus', sub: 'Virement entrant', confidence: 'medium' }

  // Règles personnalisées utilisateur (priorité sur les règles statiques)
  for (const rule of customRules) {
    if (rule.actif === false) continue
    try {
      const pat = rule.isRegex
        ? rule.pattern
        : rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(pat, 'i').test(libelleRaw))
        return { cat: rule.cat, sub: rule.sub, confidence: 'high' }
    } catch { /* regex invalide ignorée */ }
  }

  for (const rule of RULES) {
    if (rule.r.test(libelleRaw))
      return { cat: rule.cat, sub: rule.sub, confidence: 'high' }
  }
  if (/vir inst vers|virement web/i.test(libelleRaw))
    return { cat: 'non_categorise', sub: 'À clarifier', confidence: 'low' }

  return { cat: 'non_categorise', sub: 'À clarifier', confidence: 'low' }
}

// ─── Hash déduplication (date + libellé + montant) ───────────────────────────
/**
 * Génère un identifiant court et déterministe pour détecter les doublons.
 * Algorithme : variante djb2 (polynôme de Horner mod 2³²) — rapide, sans dépendance.
 * On tronque le libellé à 40 chars pour tolérer les légères variantes de PDF.
 *
 * @param {string} dateOpe     – Date opération ISO (YYYY-MM-DD)
 * @param {string} libelleRaw  – Libellé brut (avant nettoyage)
 * @param {string} montant     – Montant en string (ex: "42.5")
 * @returns {string} Identifiant en base-36 (court, URL-safe)
 */
export function makeId(dateOpe, libelleRaw, montant) {
  const str = `${dateOpe}|${libelleRaw.trim().slice(0, 40)}|${montant}`
  let h = 0
  for (let i = 0; i < str.length; i++) { h = Math.imul(31, h) + str.charCodeAt(i) | 0 }
  return Math.abs(h).toString(36)
}

// ─── Nettoyage libellé ────────────────────────────────────────────────────────
/**
 * Normalise le libellé brut extrait du PDF pour l'affichage et la catégorisation.
 *
 * La chaîne de remplacements est ordonnée du plus général au plus spécifique :
 *  - Préfixes bancaires standards (CARTE, PRLV, VIR INST…)
 *  - Artefacts PDF du CA (codes techniques, références SEPA, IBAN partiels…)
 *  - Artefacts propres aux fournisseurs connus (Rhapsody, Bouygues, Free, Macif…)
 *  - Nettoyage final (espaces multiples, capitalisation)
 *
 * Idempotent : appliquer deux fois donne le même résultat.
 *
 * @param {string} raw – Libellé brut issu du parser PDF
 * @returns {string}   – Libellé lisible, normalisé
 */
export function cleanLibelle(raw) {
  return raw
    .replace(/carte\s+x\d+\s*/i, '')
    .replace(/prlv\s+/gi, '')
    .replace(/virement\s+(web\s+)?/i, '')
    .replace(/vir inst (vers|de)\s+/i, '→ ')       // virements sortants (avec ou sans "de")
    .replace(/^De\s+(?=\w)/i, '')                  // article résiduel "De Monsieur Vassenet..."
    .replace(/\s+\d{2}\/\d{2,4}\s*$/, '')        // date carte CA : "20/03" ou "20/03/2026" en fin
    .replace(/\s+\d{2}\/\s*$/, '')                // date carte CA coupée par pdfjs : "20/"
    .replace(/\d{2}\/\d{2}$/, '')                 // fallback ancien pattern
    .replace(/paypal4nfj[\w\/]*/gi, '')
    .replace(/\s+\d{2}-\d{4}\s*$/i, '')           // période résiduelle : "05-2025" en fin
    .replace(/\s+FACTURE\S*/gi, '')               // numéros de facture (ex: FACTURE260203000065)
    .replace(/\s+MANDAT\S*/gi, '')                // références mandat SEPA (ex: MANDATFR81EAU10...)
    .replace(/\s+\d{10,}/g, '')                   // séquences numériques longues ≥ 10 chiffres
    .replace(/[A-Z]{2}\d{8,}/g, '')               // codes type MA9079137155 / FR83ZZZ (collés ou séparés)
    .replace(/\s+[A-Z]{2}\d{1,2}[A-Z0-9]{8,}/g, '') // IBAN/BIC avec espace avant (FR83ZZZ, IC000...)
    .replace(/\s+\d{4}[A-Z][A-Z0-9]{4,}/g, '')   // codes alphanum débutant par 4 chiffres (2148FR81EAU...)
    .replace(/[A-Z0-9]{20,}/g, '')                // tokens ≥20 chars tout majuscule = ref banque résiduelle
    .replace(/\s+E\s+Logemen\b.*/i, '')            // artefact PDF loyer : "E Logemen Logement 44 rue Garnier Pages..."
    .replace(/\s+(Loyer|Logement)\s+\d+.*/i, '') // artefact PDF loyer : "Loyer 4 Loyer 44 garnier PagesLoyer..."
    .replace(/\s+-prelev\b.*/i, '')               // suffixe prélèvement CA : "-prelev ..."
    .replace(/\s+Production-m\b/i, '')            // code agence Macif résiduel
    .replace(/\s+Auchan\s+Telecom\b.*/i, '')      // SEPA Bouygues résiduel : "Prlv Auchan Telecom Fact N.FM..."
    .replace(/\s+Box[A-Z0-9]{4,}\b.*/i, '')      // ref contrat Bouygues : "BoxBT1150ULPJS28"
    .replace(/\s+Free\s+Haut\w*/i, '')            // produit Free Box : "Free Hautdebit"
    .replace(/\s+[a-f0-9]{8}\b.*/i, '')           // hash hex 8 chars : "Game Joy f21ebd7a Pa"
    .replace(/\s+(\w{4,})\s+\1\w*\s*$/i, '')     // mot dupliqué en fin PDF : "Spotify SpotifySpotify"
    .replace(/\s+D\d{7,}\s+\d{7,}/i, '')          // réf dossier remboursement : "D483533614 483533614"
    .replace(/\s+\d+\s+rue\b.*/i, '')             // adresse résiduelle : "561 rue George..."
    .replace(/\s+core$/i, '')                     // suffixe "Core" ajouté par CA
    .replace(/[,\/]\s*$/, '')                      // slash ou virgule résiduels en fin (PayPal "S./" ou "Cie,")
    .replace(/^\w{1,6}\*(?:\w{1,5}\s+)?/i, '')   // préfixe acquéreur CB : "Mp*", "Uep*dac "
    .replace(/\s+Dac\s+[A-Z][a-z]{0,4}\s*$/i, '') // code acquéreur résiduel : "Dac Vl"
    .replace(/^E\.?\s*Lecler[ece]+\b/i, 'E.Leclerc') // normalise variantes : "E. Leclerc", "E.leclere"
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[a-z]/, c => c.toUpperCase())          // capitalise 1ère lettre si minuscule (ex: "carrefour")
}


// parseCA et parsePEA sont maintenant dans parsers/ — re-exportés pour compatibilité
export { parseCA } from './parsers/ca.js'
export { parsePEA } from './parsers/pea.js'

// ─── Déduplication ────────────────────────────────────────────────────────────
/**
 * Sépare les nouvelles transactions en deux listes : nouvelles vs doublons.
 * Utilise le champ `id` (hash makeId) comme clé de déduplication.
 * Complexité O(n) grâce au Set.
 *
 * @param {Array} existing – Transactions déjà en base
 * @param {Array} newTxs   – Transactions issues du dernier PDF parsé
 * @returns {{ added: Array, dupes: Array }}
 */
export function deduplicate(existing, newTxs) {
  const ids = new Set(existing.map(t => t.id))
  const added = [], dupes = []
  newTxs.forEach(t => (ids.has(t.id) ? dupes : added).push(t))
  return { added, dupes }
}

// ─── Stats ────────────────────────────────────────────────────────────────────
/**
 * Calcule les indicateurs financiers clés d'un tableau de transactions.
 *
 * Définitions :
 *  - "Dépenses conso" (dep)  : débits hors virements internes et hors PEA/AV
 *  - "Revenus réels"  (rev)  : crédits hors virements internes
 *  - "Épargne investie"      : versements PEA/AV — ni dépense ni revenu courant
 *  - "Récurrences"           : libellés vus ≥ 2× dans les dépenses conso (sliding window)
 *  - "À clarifier"           : dépenses avec confidence='low' et non corrigées
 *  - "Exceptionnelles"       : dépenses > 200€ hors catégories incompressibles
 *
 * @param {Array} txs – Tableau de transactions (peut être filtré par mois, etc.)
 * @returns {{ totalDep, totalRev, epargneInvestie, parCat, recurrentes, aClarifier, exceptionnelles }}
 */
export function computeStats(txs) {
  // Virements internes et épargne investie = mouvements entre comptes propres, pas des flux réels
  // sub 'Virement entre comptes' couvre les corrections manuelles de l'utilisateur
  const isTransfert = t =>
    t.cat === 'virement_interne' ||
    t.sub === 'Épargne & investissement' ||
    t.sub === 'Virement entre comptes'

  const dep    = txs.filter(t => !t.isCredit && !isTransfert(t))   // vraies dépenses conso
  const rev    = txs.filter(t =>  t.isCredit && t.cat !== 'virement_interne') // vrais revenus
  const allDep = txs.filter(t => !t.isCredit)                      // tous les débits (pour epargneInvestie)

  const parCat = {}
  dep.forEach(t => { parCat[t.cat] = (parCat[t.cat] || 0) + Math.abs(t.montant) })

  // Détection récurrences — débits de conso seulement
  // Clé = 25 premiers chars du libellé nettoyé (assez long pour distinguer les commerçants,
  // assez court pour tolérer les légères variantes de libellé d'un mois sur l'autre)
  const byLib = {}
  dep.forEach(t => {
    const k = t.libelle.slice(0, 25)
    ;(byLib[k] = byLib[k] || []).push(t)
  })
  const recurrentes = Object.entries(byLib)
    .filter(([, v]) => v.length >= 2)
    .map(([label, v]) => {
      const catCount = {}; const subCount = {}
      v.forEach(t => {
        catCount[t.cat] = (catCount[t.cat] || 0) + 1
        if (t.sub) subCount[t.sub] = (subCount[t.sub] || 0) + 1
      })
      const cat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0][0]
      const sub = Object.keys(subCount).length
        ? Object.entries(subCount).sort((a, b) => b[1] - a[1])[0][0]
        : null
      return {
        label, count: v.length,
        montantMoyen: v.reduce((s, t) => s + Math.abs(t.montant), 0) / v.length,
        cat, sub
      }
    })
    .sort((a, b) => b.montantMoyen - a.montantMoyen)

  // Épargne investie (PEA, assurance-vie…) : flux de placement, ni dépense ni revenu courant
  const epargneInvestie = allDep
    .filter(t => t.sub === 'Épargne & investissement')
    .reduce((s, t) => s + Math.abs(t.montant), 0)

  const totalDep = dep.reduce((s, t) => s + Math.abs(t.montant), 0)  // conso pure
  const totalRev = rev.reduce((s, t) => s + t.montant, 0)             // revenus réels

  return {
    totalDep,           // dépenses conso (hors PEA + hors virements internes)
    totalRev,           // revenus réels (hors virements internes)
    epargneInvestie,    // versements PEA/AV — s'ajoute au net pour le taux d'épargne réel
    parCat,
    recurrentes,
    aClarifier: dep.filter(t => t.confidence === 'low'),
    exceptionnelles: dep.filter(t => t.isExceptionnel
      && t.sub !== 'Épargne & investissement'
      && t.sub !== 'Espèces'
    )
  }
}

