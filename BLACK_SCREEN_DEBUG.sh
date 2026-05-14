#!/usr/bin/env bash
set -Eeuo pipefail

echo "===================================="
echo " BLACK SCREEN DEBUG"
echo "===================================="

echo ""
echo "=== 1. SEKRETY VITE — SAME NAZWY ==="
node - <<'NODE'
const fs = require("fs");

const files = [
  ...["client/src", "src"].filter(fs.existsSync)
];

const found = new Set();

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + "/" + item.name;
    if (item.isDirectory()) {
      if (!["node_modules", "dist", ".git"].includes(item.name)) walk(p);
    } else if (/\.(ts|tsx|js|jsx)$/.test(item.name)) {
      const text = fs.readFileSync(p, "utf8");
      for (const m of text.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) {
        found.add(m[1]);
      }
    }
  }
}

for (const dir of files) walk(dir);

console.log("VITE sekrety użyte w kodzie:");
for (const k of [...found].sort()) {
  console.log((process.env[k] ? "✅ " : "❌ ") + k);
}
NODE

echo ""
echo "=== 2. NAJWAŻNIEJSZE SEKRETY ==="
node -e "
[
'DATABASE_URL',
'FIREBASE_SERVICE_ACCOUNT',
'VITE_FIREBASE_API_KEY',
'VITE_FIREBASE_PROJECT_ID',
'VITE_FIREBASE_AUTH_DOMAIN',
'VITE_FIREBASE_APP_ID',
'VITE_FIREBASE_STORAGE_BUCKET',
'VITE_FIREBASE_MESSAGING_SENDER_ID'
].forEach(k => console.log(k, process.env[k] ? '✅ jest' : '❌ brak'))
"

echo ""
echo "=== 3. SZUKAM ENTRYPOINT REACT ==="
find . -maxdepth 5 \( -name "main.tsx" -o -name "main.jsx" -o -name "main.ts" -o -name "main.js" -o -name "App.tsx" \) \
  -not -path "./node_modules/*" \
  -not -path "./dist/*"

echo ""
echo "=== 4. INDEX.HTML ROOT ==="
find . -maxdepth 4 -name "index.html" -not -path "./node_modules/*" -not -path "./dist/*" -print -exec sed -n '1,120p' {} \;

echo ""
echo "=== 5. BUILD ==="
npm run build 2>&1 | tee black-build.log

echo ""
echo "=== 6. DIST PUBLIC ==="
find dist -maxdepth 4 -type f | sort | head -80

echo ""
echo "=== 7. START PROD LOCAL ==="
pkill -f "tsx server/index.ts|vite|node dist/index.cjs|node dist/index.js|npm run dev|npm start" 2>/dev/null || true
npm start > black-prod.log 2>&1 &
sleep 8

echo ""
echo "=== 8. PROD LOG LOCAL ==="
tail -100 black-prod.log

echo ""
echo "=== 9. LOCAL API ==="
curl -i http://localhost:5000/api/health | head -30 || true

echo ""
echo "=== 10. LOCAL HTML ==="
curl -s http://localhost:5000/ | head -120

echo ""
echo "=== 11. LOCAL JS ASSET ==="
JS=$(curl -s http://localhost:5000/ | grep -oE '/assets/[^"]+\.js' | head -1 || true)
echo "JS=$JS"
if [ -n "$JS" ]; then
  curl -I "http://localhost:5000$JS" || true
fi

echo ""
echo "=== 12. PUBLIC HTML ==="
curl -s https://deppclear.replit.app | head -120 || true

echo ""
echo "=== 13. PUBLIC JS ASSET ==="
PJS=$(curl -s https://deppclear.replit.app | grep -oE '/assets/[^"]+\.js' | head -1 || true)
echo "PJS=$PJS"
if [ -n "$PJS" ]; then
  curl -I "https://deppclear.replit.app$PJS" || true
fi

echo ""
echo "===================================="
echo " GOTOWE"
echo "===================================="
