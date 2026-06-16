#!/bin/bash
set -e

REPO="https://github.com/lysentreprenor-cell/global-arbitrage-assistant.git"
BRANCH="claude/teraz-YKMDA"

echo "==> Pobieranie zmian z GitHub ($BRANCH)..."
git fetch "$REPO" "$BRANCH"
git checkout -B "$BRANCH" FETCH_HEAD

echo ""
echo "==> Instalowanie zależności..."
npm install 2>&1 | tail -5

echo ""
echo "==> Budowanie aplikacji (dist/)..."
npm run build

echo ""
echo "==> Zainstalowane wersje plików:"
node --version
ls -lh dist/index.cjs 2>/dev/null || echo "BRAK dist/index.cjs !"
ls -lh dist/public/index.html 2>/dev/null || echo "BRAK dist/public/index.html !"

echo ""
echo "✅ Gotowe! Teraz kliknij Stop ■ i Run ▶ w Replit."
