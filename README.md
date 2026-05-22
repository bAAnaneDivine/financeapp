# FinanceApp — Guide de démarrage

## Prérequis (une seule fois)

1. Installe **Node.js** depuis https://nodejs.org (version LTS)
2. C'est tout.

## Lancer l'application

Double-clique sur **Lancer_FinanceApp.bat**

L'application s'ouvre automatiquement dans ton navigateur sur http://localhost:3000

## Première utilisation

1. Réponds aux 5 questions de l'onboarding (prénom, revenu, charges, épargne)
2. Va dans **Importer** et glisse tes relevés PDF du Crédit Agricole
3. Tes données sont sauvegardées automatiquement dans le navigateur

## Structure du projet

```
Claude_finance/
├── Lancer_FinanceApp.bat   ← Double-clic pour démarrer
├── README.md               ← Ce fichier
├── package.json            ← Configuration du projet
├── src/
│   ├── App.jsx             ← Application principale
│   ├── main.jsx            ← Point d'entrée
│   └── utils/
│       └── parser.js       ← Parser relevés + catégorisation
└── node_modules/           ← Dépendances (créé automatiquement)
```

## Arrêter l'application

Ferme la fenêtre noire (terminal) ou appuie sur Ctrl+C dedans.
