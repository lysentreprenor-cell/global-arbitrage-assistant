import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, Package, ShoppingCart, Zap, ExternalLink, CheckCircle, Clock,
  Copy, ChevronDown, X, MapPin, Trash2, RefreshCw, Edit3, Tag,
  TrendingUp, DollarSign, ArrowRight, Check, Download,
} from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";

const PLATFORMS = ["eBay USA", "Etsy USA", "Amazon UK", "eBay DE", "Vinted EU", "Amazon DE", "StockX USA", "Depop"];
const CATEGORIES = ["Clothing", "Jewelry", "Electronics", "Collectibles", "Sneakers", "Spirits", "Antiques", "Watches", "General"];

const PLATFORM_FEES: Record<string, number> = {
  "eBay USA": 13.25, "Etsy USA": 9.5, "Amazon UK": 15, "eBay DE": 12,
  "Amazon DE": 15, "Vinted EU": 0, "StockX USA": 9.5, "Depop": 10,
};
const AVG_SHIPPING: Record<string, number> = {
  "Clothing": 12, "Jewelry": 18, "Electronics": 28, "Collectibles": 22,
  "Sneakers": 25, "Spirits": 35, "Antiques": 40, "Watches": 30, "General": 15,
};

const PLATFORM_LINKS: Record<string, string> = {
  "eBay USA": "https://www.ebay.com/sl/sell",
  "Etsy USA": "https://www.etsy.com/sell",
  "Amazon UK": "https://sell.amazon.co.uk",
  "eBay DE": "https://www.ebay.de/sl/sell",
  "Vinted EU": "https://www.vinted.com/sell-now",
  "Amazon DE": "https://sell.amazon.de",
  "StockX USA": "https://stockx.com/sell",
  "Depop": "https://www.depop.com/sell",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#f5c842", active: "#4ade80", sold: "#a78bfa",
  pending: "#f59e0b", processed: "#4ade80",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Szkic", active: "Aktywne", sold: "Sprzedane",
  pending: "Oczekuje", processed: "Zrealizowane",
};

type Listing = {
  id: number; productName: string; sourceUrl: string;
  sourcePricePLN: number; sourcePriceUSD: number; sellPrice: number;
  profit: number; margin: number; feePercent?: number; shippingEst?: number;
  platform: string; status: string; createdAt: string; category?: string;
  buyHint?: string; sellHint?: string; sourceMarket?: string;
  aiContent?: { title: string; description: string; tags: string[]; category: string; shippingNote: string; highlights?: string[]; seoKeywords?: string[] } | null;
};

type Order = {
  id: number; listingId: number; productName: string; sourceUrl: string;
  sourceMarket?: string; buyerName: string; buyerAddress: string; buyerEmail: string;
  quantity: number; sellPrice: number; sourcePriceUSD: number; profit: number;
  status: string; createdAt: string; processedAt: string | null; platform: string;
  trackingNumber?: string; notes?: string;
};

type Stats = {
  totalListings: number; activeListings: number; soldListings?: number;
  totalOrders: number; pendingOrders: number; processedOrders?: number; totalProfit: number;
};

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#0d0d1a", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 18, padding: 24, width: "100%", maxWidth: wide ? 660 : 520, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 4 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13,
  fontFamily: "inherit", boxSizing: "border-box",
};

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: done ? "#4ade80" : "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
      {done ? <><Check size={10} /> Skopiowano</> : <><Copy size={10} /> Kopiuj</>}
    </button>
  );
}

