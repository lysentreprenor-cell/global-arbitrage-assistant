#!/bin/bash
set -e

REPO="https://github.com/lysentreprenor-cell/global-arbitrage-assistant.git"
BRANCH="claude/teraz-YKMDA"

echo "==> Pobieranie zmian z GitHub ($BRANCH)..."
git fetch "$REPO" "$BRANCH"
git stash --include-untracked 2>/dev/null || true
git checkout -f -B "$BRANCH" FETCH_HEAD

# NIE uruchamiamy 'npm install' — firewall Replit blokuje niektóre pakiety
# (es5-ext), a node_modules jest już zainstalowany przy starcie środowiska.
# 'npm install' tylko psuje node_modules. Budujemy z istniejących zależności.

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
