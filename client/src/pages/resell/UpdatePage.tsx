/**
 * 🔄 AKTUALIZACJA — narzędzie do odświeżania aplikacji i pobierania nowych APK.
 *
 * Trzy rzeczy w jednym miejscu:
 *  1. „Odśwież teraz" — przeładowuje stronę/aplikację, żeby wciągnąć najnowszą
 *     wersję serwisu (po tym jak zrobisz Stop/Run na Replit).
 *  2. Pobierz najnowszy APK ResellAssist (aplikacja-opakowanie strony).
 *  3. Pobierz najnowszy APK Gadacz (asystent dla niewidomych, praca w tle).
 *
 * APK-i budują się same na GitHubie i leżą jako Release — te przyciski prowadzą
 * wprost do pliku do zainstalowania na telefonie.
 */
import { useState } from "react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import * as palette from "@/design/palette";

const REPO = "lysentreprenor-cell/global-arbitrage-assistant";
const RESELL_APK = `https://github.com/${REPO}/releases/download/resell-latest/ResellAssist.apk`;
const GADACZ_APK = `https://github.com/${REPO}/releases/download/gadacz-latest/Gadacz.apk`;

export default function UpdatePage() {
  const [checking, setChecking] = useState(false);
  const [webInfo, setWebInfo] = useState<string | null>(null);

  // Odśwież = twarde przeładowanie (omija pamięć podręczną). W aplikacji APK to
  // wciąga świeżo zbudowaną stronę z serwera; w przeglądarce działa tak samo.
  const refreshNow = () => {
    setChecking(true);
    // mały odstęp, żeby użytkownik zobaczył kliknięcie, potem pełny reload
    setTimeout(() => { window.location.reload(); }, 300);
  };

  // Sprawdź, czy serwer odpowiada świeżą wersją (best-effort — pokaż znacznik build).
  const checkServer = async () => {
    setChecking(true);
    setWebInfo(null);
    try {
      const r = await fetch("/api/bot/status", { cache: "no-store" });
      setWebInfo(r.ok ? "Serwer odpowiada — możesz odświeżyć, żeby wciągnąć najnowszą wersję." : "Serwer nie odpowiada. Zrób Stop i Run na Replit.");
    } catch {
      setWebInfo("Brak połączenia z serwerem. Sprawdź, czy Replit jest włączony (Run).");
    } finally {
      setChecking(false);
    }
  };

  const box: React.CSSProperties = { border: `3px solid ${palette.info.deep}`, borderRadius: 16, background: palette.sectionAccent.blue.ink, padding: 16, marginBottom: 12 };
  const h: React.CSSProperties = { color: palette.info.soft, fontSize: 18, fontWeight: 900, marginBottom: 8 };
  const btn = (bg: string): React.CSSProperties => ({ display: "block", width: "100%", boxSizing: "border-box", minHeight: 60, borderRadius: 12, border: "none", background: bg, color: palette.ink.white, fontSize: 17, fontWeight: 800, textAlign: "center", textDecoration: "none", padding: "18px 16px" });

  return (
    <ResellLayout>
      <div style={{ background: palette.ink.black, minHeight: "calc(100vh - 60px)", padding: 12 }}>

        <div style={{ color: palette.info.soft, fontSize: 14, lineHeight: 1.5, background: palette.sectionAccent.blue.ink, border: `2px solid ${palette.sectionAccent.blue.deep}`, borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
          <b>🔄 Aktualizacja.</b> Tu odświeżysz aplikację po zmianach i pobierzesz najnowsze wersje aplikacji na telefon.
        </div>

        {/* 1. Odśwież stronę/aplikację */}
        <div style={box}>
          <div style={h}>♻️ Odśwież aplikację</div>
          <div style={{ color: palette.sectionAccent.blue.soft, fontSize: 14, marginBottom: 12 }}>
            Po zrobieniu <b>Stop i Run</b> na Replit dotknij tego przycisku, żeby wciągnąć najnowszą wersję strony.
          </div>
          <button onClick={checkServer} disabled={checking} style={{ ...btn(palette.sectionAccent.blue.base), marginBottom: 8 }}>
            🔎 Sprawdź serwer
          </button>
          {webInfo && <div style={{ color: palette.sectionAccent.blue.wash, fontSize: 14, background: palette.sectionAccent.blue.inkDeep, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>{webInfo}</div>}
          <button onClick={refreshNow} style={btn(palette.profit.deep)}>
            ♻️ ODŚWIEŻ TERAZ
          </button>
        </div>

        {/* 2. APK ResellAssist */}
        <div style={box}>
          <div style={h}>📱 Aplikacja ResellAssist (najnowsza)</div>
          <div style={{ color: palette.sectionAccent.blue.soft, fontSize: 14, marginBottom: 12 }}>
            Cała ta aplikacja jako ikona na telefonie: Filmiki, Reklama, Gadacz, bot. Pobierz i zainstaluj — nowsza wersja
            wgra się „na wierzch" starej (nic nie tracisz). Przy pierwszym uruchomieniu wklejasz adres swojej strony.
          </div>
          <a href={RESELL_APK} style={btn(palette.info.deep)}>⬇️ POBIERZ ResellAssist.apk</a>
        </div>

        {/* 3. APK Gadacz */}
        <div style={box}>
          <div style={h}>🗣️ Aplikacja Gadacz (najnowsza)</div>
          <div style={{ color: palette.sectionAccent.blue.soft, fontSize: 14, marginBottom: 12 }}>
            Asystent dla osób niewidomych, działa w tle nad każdą aplikacją (sterowanie ekranem, mowa, aparat-oczy).
            Pobierz i zainstaluj na telefonie osoby, która ma z niego korzystać.
          </div>
          <a href={GADACZ_APK} style={btn(palette.ai.deep)}>⬇️ POBIERZ Gadacz.apk</a>
        </div>

        <div style={{ color: palette.steel.mid, fontSize: 13, lineHeight: 1.5, padding: "4px 6px 20px" }}>
          Jeśli telefon zapyta o „instalowanie z nieznanych źródeł" — zezwól tej przeglądarce/aplikacji.
          Po pobraniu otwórz plik z folderu <b>Pobrane</b>, żeby zainstalować.
        </div>
      </div>
    </ResellLayout>
  );
}