export default function DropshipManager() {
  const [tab, setTab] = useState<"listings" | "orders">("listings");
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showNewListing, setShowNewListing] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState<Listing | null>(null);
  const [showDetail, setShowDetail] = useState<Listing | null>(null);
  const [showOrderDetail, setShowOrderDetail] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    productName: "", sourceUrl: "", sourcePricePLN: "", sourcePriceUSD: "",
    sellPrice: "", platform: "eBay USA", category: "General",
    description: "", buyHint: "", sellHint: "", sourceMarket: "",
  });
  const [orderForm, setOrderForm] = useState({ buyerName: "", buyerAddress: "", buyerEmail: "", quantity: "1", notes: "" });
  const [trackingInput, setTrackingInput] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const [l, o, s] = await Promise.all([
        fetch("/api/dropship/listings").then(r => r.json()),
        fetch("/api/dropship/orders").then(r => r.json()),
        fetch("/api/dropship/stats").then(r => r.json()),
      ]);
      setListings(l.listings || []);
      setOrders(o.orders || []);
      setStats(s);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    // Check if there's a pending import from Dashboard
    const imp = sessionStorage.getItem("dropship_import");
    if (imp) {
      try {
        const o = JSON.parse(imp);
        sessionStorage.removeItem("dropship_import");
        setForm(f => ({
          ...f,
          productName: o.name ?? "",
          sourcePriceUSD: String(o.buy ?? ""),
          sellPrice: String(o.sell ?? ""),
          platform: o.market ?? "eBay USA",
          category: o.category ?? "General",
          sourceUrl: o.sourceUrl ?? "",
          buyHint: o.buyHint ?? "",
          sellHint: o.sellHint ?? "",
          sourceMarket: o.flag ?? "",
        }));
        setShowNewListing(true);
      } catch {}
    }
  }, [load]);

  // Computed profit for form
  const buy = parseFloat(form.sourcePriceUSD || "0") || 0;
  const sell = parseFloat(form.sellPrice || "0") || 0;
  const fee = PLATFORM_FEES[form.platform] ?? 13;
  const ship = AVG_SHIPPING[form.category] ?? 15;
  const feeAmt = sell * (fee / 100);
  const formProfit = sell > 0 ? Math.round((sell - feeAmt - buy - ship) * 100) / 100 : 0;
  const formMargin = sell > 0 ? Math.round((formProfit / sell) * 100) : 0;

  const createListing = async () => {
    if (!form.productName || !form.sellPrice) return;
    setCreating(true);
    try {
      const res = await fetch("/api/dropship/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, anthropicKey: getAnthropicKey() }),
      });
      const data = await res.json();
      setShowNewListing(false);
      setForm({ productName: "", sourceUrl: "", sourcePricePLN: "", sourcePriceUSD: "", sellPrice: "", platform: "eBay USA", category: "General", description: "", buyHint: "", sellHint: "", sourceMarket: "" });
      await load();
      if (data.listing) setShowDetail(data.listing);
    } catch {}
    setCreating(false);
  };

  const createOrder = async () => {
    if (!showNewOrder || !orderForm.buyerName || !orderForm.buyerAddress) return;
    await fetch("/api/dropship/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId: showNewOrder.id, ...orderForm }),
    });
    setShowNewOrder(null);
    setOrderForm({ buyerName: "", buyerAddress: "", buyerEmail: "", quantity: "1", notes: "" });
    await load();
    setTab("orders");
  };

  const processOrder = async (order: Order) => {
    await fetch(`/api/dropship/orders/${order.id}/process`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackingNumber: trackingInput, notes: orderNotes }),
    });
    await load();
    setShowOrderDetail(prev => prev?.id === order.id ? { ...prev, status: "processed", processedAt: new Date().toISOString(), trackingNumber: trackingInput } : prev);
  };

  const deleteListing = async (id: number) => {
    if (!confirm("Usunąć ogłoszenie?")) return;
    await fetch(`/api/dropship/listings/${id}`, { method: "DELETE" });
    await load();
    setShowDetail(null);
  };

  const changeStatus = async (id: number, status: string) => {
    await fetch(`/api/dropship/listings/${id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  };

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 60px", maxWidth: 940 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 900, margin: "0 0 4px" }}>Dropship Manager</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>Wystawiaj ogłoszenia · AI pisze opisy · Zamawiaj do klienta · Zarabiaj marżę</p>
          </div>
          <button onClick={() => setShowNewListing(true)}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700, fontSize: 13, boxShadow: "0 4px 14px rgba(139,92,246,0.3)" }}>
            <Plus size={15} /> Nowe ogłoszenie
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 24 }}>
            {[
              { label: "OGŁOSZENIA", val: stats.totalListings,   color: "#f5c842" },
              { label: "AKTYWNE",    val: stats.activeListings,  color: "#4ade80" },
              { label: "ZAMÓWIENIA", val: stats.totalOrders,     color: "#60a5fa" },
              { label: "OCZEKUJE",   val: stats.pendingOrders,   color: "#f59e0b" },
              { label: "ZYSK NETTO", val: `$${stats.totalProfit.toFixed(0)}`, color: "#a78bfa" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700, letterSpacing: 0.8, marginBottom: 5 }}>{s.label}</div>
                <div style={{ color: s.color, fontSize: 20, fontWeight: 900 }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {(["listings", "orders"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "10px 20px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
              color: tab === t ? "#a78bfa" : "rgba(255,255,255,0.4)",
              borderBottom: tab === t ? "2px solid #a78bfa" : "2px solid transparent",
              marginBottom: -1,
            }}>
              {t === "listings" ? `📋 Ogłoszenia (${listings.length})` : `📦 Zamówienia (${orders.length})`}
            </button>
          ))}
        </div>

        {/* LISTINGS */}
        {tab === "listings" && (
          <div>
            {listings.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
                <Package size={36} style={{ margin: "0 auto 12px", opacity: 0.2, display: "block" }} />
                Brak ogłoszeń — kliknij „Nowe ogłoszenie" lub importuj z Dashboardu
              </div>
            ) : listings.map(l => {
              const sc = STATUS_COLORS[l.status] || "#888";
              return (
                <div key={l.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 14, padding: "14px 16px", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setShowDetail(l)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{l.productName}</span>
                        <span style={{ background: `${sc}18`, border: `1px solid ${sc}35`, borderRadius: 99, padding: "2px 9px", color: sc, fontSize: 10, fontWeight: 700 }}>
                          {STATUS_LABELS[l.status] ?? l.status}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{l.platform}</span>
                        {l.category && <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{l.category}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                          Kupno: <strong style={{ color: "#fff" }}>${l.sourcePriceUSD}</strong>
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                          Sprzedaż: <strong style={{ color: "#4ade80" }}>${l.sellPrice}</strong>
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                          Opłata: <strong style={{ color: "#f87171" }}>{l.feePercent ?? "?"}%</strong>
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                          Zysk netto: <strong style={{ color: "#4ade80" }}>+${l.profit}</strong>
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginLeft: 4 }}>({l.margin}%)</span>
                        </span>
                      </div>
                      {l.buyHint && (
                        <div style={{ color: "rgba(139,92,246,0.6)", fontSize: 11, marginTop: 3 }}>💡 {l.buyHint}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => setShowNewOrder(l)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(74,222,128,0.15)", color: "#4ade80", fontWeight: 700, fontSize: 11 }}>
                        + Zamówienie
                      </button>
                      <button onClick={() => deleteListing(l.id)}
                        style={{ padding: "6px 8px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(248,113,113,0.1)", color: "#f87171" }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ORDERS */}
        {tab === "orders" && (
          <div>
            {orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
                <ShoppingCart size={36} style={{ margin: "0 auto 12px", opacity: 0.2, display: "block" }} />
                Brak zamówień — dodaj ręcznie lub poczekaj na klienta
              </div>
            ) : orders.map(o => (
              <div key={o.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${o.status === "pending" ? "rgba(245,200,66,0.2)" : "rgba(74,222,128,0.15)"}`, borderRadius: 14, padding: "14px 16px", marginBottom: 8, cursor: "pointer" }}
                onClick={() => { setShowOrderDetail(o); setTrackingInput(o.trackingNumber || ""); setOrderNotes(o.notes || ""); }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      {o.status === "pending" ? <Clock size={14} color="#f5c842" /> : <CheckCircle size={14} color="#4ade80" />}
                      <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{o.productName}</span>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>— {o.buyerName}</span>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}>
                      <span style={{ color: "rgba(255,255,255,0.45)" }}>Zysk: <strong style={{ color: "#4ade80" }}>+${o.profit}</strong></span>
                      <span style={{ color: "rgba(255,255,255,0.45)" }}>{o.platform}</span>
                      <span style={{ color: "rgba(255,255,255,0.3)" }}>{new Date(o.createdAt).toLocaleDateString()}</span>
                      {o.trackingNumber && <span style={{ color: "#60a5fa" }}>📦 {o.trackingNumber}</span>}
                    </div>
                    {o.buyerAddress && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, background: "rgba(0,0,0,0.2)", borderRadius: 7, padding: "5px 9px", marginTop: 6, maxWidth: 400 }}>
                        <MapPin size={11} color="#60a5fa" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{o.buyerAddress}</span>
                      </div>
                    )}
                  </div>
                  {o.status === "pending" && (
                    <button onClick={e => { e.stopPropagation(); setShowOrderDetail(o); setTrackingInput(""); setOrderNotes(""); }}
                      style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #f5c842, #d97706)", color: "#000", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                      ⚡ Realizuj
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MODAL: New Listing ── */}
      {showNewListing && (
        <Modal title="Nowe ogłoszenie dropship" onClose={() => setShowNewListing(false)} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="NAZWA PRODUKTU *">
                <input style={inp} value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} placeholder="np. Omega Seamaster Vintage 1965" />
              </Field>
            </div>
            <Field label="PLATFORMA SPRZEDAŻY *">
              <div style={{ position: "relative" }}>
                <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                  style={{ ...inp, appearance: "none", paddingRight: 30, cursor: "pointer" }}>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p} ({PLATFORM_FEES[p]}% fee)</option>)}
                </select>
                <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", pointerEvents: "none" }} />
              </div>
            </Field>
            <Field label="KATEGORIA">
              <div style={{ position: "relative" }}>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ ...inp, appearance: "none", paddingRight: 30, cursor: "pointer" }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", pointerEvents: "none" }} />
              </div>
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 2 }}>
            <Field label="CENA ZAKUPU (USD) *">
              <input style={inp} type="number" min="0" value={form.sourcePriceUSD} onChange={e => setForm(f => ({ ...f, sourcePriceUSD: e.target.value }))} placeholder="22" />
            </Field>
            <Field label="CENA ZAKUPU (PLN)">
              <input style={inp} type="number" min="0" value={form.sourcePricePLN} onChange={e => setForm(f => ({ ...f, sourcePricePLN: e.target.value }))} placeholder="88" />
            </Field>
            <Field label="CENA SPRZEDAŻY ($) *">
              <input style={inp} type="number" min="0" value={form.sellPrice} onChange={e => setForm(f => ({ ...f, sellPrice: e.target.value }))} placeholder="74" />
            </Field>
          </div>

          {/* Live profit preview */}
          {sell > 0 && (
            <div style={{ background: formProfit > 0 ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)", border: `1px solid ${formProfit > 0 ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>Zysk netto: <strong style={{ color: formProfit > 0 ? "#4ade80" : "#f87171" }}>${formProfit.toFixed(2)}</strong></span>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>Marża: <strong style={{ color: formProfit > 0 ? "#4ade80" : "#f87171" }}>{formMargin}%</strong></span>
                <span style={{ color: "rgba(255,255,255,0.35)" }}>Opłata {form.platform}: {fee}% (${feeAmt.toFixed(2)})</span>
                <span style={{ color: "rgba(255,255,255,0.35)" }}>Wysyłka est: ${ship}</span>
              </div>
            </div>
          )}

          <Field label="LINK DO ŹRÓDŁA (gdzie kupujesz)">
            <input style={inp} value={form.sourceUrl} onChange={e => setForm(f => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://allegro.pl/oferta/..." />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="WSKAZÓWKA ZAKUPU">
              <input style={inp} value={form.buyHint} onChange={e => setForm(f => ({ ...f, buyHint: e.target.value }))} placeholder="np. Allegro PL, budżet do 80 PLN" />
            </Field>
            <Field label="HINT SEO (tytuł)">
              <input style={inp} value={form.sellHint} onChange={e => setForm(f => ({ ...f, sellHint: e.target.value }))} placeholder="np. Zorki 4 Soviet Camera Working" />
            </Field>
          </div>

          <Field label="OPIS (opcjonalnie — AI uzupełni)">
            <textarea style={{ ...inp, height: 60, resize: "vertical" }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Dodatkowe info o produkcie..." />
          </Field>

          <button onClick={createListing} disabled={creating || !form.productName || !form.sellPrice}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", cursor: creating || !form.productName || !form.sellPrice ? "not-allowed" : "pointer", background: creating ? "rgba(139,92,246,0.3)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 800, fontSize: 14, opacity: !form.productName || !form.sellPrice ? 0.5 : 1 }}>
            {creating ? "🤖 AI generuje ogłoszenie…" : "✚ Utwórz ogłoszenie"}
          </button>
        </Modal>
      )}

      {/* ── MODAL: Listing Detail ── */}
      {showDetail && (
        <Modal title="Szczegóły ogłoszenia" onClose={() => setShowDetail(null)} wide>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{showDetail.productName}</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Kupno: <strong style={{ color: "#fff" }}>${showDetail.sourcePriceUSD}</strong></span>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Sprzedaż: <strong style={{ color: "#4ade80" }}>${showDetail.sellPrice}</strong></span>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Zysk netto: <strong style={{ color: "#4ade80" }}>+${showDetail.profit}</strong></span>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Marża: <strong style={{ color: "#4ade80" }}>{showDetail.margin}%</strong></span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["draft","active","sold"].map(st => (
                <button key={st} onClick={() => changeStatus(showDetail.id, st)}
                  style={{ padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, background: showDetail.status === st ? `${STATUS_COLORS[st]}25` : "rgba(255,255,255,0.06)", color: showDetail.status === st ? STATUS_COLORS[st] : "rgba(255,255,255,0.35)" }}>
                  {STATUS_LABELS[st]}
                </button>
              ))}
            </div>
          </div>

          {showDetail.aiContent ? (
            <>
              {/* Title */}
              <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700 }}>TYTUŁ (AI)</span>
                  <CopyBtn text={showDetail.aiContent.title} />
                </div>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{showDetail.aiContent.title}</div>
              </div>

              {/* Highlights */}
              {showDetail.aiContent.highlights?.length && (
                <div style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  {showDetail.aiContent.highlights.map((h, i) => (
                    <div key={i} style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, padding: "2px 0", display: "flex", gap: 6 }}>
                      <span style={{ color: "#4ade80" }}>✓</span> {h}
                    </div>
                  ))}
                </div>
              )}

              {/* Description */}
              <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700 }}>OPIS (AI)</span>
                  <CopyBtn text={showDetail.aiContent.description} />
                </div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 1.6 }}>{showDetail.aiContent.description}</div>
              </div>

              {/* Shipping note */}
              {showDetail.aiContent.shippingNote && (
                <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700 }}>📦 WYSYŁKA</span>
                  <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 4 }}>{showDetail.aiContent.shippingNote}</div>
                </div>
              )}

              {/* Tags */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
                {showDetail.aiContent.tags.map((t, i) => (
                  <span key={i} style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 99, padding: "2px 9px", color: "#93c5fd", fontSize: 10 }}>#{t}</span>
                ))}
              </div>
            </>
          ) : (
            <div style={{ background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 10, padding: 12, marginBottom: 14, color: "#fde68a", fontSize: 12 }}>
              Dodaj klucz Anthropic w Ustawieniach API żeby AI generowało opisy
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href={PLATFORM_LINKS[showDetail.platform]} target="_blank" rel="noopener noreferrer"
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 10, padding: "10px 14px", textDecoration: "none" }}>
              <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 13 }}>🚀 Wystaw na {showDetail.platform}</span>
              <ExternalLink size={13} color="#4ade80" />
            </a>
            {showDetail.sourceUrl && (
              <a href={showDetail.sourceUrl} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 10, padding: "10px 14px", textDecoration: "none" }}>
                <span style={{ color: "#fde68a", fontWeight: 700, fontSize: 13 }}>🛒 Źródło zakupu</span>
                <ExternalLink size={13} color="#fde68a" />
              </a>
            )}
          </div>
          <button onClick={() => deleteListing(showDetail.id)}
            style={{ marginTop: 10, width: "100%", padding: "8px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.06)", color: "#f87171", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            <Trash2 size={13} style={{ marginRight: 6 }} />Usuń ogłoszenie
          </button>
        </Modal>
      )}

      {/* ── MODAL: New Order ── */}
      {showNewOrder && (
        <Modal title={`Nowe zamówienie — ${showNewOrder.productName}`} onClose={() => setShowNewOrder(null)}>
          <div style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.18)", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
            Klient płaci <strong style={{ color: "#4ade80" }}>${showNewOrder.sellPrice}</strong>
            {" · "}Zamawiasz za <strong style={{ color: "#fff" }}>${showNewOrder.sourcePriceUSD}</strong>
            {" · "}Zysk netto: <strong style={{ color: "#4ade80" }}>+${showNewOrder.profit}</strong>
          </div>
          <Field label="IMIĘ I NAZWISKO KUPUJĄCEGO *">
            <input style={inp} value={orderForm.buyerName} onChange={e => setOrderForm(f => ({ ...f, buyerName: e.target.value }))} placeholder="Jan Kowalski" />
          </Field>
          <Field label="ADRES DOSTAWY *">
            <textarea style={{ ...inp, height: 70, resize: "vertical" }} value={orderForm.buyerAddress} onChange={e => setOrderForm(f => ({ ...f, buyerAddress: e.target.value }))} placeholder={"123 Main St\nNew York, NY 10001\nUSA"} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="EMAIL KUPUJĄCEGO">
              <input style={inp} value={orderForm.buyerEmail} onChange={e => setOrderForm(f => ({ ...f, buyerEmail: e.target.value }))} placeholder="customer@email.com" />
            </Field>
            <Field label="ILOŚĆ">
              <input style={inp} type="number" min="1" value={orderForm.quantity} onChange={e => setOrderForm(f => ({ ...f, quantity: e.target.value }))} />
            </Field>
          </div>
          <Field label="NOTATKI (opcjonalnie)">
            <input style={inp} value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} placeholder="np. preferuje paczkomat, kolor zielony..." />
          </Field>
          <button onClick={createOrder} disabled={!orderForm.buyerName || !orderForm.buyerAddress}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #f5c842, #d97706)", color: "#000", fontWeight: 800, fontSize: 14, opacity: !orderForm.buyerName || !orderForm.buyerAddress ? 0.5 : 1 }}>
            ✚ Dodaj zamówienie
          </button>
        </Modal>
      )}

      {/* ── MODAL: Order Detail / Process ── */}
      {showOrderDetail && (
        <Modal title="Realizacja zamówienia" onClose={() => setShowOrderDetail(null)}>
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{showOrderDetail.productName}</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <CopyBtn text={showOrderDetail.buyerName} />
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>👤 {showOrderDetail.buyerName}</span>
            </div>
            <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>📍 {showOrderDetail.buyerAddress}</span>
                <CopyBtn text={showOrderDetail.buyerAddress} />
              </div>
            </div>
            {showOrderDetail.buyerEmail && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>✉ {showOrderDetail.buyerEmail}</span>
                <CopyBtn text={showOrderDetail.buyerEmail} />
              </div>
            )}
            {showOrderDetail.notes && (
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 6, fontStyle: "italic" }}>💬 {showOrderDetail.notes}</div>
            )}
          </div>

          {showOrderDetail.status === "pending" ? (
            <>
              <div style={{ background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ color: "#fde68a", fontWeight: 700, fontSize: 12, marginBottom: 8 }}>⚡ KROKI DO REALIZACJI:</div>
                {[
                  "Otwórz źródło zakupu poniżej",
                  `Dodaj do koszyka i wpisz adres klienta`,
                  `Zapłać $${showOrderDetail.sourcePriceUSD} — zarabiasz +$${showOrderDetail.profit}`,
                  "Wpisz numer śledzenia paczki",
                  "Kliknij „Oznacz jako zrealizowane”",
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                    <span style={{ color: "#f5c842", fontWeight: 700, width: 14, flexShrink: 0 }}>{i + 1}.</span>
                    {step}
                  </div>
                ))}
              </div>
              {showOrderDetail.sourceUrl && (
                <a href={showOrderDetail.sourceUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(245,200,66,0.1)", border: "1px solid rgba(245,200,66,0.25)", borderRadius: 10, padding: "10px 14px", textDecoration: "none", marginBottom: 10 }}>
                  <span style={{ color: "#fde68a", fontWeight: 700, fontSize: 13 }}>🛒 Otwórz źródło i zamów</span>
                  <ExternalLink size={13} color="#fde68a" />
                </a>
              )}
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>NUMER ŚLEDZENIA (opcjonalnie)</div>
                <input style={inp} value={trackingInput} onChange={e => setTrackingInput(e.target.value)} placeholder="DHL 1234567890 / InPost 123..." />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>NOTATKA</div>
                <input style={inp} value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="np. wysłano 26.05, paczkomat POP-1234" />
              </div>
              <button onClick={() => processOrder(showOrderDetail)}
                style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 800, fontSize: 14 }}>
                ✓ Oznacz jako zrealizowane
              </button>
            </>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#4ade80", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                <CheckCircle size={18} /> Zrealizowane · {showOrderDetail.processedAt && new Date(showOrderDetail.processedAt).toLocaleString()}
              </div>
              {showOrderDetail.trackingNumber && (
                <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ color: "#93c5fd", fontSize: 13 }}>📦 {showOrderDetail.trackingNumber}</span>
                  <CopyBtn text={showOrderDetail.trackingNumber} />
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      <style>{`option { background: #0d0d1a; } textarea,input { outline: none; } textarea:focus,input:focus { border-color: rgba(139,92,246,0.5) !important; }`}</style>
    </ResellLayout>
  );
}
