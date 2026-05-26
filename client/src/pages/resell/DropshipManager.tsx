import React, { useState, useEffect } from "react";
import { Plus, Package, ShoppingCart, Zap, ExternalLink, CheckCircle, Clock, AlertCircle, Copy, ChevronDown, X, MapPin } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";

const PLATFORMS = ["eBay USA", "Etsy USA", "Amazon UK", "eBay DE", "Vinted EU", "Amazon DE"];

const PLATFORM_LINKS: Record<string, string> = {
  "eBay USA": "https://www.ebay.com/sl/sell",
  "Etsy USA": "https://www.etsy.com/sell",
  "Amazon UK": "https://sell.amazon.co.uk",
  "eBay DE": "https://www.ebay.de/sl/sell",
  "Vinted EU": "https://www.vinted.com/sell-now",
  "Amazon DE": "https://sell.amazon.de",
};

type Listing = {
  id: number; productName: string; sourceUrl: string;
  sourcePricePLN: number; sourcePriceUSD: number; sellPrice: number;
  profit: number; margin: number; platform: string;
  status: string; createdAt: string;
  aiContent?: { title: string; description: string; tags: string[]; category: string; shippingNote: string } | null;
};

type Order = {
  id: number; listingId: number; productName: string; sourceUrl: string;
  buyerName: string; buyerAddress: string; buyerEmail: string;
  quantity: number; sellPrice: number; sourcePriceUSD: number; profit: number;
  status: string; createdAt: string; processedAt: string | null; platform: string;
};

type Stats = { totalListings: number; activeListings: number; totalOrders: number; pendingOrders: number; totalProfit: number };

