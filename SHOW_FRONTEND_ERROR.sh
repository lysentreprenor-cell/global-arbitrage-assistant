#!/usr/bin/env bash
set -Eeuo pipefail

echo "=== SZUKAM index.html ==="
INDEX="client/index.html"

if [ ! -f "$INDEX" ]; then
  INDEX=$(find . -maxdepth 4 -name index.html -not -path "./dist/*" -not -path "./node_modules/*" | head -1)
fi

if [ -z "$INDEX" ] || [ ! -f "$INDEX" ]; then
  echo "❌ Nie znaleziono index.html"
  exit 1
fi

echo "Używam: $INDEX"
cp "$INDEX" "$INDEX.backup-error-overlay-$(date +%Y%m%d-%H%M%S)"

echo "=== DODAJĘ WIDOCZNY ERROR OVERLAY ==="

node <<'NODE'
const fs = require("fs");

let index = "client/index.html";
if (!fs.existsSync(index)) {
  const { execSync } = require("child_process");
  index = execSync(`find . -maxdepth 4 -name index.html -not -path "./dist/*" -not -path "./node_modules/*" | head -1`).toString().trim();
}

let html = fs.readFileSync(index, "utf8");

const marker = "FRONTEND_ERROR_OVERLAY_DIAGNOSTIC";

const script = `
<script id="${marker}">
(function () {
  function showError(title, detail) {
    var box = document.getElementById("__frontend_error_box");
    if (!box) {
      box = document.createElement("pre");
      box.id = "__frontend_error_box";
      box.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:999999",
        "background:#120000",
        "color:#ffdddd",
        "padding:18px",
        "font:14px/1.45 monospace",
        "white-space:pre-wrap",
        "overflow:auto"
      ].join(";");
      document.documentElement.appendChild(box);
    }
    box.textContent =
      "FRONTEND ERROR - CZARNY EKRAN NAMIERZONY\\n\\n" +
      title + "\\n\\n" +
      String(detail || "");
  }

  window.addEventListener("error", function (event) {
    showError(
      event.message || "window error",
      (event.filename || "") + ":" + (event.lineno || "") + ":" + (event.colno || "") +
      "\\n\\n" +
      (event.error && event.error.stack ? event.error.stack : "")
    );
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    showError(
      "Unhandled promise rejection",
      reason && reason.stack ? reason.stack : JSON.stringify(reason, null, 2)
    );
  });
})();
</script>
`;

if (html.includes(marker)) {
  console.log("Overlay już istnieje.");
} else {
  html = html.replace("</head>", script + "\n</head>");
  fs.writeFileSync(index, html, "utf8");
  console.log("✅ Dodano overlay do " + index);
}
NODE

echo ""
echo "=== BUILD ==="
npm run build

echo ""
echo "=== START LOCAL PROD ==="
pkill -f "tsx server/index.ts|vite|node dist/index.cjs|node dist/index.js|npm run dev|npm start" 2>/dev/null || true
npm start > overlay-prod.log 2>&1 &
sleep 8

echo ""
echo "=== TEST LOCAL ==="
curl -i http://localhost:5000/ | head -40

echo ""
echo "✅ GOTOWE"
echo "Teraz kliknij Republish w Replit."
echo "Po publikacji otwórz https://deppclear.replit.app"
echo "Jeśli dalej był czarny ekran, teraz powinien pokazać konkretny błąd."
