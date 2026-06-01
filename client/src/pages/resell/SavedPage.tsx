import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Bookmark, Trash2, ExternalLink, ChevronDown, ChevronRight,
  Check, Clock, ShoppingCart, Tag, Trophy, Ban, Plus, Pencil,
  AlertTriangle, TrendingDown, DollarSign, BarChart2, Zap,
} from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import {
  loadPipeline, savePipeline, updatePipelineItem, removeFromPipeline,
  type PipelineItem, type PipelineStatus,
} from "@/lib/pipeline";
import { getValidAccessToken, isEbayConnected } from "@/lib/ebayAuth";
import { getValidEtsyToken, isEtsyConnected } from "@/lib/etsyAuth";

function loadEbayCredentials(): { clientId: string; certId: string } {
  try {
    const keys = JSON.parse(localStorage.getItem("resell_api_keys") || "{}");
    return { clientId: keys.ebay?.appId || "", certId: keys.ebay?.certId || "" };
  } catch { return { clientId: "", certId: "" }; }
}

const STATUS_CONFIG: Record<PipelineStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  planned:   { label: "Planowane",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: <Clock size={11} /> },
  bought:    { label: "Kupione",    color: "#f5c842", bg: "rgba(245,200,66,0.12)",  icon: <ShoppingCart size={11} /> },
  listed:    { label: "Wystawione", color: "#a78bfa", bg: "rgba(139,92,246,0.12)", icon: <Tag size={11} /> },
  sold:      { label: "Sprzedane",  color: "#4ade80", bg: "rgba(74,222,128,0.12)", icon: <Trophy size={11} /> },
  abandoned: { label: "Porzucone",  color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: <Ban size={11} /> },
};

const STATUS_ORDER: PipelineStatus[] = ["planned", "bought", "listed", "sold", "abandoned"];

// Days since a timestamp (returns null if no timestamp)
function daysSince(ts?: number): number | null {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / 86400000);
}

// A "listed" item is stale when it's been listed for 1.5× its expected sell time
function isStale(item: PipelineItem): boolean {
  if (item.status !== "listed") return false;
  const days = daysSince(item.listedAt ?? item.savedAt);
  if (days === null) return false;
  const threshold = Math.round((item.daysToSell ?? 14) * 1.5);
  return days >= threshold;
}

function suggestReprice(item: PipelineItem): number {
  return Math.round(item.sell * 0.88); // 12% price drop suggestion
}