const STATUS_COLORS: Record<string, string> = { draft: "#f5c842", active: "#4ade80", sold: "#a78bfa", pending: "#f59e0b", processed: "#4ade80" };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#0d1f0d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", padding: 4 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13,
  fontFamily: "inherit", boxSizing: "border-box",
};

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
  const [copied, setCopied] = useState(false);

  // New listing form
  const [form, setForm] = useState({ productName: "", sourceUrl: "", sourcePricePLN: "", sourcePriceUSD: "", sellPrice: "", platform: "eBay USA", description: "" });

  // New order form
  const [orderForm, setOrderForm] = useState({ buyerName: "", buyerAddress: "", buyerEmail: "", quantity: "1" });

  const load = async () => {
    const [l, o, s] = await Promise.all([
      fetch("/api/dropship/listings").then(r => r.json()),
      fetch("/api/dropship/orders").then(r => r.json()),
      fetch("/api/dropship/stats").then(r => r.json()),
    ]);
    setListings(l.listings || []);
    setOrders(o.orders || []);
    setStats(s);
  };

  useEffect(() => { load(); }, []);

  const createListing = async () => {
    if (!form.productName || !form.sellPrice) return;
    setCreating(true);
    const res = await fetch("/api/dropship/listings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, anthropicKey: getAnthropicKey() }),
    });
    const data = await res.json();
    setCreating(false);
    setShowNewListing(false);
    setForm({ productName: "", sourceUrl: "", sourcePricePLN: "", sourcePriceUSD: "", sellPrice: "", platform: "eBay USA", description: "" });
    await load();
    if (data.listing) setShowDetail(data.listing);
  };

  const createOrder = async () => {
    if (!showNewOrder || !orderForm.buyerName || !orderForm.buyerAddress) return;
    await fetch("/api/dropship/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId: showNewOrder.id, ...orderForm }),
    });
    setShowNewOrder(null);
    setOrderForm({ buyerName: "", buyerAddress: "", buyerEmail: "", quantity: "1" });
    await load();
    setTab("orders");
  };

  const processOrder = async (order: Order) => {
    await fetch(`/api/dropship/orders/${order.id}/process`, { method: "PATCH" });
    await load();
    setShowOrderDetail(prev => prev?.id === order.id ? { ...prev, status: "processed", processedAt: new Date().toISOString() } : prev);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const profit = parseFloat(form.sellPrice || "0") - parseFloat(form.sourcePriceUSD || "0");
  const margin = parseFloat(form.sellPrice) > 0 ? Math.round((profit / parseFloat(form.sellPrice)) * 100) : 0;

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 60px", maxWidth: 900 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 900, margin: "0 0 4px" }}>Dropship Manager</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>Wystawiaj ogłoszenia · Auto-zamawiaj do klienta · Zarabiaj marżę</p>
          </div>
          <button onClick={() => setShowNewListing(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 700, fontSize: 13, boxShadow: "0 4px 14px rgba(22,163,74,0.3)" }}>
            <Plus size={15} /> Nowe ogłoszenie
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 24 }}>
            {[
              { label: "OGŁOSZENIA", val: stats.totalListings, color: "#f5c842" },
              { label: "AKTYWNE", val: stats.activeListings, color: "#4ade80" },
              { label: "ZAMÓWIENIA", val: stats.totalOrders, color: "#60a5fa" },
              { label: "ZYSK ŁĄCZNY", val: `$${stats.totalProfit.toFixed(0)}`, color: "#a78bfa" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>{s.label}</div>
                <div style={{ color: s.color, fontSize: 22, fontWeight: 900 }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {(["listings", "orders"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
              background: tab === t ? "rgba(74,222,128,0.15)" : "transparent",
              color: tab === t ? "#4ade80" : "rgba(255,255,255,0.4)",
              borderBottom: tab === t ? "2px solid #4ade80" : "2px solid transparent",
            }}>
              {t === "listings" ? `📋 Ogłoszenia (${listings.length})` : `📦 Zamówienia (${orders.length})`}
            </button>
          ))}
        </div>

        {/* Listings tab */}
        {tab === "listings" && (
          <div>
            {listings.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
                Brak ogłoszeń — kliknij „Nowe ogłoszenie" żeby zacząć
              </div>
            ) : listings.map(l => (
              <div key={l.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 18px", marginBottom: 10, cursor: "pointer" }}
                onClick={() => setShowDetail(l)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{l.productName}</span>
                      <span style={{ background: `${STATUS_COLORS[l.status] || "#888"}20`, border: `1px solid ${STATUS_COLORS[l.status] || "#888"}40`, borderRadius: 99, padding: "2px 10px", color: STATUS_COLORS[l.status] || "#888", fontSize: 11, fontWeight: 700 }}>
                        {l.status === "draft" ? "Szkic" : l.status === "active" ? "Aktywne" : l.status}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{l.platform}</span>
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Kupujesz: <strong style={{ color: "#fff" }}>${l.sourcePriceUSD}</strong></span>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Sprzedajesz: <strong style={{ color: "#4ade80" }}>${l.sellPrice}</strong></span>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Zysk: <strong style={{ color: "#4ade80" }}>+${l.profit} ({l.margin}%)</strong></span>
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setShowNewOrder(l); }} style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(74,222,128,0.15)", color: "#4ade80", fontWeight: 700, fontSize: 12, flexShrink: 0, marginLeft: 12 }}>
                    + Zamówienie
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Orders tab */}
        {tab === "orders" && (
          <div>
            {orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
                Brak zamówień — dodaj ręcznie lub poczekaj na klienta
              </div>
            ) : orders.map(o => (
              <div key={o.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${o.status === "pending" ? "rgba(245,200,66,0.25)" : "rgba(74,222,128,0.2)"}`, borderRadius: 14, padding: "16px 18px", marginBottom: 10, cursor: "pointer" }}
                onClick={() => setShowOrderDetail(o)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      {o.status === "pending" ? <Clock size={14} color="#f5c842" /> : <CheckCircle size={14} color="#4ade80" />}
                      <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{o.productName}</span>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>— {o.buyerName}</span>
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: o.buyerAddress ? 8 : 0 }}>
                      Zysk: <strong style={{ color: "#4ade80" }}>+${o.profit}</strong> · {o.platform} · {new Date(o.createdAt).toLocaleDateString()}
                    </div>
                    {o.buyerAddress && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "7px 10px", marginBottom: 8 }}>
                        <MapPin size={12} color="#60a5fa" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, lineHeight: 1.5 }}>{o.buyerAddress}</span>
                      </div>
                    )}
                    {o.sourceUrl && (
                      <a
                        href={o.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "8px 14px", borderRadius: 8,
                          background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.35)",
                          color: "#4ade80", fontWeight: 700, fontSize: 12,
                          textDecoration: "none",
                        }}
                      >
                        <ShoppingCart size={13} /> Kup od źródła
                      </a>
                    )}
                  </div>
                  {o.status === "pending" && (
                    <button onClick={e => { e.stopPropagation(); setShowOrderDetail(o); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #f5c842, #d97706)", color: "#000", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                      ⚡ Realizuj
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: New Listing */}
      {showNewListing && (
        <Modal title="Nowe ogłoszenie dropship" onClose={() => setShowNewListing(false)}>
          <Field label="NAZWA PRODUKTU">
            <input style={inputStyle} value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} placeholder="np. Spodenki Nike rozmiar M" />
          </Field>
          <Field label="LINK DO ŹRÓDŁA (gdzie kupujesz)">
            <input style={inputStyle} value={form.sourceUrl} onChange={e => setForm(f => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://allegro.pl/oferta/..." />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="CENA ZAKUPU (PLN)">
              <input style={inputStyle} type="number" value={form.sourcePricePLN} onChange={e => setForm(f => ({ ...f, sourcePricePLN: e.target.value }))} placeholder="49" />
            </Field>
            <Field label="CENA ZAKUPU (USD)">
              <input style={inputStyle} type="number" value={form.sourcePriceUSD} onChange={e => setForm(f => ({ ...f, sourcePriceUSD: e.target.value }))} placeholder="12" />
            </Field>
            <Field label="CENA SPRZEDAŻY ($)">
              <input style={inputStyle} type="number" value={form.sellPrice} onChange={e => setForm(f => ({ ...f, sellPrice: e.target.value }))} placeholder="35" />
            </Field>
          </div>
          {parseFloat(form.sellPrice) > 0 && (
            <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 20 }}>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Zysk: <strong style={{ color: "#4ade80" }}>${profit.toFixed(2)}</strong></span>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Marża: <strong style={{ color: "#4ade80" }}>{margin}%</strong></span>
            </div>
          )}
          <Field label="PLATFORMA SPRZEDAŻY">
            <div style={{ position: "relative" }}>
              <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", pointerEvents: "none" }} />
            </div>
          </Field>
          <Field label="OPIS (opcjonalnie)">
            <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Dodatkowe info o produkcie..." />
          </Field>
          <button onClick={createListing} disabled={creating} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", cursor: creating ? "not-allowed" : "pointer", background: creating ? "rgba(74,222,128,0.3)" : "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 800, fontSize: 14 }}>
            {creating ? "AI generuje ogłoszenie…" : "✚ Utwórz ogłoszenie"}
          </button>
        </Modal>
      )}

      {/* Modal: Listing detail with AI content */}
      {showDetail && (
        <Modal title="Szczegóły ogłoszenia" onClose={() => setShowDetail(null)}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{showDetail.productName}</div>
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Kupujesz: <strong style={{ color: "#fff" }}>${showDetail.sourcePriceUSD}</strong></span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Sprzedajesz: <strong style={{ color: "#4ade80" }}>${showDetail.sellPrice}</strong></span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Zysk: <strong style={{ color: "#4ade80" }}>+${showDetail.profit}</strong></span>
            </div>
          </div>

          {showDetail.aiContent ? (
            <div>
              <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 6 }}>TYTUŁ OGŁOSZENIA (AI)</div>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{showDetail.aiContent.title}</div>
                <button onClick={() => copyText(showDetail.aiContent!.title)} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, padding: "4px 10px", color: "rgba(255,255,255,0.6)", fontSize: 11, cursor: "pointer" }}>
                  <Copy size={11} /> {copied ? "Skopiowano!" : "Kopiuj"}
                </button>
              </div>
              <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 6 }}>OPIS PRODUKTU (AI)</div>
                <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 1.6 }}>{showDetail.aiContent.description}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {showDetail.aiContent.tags.map((t, i) => (
                  <span key={i} style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 99, padding: "3px 10px", color: "#93c5fd", fontSize: 11 }}>#{t}</span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ background: "rgba(245,200,66,0.1)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 10, padding: 12, marginBottom: 14, color: "#fde68a", fontSize: 12 }}>
              Dodaj ANTHROPIC_API_KEY w Replit Secrets żeby AI generowało opisy ogłoszeń
            </div>
          )}

          <a href={PLATFORM_LINKS[showDetail.platform]} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 10, padding: "12px 16px", textDecoration: "none", marginBottom: 10 }}>
            <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 14 }}>🚀 Wystaw na {showDetail.platform}</span>
            <ExternalLink size={14} color="#4ade80" />
          </a>
          {showDetail.sourceUrl && (
            <a href={showDetail.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 10, padding: "12px 16px", textDecoration: "none" }}>
              <span style={{ color: "#fde68a", fontWeight: 700, fontSize: 14 }}>🛒 Źródło zakupu</span>
              <ExternalLink size={14} color="#fde68a" />
            </a>
          )}
        </Modal>
      )}

      {/* Modal: New Order */}
      {showNewOrder && (
        <Modal title={`Nowe zamówienie — ${showNewOrder.productName}`} onClose={() => setShowNewOrder(null)}>
          <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
            Klient zapłacił <strong style={{ color: "#4ade80" }}>${showNewOrder.sellPrice}</strong> · Ty zamawiasz za <strong style={{ color: "#fff" }}>${showNewOrder.sourcePriceUSD}</strong> · Zysk: <strong style={{ color: "#4ade80" }}>+${showNewOrder.profit}</strong>
          </div>
          <Field label="IMIĘ I NAZWISKO KUPUJĄCEGO">
            <input style={inputStyle} value={orderForm.buyerName} onChange={e => setOrderForm(f => ({ ...f, buyerName: e.target.value }))} placeholder="Jan Kowalski" />
          </Field>
          <Field label="ADRES DOSTAWY">
            <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }} value={orderForm.buyerAddress} onChange={e => setOrderForm(f => ({ ...f, buyerAddress: e.target.value }))} placeholder="123 Main St, New York, NY 10001, USA" />
          </Field>
          <Field label="EMAIL KUPUJĄCEGO">
            <input style={inputStyle} value={orderForm.buyerEmail} onChange={e => setOrderForm(f => ({ ...f, buyerEmail: e.target.value }))} placeholder="customer@email.com" />
          </Field>
          <Field label="ILOŚĆ">
            <input style={inputStyle} type="number" value={orderForm.quantity} onChange={e => setOrderForm(f => ({ ...f, quantity: e.target.value }))} min="1" />
          </Field>
          <button onClick={createOrder} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #f5c842, #d97706)", color: "#000", fontWeight: 800, fontSize: 14 }}>
            ✚ Dodaj zamówienie
          </button>
        </Modal>
      )}

      {/* Modal: Order detail / process */}
      {showOrderDetail && (
        <Modal title="Realizacja zamówienia" onClose={() => setShowOrderDetail(null)}>
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{showOrderDetail.productName}</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 4 }}>👤 {showOrderDetail.buyerName}</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 4 }}>📍 {showOrderDetail.buyerAddress}</div>
            {showOrderDetail.buyerEmail && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>✉ {showOrderDetail.buyerEmail}</div>}
          </div>

          {showOrderDetail.status === "pending" ? (
            <>
              <div style={{ background: "rgba(245,200,66,0.1)", border: "1px solid rgba(245,200,66,0.25)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ color: "#fde68a", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>⚡ KROKI DO REALIZACJI:</div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.8 }}>
                  1. Otwórz źródło zakupu poniżej<br />
                  2. Dodaj produkt do koszyka<br />
                  3. Wpisz adres klienta: <strong style={{ color: "#fff" }}>{showOrderDetail.buyerAddress}</strong><br />
                  4. Zapłać (${showOrderDetail.sourcePriceUSD}) — zarabiasz +${showOrderDetail.profit}<br />
                  5. Kliknij „Oznacz jako zrealizowane"
                </div>
              </div>
              {showOrderDetail.sourceUrl && (
                <a href={showOrderDetail.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(245,200,66,0.12)", border: "1px solid rgba(245,200,66,0.3)", borderRadius: 10, padding: "12px 16px", textDecoration: "none", marginBottom: 10 }}>
                  <span style={{ color: "#fde68a", fontWeight: 700, fontSize: 14 }}>🛒 Otwórz źródło i zamów</span>
                  <ExternalLink size={14} color="#fde68a" />
                </a>
              )}
              <button onClick={() => processOrder(showOrderDetail)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontWeight: 800, fontSize: 14 }}>
                ✓ Oznacz jako zrealizowane
              </button>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#4ade80", fontSize: 14, fontWeight: 700 }}>
              <CheckCircle size={18} /> Zamówienie zrealizowane · {showOrderDetail.processedAt && new Date(showOrderDetail.processedAt).toLocaleString()}
            </div>
          )}
        </Modal>
      )}

      <style>{`
        option { background: #0d1f0d; }
      `}</style>
    </ResellLayout>
  );
}
