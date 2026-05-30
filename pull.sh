#!/bin/bash
set -e

BRANCH="claude/teraz-YKMDA"

echo "==> Pobieranie zmian z GitHub..."
git fetch https://github.com/lysentreprenor-cell/global-arbitrage-assistant.git "$BRANCH"
git checkout "$BRANCH"
git pull https://github.com/lysentreprenor-cell/global-arbitrage-assistant.git "$BRANCH"

echo "==> Instalacja zależności..."
npm install --legacy-peer-deps

echo "==> Budowanie projektu..."
npm run build

echo ""
echo "✅ Gotowe! Kliknij Stop ■ i Run ▶ w Replit żeby uruchomić aplikację."
