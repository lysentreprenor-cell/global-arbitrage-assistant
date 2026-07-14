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
    <div style={{ background: "#1e1b4b", border: "2px solid #818cf8", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ color: "#c7d2fe", fontSize: 15, fontWeight: 700 }}>
        🔑 Aplikacja jest zamknięta PIN-em. Wpisz go raz — to urządzenie zapamięta.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password" inputMode="numeric" autoComplete="off" value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="PIN"
          style={{ flex: 1, minWidth: 0, background: "#0f172a", border: "1px solid #475569", borderRadius: 10, color: "#fff", padding: "12px 14px", fontSize: 18, letterSpacing: 4 }}
        />
        <button
          onClick={submit}
          style={{ background: "#6d28d9", color: "#fff", border: "none", borderRadius: 10, padding: "12px 18px", fontSize: 16, fontWeight: 800, cursor: "pointer" }}
        >
          ODBLOKUJ
        </button>
      </div>
    </div>
  );
}
