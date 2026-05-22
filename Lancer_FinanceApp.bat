@echo off
title FinanceApp
echo.
echo  ◆ FinanceApp - Lancement en cours...
echo.

:: Vérifier si Node.js est installé
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERREUR : Node.js n'est pas installe.
    echo.
    echo  Telechargez Node.js sur : https://nodejs.org
    echo  Choisissez la version LTS et installez-la.
    echo  Puis relancez ce fichier.
    echo.
    pause
    exit /b 1
)

:: Afficher la version Node
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  Node.js detecte : %NODE_VER%
echo.

:: Aller dans le dossier du script
cd /d "%~dp0"

:: Installer les dépendances si node_modules absent
if not exist "node_modules" (
    echo  Installation des dependances ^(premiere fois uniquement^)...
    echo  Patientez environ 1-2 minutes...
    echo.
    call npm install
    echo.
)

:: Lancer l'app
echo  Lancement de FinanceApp sur http://localhost:3000
echo  Fermez cette fenetre pour arreter l'application.
echo.
call npm run dev

pause
