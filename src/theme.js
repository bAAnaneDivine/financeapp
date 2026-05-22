/**
 * @file theme.js
 * @description Constantes de design et helpers de formatage partagés par tous les composants.
 *
 * Ce fichier centralise la palette de couleurs, les styles de base et les utilitaires
 * d'affichage afin de garantir la cohérence visuelle de l'application.
 * Toute modification de la palette ou des styles de base doit se faire ici.
 */

// ─── Palette de couleurs ───────────────────────────────────────────────────────
/**
 * Couleurs principales de l'application (thème sombre finance).
 *
 * Conventions de nommage :
 *  - bg/card/border → surfaces et séparateurs
 *  - text/muted     → hiérarchie typographique
 *  - gold           → accent principal (actions, sélections)
 *  - danger/warn/success/green → états sémantiques
 */
export const C = {
  bg:      '#0a0a16',  // fond principal
  card:    '#11112a',  // fond des cartes
  border:  '#1e1e3a',  // bordures
  gold:    '#c9a96e',  // accent doré (actions, navigation active)
  text:    '#e2d9c8',  // texte principal
  muted:   '#5a5a7a',  // texte secondaire / placeholders
  danger:  '#e05555',  // erreurs, suppressions
  success: '#6db87a',  // succès, valeurs positives
  warn:    '#e8a838',  // avertissements
  green:   '#28b888',  // épargne / partage (vert distinct de success)
}

// ─── Styles de base réutilisables ─────────────────────────────────────────────
/**
 * Primitives de style appliquées via spread operator ({...S.card}).
 * Construites sur la palette C pour rester cohérentes au changement de thème.
 */
export const S = {
  /** Surface encadrée avec bordure arrondie */
  card:  { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 },
  /** Champ de saisie plein écran */
  input: { width: '100%', background: '#080814', border: `1px solid ${C.border}`, color: C.text, padding: '10px 14px', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' },
  /** Bouton d'action principal (fond doré) */
  btn:   { background: C.gold, color: '#080814', border: 'none', padding: '10px 22px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' },
  /** Bouton secondaire transparent avec bordure */
  ghost: { background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
}

// ─── Helpers de formatage ──────────────────────────────────────────────────────
/**
 * Formate un montant en euros selon les conventions françaises.
 * Exemple : 1234.5 → "1 234,50 €"
 * @param {number} n
 * @returns {string}
 */
export const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

/**
 * Formate une date ISO en date courte française.
 * Exemple : "2026-01-15" → "15 janv."
 * @param {string} iso – Date au format YYYY-MM-DD
 * @returns {string}
 */
export const fmtD = iso => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

/**
 * Formate un mois YYYY-MM en libellé long français.
 * Exemple : "2026-01" → "janvier 2026"
 * @param {string} m – Mois au format YYYY-MM
 * @returns {string}
 */
export const fmtMonth = m => new Date(m + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

// ─── Constantes métier partagées ──────────────────────────────────────────────
/**
 * Catégories considérées comme des charges fixes récurrentes.
 * Utilisé par analyseLocale et Dashboard pour filtrer les abonnements
 * sans remonter les dépenses ponctuelles (alimentation, loisirs…).
 */
export const ABO_CATS = new Set(['abonnements', 'logement', 'assurances', 'sante'])
