import React, { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft, FileText, Copy, Check, RefreshCw, Edit3, Save,
  ExternalLink, Tag, Zap, AlertCircle, DollarSign, Sparkles,
  ChevronDown, Plus, X, TrendingUp,
} from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";

type Offer = {
  title: string;
  description: string;
  tags: string[];
  price: number;
  highlights: string[];
  shippingNote: string;
  seoKeywords: string[];
  itemSpecifics?: Record<string, string>;
  priceNote?: string;
  urgencyNote?: string;
};

const PLATFORM_FEES: Record<string, number> = {
  "eBay USA": 13.25, "Etsy USA": 9.5, "Amazon UK": 15, "Amazon DE": 15,
  "eBay DE": 12, "StockX USA": 9.5, "Vinted EU": 0, "Depop": 10,
};
const PLATFORM_SHIP: Record<string, number> = {
  "Clothing": 12, "Jewelry": 18, "Electronics": 28, "Collectibles": 22,
  "Sneakers": 25, "Spirits": 35, "Antiques": 40, "Watches": 30,
};
const PLATFORM_COLORS: Record<string, string> = {
  "eBay USA": "#f5c842", "Etsy USA": "#f97316", "Amazon UK": "#34d399",
  "Amazon DE": "#34d399", "eBay DE": "#60a5fa", "StockX USA": "#a78bfa",
  "Vinted EU": "#c084fc", "Depop": "#f87171",
};
const PLATFORM_SELL_URLS: Record<string, string> = {
  "eBay USA": "https://www.ebay.com/sell",
  "Etsy USA": "https://www.etsy.com/sell",
  "Amazon UK": "https://sell.amazon.co.uk",
  "Amazon DE": "https://sell.amazon.de",
  "eBay DE": "https://www.ebay.de/sell",
  "StockX USA": "https://stockx.com/sell",
  "Vinted EU": "https://www.vinted.com/sell-now",
  "Depop": "https://www.depop.com/sell",
};

const TONES = [
  { key: "vintage", label: "Vintage", desc: "Storytelling, authentic history" },
  { key: "professional", label: "Professional", desc: "Clean, keyword-dense" },
  { key: "luxury", label: "Luxury", desc: "Premium feel, high-value language" },
  { key: "urgency", label: "Urgency", desc: "Scarcity, act-now tone" },
];
const FOCUSES = [
  { key: "balanced", label: "Balanced" },
  { key: "seo", label: "Max SEO" },
  { key: "conversion", label: "Conversion" },
  { key: "rarity", label: "Rarity" },
];

function CopyBtn({ text, label = "Copy", small = false }: { text: string; label?: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); }); }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: small ? "3px 8px" : "5px 11px",
        borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)",
        background: done ? "rgba(74,222,128,0.12)" : "transparent",
        color: done ? "#4ade80" : "rgba(255,255,255,0.4)",
        fontSize: small ? 10 : 11, fontWeight: 700, cursor: "pointer",
      }}>
      {done ? <><Check size={10} /> Copied</> : <><Copy size={10} /> {label}</>}
    </button>
  );
}

function TitleGauge({ length, platform }: { length: number; platform: string }) {
  const max = platform.includes("Etsy") ? 140 : platform.includes("Amazon") ? 200 : 80;
  const pct = Math.min((length / max) * 100, 100);
  const color = pct > 100 ? "#f87171" : pct > 85 ? "#f5c842" : "#4ade80";
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden", marginBottom: 3 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "all 0.2s" }} />
      </div>
      <div style={{ color: pct > 100 ? "#f87171" : "rgba(255,255,255,0.25)", fontSize: 10 }}>
        {length}/{max} chars {pct > 100 && `— ${length - max} over limit`}
      </div>
    </div>
  );
}

