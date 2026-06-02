import React, { useState, useEffect } from "react";
import { Flame, RefreshCw, AlertCircle, BookmarkPlus, Check } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getEbayKeys } from "@/lib/apiKeys";
import { addToPipeline } from "@/lib/pipeline";

// ── Category map ─────────────────────────────────────────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  Electronics: "293",
  Telefony: "15032",
  Odzież: "11450",
  Zegarki: "14324",
  Sneakers: "63889",
  Biżuteria: "281",
  Aparaty: "625",
  Gry: "1249",
  Muzyka: "619",
  Antyki: "20081",
  Kolekcje: "1",
};

const CATEGORIES = Object.keys(CATEGORY_MAP);

type Marketplace = "EBAY_US" | "EBAY_DE" | "EBAY_GB";

const MARKETPLACE_OPTIONS: { label: string; value: Marketplace }[] = [
  { label: "eBay USA", value: "EBAY_US" },
  { label: "eBay DE",  value: "EBAY_DE" },
  { label: "eBay UK",  value: "EBAY_GB" },
];

type TrendItem = {
  title: string;
  price: number;
  currency: string;
  imageUrl: string;
  url: string;
  watchCount: number;
  bidCount: number;
  condition: string;
  daysLeft: number;
  sellerId: string;
};

type TrendsResponse = {
  items: TrendItem[];
  source: string;
};

// ── Currency symbol helper ────────────────────────────────────────────────────
function currencySymbol(code: string): string {
  const map: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
  return map[code] ?? code;
}

