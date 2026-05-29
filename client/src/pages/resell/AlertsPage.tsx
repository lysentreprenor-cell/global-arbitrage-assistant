import { useState, useEffect } from "react";
import { Bell, Plus, Trash2, RefreshCw, CheckCircle, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getEbayKeys } from "@/lib/apiKeys";
import {
  loadAlerts, addAlert, updateAlert, removeAlert,
  type PriceAlert,
} from "@/lib/priceAlerts";

const MARKETPLACES = [
  { id: "EBAY_DE", label: "eBay DE" },
  { id: "EBAY_US", label: "eBay USA" },
  { id: "EBAY_GB", label: "eBay UK" },
  { id: "EBAY_FR", label: "eBay FR" },
];

const MARKETPLACE_CURRENCY: Record<string, string> = {
  EBAY_US: "USD", EBAY_GB: "GBP", EBAY_DE: "EUR", EBAY_FR: "EUR",
};

const FX_PAIRS = [
  { code: "EUR", flag: "🇪🇺", name: "Euro" },
  { code: "GBP", flag: "🇬🇧", name: "Funt brytyjski" },
  { code: "PLN", flag: "🇵🇱", name: "Złoty polski" },
  { code: "JPY", flag: "🇯🇵", name: "Jen japoński" },
  { code: "CZK", flag: "🇨🇿", name: "Korona czeska" },
  { code: "SEK", flag: "🇸🇪", name: "Korona szwedzka" },
  { code: "CHF", flag: "🇨🇭", name: "Frank szwajcarski" },
  { code: "CNY", flag: "🇨🇳", name: "Juan chiński" },
];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>(loadAlerts);
  const [checking, setChecking] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [marketplace, setMarketplace] = useState("EBAY_DE");
  const [targetPrice, setTargetPrice] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [fxFetchedAt, setFxFetchedAt] = useState<number>(0);
  const [fxLoading, setFxLoading] = useState(false);

  useEffect(() => {
    fetchFx();
  }, []);

  const fetchFx = async () => {
    setFxLoading(true);
    try {
      const r = await fetch("/api/resell/fx-rates");
      const data = await r.json();
      setFxRates(data.rates ?? {});
      setFxFetchedAt(data.fetchedAt ?? Date.now());
    } catch {}
    setFxLoading(false);
  };

  useEffect(() => {
    const reload = () => setAlerts(loadAlerts());
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const handleAdd = () => {
    if (!query.trim() || !targetPrice) return;
    const updated = addAlert({
      name: name.trim() || query.trim(),
      query: query.trim(),
      marketplace,
      targetPrice: parseFloat(targetPrice),
    });
    setAlerts(updated);
    setName(""); setQuery(""); setTargetPrice(""); setShowForm(false);
    showToast("Alert dodany!");
  };

  const checkAlert = async (alert: PriceAlert) => {
    const ebay = getEbayKeys();
    if (!ebay.appId || !ebay.certId) {
      showToast("Brak kluczy eBay API — ustaw w Ustawieniach.");
      return;
    }
    setChecking(alert.id);
    try {
      const r = await fetch("/api/resell/check-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: alert.query,
          marketplace: alert.marketplace,
          targetPrice: alert.targetPrice,
          ebayAppId: ebay.appId,
          ebayCertId: ebay.certId,
        }),
      });
      const data = await r.json();
      const patch: Partial<PriceAlert> = {
        lastCheckedAt: Date.now(),
        lastFoundPrice: data.cheapestPrice ?? undefined,
        foundUrl: data.cheapestUrl ?? undefined,
        foundTitle: data.cheapestTitle ?? undefined,
      };
      if (data.found) {
        patch.triggered = true;
        patch.triggeredAt = Date.now();
        showToast(`Alert! ${alert.name} za $${data.cheapestPrice}`);
      } else {
        patch.triggered = false;
        showToast(`Sprawdzono — cena: $${data.cheapestPrice ?? "brak"}. Cel: $${alert.targetPrice}`);
      }
      const updated = updateAlert(alert.id, patch);
      setAlerts(updated);
    } catch {
      showToast("Błąd sprawdzania alertu.");
    }
    setChecking(null);
  };

  const checkAll = async () => {
    for (const a of alerts) await checkAlert(a);
  };

  const dismiss = (id: string) => {
    const updated = updateAlert(id, { triggered: false });
    setAlerts(updated);
  };

  const triggered = alerts.filter(a => a.triggered);
  const pending = alerts.filter(a => !a.triggered);

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 80px", maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#d97706)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bell size={18} color="#fff" />
            </div>
            <div>
              <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 900, margin: 0 }}>Alerty cenowe</h1>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                {alerts.length} aktywnych alertów
                {triggered.length > 0 && <span style={{ color: "#f59e0b", fontWeight: 700 }}> · {triggered.length} wyzwolonych</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {alerts.length > 0 && (
              <button onClick={checkAll} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.1)", color: "#a78bfa", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                <RefreshCw size={13} /> Sprawdź wszystkie
              </button>
            )}
            <button onClick={() => setShowForm(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              <Plus size={14} /> Nowy alert
            </button>
          </div>
        </div>

        {/* Add form */}
        {showForm && (
          <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ color: "#fde68a", fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Nowy alert — powiadom gdy cena spadnie poniżej progu</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>NAZWA (opcjonalna)</div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="np. Zegarek Omega" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>ZAPYTANIE eBay *</div>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="omega seamaster vintage" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>RYNEK</div>
                <select value={marketplace} onChange={e => setMarketplace(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" }}>
                  {MARKETPLACES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>CENA DOCELOWA ({MARKETPLACE_CURRENCY[marketplace] ?? "USD"}) *</div>
                <input type="number" min="0" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="85" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAdd} disabled={!query.trim() || !targetPrice} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: query.trim() && targetPrice ? "pointer" : "not-allowed", opacity: query.trim() && targetPrice ? 1 : 0.5 }}>
                Dodaj alert
              </button>
              <button onClick={() => setShowForm(false)} style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}>Anuluj</button>
            </div>
          </div>
        )}

        {/* Triggered alerts */}
        {triggered.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, marginBottom: 10 }}>WYZWOLONE ALERTY</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {triggered.map(a => (
                <div key={a.id} style={{ background: "rgba(245,158,11,0.09)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <CheckCircle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fde68a", fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>
                      "{a.query}" · {MARKETPLACES.find(m => m.id === a.marketplace)?.label}
                    </div>
                    {a.foundTitle && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>"{a.foundTitle.slice(0, 60)}"</div>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: "#4ade80", fontWeight: 900, fontSize: 18 }}>${a.lastFoundPrice}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>cel: ${a.targetPrice}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {a.foundUrl && (
                      <a href={a.foundUrl} target="_blank" rel="noopener noreferrer" style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                        KUP →
                      </a>
                    )}
                    <button onClick={() => dismiss(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.25)", padding: 4 }} title="Odznacz">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending alerts */}
        {pending.length > 0 ? (
          <div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, marginBottom: 10 }}>AKTYWNE ALERTY</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pending.map(a => {
                const isChecking = checking === a.id;
                return (
                  <div key={a.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <Bell size={16} color="rgba(245,158,11,0.5)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>
                        "{a.query}" · {MARKETPLACES.find(m => m.id === a.marketplace)?.label} · cel: <span style={{ color: "#f5c842" }}>${a.targetPrice}</span>
                      </div>
                      {a.lastCheckedAt && (
                        <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 2 }}>
                          Sprawdzono: {new Date(a.lastCheckedAt).toLocaleTimeString("pl-PL")}
                          {a.lastFoundPrice != null && <span> · najtańsza: <span style={{ color: a.lastFoundPrice <= a.targetPrice ? "#4ade80" : "#f87171" }}>${a.lastFoundPrice}</span></span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => checkAlert(a)}
                        disabled={isChecking}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.1)", color: "#a78bfa", fontSize: 11, fontWeight: 700, cursor: isChecking ? "not-allowed" : "pointer", opacity: isChecking ? 0.6 : 1 }}>
                        <RefreshCw size={11} style={{ animation: isChecking ? "spin 1s linear infinite" : "none" }} />
                        {isChecking ? "..." : "Sprawdź"}
                      </button>
                      <button onClick={() => { const u = removeAlert(a.id); setAlerts(u); }} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(248,113,113,0.4)", padding: 4 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : alerts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <Bell size={40} style={{ margin: "0 auto 12px", display: "block", opacity: 0.15 }} />
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Brak alertów</div>
            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, marginBottom: 20 }}>Dodaj alert żeby być powiadamianym gdy cena spadnie poniżej progu</div>
            <button onClick={() => setShowForm(true)} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <Plus size={13} style={{ verticalAlign: "middle", marginRight: 6 }} /> Dodaj pierwszy alert
            </button>
          </div>
        ) : null}

        {/* How it works */}
        <div style={{ marginTop: 32, padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>JAK TO DZIAŁA</div>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, lineHeight: 1.6 }}>
            Kliknij "Sprawdź" przy alercie aby sprawdzić aktualną najtańszą cenę na eBay. Gdy cena jest niższa od Twojego progu — alert wyzwala się i pokazuje bezpośredni link do aukcji. Sprawdź "Wszystkie" jednym kliknięciem przed każdym zakupem.
          </div>
        </div>

        {/* FX Rates section */}
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#06b6d4,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <TrendingUp size={15} color="#fff" />
              </div>
              <div>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>Kursy walut (USD base)</div>
                {fxFetchedAt > 0 && (
                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>
                    Aktualizacja: {new Date(fxFetchedAt).toLocaleTimeString("pl-PL")}
                  </div>
                )}
              </div>
            </div>
            <button onClick={fetchFx} disabled={fxLoading} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(6,182,212,0.3)", background: "rgba(6,182,212,0.08)", color: "#67e8f9", fontSize: 11, fontWeight: 700, cursor: fxLoading ? "not-allowed" : "pointer", opacity: fxLoading ? 0.6 : 1 }}>
              <RefreshCw size={11} style={{ animation: fxLoading ? "spin 1s linear infinite" : "none" }} />
              Odśwież
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {FX_PAIRS.map(({ code, flag, name: cname }) => {
              const rate = fxRates[code];
              const prev = code === "EUR" ? 0.92 : code === "GBP" ? 0.79 : code === "PLN" ? 4.0 : code === "JPY" ? 150 : undefined;
              const diff = rate && prev ? ((rate - prev) / prev) * 100 : 0;
              return (
                <div key={code} style={{ background: "rgba(6,182,212,0.05)", border: "1px solid rgba(6,182,212,0.15)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{flag}</span>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700 }}>{code}</span>
                  </div>
                  <div style={{ color: "#fff", fontWeight: 800, fontSize: 17 }}>
                    {rate ? rate.toFixed(code === "JPY" || code === "CZK" || code === "SEK" ? 1 : 4) : "—"}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>{cname}</div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 10, color: "rgba(255,255,255,0.2)", fontSize: 10, textAlign: "right" }}>
            Kursy z open.er-api.com · odświeżane co godzinę
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: "rgba(245,158,11,0.95)", borderRadius: 12, padding: "10px 18px", color: "#1a0a00", fontWeight: 700, fontSize: 13, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.2); }
        select option { background: #0d1117; color: #fff; }
      `}</style>
    </ResellLayout>
  );
}
