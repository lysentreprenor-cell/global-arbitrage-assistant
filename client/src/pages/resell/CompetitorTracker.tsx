import React, { useState } from "react";
import { Crosshair, Plus, Trash2, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getEbayKeys } from "@/lib/apiKeys";

// ── Types ─────────────────────────────────────────────────────────────────────

type TrackedItem = {
  id: string;
  name: string;
  query: string;
  myPrice: number;
  marketplace: string;
  lastCheckedAt?: number;
  lowestFound?: number;
  avgFound?: number;
  countFound?: number;
  belowMyPrice?: boolean;
  addedAt: number;
};

// ── localStorage helpers ──────────────────────────────────────────────────────

const COMPETITORS_KEY = "resell_competitors";

function loadTracked(): TrackedItem[] {
  try {
    const saved = localStorage.getItem(COMPETITORS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveTracked(items: TrackedItem[]): void {
  localStorage.setItem(COMPETITORS_KEY, JSON.stringify(items));
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MARKETPLACES = [
  { id: "EBAY_US", label: "eBay USA" },
  { id: "EBAY_DE", label: "eBay DE" },
  { id: "EBAY_GB", label: "eBay UK" },
];

const inp: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13,
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: "50%",
      border: "2px solid rgba(255,255,255,0.15)",
      borderTopColor: "#f87171",
      animation: "spin 0.8s linear infinite",
      flexShrink: 0,
    }} />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CompetitorTracker() {
  const [items, setItems] = useState<TrackedItem[]>(loadTracked);
  const [showForm, setShowForm] = useState(false);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [checkingAll, setCheckingAll] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formQuery, setFormQuery] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formMarket, setFormMarket] = useState("EBAY_US");

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Check single item ─────────────────────────────────────────────────────

  const checkItem = async (item: TrackedItem): Promise<TrackedItem[]> => {
    const ebay = getEbayKeys();
    if (!ebay.appId || !ebay.certId) {
      showToast("Brak kluczy eBay API — ustaw w Ustawieniach.", "err");
      return loadTracked();
    }

    setChecking(prev => new Set(prev).add(item.id));

    let updated = loadTracked();

    try {
      const [alertRes, soldRes] = await Promise.allSettled([
        fetch("/api/resell/check-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: item.query,
            marketplace: item.marketplace,
            targetPrice: 999999,
            ebayAppId: ebay.appId,
            ebayCertId: ebay.certId,
          }),
        }).then(r => r.json()),
        fetch("/api/resell/sold-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: item.query,
            ebayAppId: ebay.appId,
            ebayCertId: ebay.certId,
            marketplace: item.marketplace,
            limit: 10,
          }),
        }).then(r => r.json()),
      ]);

      const alertData = alertRes.status === "fulfilled" ? alertRes.value : null;
      const soldData = soldRes.status === "fulfilled" ? soldRes.value : null;

      const lowestFound: number | undefined = alertData?.cheapestPrice ?? undefined;
      const avgFound: number | undefined = soldData?.stats?.avg ?? undefined;
      const countFound: number | undefined = alertData?.found !== undefined ? (alertData.found ? 1 : 0) : undefined;
      const belowMyPrice = lowestFound !== undefined ? lowestFound < item.myPrice : false;

      const patch: Partial<TrackedItem> = {
        lastCheckedAt: Date.now(),
        lowestFound,
        avgFound,
        countFound,
        belowMyPrice,
      };

      updated = updated.map(i => i.id === item.id ? { ...i, ...patch } : i);
      saveTracked(updated);

      if (belowMyPrice && lowestFound !== undefined) {
        showToast(`⚠️ Rywal taniej! ${item.name} — $${lowestFound.toFixed(2)} vs Twoje $${item.myPrice}`, "err");
      } else {
        showToast(`Sprawdzono — ${item.name}: najtańszy $${lowestFound?.toFixed(2) ?? "brak"}`, "ok");
      }
    } catch {
      showToast("Błąd sprawdzania — spróbuj ponownie.", "err");
    }

    setChecking(prev => { const s = new Set(prev); s.delete(item.id); return s; });
    setItems(updated);
    return updated;
  };

  // ── Check all ─────────────────────────────────────────────────────────────

  const handleCheckAll = async () => {
    setCheckingAll(true);
    let current = loadTracked();
    for (const item of current) {
      current = await checkItem(item);
    }
    setCheckingAll(false);
  };

  // ── Add item ──────────────────────────────────────────────────────────────

  const handleAdd = () => {
    if (!formName.trim() || !formQuery.trim() || !formPrice) return;
    const newItem: TrackedItem = {
      id: crypto.randomUUID(),
      name: formName.trim(),
      query: formQuery.trim(),
      myPrice: parseFloat(formPrice),
      marketplace: formMarket,
      addedAt: Date.now(),
    };
    const updated = [newItem, ...loadTracked()];
    saveTracked(updated);
    setItems(updated);
    setFormName(""); setFormQuery(""); setFormPrice(""); setFormMarket("EBAY_US");
    setShowForm(false);
    showToast("Produkt dodany do śledzenia.");
  };

  // ── Remove item ───────────────────────────────────────────────────────────

  const handleRemove = (id: string) => {
    const updated = loadTracked().filter(i => i.id !== id);
    saveTracked(updated);
    setItems(updated);
  };

  // ── Alert count ───────────────────────────────────────────────────────────

  const alertCount = items.filter(i => i.belowMyPrice).length;

  // ── Relative time ─────────────────────────────────────────────────────────

  const relTime = (ts?: number): string => {
    if (!ts) return "Nie sprawdzono";
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return "przed chwilą";
    if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h temu`;
    return new Date(ts).toLocaleDateString("pl-PL");
  };

  const ebay = getEbayKeys();
  const hasKeys = !!(ebay.appId && ebay.certId);

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 80px", maxWidth: 860, margin: "0 auto" }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "linear-gradient(135deg,#f43f5e,#e11d48)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Crosshair size={20} color="#fff" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>Śledzenie Rywali</h1>
                {alertCount > 0 && (
                  <span style={{
                    background: "#f43f5e", color: "#fff", fontWeight: 800, fontSize: 11,
                    borderRadius: 99, padding: "2px 8px", lineHeight: 1.5,
                  }}>
                    {alertCount}
                  </span>
                )}
              </div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 2 }}>
                Monitoruj ceny konkurencji na eBay
                {alertCount > 0 && (
                  <span style={{ color: "#f87171", fontWeight: 700 }}> · {alertCount} rywal taniej!</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {items.length > 0 && (
              <button
                onClick={handleCheckAll}
                disabled={checkingAll}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "9px 14px",
                  borderRadius: 10, border: "1px solid rgba(248,113,113,0.3)",
                  background: "rgba(248,113,113,0.1)", color: "#f87171",
                  fontWeight: 700, fontSize: 12, cursor: checkingAll ? "not-allowed" : "pointer",
                  opacity: checkingAll ? 0.7 : 1,
                }}
              >
                <RefreshCw size={13} style={{ animation: checkingAll ? "spin 1s linear infinite" : "none" }} />
                Sprawdź wszystkie
              </button>
            )}
            <button
              onClick={() => setShowForm(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "9px 16px",
                borderRadius: 10, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg,#f43f5e,#e11d48)",
                color: "#fff", fontWeight: 700, fontSize: 13,
              }}
            >
              <Plus size={15} /> Dodaj produkt
            </button>
          </div>
        </div>

        {/* ── No eBay keys warning ─────────────────────────────────────────── */}
        {!hasKeys && (
          <div style={{
            background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: 12, padding: "12px 16px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
            <div style={{ color: "#fde68a", fontSize: 13 }}>
              Brak kluczy eBay API.{" "}
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                Przejdź do Ustawień i dodaj eBay App ID oraz Cert ID, żeby sprawdzać ceny.
              </span>
            </div>
          </div>
        )}

        {/* ── Add form ────────────────────────────────────────────────────── */}
        {showForm && (
          <div style={{
            background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.25)",
            borderRadius: 14, padding: 18, marginBottom: 20,
          }}>
            <div style={{ color: "#fda4af", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
              Nowy produkt do śledzenia
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>NAZWA *</div>
                <input
                  style={inp} value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="np. Zegarek Casio G-Shock"
                />
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>ZAPYTANIE EBAY *</div>
                <input
                  style={inp} value={formQuery}
                  onChange={e => setFormQuery(e.target.value)}
                  placeholder="casio g-shock dw5600"
                />
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>TWOJA CENA (USD) *</div>
                <input
                  style={inp} type="number" min="0" step="0.01" value={formPrice}
                  onChange={e => setFormPrice(e.target.value)}
                  placeholder="89.99"
                />
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>RYNEK</div>
                <select
                  value={formMarket}
                  onChange={e => setFormMarket(e.target.value)}
                  style={{ ...inp, appearance: "none" as any, cursor: "pointer" }}
                >
                  {MARKETPLACES.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleAdd}
                disabled={!formName.trim() || !formQuery.trim() || !formPrice}
                style={{
                  padding: "9px 20px", borderRadius: 9, border: "none",
                  background: formName.trim() && formQuery.trim() && formPrice
                    ? "linear-gradient(135deg,#f43f5e,#e11d48)"
                    : "rgba(255,255,255,0.08)",
                  color: "#fff", fontWeight: 700, fontSize: 13,
                  cursor: formName.trim() && formQuery.trim() && formPrice ? "pointer" : "not-allowed",
                  opacity: formName.trim() && formQuery.trim() && formPrice ? 1 : 0.5,
                }}
              >
                Dodaj
              </button>
              <button
                onClick={() => setShowForm(false)}
                style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}
              >
                Anuluj
              </button>
            </div>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {items.length === 0 && !showForm && (
          <div style={{ textAlign: "center", padding: "64px 0" }}>
            <Crosshair size={48} style={{ margin: "0 auto 16px", display: "block", opacity: 0.1, color: "#f43f5e" }} />
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Brak śledzonych produktów
            </div>
            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 13, maxWidth: 360, margin: "0 auto 24px" }}>
              Dodaj produkty do śledzenia, żeby monitorować ceny konkurencji na eBay
            </div>
            <button
              onClick={() => setShowForm(true)}
              style={{
                padding: "10px 22px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg,#f43f5e,#e11d48)",
                color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >
              <Plus size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
              Dodaj pierwszy produkt
            </button>
          </div>
        )}

        {/* ── Tracked items list ───────────────────────────────────────────── */}
        {items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map(item => {
              const isChecking = checking.has(item.id);
              const hasResult = item.lastCheckedAt !== undefined;
              const diff = item.lowestFound !== undefined
                ? (item.myPrice - item.lowestFound).toFixed(2)
                : null;
              const marketLabel = MARKETPLACES.find(m => m.id === item.marketplace)?.label ?? item.marketplace;

              return (
                <div
                  key={item.id}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: item.belowMyPrice
                      ? "1px solid rgba(244,63,94,0.35)"
                      : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14, padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {/* Info block */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Name + market */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>{item.name}</span>
                        <span style={{
                          padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                          background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)",
                        }}>
                          {marketLabel}
                        </span>
                      </div>

                      {/* Query */}
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginBottom: 8 }}>
                        zapytanie: <em>"{item.query}"</em>
                      </div>

                      {/* Price comparison */}
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                        {/* My price */}
                        <div style={{
                          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                          borderRadius: 8, padding: "6px 10px",
                        }}>
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700 }}>TWOJA CENA</div>
                          <div style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>${item.myPrice.toFixed(2)}</div>
                        </div>

                        {/* Competitor lowest */}
                        {hasResult && item.lowestFound !== undefined && (
                          <>
                            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 18 }}>vs</div>
                            <div style={{
                              background: item.belowMyPrice ? "rgba(244,63,94,0.1)" : "rgba(74,222,128,0.08)",
                              border: item.belowMyPrice ? "1px solid rgba(244,63,94,0.25)" : "1px solid rgba(74,222,128,0.2)",
                              borderRadius: 8, padding: "6px 10px",
                            }}>
                              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700 }}>RYWAL NAJTANIEJ</div>
                              <div style={{ color: item.belowMyPrice ? "#f87171" : "#4ade80", fontWeight: 900, fontSize: 16 }}>
                                ${item.lowestFound.toFixed(2)}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Avg price */}
                        {hasResult && item.avgFound !== undefined && (
                          <div style={{
                            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                            borderRadius: 8, padding: "6px 10px",
                          }}>
                            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700 }}>ŚR. SPRZEDANE</div>
                            <div style={{ color: "#a78bfa", fontWeight: 800, fontSize: 14 }}>${item.avgFound.toFixed(2)}</div>
                          </div>
                        )}
                      </div>

                      {/* Alert / status badge */}
                      {hasResult && (
                        <>
                          {item.belowMyPrice && diff !== null ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#f87171", fontSize: 13, fontWeight: 700 }}>
                              <AlertTriangle size={14} />
                              Rywal taniej o ${Math.abs(parseFloat(diff)).toFixed(2)} — rozważ obniżkę ceny
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#4ade80", fontSize: 12, fontWeight: 600 }}>
                              <CheckCircle size={13} />
                              Twoja cena konkurencyjna
                            </div>
                          )}
                        </>
                      )}

                      {/* Metadata row */}
                      <div style={{ marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>
                          Sprawdzono: {relTime(item.lastCheckedAt)}
                        </span>
                        {item.countFound !== undefined && (
                          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>
                            {item.countFound} ofert znalezionych
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, alignItems: "flex-end" }}>
                      <button
                        onClick={() => checkItem(item)}
                        disabled={isChecking || checkingAll}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "7px 13px", borderRadius: 8,
                          border: "1px solid rgba(244,63,94,0.3)", background: "rgba(244,63,94,0.1)",
                          color: "#f87171", fontSize: 11, fontWeight: 700,
                          cursor: isChecking || checkingAll ? "not-allowed" : "pointer",
                          opacity: isChecking || checkingAll ? 0.6 : 1, whiteSpace: "nowrap",
                        }}
                      >
                        {isChecking ? <><Spinner /> Sprawdzam…</> : <><RefreshCw size={11} /> Sprawdź teraz</>}
                      </button>
                      <button
                        onClick={() => handleRemove(item.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(248,113,113,0.3)", padding: 4 }}
                        title="Usuń"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── How it works ────────────────────────────────────────────────── */}
        {items.length > 0 && (
          <div style={{
            marginTop: 32, padding: "14px 16px",
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
          }}>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>
              JAK TO DZIAŁA
            </div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, lineHeight: 1.6 }}>
              Kliknij "Sprawdź teraz" przy produkcie lub "Sprawdź wszystkie" aby pobrać aktualne ceny z eBay.
              Gdy rywal sprzedaje taniej niż Twoja cena — pojawia się alert. Regularnie sprawdzaj przed ustalaniem cen.
            </div>
          </div>
        )}
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: toast.type === "err" ? "rgba(244,63,94,0.95)" : "rgba(34,197,94,0.92)",
          borderRadius: 12, padding: "10px 18px",
          color: "#fff", fontWeight: 700, fontSize: 13,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          maxWidth: 340,
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,0.2) !important; }
        select option { background: #001a0a; color: #fff; }
        input:focus, select:focus { border-color: rgba(244,63,94,0.4) !important; }
      `}</style>
    </ResellLayout>
  );
}
