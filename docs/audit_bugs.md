# Audit I0a — Bugs détectés et corrigés
Date : 2026-05-22

## Bugs corrigés

### BUG-01 — Budget.jsx : `useEffect` manquant
- **Composant** : `src/components/Budget.jsx`
- **Symptôme** : `useEffect` utilisé (lignes 33, 64) mais non importé → crash à l'ouverture de l'onglet Budget
- **Correction** : `import { useState, useEffect, useMemo, useRef } from 'react'`
- **Statut** : ✅ Corrigé

### BUG-02 — Epargne.jsx : `useMemo` manquant
- **Composant** : `src/components/Epargne.jsx`
- **Symptôme** : `useMemo` utilisé (ligne 139) mais non importé → crash à l'ouverture de l'onglet Épargne
- **Correction** : `import { useState, useRef, useMemo } from 'react'`
- **Statut** : ✅ Corrigé

### BUG-03 — Transactions.jsx : `useEffect` manquant
- **Composant** : `src/components/Transactions.jsx`
- **Symptôme** : `useEffect` utilisé (ligne 33) mais non importé → crash à l'ouverture de l'onglet Transactions
- **Correction** : `import { useState, useEffect, useMemo, useRef } from 'react'`
- **Statut** : ✅ Corrigé

### BUG-04 — Import.jsx : `ResetButton` manquant
- **Composant** : `src/components/Import.jsx`
- **Symptôme** : `ResetButton` utilisé (ligne 591) mais non importé → crash à l'import d'un 2ème relevé (quand des données existent déjà)
- **Correction** : `import ResetButton from './ResetButton.jsx'`
- **Note** : Non détecté en I0a car le crash ne survient qu'avec des données existantes, pas sur état vide
- **Statut** : ✅ Corrigé

## Résultats des tests post-correction

- `npm test` : 54/54 ✅
- 9 onglets testés manuellement : 0 erreur console ✅

## Bugs non trouvés (attendus résiduels des sessions précédentes)

- `useMemo` manquant ChatIA.jsx → déjà corrigé session 2026-05-22 ✅
- `CTooltip` non défini → déjà corrigé session 2026-05-22 ✅
- `Analyse.jsx` ad blocker → renommée `Mensuel.jsx` session 2026-05-22 ✅