export default function TrendsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("Electronics");
  const [marketplace, setMarketplace] = useState<Marketplace>("EBAY_US");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TrendItem[]>([]);
  const [fetched, setFetched] = useState(false);
  const [addedIdx, setAddedIdx] = useState<Set<number>>(new Set());

  const ebayKeys = getEbayKeys();

  const handleAddToPipeline = (item: TrendItem, idx: number) => {
    const marketFlag = marketplace === "EBAY_US" ? "🇺🇸" : marketplace === "EBAY_DE" ? "🇩🇪" : "🇬🇧";
    const marketName = marketplace === "EBAY_US" ? "USA" : marketplace === "EBAY_DE" ? "Germany" : "UK";
    const estimatedSell = Math.round(item.price * 1.45);
    const estimatedProfit = Math.round(item.price * 0.45);
    const netProfit = Math.round(estimatedProfit * 0.65); // ~35% for fees/shipping
    addToPipeline({
      id: Date.now() + idx,
      name: item.title.slice(0, 80),
      buy: item.price,
      sell: estimatedSell,
      profit: estimatedProfit,
      netProfit,
      margin: Math.round((netProfit / estimatedSell) * 100),
      market: marketName,
      category: selectedCategory,
      score: Math.min(96, 55 + Math.min(40, Math.round(item.watchCount / 5))),
      flag: marketFlag,
      imageUrl: item.imageUrl,
      sourceUrl: item.url,
      tip: `Trendy eBay · ${item.watchCount} obserwujących · ${item.condition || ""}`.trim(),
    });
    setAddedIdx(prev => new Set([...prev, idx]));
  };
  const hasKeys = !!(ebayKeys.appId && ebayKeys.certId);

  const fetchTrends = async (category: string, market: Marketplace) => {
    if (!hasKeys) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/resell/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: CATEGORY_MAP[category] ?? "293",
          ebayAppId: ebayKeys.appId,
          ebayCertId: ebayKeys.certId,
          marketplace: market,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TrendsResponse = await res.json();
      setItems(data.items ?? []);
      setFetched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Błąd pobierania danych");
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on mount if keys are available
  useEffect(() => {
    if (hasKeys) {
      fetchTrends(selectedCategory, marketplace);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    if (hasKeys) fetchTrends(cat, marketplace);
  };

  const handleMarketplaceChange = (m: Marketplace) => {
    setMarketplace(m);
    if (hasKeys) fetchTrends(selectedCategory, m);
  };

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              background: "linear-gradient(135deg, #f97316, #f59e0b)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(249,115,22,0.35)",
            }}>
              <Flame size={22} color="#fff" />
            </div>
            <div>
              <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>
                Trendy Rynkowe
              </h1>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0, marginTop: 2 }}>
                Najpopularniejsze produkty według liczby obserwujących
              </p>
            </div>
          </div>

          {hasKeys && (
            <button
              onClick={() => fetchTrends(selectedCategory, marketplace)}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "10px 18px", borderRadius: 10, cursor: loading ? "not-allowed" : "pointer",
                background: loading ? "rgba(249,115,22,0.12)" : "linear-gradient(135deg, rgba(249,115,22,0.25), rgba(245,158,11,0.15))",
                border: `1px solid ${loading ? "rgba(249,115,22,0.3)" : "rgba(249,115,22,0.4)"}`,
                color: loading ? "#fed7aa" : "#fb923c", fontWeight: 700, fontSize: 13,
                opacity: loading ? 0.8 : 1,
              }}
            >
              <RefreshCw
                size={14}
                style={{ animation: loading ? "spin 1s linear infinite" : "none" }}
              />
              Pobierz trendy
            </button>
          )}
        </div>

        {/* ── No keys warning ── */}
        {!hasKeys && (
          <div style={{
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 12, padding: "14px 18px", marginBottom: 24,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <AlertCircle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
            <span style={{ color: "#fde68a", fontSize: 13 }}>
              Dodaj klucz eBay App ID w ⚙ API żeby pobrać trendy
            </span>
          </div>
        )}

        {/* ── Marketplace selector ── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
            MARKETPLACE
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {MARKETPLACE_OPTIONS.map(opt => (
              <label
                key={opt.value}
                style={{
                  display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                  padding: "6px 14px", borderRadius: 99,
                  background: marketplace === opt.value ? "rgba(249,115,22,0.18)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${marketplace === opt.value ? "rgba(249,115,22,0.45)" : "rgba(255,255,255,0.1)"}`,
                  color: marketplace === opt.value ? "#fb923c" : "rgba(255,255,255,0.45)",
                  fontSize: 12, fontWeight: 700, userSelect: "none",
                }}
              >
                <input
                  type="radio"
                  name="marketplace"
                  value={opt.value}
                  checked={marketplace === opt.value}
                  onChange={() => handleMarketplaceChange(opt.value)}
                  style={{ accentColor: "#fb923c", width: 12, height: 12 }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* ── Category chips ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
            KATEGORIA
          </div>
          <div style={{
            display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4,
            scrollbarWidth: "none",
          }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                style={{
                  padding: "7px 14px", borderRadius: 99, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
                  background: selectedCategory === cat
                    ? "linear-gradient(135deg, rgba(245,158,11,0.35), rgba(249,115,22,0.25))"
                    : "rgba(255,255,255,0.06)",
                  color: selectedCategory === cat ? "#fbbf24" : "rgba(255,255,255,0.45)",
                  outline: selectedCategory === cat ? "1px solid rgba(245,158,11,0.45)" : "none",
                  boxShadow: selectedCategory === cat ? "0 2px 10px rgba(245,158,11,0.2)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* ── Loading state ── */}
        {loading && (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{
              width: 36, height: 36, margin: "0 auto 16px",
              border: "3px solid rgba(249,115,22,0.15)",
              borderTopColor: "#f97316",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }} />
            <div style={{ color: "#fb923c", fontSize: 14, fontWeight: 700 }}>
              Pobieranie danych z eBay…
            </div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 6 }}>
              Szukamy najgorętszych produktów w kategorii {selectedCategory}
            </div>
          </div>
        )}

        {/* ── Error state ── */}
        {error && !loading && (
          <div style={{
            background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
            borderRadius: 10, padding: "12px 16px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <AlertCircle size={15} color="#f87171" style={{ flexShrink: 0 }} />
            <span style={{ color: "#fca5a5", fontSize: 13 }}>{error}</span>
          </div>
        )}

        {/* ── Items grid ── */}
        {!loading && items.length > 0 && (
          <>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginBottom: 12 }}>
              {items.length} wyników · {selectedCategory} · {MARKETPLACE_OPTIONS.find(m => m.value === marketplace)?.label}
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}>
              {items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14, overflow: "hidden",
                    display: "flex", flexDirection: "column",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.border = "1px solid rgba(249,115,22,0.3)";
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.border = "1px solid rgba(255,255,255,0.08)";
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                  }}
                >
                  {/* Image */}
                  <div style={{ position: "relative", height: 160, background: "rgba(0,0,0,0.3)", flexShrink: 0 }}>
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        style={{
                          width: "100%", height: "100%", objectFit: "cover",
                          borderRadius: "10px 10px 0 0", display: "block",
                        }}
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div style={{
                        width: "100%", height: "100%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 40, color: "rgba(255,255,255,0.15)",
                      }}>
                        📦
                      </div>
                    )}

                    {/* Watch count badge */}
                    {item.watchCount > 0 && (
                      <div style={{
                        position: "absolute", top: 8, left: 8,
                        background: "linear-gradient(135deg, rgba(245,158,11,0.95), rgba(249,115,22,0.9))",
                        borderRadius: 8, padding: "3px 9px",
                        fontSize: 11, fontWeight: 800, color: "#fff",
                        display: "flex", alignItems: "center", gap: 4,
                        boxShadow: "0 2px 8px rgba(245,158,11,0.4)",
                      }}>
                        🔥 {item.watchCount.toLocaleString()} obserwujących
                      </div>
                    )}

                    {/* Condition badge */}
                    {item.condition && (
                      <div style={{
                        position: "absolute", bottom: 8, right: 8,
                        background: "rgba(0,0,0,0.75)",
                        borderRadius: 6, padding: "2px 8px",
                        fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.7)",
                        backdropFilter: "blur(4px)",
                      }}>
                        {item.condition}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* Title */}
                    <div style={{
                      color: "#fff", fontSize: 13, fontWeight: 600, lineHeight: 1.35,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}>
                      {item.title}
                    </div>

                    {/* Price row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ color: "#22c55e", fontSize: 18, fontWeight: 900 }}>
                        {currencySymbol(item.currency)}{item.price.toFixed(2)}
                      </div>
                      {item.daysLeft > 0 && (
                        <div style={{
                          color: item.daysLeft <= 1 ? "#f87171" : "rgba(255,255,255,0.35)",
                          fontSize: 10, fontWeight: 600,
                        }}>
                          {item.daysLeft}d pozostało
                        </div>
                      )}
                    </div>

                    {/* Meta row */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {item.bidCount > 0 && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                          background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)",
                          color: "#60a5fa",
                        }}>
                          {item.bidCount} ofert
                        </span>
                      )}
                      {item.sellerId && (
                        <span style={{
                          fontSize: 10, color: "rgba(255,255,255,0.3)",
                          overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140, whiteSpace: "nowrap",
                        }}>
                          @{item.sellerId}
                        </span>
                      )}
                    </div>

                    {/* CTA buttons */}
                    <div style={{ display: "flex", gap: 7, marginTop: "auto" }}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                          padding: "8px 0", borderRadius: 9, textDecoration: "none",
                          background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.28)",
                          color: "#22c55e", fontSize: 12, fontWeight: 700,
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.2)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.12)"; }}
                      >
                        eBay →
                      </a>
                      <button
                        onClick={e => { e.stopPropagation(); handleAddToPipeline(item, idx); }}
                        disabled={addedIdx.has(idx)}
                        title="Dodaj do pipeline"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                          padding: "8px 12px", borderRadius: 9, border: "none", cursor: addedIdx.has(idx) ? "default" : "pointer",
                          background: addedIdx.has(idx) ? "rgba(74,222,128,0.15)" : "rgba(139,92,246,0.15)",
                          color: addedIdx.has(idx) ? "#4ade80" : "#a78bfa",
                          fontSize: 12, fontWeight: 700, transition: "all 0.15s",
                          flexShrink: 0,
                        }}
                      >
                        {addedIdx.has(idx) ? <Check size={14} /> : <BookmarkPlus size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Empty state (after fetch, no items) ── */}
        {!loading && fetched && items.length === 0 && !error && (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📭</div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 8 }}>
              Brak wyników dla kategorii {selectedCategory}
            </div>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>
              Spróbuj innej kategorii lub marketplace
            </div>
          </div>
        )}

        {/* ── Initial empty state (no fetch yet, keys missing) ── */}
        {!loading && !fetched && !error && !hasKeys && (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🔥</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
              Skonfiguruj klucze eBay, żeby zobaczyć trending produkty
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </ResellLayout>
  );
}
