import React, { useState, useEffect } from "react";
import { X, Boxes, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

const PLATFORM_FEES: Record<string, number> = {
  "eBay USA": 0.1325,
  "Etsy USA": 0.095,
  "Amazon UK": 0.15,
  "eBay DE": 0.12,
  "Amazon DE": 0.15,
  "Vinted EU": 0,
  "StockX USA": 0.095,
  "Depop": 0.10,
};

const AVG_SHIPPING: Record<string, number> = {
  "Clothing": 12, "Jewelry": 18, "Electronics": 28, "Collectibles": 22,
  "Sneakers": 25, "Spirits": 35, "Antiques": 40, "Watches": 30,
};

const PLATFORMS = Object.keys(PLATFORM_FEES);
const CATEGORIES = Object.keys(AVG_SHIPPING);

type QuickOpp = {
  name?: string;
  productName?: string;
  buy?: number;
  sourcePriceUSD?: number;
  sell?: number;
  sellPrice?: number;
  market?: string;
  sellMarket?: string;
  platform?: string;
  category?: string;
  sourceUrl?: string;
  buyHint?: string;
  sellHint?: string;
  sourceMarket?: string;
};

type Props = {
  opportunity: QuickOpp;
  onClose: () => void;
  onCreated?: (listing: any) => void;
};

function calcProfit(sell: number, buy: number, platform: string, category: string) {
  const fee = PLATFORM_FEES[platform] ?? 0.13;
  const ship = AVG_SHIPPING[category] ?? 15;
  const feeAmt = sell * fee;
  return Math.round((sell - feeAmt - buy - ship) * 100) / 100;
}

export function QuickCreateOfferModal({ opportunity, onClose, onCreated }: Props) {
  const [, setLocation] = useLocation();

  const defaultName = opportunity.name ?? opportunity.productName ?? "";
  const defaultBuy = opportunity.buy ?? opportunity.sourcePriceUSD ?? 0;
  const defaultSell = opportunity.sell ?? opportunity.sellPrice ?? 0;
  const defaultPlatform =
    opportunity.platform ??
    opportunity.market ??
    opportunity.sellMarket ??
    "eBay USA";
  const defaultCategory = opportunity.category ?? "General";
  const defaultSourceUrl = opportunity.sourceUrl ?? "";
  const defaultBuyHint = opportunity.buyHint ?? "";
  const defaultSellHint = opportunity.sellHint ?? "";
  const defaultSourceMarket = opportunity.sourceMarket ?? "";

  const [name, setName] = useState(defaultName);
  const [buyPrice, setBuyPrice] = useState(String(defaultBuy));
  const [sellPrice, setSellPrice] = useState(String(defaultSell));
  const [platform, setPlatform] = useState(
    PLATFORMS.includes(defaultPlatform) ? defaultPlatform : "eBay USA"
  );
  const [category, setCategory] = useState(
    CATEGORIES.includes(defaultCategory) ? defaultCategory : "General"
  );
  const [stock, setStock] = useState("1");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [createdId, setCreatedId] = useState<number | null>(null);

  const sell = parseFloat(sellPrice) || 0;
  const buy = parseFloat(buyPrice) || 0;
  const qty = parseInt(stock) || 1;
  const profit = calcProfit(sell, buy, platform, category);
  const feeAmt = sell * (PLATFORM_FEES[platform] ?? 0.13);
  const margin = sell > 0 ? Math.round((profit / sell) * 100) : 0;

  const handleSubmit = async () => {
    if (!name.trim()) { setErrorMsg("Product name is required"); return; }
    if (!sell || sell <= 0) { setErrorMsg("Sell price must be > 0"); return; }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/dropship/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productName: name.trim(),
          sellPrice: sell,
          sourcePriceUSD: buy,
          platform,
          category,
          stockQuantity: qty,
          sourceUrl: defaultSourceUrl,
          buyHint: defaultBuyHint,
          sellHint: defaultSellHint,
          sourceMarket: defaultSourceMarket,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      setStatus("success");
      setCreatedId(data.listing?.id ?? null);
      onCreated?.(data.listing);
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e.message || "Failed to create listing");
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 9, color: "#fff", fontSize: 14, padding: "9px 12px",
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
    marginBottom: 5, display: "block",
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: "none" as any };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999, padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%", maxWidth: 480,
          background: "linear-gradient(135deg, #1a1030 0%, #130d22 100%)",
          border: "1px solid rgba(139,92,246,0.25)", borderRadius: 18,
          padding: 28, position: "relative",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #60a5fa, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Boxes size={16} color="#fff" />
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>Create Listing</div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Publish to your dropship store</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 8, color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 7 }}>
            <X size={15} />
          </button>
        </div>

        {/* Success state */}
        {status === "success" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <CheckCircle size={48} color="#4ade80" style={{ margin: "0 auto 14px", display: "block" }} />
            <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 17, marginBottom: 6 }}>Listing Created!</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 22 }}>
              {name} is live with {stock} unit{parseInt(stock) !== 1 ? "s" : ""}. Auto-removes when stock hits 0.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => setLocation("/resell/dropship")}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #60a5fa, #3b82f6)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Open Dropship Manager
              </button>
              <button
                onClick={onClose}
                style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        {status !== "success" && (
          <>
            {/* Product name */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>PRODUCT NAME *</label>
              <input
                style={inputStyle}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Vostok Amphibia 100 Military"
              />
            </div>

            {/* Platform + Category */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>PLATFORM *</label>
                <select style={selectStyle} value={platform} onChange={e => setPlatform(e.target.value)}>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>CATEGORY</label>
                <select style={selectStyle} value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="General">General</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Buy + Sell prices */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>BUY PRICE (USD)</label>
                <input
                  style={inputStyle} type="number" min="0" step="0.01"
                  value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label style={labelStyle}>SELL PRICE (USD) *</label>
                <input
                  style={inputStyle} type="number" min="0" step="0.01"
                  value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Stock */}
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>STOCK QUANTITY</label>
              <input
                style={inputStyle} type="number" min="1" step="1"
                value={stock} onChange={e => setStock(e.target.value)}
                placeholder="1"
              />
              <div style={{ color: "rgba(96,165,250,0.7)", fontSize: 11, marginTop: 5 }}>
                ✓ Listing auto-removes when stock reaches 0 — no refunds needed
              </div>
            </div>

            {/* Profit preview */}
            {sell > 0 && (
              <div style={{
                background: profit > 0 ? "rgba(74,222,128,0.07)" : "rgba(248,113,113,0.07)",
                border: `1px solid ${profit > 0 ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
                borderRadius: 10, padding: "12px 16px", marginBottom: 18,
                display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8,
              }}>
                {[
                  { label: "FEE", val: `-$${Math.round(feeAmt * 100) / 100}`, color: "#f87171" },
                  { label: "NET PROFIT", val: `${profit >= 0 ? "+" : ""}$${profit}`, color: profit > 0 ? "#4ade80" : "#f87171" },
                  { label: "MARGIN", val: `${margin}%`, color: profit > 0 ? "#f5c842" : "#f87171" },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: "center" }}>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>{s.label}</div>
                    <div style={{ color: s.color, fontWeight: 900, fontSize: 14 }}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {(status === "error" || errorMsg) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 9, padding: "10px 14px", marginBottom: 14 }}>
                <AlertCircle size={14} color="#f87171" />
                <span style={{ color: "#f87171", fontSize: 12 }}>{errorMsg}</span>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={status === "loading"}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 11, border: "none",
                background: status === "loading" ? "rgba(96,165,250,0.4)" : "linear-gradient(135deg, #60a5fa, #3b82f6)",
                color: "#fff", fontWeight: 800, fontSize: 14, cursor: status === "loading" ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {status === "loading" ? (
                <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Creating…</>
              ) : (
                <><Boxes size={16} /> Create Listing</>
              )}
            </button>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
