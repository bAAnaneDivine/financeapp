# FinanceApp

Application de gestion financière personnelle — multi-banque, tout en local, open source.

**Toutes vos données restent sur votre appareil. Aucun serveur, aucun compte.**

---

## Fonctionnalités

- Import de relevés **PDF** (Crédit Agricole natif), **CSV** et **XLSX** (détection automatique)
- Import universel via **Google Gemini Flash** (IA gratuite, n'importe quelle banque)
- Catégorisation automatique des transactions + règles personnalisées
- Dashboard, Budget, Épargne (PEA/AV), Analyse mensuelle, Mode Partage
- Chiffrement optionnel **AES-256-GCM** des données locales
- PWA installable sur mobile (iOS / Android)

---

## Prérequis

- [Node.js](https://nodejs.org) version LTS (18+)
- Un navigateur moderne (Chrome, Firefox, Edge, Safari 15+)

---

## Démarrage local

```bash
# Cloner le dépôt
git clone https://github.com/bAAnaneDivine/financeapp.git
cd financeapp

# Installer les dépendances
npm install

# Lancer l'app en développement
npm run dev
```

L'app s'ouvre automatiquement sur **http://localhost:3000**

**Sur Windows :** double-cliquer sur `Lancer_FinanceApp.bat`

---

## Configuration clé API Gemini (optionnel)

L'import IA fonctionne avec n'importe quel format de relevé bancaire.

1. Créer une clé gratuite sur [aistudio.google.com](https://aistudio.google.com)
2. Dans l'app → **Paramètres** → section **Clé API Gemini** → coller la clé
3. Le bouton "Import via IA 🤖" apparaît dans l'onglet Importer

> La clé est stockée uniquement dans votre navigateur. Elle n'est jamais envoyée ailleurs que vers l'API Google Gemini.

---

## Déploiement Vercel (en 1 clic)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/bAAnaneDivine/financeapp)

Ou manuellement :

```bash
npm run build        # Génère dist/
# Pousser sur GitHub → connecter le repo sur vercel.com
```

Les fichiers `vercel.json` et `netlify.toml` (CSP, headers sécurité) sont déjà configurés.

---

## Tests

```bash
npm test             # 96 tests (parseurs CA, CSV, crypto, Gemini, analyseLocale)
npm run test:watch   # Mode watch
```

---

## Architecture

```
src/
├── App.jsx                  — Orchestrateur, persistance, chiffrement
├── components/              — 14 composants (Dashboard, Import, Budget…)
├── utils/
│   ├── parser.js            — Catégorisation, stats, cleanLibelle
│   ├── crypto.js            — AES-256-GCM (Web Crypto API)
│   └── parsers/
│       ├── ca.js            — Relevés PDF Crédit Agricole
│       ├── csv.js           — CSV/XLSX multi-format
│       ├── gemini.js        — Import IA universel
│       └── pdf-extract.js   — Extraction texte PDF (pdfjs-dist)
├── helpers.js               — analyseLocale, exportCSV
├── theme.js                 — Palette, styles, formatters
└── constants.js             — Clés localStorage, PACK_FRANCE
```

---

## Contribution

Les contributions sont bienvenues. Quelques règles :

- Chaque parseur doit avoir ses tests Vitest (`*.test.js`)
- Les PDFs de test doivent être anonymisés (pas de données personnelles réelles)
- Pas de dépendances CDN externes — tout doit être bundlé

**Ajouter un parseur pour une nouvelle banque :**
1. Créer `src/utils/parsers/mabanque.js` avec la même interface que `ca.js`
2. L'enregistrer dans `src/utils/parsers/index.js` (détection par en-tête PDF)
3. Livrer avec au moins 5 tests sur données synthétiques

---

## Licence

**MIT** — libre d'utilisation, de modification et de distribution.
