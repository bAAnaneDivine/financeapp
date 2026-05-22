/**
 * @file constants.js
 * @description Constantes applicatives : clés localStorage, configuration et données de référence.
 *
 * Centralisées ici pour éviter les chaînes magiques dispersées dans le code
 * et faciliter la maintenance (changement de clé localStorage, ajout de règles, etc.).
 */

// ─── Clés localStorage ────────────────────────────────────────────────────────
/** Clé principale des données de l'application (state JSON) */
export const KEY            = 'financeapp_v2'
/** Sauvegarde automatique avant migration de schéma (rollback v2→v3) */
export const KEY_BACKUP     = 'financeapp_backup_v2'
/** Données chiffrées AES-256-GCM (remplace KEY quand le chiffrement est actif) */
export const KEY_ENCRYPTION = 'financeapp_encryption'
/** Clé API Gemini (stockée séparément du state pour éviter de la chiffrer) */
export const KEY_API        = 'financeapp_apikey'
/** Consentement Gemini : 'true' si l'utilisateur a accepté d'envoyer des données à Google */
export const KEY_CONSENT    = 'financeapp_gemini_consent'
/** Mappings CSV mémorisés par fingerprint d'en-têtes (évite de re-mapper le même format) */
export const KEY_CSV_MAPPINGS = 'financeapp_csv_mappings'

// ─── Schéma de données ────────────────────────────────────────────────────────
/**
 * Version courante du schéma de données.
 * À incrémenter à chaque changement structurel du state nécessitant une migration.
 *
 * Historique :
 *  v1 (initial) → transactions + profil de base
 *  v2           → comptes PEA + mode partage couple
 *  v3           → profil étendu (banque, devise, langue) + compteId + customRules enrichies
 */
export const SCHEMA_VERSION = 3

// ─── Options de mapping CSV ───────────────────────────────────────────────────
/**
 * Rôles assignables à une colonne CSV lors du mapping manuel (Phase 4c).
 * Valeur -1 = colonne ignorée.
 */
export const COL_OPTIONS = [
  { value: -1,       label: '— Ignorer' },
  { value: 'date',   label: '📅 Date' },
  { value: 'desc',   label: '📝 Libellé' },
  { value: 'amt',    label: '💶 Montant (signé)' },
  { value: 'debit',  label: '🔴 Débit' },
  { value: 'credit', label: '🟢 Crédit' },
]

// ─── Pack France ──────────────────────────────────────────────────────────────
/**
 * Règles de catégorisation franco-centrées non incluses dans les RULES universelles
 * (qui couvrent uniquement les marchands présents dans toute l'Europe).
 *
 * Ce pack est chargeable en un clic depuis l'interface des règles personnalisées.
 * Il est conçu pour les utilisateurs français et ne s'applique pas automatiquement.
 *
 * Format : compatible avec customRules ({ id, pattern, isRegex, actif, cat, sub }).
 */
export const PACK_FRANCE = [
  { id: 'fr_01', pattern: 'hergibo',                          isRegex: false, actif: true, cat: 'logement',    sub: 'Loyer' },
  { id: 'fr_02', pattern: 'seloger|pap\\.fr|leboncoin.*immo', isRegex: true,  actif: true, cat: 'logement',    sub: 'Loyer' },
  { id: 'fr_03', pattern: 'la poste|colissimo',               isRegex: false, actif: true, cat: 'shopping',    sub: 'Cadeaux' },
  { id: 'fr_04', pattern: 'picard',                           isRegex: false, actif: true, cat: 'alimentation',sub: 'Courses supermarché' },
  { id: 'fr_05', pattern: 'biocoop|naturalia|bio.* coop',     isRegex: true,  actif: true, cat: 'alimentation',sub: 'Marché & épicerie' },
  { id: 'fr_06', pattern: 'boulanger|darty|fnac',             isRegex: true,  actif: true, cat: 'shopping',    sub: 'Électronique & high-tech' },
  { id: 'fr_07', pattern: 'kiabi|decathlon|sport.*2000',      isRegex: true,  actif: true, cat: 'shopping',    sub: 'Vêtements & chaussures' },
  { id: 'fr_08', pattern: 'culture.?bar|super.?u',            isRegex: true,  actif: true, cat: 'alimentation',sub: 'Courses supermarché' },
  { id: 'fr_09', pattern: 'assurance.*maladie|cpam|ameli',    isRegex: true,  actif: true, cat: 'sante',       sub: 'Mutuelle & assurance santé' },
  { id: 'fr_10', pattern: 'dgfip|tresor.public|impot',        isRegex: true,  actif: true, cat: 'assurances',  sub: 'Impôts & taxes' },
  { id: 'fr_11', pattern: 'caf\\.fr|caf.*alloc',              isRegex: true,  actif: true, cat: 'revenus',     sub: 'Virement entrant' },
  { id: 'fr_12', pattern: 'leroy.merlin|brico.depot|castorama',isRegex: true, actif: true, cat: 'logement',    sub: 'Entretien & réparation' },
  { id: 'fr_13', pattern: 'seolis|total.energies|engie|edf',  isRegex: true,  actif: true, cat: 'logement',    sub: 'Électricité & gaz' },
  { id: 'fr_14', pattern: 'doctolib',                         isRegex: false, actif: true, cat: 'sante',       sub: 'Médecin & spécialiste' },
  { id: 'fr_15', pattern: 'alan.*sante|alan.*mutuelle',       isRegex: true,  actif: true, cat: 'sante',       sub: 'Mutuelle & assurance santé' },
]