export default function OfferPage() {
  const [, params] = useRoute("/resell/offer/:id");
  const [, setLocation] = useLocation();

  const [offer, setOffer] = useState<Offer | null>(null);
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState("eBay USA");
  const [tone, setTone] = useState("professional");
  const [focus, setFocus] = useState("balanced");
  const [editMode, setEditMode] = useState(false);
  const [edited, setEdited] = useState<Partial<Offer & { tags: string[] }>>({});
  const [newTag, setNewTag] = useState("");

  // Manual entry mode (no sessionStorage product)
  const [manualMode, setManualMode] = useState(false);
  const [manualForm, setManualForm] = useState({ name: "", buy: "", sell: "", category: "General" });
  const [regenCooldown, setRegenCooldown] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const DRAFT_KEY = "offer_draft_last";

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("resell_opportunity");
      if (stored) {
        const p = JSON.parse(stored);
        setProduct(p);
        setPlatform(p.market ?? "eBay USA");
      } else {
        // No new product — try loading last saved draft
        const draft = localStorage.getItem(DRAFT_KEY);
        if (draft) {
          const d = JSON.parse(draft);
          if (d.product) { setProduct(d.product); setPlatform(d.platform ?? "eBay USA"); }
          if (d.tone)    setTone(d.tone);
          if (d.focus)   setFocus(d.focus);
          if (d.offer)   { setOffer(d.offer); setDraftRestored(true); }
        }
      }
    } catch {}
  }, []);

  const generate = async (targetPlatform = platform, targetTone = tone, targetFocus = focus) => {
    const p = product ?? (manualMode && manualForm.name ? {
      name: manualForm.name,
      buy: parseFloat(manualForm.buy) || 0,
      sell: parseFloat(manualForm.sell) || 0,
      category: manualForm.category,
      market: targetPlatform,
    } : null);
    if (!p || regenCooldown) return;
    setLoading(true);
    setError(null);
    setOffer(null);
    setEdited({});
    setDraftRestored(false);
    try {
      const res = await fetch("/api/resell/generate-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: { ...p, market: targetPlatform },
          tone: targetTone,
          focus: targetFocus,
          anthropicKey: getAnthropicKey(),
        }),
      });
      const data = await res.json();
      if (data.offer) {
        setOffer(data.offer);
        // Auto-save draft to localStorage
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({
            offer: data.offer, product: p,
            platform: targetPlatform, tone: targetTone, focus: targetFocus,
          }));
        } catch {}
      } else {
        setError(data.message ?? "Generation failed — check your Anthropic API key in Settings.");
      }
    } catch {
      setError("Connection error — server unavailable.");
    }
    setLoading(false);
    // 6-second cooldown to prevent API spam
    setRegenCooldown(true);
    setTimeout(() => setRegenCooldown(false), 6000);
  };

  useEffect(() => {
    if (product && !offer && !loading) generate();
  }, [product]);

  const display = offer ? { ...offer, ...edited } : null;
  const activeTags = edited.tags ?? display?.tags ?? [];

  // Profit calculator
  const p = product ?? (manualMode ? {
    buy: parseFloat(manualForm.buy) || 0,
    sell: parseFloat(manualForm.sell) || 0,
    category: manualForm.category,
  } : null);
  const sellPrice = display?.price ?? p?.sell ?? 0;
  const buyPrice = p?.buy ?? 0;
  const feeP = PLATFORM_FEES[platform] ?? 13;
  const shipEst = PLATFORM_SHIP[p?.category ?? "General"] ?? 15;
  const feeAmt = sellPrice * (feeP / 100);
  const netProfit = Math.round((sellPrice - feeAmt - buyPrice - shipEst) * 100) / 100;
  const margin = sellPrice > 0 ? Math.round((netProfit / sellPrice) * 100) : 0;

  // Platform-formatted copy
  const getFormattedCopy = () => {
    if (!display) return "";
    if (platform.includes("eBay")) {
      return `${display.title}\n\n✅ KEY FEATURES:\n${(display.highlights ?? []).map(h => `• ${h}`).join("\n")}\n\n${display.description}\n\n📦 SHIPPING: ${display.shippingNote}\n\nKeywords: ${(display.seoKeywords ?? []).join(", ")}`;
    }
    if (platform.includes("Etsy")) {
      return `${display.title}\n\n${display.description}\n\n✨ ${(display.highlights ?? []).join(" · ")}\n\n📦 ${display.shippingNote}\n\nTags: ${activeTags.join(", ")}`;
    }
    return `${display.title}\n\n${display.description}\n\nPrice: $${display.price}\nShipping: ${display.shippingNote}\nTags: ${activeTags.join(", ")}`;
  };

  return (
    <ResellLayout>
      <div style={{ padding: "28px 28px 60px", maxWidth: 800 }}>
        <button onClick={() => setLocation(`/resell/product/${params?.id ?? "1"}`)}
          style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 22 }}>
          <ArrowLeft size={15} /> Back
        </button>

        {/* Draft restored banner */}
        {draftRestored && (
          <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 10, padding: "9px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={13} color="#a78bfa" />
            <span style={{ color: "#c4b5fd", fontSize: 12 }}>Draft restored from last session — regenerate for a fresh version</span>
            <button onClick={() => setDraftRestored(false)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 2 }}><X size={12} /></button>
          </div>
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: "linear-gradient(135deg, #a78bfa, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={18} color="#fff" />
            </div>
            <div>
              <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 900, margin: 0 }}>AI Offer Generator</h1>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>
                {product?.name ?? (manualMode ? manualForm.name || "New product" : "No product selected")} → {platform}
              </p>
            </div>
          </div>
          {/* Platform selector */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {Object.keys(PLATFORM_FEES).map(pl => (
              <button key={pl} onClick={() => { setPlatform(pl); if (offer || product) generate(pl, tone, focus); }}
                style={{
                  padding: "5px 11px", borderRadius: 99, border: "1px solid", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "all 0.12s",
                  background: platform === pl ? `${PLATFORM_COLORS[pl]}20` : "rgba(255,255,255,0.05)",
                  color: platform === pl ? PLATFORM_COLORS[pl] : "rgba(255,255,255,0.35)",
                  borderColor: platform === pl ? `${PLATFORM_COLORS[pl]}40` : "transparent",
                }}>
                {pl}
              </button>
            ))}
          </div>
        </div>

        {/* ── Profit panel (always visible) ── */}
        {p && (
          <div style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.18)", borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
            <TrendingUp size={13} color="#4ade80" style={{ marginRight: 8 }} />
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginRight: 4 }}>Buy</span>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 13, marginRight: 12 }}>${buyPrice}</span>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, marginRight: 12 }}>→</span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginRight: 4 }}>Sell</span>
            <span style={{ color: "#a78bfa", fontWeight: 800, fontSize: 13, marginRight: 12 }}>${sellPrice}</span>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, marginRight: 12 }}>→</span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginRight: 4 }}>Fee {feeP}%</span>
            <span style={{ color: "#f87171", fontWeight: 700, fontSize: 12, marginRight: 4 }}>-${feeAmt.toFixed(2)}</span>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginRight: 4 }}>ship</span>
            <span style={{ color: "#f87171", fontWeight: 700, fontSize: 12, marginRight: 12 }}>-${shipEst}</span>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, marginRight: 12 }}>→</span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginRight: 4 }}>Net</span>
            <span style={{ color: netProfit > 0 ? "#4ade80" : "#f87171", fontWeight: 900, fontSize: 16, marginRight: 8 }}>
              {netProfit > 0 ? "+" : ""}{netProfit}$
            </span>
            <span style={{ color: netProfit > 0 ? "#4ade80" : "#f87171", fontSize: 11, fontWeight: 700 }}>{margin}% margin</span>
          </div>
        )}

        {/* ── Tone & Focus selectors ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 6 }}>TONE</div>
            <div style={{ display: "flex", gap: 5 }}>
              {TONES.map(t => (
                <button key={t.key} onClick={() => setTone(t.key)} title={t.desc}
                  style={{ padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "all 0.12s",
                    background: tone === t.key ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.06)",
                    color: tone === t.key ? "#c4b5fd" : "rgba(255,255,255,0.4)" }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 6 }}>FOCUS</div>
            <div style={{ display: "flex", gap: 5 }}>
              {FOCUSES.map(f => (
                <button key={f.key} onClick={() => setFocus(f.key)}
                  style={{ padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "all 0.12s",
                    background: focus === f.key ? "rgba(245,200,66,0.2)" : "rgba(255,255,255,0.06)",
                    color: focus === f.key ? "#f5c842" : "rgba(255,255,255,0.4)" }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => generate(platform, tone, focus)}
            disabled={(!product && !manualMode) || loading}
            style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.12)", color: "#a78bfa", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {loading ? "Generating…" : "Regenerate"}
          </button>
        </div>

        {/* ── Manual entry (no product) ── */}
        {!product && !manualMode && !loading && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "28px 24px", textAlign: "center", marginBottom: 16 }}>
            <Zap size={28} color="rgba(255,255,255,0.15)" style={{ margin: "0 auto 10px" }} />
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 6 }}>No product selected</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginBottom: 14 }}>Open a product from Dashboard/Search, or enter details manually below.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={() => setLocation("/resell")}
                style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.5)", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                Go to Dashboard
              </button>
              <button onClick={() => setManualMode(true)}
                style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: "rgba(139,92,246,0.2)", color: "#a78bfa", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                Enter manually
              </button>
            </div>
          </div>
        )}

        {manualMode && !product && (
          <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 14, padding: "16px 18px", marginBottom: 14 }}>
            <div style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700, letterSpacing: 0.6, marginBottom: 12 }}>ENTER PRODUCT DETAILS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 120px", gap: 10, alignItems: "end" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginBottom: 4 }}>Product name</div>
                <input value={manualForm.name} onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Vintage Leica M3 camera body"
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 12, boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginBottom: 4 }}>Buy ($)</div>
                <input value={manualForm.buy} onChange={e => setManualForm(f => ({ ...f, buy: e.target.value }))} type="number"
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 12, boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginBottom: 4 }}>Sell ($)</div>
                <input value={manualForm.sell} onChange={e => setManualForm(f => ({ ...f, sell: e.target.value }))} type="number"
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 12, boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginBottom: 4 }}>Category</div>
                <select value={manualForm.category} onChange={e => setManualForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: "100%", background: "rgba(30,10,60,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 12, boxSizing: "border-box", fontFamily: "inherit" }}>
                  {["General","Clothing","Jewelry","Electronics","Collectibles","Sneakers","Watches","Antiques","Spirits"].map(c =>
                    <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <button
              disabled={!manualForm.name || loading}
              onClick={() => generate(platform, tone, focus)}
              style={{ marginTop: 12, padding: "9px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <Sparkles size={13} style={{ marginRight: 6, verticalAlign: "middle" }} />Generate Offer
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16, padding: "36px 24px", textAlign: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 14 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa", animation: `bounce 1s ${i*0.2}s infinite` }} />
              ))}
            </div>
            <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: 14 }}>Generating {tone} offer for {platform}…</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 5 }}>Optimizing title, description, tags and item specifics</div>
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12, padding: "14px 18px", display: "flex", gap: 10, marginBottom: 16 }}>
            <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ color: "#fca5a5", fontWeight: 700, fontSize: 13 }}>{error}</div>
              {error.toLowerCase().includes("key") && (
                <button onClick={() => setLocation("/resell/settings")}
                  style={{ marginTop: 6, padding: "5px 12px", borderRadius: 7, background: "rgba(139,92,246,0.2)", border: "none", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Open API Settings →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Offer ── */}
        {display && !loading && (
          <>
            {/* Price note */}
            {display.priceNote && (
              <div style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: "9px 14px", marginBottom: 12, color: "#86efac", fontSize: 12 }}>
                💡 {display.priceNote}
              </div>
            )}

            {/* Urgency note */}
            {display.urgencyNote && (
              <div style={{ background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 10, padding: "9px 14px", marginBottom: 12, color: "#fde68a", fontSize: 12 }}>
                ⚡ {display.urgencyNote}
              </div>
            )}

            {/* Title */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "16px 18px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>TITLE</span>
                <CopyBtn text={edited.title ?? display.title ?? ""} label="Copy" />
              </div>
              {editMode ? (
                <input value={edited.title ?? display.title} onChange={e => setEdited(p => ({ ...p, title: e.target.value }))}
                  style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 14, fontWeight: 600, boxSizing: "border-box", fontFamily: "inherit" }} />
              ) : (
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>{edited.title ?? display.title}</div>
              )}
              <TitleGauge length={(edited.title ?? display.title ?? "").length} platform={platform} />
            </div>

            {/* Highlights */}
            {display.highlights?.length > 0 && (
              <div style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.14)", borderRadius: 14, padding: "14px 18px", marginBottom: 10 }}>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>KEY SELLING POINTS</div>
                {display.highlights.map((h, i) => (
                  <div key={i} style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, padding: "3px 0", display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: "#4ade80", fontWeight: 700, flexShrink: 0 }}>✓</span> {h}
                  </div>
                ))}
              </div>
            )}

            {/* Description */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "16px 18px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>DESCRIPTION</span>
                <CopyBtn text={edited.description ?? display.description ?? ""} label="Copy" />
              </div>
              {editMode ? (
                <textarea value={edited.description ?? display.description} onChange={e => setEdited(p => ({ ...p, description: e.target.value }))}
                  rows={8} style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, padding: "8px 12px", color: "rgba(255,255,255,0.8)", fontSize: 12, lineHeight: 1.7, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
              ) : (
                <pre style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{edited.description ?? display.description}</pre>
              )}
            </div>

            {/* Item Specifics (eBay/Amazon) */}
            {display.itemSpecifics && Object.keys(display.itemSpecifics).length > 0 && (
              <div style={{ background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 14, padding: "14px 18px", marginBottom: 10 }}>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>ITEM SPECIFICS (for {platform})</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                  {Object.entries(display.itemSpecifics).map(([k, v]) => (
                    <div key={k} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "6px 10px" }}>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 2 }}>{k}</div>
                      <div style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shipping */}
            {display.shippingNote && (
              <div style={{ background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.12)", borderRadius: 12, padding: "10px 16px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>📦 SHIPPING  </span>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{display.shippingNote}</span>
                </div>
                <CopyBtn text={display.shippingNote} label="Copy" small />
              </div>
            )}

            {/* Tags */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "14px 18px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Tag size={11} color="rgba(255,255,255,0.3)" />
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>TAGS · {activeTags.length}</span>
                </div>
                <CopyBtn text={activeTags.join(", ")} label="Copy all" />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: editMode ? 8 : 0 }}>
                {activeTags.map((t, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.22)", borderRadius: 99, padding: "3px 10px", color: "#a78bfa", fontSize: 11 }}>
                    #{t}
                    {editMode && (
                      <button onClick={() => setEdited(p => ({ ...p, tags: activeTags.filter((_, j) => j !== i) }))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 0, display: "flex" }}>
                        <X size={9} />
                      </button>
                    )}
                    {!editMode && (
                      <button onClick={() => navigator.clipboard.writeText(t)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(139,92,246,0.5)", padding: 0, display: "flex" }}>
                        <Copy size={9} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {editMode && (
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newTag.trim()) { setEdited(p => ({ ...p, tags: [...activeTags, newTag.trim()] })); setNewTag(""); } }}
                    placeholder="Add tag…"
                    style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 7, padding: "5px 10px", color: "#fff", fontSize: 11, fontFamily: "inherit" }} />
                  <button onClick={() => { if (newTag.trim()) { setEdited(p => ({ ...p, tags: [...activeTags, newTag.trim()] })); setNewTag(""); } }}
                    style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: "rgba(139,92,246,0.2)", color: "#a78bfa", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    <Plus size={11} />
                  </button>
                </div>
              )}
            </div>

            {/* SEO keywords */}
            {display.seoKeywords?.length > 0 && (
              <div style={{ background: "rgba(245,200,66,0.04)", border: "1px solid rgba(245,200,66,0.12)", borderRadius: 12, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>🔍 SEO  </span>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{display.seoKeywords.join(" · ")}</span>
                </div>
                <CopyBtn text={display.seoKeywords.join(", ")} label="Copy" small />
              </div>
            )}

            {/* Action bar */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setEditMode(e => !e)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 15px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: editMode ? "rgba(139,92,246,0.15)" : "transparent", color: editMode ? "#a78bfa" : "rgba(255,255,255,0.45)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                {editMode ? <><Save size={12} /> Done</> : <><Edit3 size={12} /> Edit</>}
              </button>
              <CopyBtn text={getFormattedCopy()} label="Copy formatted for platform" />
              {PLATFORM_SELL_URLS[platform] && (
                <a href={PLATFORM_SELL_URLS[platform]} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${PLATFORM_COLORS[platform]}cc, ${PLATFORM_COLORS[platform]}88)`, color: "#000", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>
                  <ExternalLink size={13} /> List on {platform}
                </a>
              )}
            </div>
          </>
        )}
      </div>
      <style>{`
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.2); }
        input:focus, textarea:focus, select:focus { outline: none; border-color: rgba(139,92,246,0.5) !important; }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </ResellLayout>
  );
}
