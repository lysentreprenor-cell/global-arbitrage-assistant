#!/bin/bash
set -e

BRANCH="claude/teraz-YKMDA"

echo "==> Pobieranie zmian z GitHub..."
git fetch origin

echo "==> Przełączanie na gałąź: $BRANCH"
git checkout "$BRANCH"

echo "==> Pull latest..."
git pull origin "$BRANCH"

echo "==> Instalacja zależności (jeśli potrzeba)..."
npm install --legacy-peer-deps

echo "==> Budowanie projektu..."
npm run build

echo ""
echo "✅ Gotowe! Aplikacja zaktualizowana z GitHub."
