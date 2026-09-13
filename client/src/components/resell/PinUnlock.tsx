/**
 * 🔑 Odblokowanie PIN-em aplikacji.
 * Strony chronione PIN-em (bot, Gadacz, Filmiki) dostają z serwera 401, dopóki
 * przeglądarka nie zna PIN-u. Bot ma własny ekran blokady, ale pozostałe strony
 * pokazywały sam błąd BEZ pola do wpisania — nowe urządzenie nie miało jak
 * podać kodu. Ten baner to naprawia: wpisany PIN zapisuje się na urządzeniu
 * (localStorage), installPinFetch dokleja go do każdego zapytania, a strona
 * ponawia przerwaną akcję przez onUnlocked.
 */
import { useState } from "react";
import { setBotPin } from "@/lib/botPin";
import * as palette from "@/design/palette";

export function PinUnlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const submit = () => {
    const p = pin.trim();
    if (!p) return;
    setBotPin(p);
    setPin("");
    onUnlocked();
  };
  return (
    <div style={{ background: palette.violetInk.high, border: `2px solid ${palette.info.indigo}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ color: palette.info.indigoSoft, fontSize: 15, fontWeight: 700 }}>
        🔑 Aplikacja jest zamknięta PIN-em. Wpisz go raz — to urządzenie zapamięta.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password" inputMode="numeric" autoComplete="off" value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="PIN"
          style={{ flex: 1, minWidth: 0, background: palette.steel.ink, border: `1px solid ${palette.steel.line}`, borderRadius: 10, color: palette.ink.white, padding: "12px 14px", fontSize: 18, letterSpacing: 4 }}
        />
        <button
          onClick={submit}
          style={{ background: palette.ai.deeper, color: palette.ink.white, border: "none", borderRadius: 10, padding: "12px 18px", fontSize: 16, fontWeight: 800, cursor: "pointer" }}
        >
          ODBLOKUJ
        </button>
      </div>
    </div>
  );
}