export default function SavedPage() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<PipelineItem[]>(loadPipeline);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [filterStatus, setFilterStatus] = useState<PipelineStatus | "all">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [ebayStatus, setEbayStatus] = useState<Record<string, "idle" | "listing" | "listed" | "error">>({});
  const [ebayUrls, setEbayUrls] = useState<Record<string, string>>({});
  const [ebayErrors, setEbayErrors] = useState<Record<string, string>>({});
  const [etsyStatus, setEtsyStatus] = useState<Record<string, "idle" | "listing" | "listed" | "error">>({});
  const [etsyUrls, setEtsyUrls] = useState<Record<string, string>>({});
  const [etsyErrors, setEtsyErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const reload = () => setItems(loadPipeline());
    window.addEventListener("focus", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  const key = (i: PipelineItem) => `${i.id}:${i.name}`;

  const update = (id: number, name: string, patch: Partial<PipelineItem>) => {
    setItems(updatePipelineItem(id, name, patch));
  };

  const remove = (id: number, name: string) => {
    setItems(removeFromPipeline(id, name));
  };

  const toggleExpand = (k: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });

  const categories = ["all", ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))];

  const filtered = items
    .filter(i => filterStatus === "all" || i.status === filterStatus)
    .filter(i => filterCategory === "all" || i.category === filterCategory);

  const counts = STATUS_ORDER.reduce((acc, s) => ({ ...acc, [s]: items.filter(i => i.status === s).length }), {} as Record<PipelineStatus, number>);
  const totalEarned = items.filter(i => i.status === "sold").reduce((s, i) => s + (i.soldPrice ?? i.sell), 0);
  const totalPotential = items.filter(i => i.status !== "sold" && i.status !== "abandoned").reduce((s, i) => s + (i.netProfit ?? i.profit), 0);

  // Capital efficiency calculations
  const activeItems = items.filter(i => i.status === "bought" || i.status === "listed");
  const capitalTied = activeItems.reduce((s, i) => s + (i.realBuyPrice ?? i.buy), 0);
  const staleItems = items.filter(isStale);
  const soldItems = items.filter(i => i.status === "sold" && i.soldAt && i.boughtAt);
  const avgFlipDays = soldItems.length
    ? Math.round(soldItems.reduce((s, i) => s + (i.soldAt! - i.boughtAt!) / 86400000, 0) / soldItems.length)
    : null;
  const avgNetProfit = soldItems.length
    ? Math.round(soldItems.reduce((s, i) => s + (i.soldPrice ?? i.sell) - (i.realBuyPrice ?? i.buy), 0) / soldItems.length)
    : null;
  const roiPerDay = capitalTied > 0 && avgFlipDays
    ? Math.round((totalPotential / capitalTied / avgFlipDays) * 365 * 100)
    : null;
  const [showCapital, setShowCapital] = useState(false);

  const postToEbay = async (item: PipelineItem) => {
    const k = key(item);
    const { clientId, certId } = loadEbayCredentials();
    if (!isEbayConnected()) {
      setEbayErrors(e => ({ ...e, [k]: "Brak połączenia z eBay. Idź do Ustawień → eBay → Połącz konto." }));
      return;
    }
    setEbayStatus(s => ({ ...s, [k]: "listing" }));
    setEbayErrors(e => ({ ...e, [k]: "" }));
    try {
      const token = await getValidAccessToken(clientId, certId);
      if (!token) {
        setEbayStatus(s => ({ ...s, [k]: "error" }));
        setEbayErrors(e => ({ ...e, [k]: "Token wygasł. Wejdź w Ustawienia i połącz eBay ponownie." }));
        return;
      }
      const r = await fetch("/api/ebay/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessToken: token,
          title: item.name,
          description: item.tip || item.name,
          price: item.sell,
          category: item.category,
        }),
      });
      const d = await r.json() as any;
      if (!r.ok || !d.success) {
        setEbayStatus(s => ({ ...s, [k]: "error" }));
        setEbayErrors(e => ({ ...e, [k]: d.error || "Błąd wystawiania" }));
        return;
      }
      setEbayStatus(s => ({ ...s, [k]: "listed" }));
      setEbayUrls(u => ({ ...u, [k]: d.listingUrl }));
      update(item.id, item.name, {
        status: "listed",
        listedAt: Date.now(),
        listedOn: [...new Set([...item.listedOn, "eBay USA"])],
        sellUrls: { ...item.sellUrls, "eBay USA": d.listingUrl },
      });
    } catch (e: any) {
      setEbayStatus(s => ({ ...s, [k]: "error" }));
      setEbayErrors(er => ({ ...er, [k]: e.message || "Nieznany błąd" }));
    }
  };

  const postToEtsy = async (item: PipelineItem) => {
    const k = key(item);
    if (!isEtsyConnected()) {
      setEtsyErrors(e => ({ ...e, [k]: "Brak połączenia z Etsy. Idź do Ustawień → Etsy → Połącz konto." }));
      return;
    }
    setEtsyStatus(s => ({ ...s, [k]: "listing" }));
    setEtsyErrors(e => ({ ...e, [k]: "" }));
    try {
      const tokenData = await getValidEtsyToken();
      if (!tokenData) {
        setEtsyStatus(s => ({ ...s, [k]: "error" }));
        setEtsyErrors(e => ({ ...e, [k]: "Token wygasł. Wejdź w Ustawienia i połącz Etsy ponownie." }));
        return;
      }
      const { accessToken, clientId } = tokenData;
      const r = await fetch("/api/etsy/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessToken,
          clientId,
          title: item.name,
          description: item.tip || item.name,
          price: item.sell,
          category: item.category,
        }),
      });
      const d = await r.json() as { success?: boolean; listingId?: number; listingUrl?: string; error?: string };
      if (!r.ok || !d.success) {
        setEtsyStatus(s => ({ ...s, [k]: "error" }));
        setEtsyErrors(e => ({ ...e, [k]: d.error || "Błąd wystawiania na Etsy" }));
        return;
      }
      setEtsyStatus(s => ({ ...s, [k]: "listed" }));
      setEtsyUrls(u => ({ ...u, [k]: d.listingUrl! }));
      update(item.id, item.name, {
        status: "listed",
        listedAt: Date.now(),
        listedOn: [...new Set([...item.listedOn, "Etsy"])],
        sellUrls: { ...item.sellUrls, "Etsy": d.listingUrl! },
      });
    } catch (e: any) {
      setEtsyStatus(s => ({ ...s, [k]: "error" }));
      setEtsyErrors(er => ({ ...er, [k]: e.message || "Nieznany błąd" }));
    }
  };

  return (
    <ResellLayout>
      <div style={{ padding: "28px 20px 80px", maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bookmark size={18} color="#fff" />
            </div>
            <div>
              <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 900, margin: 0 }}>Mój Pipeline</h1>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{items.length} ogłoszeń · zarobione: <span style={{ color: "#4ade80", fontWeight: 700 }}>${totalEarned}</span> · potencjał: <span style={{ color: "#a78bfa", fontWeight: 700 }}>+${totalPotential}</span></div>
            </div>
          </div>
          <button onClick={() => setLocation("/resell")} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.1)", color: "#a78bfa", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            + Dodaj z Dashboardu
          </button>
        </div>

        {/* Status summary pills */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterStatus("all")}
            style={{ padding: "5px 12px", borderRadius: 99, border: `1px solid ${filterStatus === "all" ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}`, background: filterStatus === "all" ? "rgba(255,255,255,0.1)" : "transparent", color: filterStatus === "all" ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            Wszystkie ({items.length})
          </button>
          {STATUS_ORDER.map(s => {
            const cfg = STATUS_CONFIG[s];
            const active = filterStatus === s;
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ padding: "5px 12px", borderRadius: 99, border: `1px solid ${active ? cfg.color + "60" : cfg.color + "25"}`, background: active ? cfg.bg : "transparent", color: active ? cfg.color : cfg.color + "99", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {cfg.icon} {cfg.label} ({counts[s] ?? 0})
              </button>
            );
          })}
        </div>

        {/* Category filter */}
        {categories.length > 2 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                style={{ padding: "4px 11px", borderRadius: 99, border: `1px solid ${filterCategory === cat ? "rgba(245,200,66,0.4)" : "rgba(255,255,255,0.08)"}`, background: filterCategory === cat ? "rgba(245,200,66,0.1)" : "transparent", color: filterCategory === cat ? "#f5c842" : "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {cat === "all" ? "Wszystkie kategorie" : cat}
              </button>
            ))}
          </div>
        )}

        {/* ── Stale inventory alerts ── */}
        {staleItems.length > 0 && (
          <div style={{ marginBottom: 16, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <AlertTriangle size={14} color="#f87171" />
              <span style={{ color: "#fca5a5", fontSize: 12, fontWeight: 800 }}>STAGNUJĄCE PRODUKTY — za długo wystawione</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {staleItems.map(item => {
                const days = daysSince(item.listedAt ?? item.savedAt) ?? 0;
                const suggested = suggestReprice(item);
                return (
                  <div key={`${item.id}:${item.name}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <TrendingDown size={12} color="#f87171" style={{ flexShrink: 0 }} />
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, flex: 1 }}>
                      <strong style={{ color: "#fff" }}>{item.name.slice(0, 45)}</strong>
                      <span style={{ color: "rgba(255,255,255,0.35)" }}> · {days} dni wystawiony</span>
                    </span>
                    <span style={{ color: "#f5c842", fontSize: 11, fontWeight: 700 }}>
                      Obecna: ${item.sell} → Sugeruj: <strong>${suggested}</strong>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Capital Efficiency Dashboard ── */}
        {capitalTied > 0 && (
          <div style={{ marginBottom: 16, background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 12, overflow: "hidden" }}>
            <button onClick={() => setShowCapital(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BarChart2 size={14} color="#a78bfa" />
                <span style={{ color: "#c4b5fd", fontSize: 12, fontWeight: 800 }}>EFEKTYWNOŚĆ KAPITAŁU</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: "#f5c842", fontWeight: 900, fontSize: 15 }}>${Math.round(capitalTied)}</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>zamrożone</span>
                <ChevronDown size={13} color="rgba(255,255,255,0.3)" style={{ transform: showCapital ? "rotate(180deg)" : "none", transition: "0.15s" }} />
              </div>
            </button>
            {showCapital && (
              <div style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
                {[
                  { label: "Kapitał zamrożony", value: `$${Math.round(capitalTied)}`, sub: `${activeItems.length} produktów`, color: "#f5c842" },
                  { label: "Potencjalny zysk", value: `+$${Math.round(totalPotential)}`, sub: "gdy wszystko sprzedane", color: "#4ade80" },
                  { label: "Śr. czas flipu", value: avgFlipDays ? `${avgFlipDays}d` : "—", sub: "na podstawie sprzedanych", color: "#60a5fa" },
                  { label: "Śr. zysk/flip", value: avgNetProfit != null ? `$${avgNetProfit}` : "—", sub: "netto po opłatach", color: "#a78bfa" },
                  { label: "Proj. ROI roczny", value: roiPerDay ? `${roiPerDay}%` : "—", sub: "przy obecnym tempie", color: "#f59e0b" },
                  { label: "Stagnujące", value: String(staleItems.length), sub: "wymagają repricing", color: staleItems.length > 0 ? "#f87171" : "#4ade80" },
                ].map(s => (
                  <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>{s.label.toUpperCase()}</div>
                    <div style={{ color: s.color, fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 3 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.2)" }}>
            <Bookmark size={40} style={{ margin: "0 auto 12px", display: "block", opacity: 0.2 }} />
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Brak zapisanych ogłoszeń</div>
            <div style={{ fontSize: 12, marginBottom: 20 }}>Na Dashboardzie kliknij "Save" przy okazji żeby dodać ją tutaj</div>
            <button onClick={() => setLocation("/resell")} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Idź do Dashboardu →
            </button>
          </div>
        )}

        {/* Pipeline items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(item => {
            const cfg = STATUS_CONFIG[item.status];
            const k = key(item);
            const isOpen = expanded.has(k);
            const platforms = item.markets && item.markets.length > 0 ? item.markets : [item.market];

            return (
              <div key={k} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${cfg.color}22`, borderRadius: 14, overflow: "hidden" }}>

                {/* Main row */}
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => toggleExpand(k)}>
                  {/* Status badge */}
                  <div style={{ background: cfg.bg, border: `1px solid ${cfg.color}40`, borderRadius: 8, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4, color: cfg.color, fontSize: 10, fontWeight: 800, flexShrink: 0, letterSpacing: 0.3 }}>
                    {cfg.icon} {cfg.label.toUpperCase()}
                  </div>

                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{item.flag} · {item.category} · {item.daysToSell ? `~${item.daysToSell}d sprzedaży` : ""}</div>
                  </div>

                  {/* Profit */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: item.status === "sold" ? "#4ade80" : "#a78bfa", fontWeight: 900, fontSize: 18 }}>
                      {item.status === "sold" ? `$${item.soldPrice ?? item.sell}` : `+$${item.netProfit ?? item.profit}`}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{item.status === "sold" ? "sprzedano" : "net profit"}</div>
                  </div>

                  <div style={{ color: "rgba(255,255,255,0.2)" }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

                    {/* Copy name button */}
                    <div>
                      <button
                        onClick={() => navigator.clipboard.writeText(item.name).catch(() => {})}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 600, cursor: "pointer" }}
                        title="Kopiuj nazwę"
                      >
                        📋 Kopiuj nazwę
                      </button>
                    </div>

                    {/* Buy/sell prices */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, padding: "6px 12px" }}>
                        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700 }}>KUP ZA</div>
                        <div style={{ color: "#4ade80", fontWeight: 900, fontSize: 16 }}>${item.buy}</div>
                      </div>
                      <div style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 8, padding: "6px 12px" }}>
                        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700 }}>SPRZEDAJ ZA</div>
                        <div style={{ color: "#a78bfa", fontWeight: 900, fontSize: 16 }}>${item.sell}</div>
                      </div>
                      <div style={{ background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 8, padding: "6px 12px" }}>
                        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700 }}>MARŻA</div>
                        <div style={{ color: "#f5c842", fontWeight: 900, fontSize: 16 }}>{item.margin}%</div>
                      </div>
                      {item.sourceUrl && (
                        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ade80", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
                          <ExternalLink size={11} /> Kup tutaj
                        </a>
                      )}
                    </div>

                    {/* Tip */}
                    {item.tip && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontStyle: "italic" }}>💡 {item.tip}</div>}
                    {item.buyHint && <div style={{ color: "rgba(96,165,250,0.7)", fontSize: 11 }}>🛒 {item.buyHint}</div>}

                    {/* Platforms to list on */}
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>WYSTAW NA PLATFORMACH:</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {platforms.map(platform => {
                          const done = item.listedOn.includes(platform);
                          const url = item.sellUrls?.[platform] || item.sellUrl || "";
                          const isEbay = platform === "eBay USA";
                          const eStatus = ebayStatus[k];
                          const eListed = eStatus === "listed" || done;

                          if (isEbay) {
                            return (
                              <div key={platform} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                {eListed ? (
                                  <a href={ebayUrls[k] || url || undefined} target="_blank" rel="noopener noreferrer"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                                    <Check size={10} /> eBay USA — wystawione ↗
                                  </a>
                                ) : (
                                  <button
                                    onClick={() => postToEbay(item)}
                                    disabled={eStatus === "listing"}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: "none", cursor: eStatus === "listing" ? "not-allowed" : "pointer", background: eStatus === "listing" ? "rgba(245,200,66,0.1)" : "linear-gradient(135deg,#b45309,#d97706,#f5c842)", color: eStatus === "listing" ? "#f5c842" : "#000", fontWeight: 800, fontSize: 12 }}>
                                    <Zap size={12} />
                                    {eStatus === "listing" ? "Wystawianie..." : "Wystaw na eBay automatycznie"}
                                  </button>
                                )}
                                {!eListed && (
                                  <button
                                    onClick={() => {
                                      const listedOn = done ? item.listedOn.filter(p => p !== platform) : [...item.listedOn, platform];
                                      update(item.id, item.name, { listedOn, status: listedOn.length > 0 ? "listed" : item.status });
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.25)", padding: 2, fontSize: 10 }}
                                    title="Zaznacz ręcznie jako wystawione"
                                  >○</button>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div key={platform} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <a href={url || undefined} target="_blank" rel="noopener noreferrer"
                                style={{ padding: "4px 10px", borderRadius: 7, background: done ? "rgba(74,222,128,0.12)" : "rgba(139,92,246,0.1)", border: `1px solid ${done ? "rgba(74,222,128,0.3)" : "rgba(139,92,246,0.25)"}`, color: done ? "#4ade80" : "#a78bfa", fontSize: 11, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                                {done && <Check size={10} />} {platform}
                              </a>
                              <button
                                onClick={() => {
                                  const listedOn = done ? item.listedOn.filter(p => p !== platform) : [...item.listedOn, platform];
                                  update(item.id, item.name, { listedOn, status: listedOn.length > 0 && item.status === "bought" ? "listed" : item.status });
                                }}
                                style={{ background: "none", border: "none", cursor: "pointer", color: done ? "#4ade80" : "rgba(255,255,255,0.25)", padding: 2, fontSize: 10 }}
                                title={done ? "Odznacz" : "Zaznacz jako wystawione"}
                              >{done ? "✓" : "○"}</button>
                            </div>
                          );
                        })}
                        {item.listedOn.length < platforms.length && !platforms.some(p => p === "eBay USA" && !item.listedOn.includes(p) && ebayStatus[k] !== "listed") && (
                          <button
                            onClick={() => update(item.id, item.name, { listedOn: platforms, status: "listed" })}
                            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.1)", color: "#a78bfa", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                          >✓ Wszystkie</button>
                        )}
                      </div>
                      {/* eBay error feedback */}
                      {ebayErrors[k] && (
                        <div style={{ marginTop: 6, color: "#f87171", fontSize: 11, background: "rgba(248,113,113,0.08)", borderRadius: 7, padding: "5px 10px" }}>
                          {ebayErrors[k]}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>NOTATKA:</div>
                      {editingNote === k ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            autoFocus
                            value={noteText}
                            onChange={e => setNoteText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") { update(item.id, item.name, { note: noteText }); setEditingNote(null); }
                              if (e.key === "Escape") setEditingNote(null);
                            }}
                            style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, padding: "6px 10px", color: "#fff", fontSize: 12, outline: "none" }}
                            placeholder="np. znalazłem na Allegro za 180 PLN, link zapisany..."
                          />
                          <button onClick={() => { update(item.id, item.name, { note: noteText }); setEditingNote(null); }}
                            style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: "rgba(74,222,128,0.2)", color: "#4ade80", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Zapisz</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: item.note ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)", fontSize: 12, flex: 1 }}>
                            {item.note || "Brak notatki — kliknij żeby dodać"}
                          </span>
                          <button onClick={() => { setEditingNote(k); setNoteText(item.note); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 4 }}>
                            <Pencil size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Status change buttons */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>ZMIEŃ STATUS:</span>
                      {STATUS_ORDER.filter(s => s !== item.status).map(s => {
                        const c = STATUS_CONFIG[s];
                        return (
                          <button key={s} onClick={() => {
                            const patch: Partial<PipelineItem> = { status: s };
                            if (s === "bought") patch.boughtAt = Date.now();
                            if (s === "listed") patch.listedAt = Date.now();
                            if (s === "sold") { patch.soldAt = Date.now(); patch.soldPrice = item.sell; }
                            update(item.id, item.name, patch);
                          }}
                            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: `1px solid ${c.color}30`, background: c.bg, color: c.color, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3 }}>
                            {c.icon} {c.label}
                          </button>
                        );
                      })}
                      <button onClick={() => remove(item.id, item.name)}
                        style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.06)", color: "#f87171", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                        <Trash2 size={10} /> Usuń
                      </button>
                    </div>

                    {/* Sold price input when status=sold */}
                    {item.status === "sold" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Cena sprzedaży:</span>
                        <input
                          type="number"
                          min="0"
                          value={item.soldPrice ?? item.sell}
                          onChange={e => update(item.id, item.name, { soldPrice: Math.max(0, parseFloat(e.target.value) || item.sell) })}
                          style={{ width: 80, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 7, padding: "4px 8px", color: "#4ade80", fontSize: 13, fontWeight: 700, outline: "none", textAlign: "center" }}
                        />
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>USD</span>
                      </div>
                    )}

                    {/* Actual buy price input when status=bought */}
                    {item.status === "bought" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Cena zakupu:</span>
                        <input
                          type="number"
                          min="0"
                          value={item.realBuyPrice ?? item.buy}
                          onChange={e => update(item.id, item.name, { realBuyPrice: Math.max(0, parseFloat(e.target.value) || item.buy) })}
                          style={{ width: 80, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(245,200,66,0.3)", borderRadius: 7, padding: "4px 8px", color: "#f5c842", fontSize: 13, fontWeight: 700, outline: "none", textAlign: "center" }}
                        />
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>USD</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <style>{`input::placeholder { color: rgba(255,255,255,0.2); }`}</style>
    </ResellLayout>
  );
}
