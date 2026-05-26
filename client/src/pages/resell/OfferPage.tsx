import React, { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft, FileText, Copy, Check, RefreshCw, Edit3, Save,
  ExternalLink, Tag, Zap, AlertCircle,
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
};

const PLATFORM_LINKS: Record<string, { sell: string; label: string; color: string }> = {
  "eBay USA":   { sell: "https://www.ebay.com/sell",       label: "List on eBay USA",   color: "#f5c842" },
  "Etsy USA":   { sell: "https://www.etsy.com/sell",       label: "List on Etsy",        color: "#f97316" },
  "Amazon UK":  { sell: "https://sell.amazon.co.uk",       label: "List on Amazon UK",   color: "#34d399" },
  "Amazon DE":  { sell: "https://sell.amazon.de",          label: "List on Amazon DE",   color: "#34d399" },
  "eBay DE":    { sell: "https://www.ebay.de/sell",        label: "List on eBay DE",     color: "#60a5fa" },
  "StockX USA": { sell: "https://stockx.com/sell",         label: "List on StockX",      color: "#a78bfa" },
  "Vinted EU":  { sell: "https://www.vinted.com/sell-now", label: "List on Vinted",      color: "#c084fc" },
};

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    });
  };
  return (
    <button onClick={copy} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)",
      background: done ? "rgba(74,222,128,0.12)" : "transparent",
      color: done ? "#4ade80" : "rgba(255,255,255,0.4)",
      fontSize: 11, fontWeight: 700, cursor: "pointer",
    }}>
      {done ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> {label}</>}
    </button>
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
  const [editMode, setEditMode] = useState(false);
  const [edited, setEdited] = useState<Partial<Offer>>({});

  // Load product from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("resell_opportunity");
      if (stored) {
        const p = JSON.parse(stored);
        setProduct(p);
        setPlatform(p.market ?? "eBay USA");
      }
    } catch {}
  }, []);

  const generate = async (targetPlatform = platform) => {
    if (!product) return;
    setLoading(true);
    setError(null);
    setOffer(null);
    setEdited({});
    try {
      const res = await fetch("/api/resell/generate-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: { ...product, market: targetPlatform },
          anthropicKey: getAnthropicKey(),
        }),
      });
      const data = await res.json();
      if (data.offer) {
        setOffer(data.offer);
      } else {
        setError(data.message ?? "Generation failed. Check your Anthropic API key.");
      }
    } catch {
      setError("Connection error — server unavailable.");
    }
    setLoading(false);
  };

  // Auto-generate when product loads
  useEffect(() => {
    if (product && !offer && !loading) generate();
  }, [product]);

  const display = offer ? { ...offer, ...edited } : null;
  const platformLink = PLATFORM_LINKS[platform];

  const fullText = display
    ? `${display.title}\n\n${display.description}\n\nPrice: $${display.price}\n\nTags: ${display.tags?.join(", ")}`
    : "";

  return (
    <ResellLayout>
      <div style={{ padding: "28px 28px 60px", maxWidth: 760 }}>
        <button onClick={() => setLocation(`/resell/product/${params?.id ?? "1"}`)}
          style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.45)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 24 }}>
          <ArrowLeft size={15} /> Back
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #a78bfa, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>AI Offer Generator</h1>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
                {product?.name ?? "Loading product…"} → {platform}
              </p>
            </div>
          </div>

          {/* Platform selector */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.keys(PLATFORM_LINKS).map(p => (
              <button key={p} onClick={() => { setPlatform(p); generate(p); }}
                style={{
                  padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  background: platform === p ? `${PLATFORM_LINKS[p].color}25` : "rgba(255,255,255,0.06)",
                  color: platform === p ? PLATFORM_LINKS[p].color : "rgba(255,255,255,0.4)",
                  borderWidth: 1, borderStyle: "solid",
                  borderColor: platform === p ? `${PLATFORM_LINKS[p].color}40` : "transparent",
                  transition: "all 0.15s",
                }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Warning */}
        <div style={{ background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 10, padding: "9px 14px", marginBottom: 18, color: "#fde68a", fontSize: 12 }}>
          ⚠ AI draft — review before publishing. You are responsible for accuracy.
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16, padding: "40px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 14 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa", animation: `bounce 1s ${i*0.2}s infinite` }} />
              ))}
            </div>
            <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: 14 }}>🤖 AI generating offer for {platform}…</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 6 }}>Optimizing title, description and SEO tags</div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12, padding: "14px 18px", display: "flex", gap: 10 }}>
            <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ color: "#fca5a5", fontWeight: 700, fontSize: 13 }}>{error}</div>
              {error.includes("key") && (
                <button onClick={() => setLocation("/resell/settings")}
                  style={{ marginTop: 6, padding: "5px 12px", borderRadius: 7, background: "rgba(139,92,246,0.2)", border: "none", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Open API Settings →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Offer display */}
        {display && !loading && (
          <>
            {/* Title */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "18px 20px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>TITLE</div>
                <CopyBtn text={display.title ?? ""} label="Copy title" />
              </div>
              {editMode ? (
                <input
                  value={edited.title ?? display.title}
                  onChange={e => setEdited(prev => ({ ...prev, title: e.target.value }))}
                  style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 14, fontWeight: 600, boxSizing: "border-box" }}
                />
              ) : (
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>{display.title}</div>
              )}
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 6 }}>
                {(display.title?.length ?? 0)} chars
                {platform.includes("eBay") && (display.title?.length ?? 0) > 80 && <span style={{ color: "#f87171", marginLeft: 6 }}>⚠ eBay max 80</span>}
                {platform.includes("Etsy") && (display.title?.length ?? 0) > 140 && <span style={{ color: "#f87171", marginLeft: 6 }}>⚠ Etsy max 140</span>}
              </div>
            </div>

            {/* Highlights */}
            {display.highlights?.length > 0 && (
              <div style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 14, padding: "14px 20px", marginBottom: 12 }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>KEY SELLING POINTS</div>
                {display.highlights.map((h, i) => (
                  <div key={i} style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, padding: "3px 0", display: "flex", gap: 8 }}>
                    <span style={{ color: "#4ade80", fontWeight: 700 }}>✓</span> {h}
                  </div>
                ))}
              </div>
            )}

            {/* Description */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "18px 20px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>DESCRIPTION</div>
                <CopyBtn text={display.description ?? ""} label="Copy desc" />
              </div>
              {editMode ? (
                <textarea
                  value={edited.description ?? display.description}
                  onChange={e => setEdited(prev => ({ ...prev, description: e.target.value }))}
                  rows={8}
                  style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8, padding: "8px 12px", color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 1.7, boxSizing: "border-box", resize: "vertical" }}
                />
              ) : (
                <pre style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{display.description}</pre>
              )}
            </div>

            {/* Shipping note */}
            {display.shippingNote && (
              <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 12, padding: "12px 18px", marginBottom: 12 }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>📦 SHIPPING</div>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{display.shippingNote}</div>
              </div>
            )}

            {/* Tags */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "14px 20px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Tag size={12} color="rgba(255,255,255,0.35)" />
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>TAGS / KEYWORDS</span>
                </div>
                <CopyBtn text={(display.tags ?? []).join(", ")} label="Copy tags" />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {display.tags?.map((t, i) => (
                  <span key={i} style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 99, padding: "3px 10px", color: "#a78bfa", fontSize: 11 }}>#{t}</span>
                ))}
              </div>
            </div>

            {/* SEO keywords */}
            {display.seoKeywords?.length > 0 && (
              <div style={{ background: "rgba(245,200,66,0.05)", border: "1px solid rgba(245,200,66,0.15)", borderRadius: 12, padding: "12px 18px", marginBottom: 18 }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>🔍 SEO KEYWORDS</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{display.seoKeywords.join(" · ")}</div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { setEditMode(e => !e); }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: editMode ? "rgba(139,92,246,0.15)" : "transparent", color: editMode ? "#a78bfa" : "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                {editMode ? <><Save size={13} /> Done editing</> : <><Edit3 size={13} /> Edit</>}
              </button>
              <button onClick={() => generate()}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(139,92,246,0.2)", background: "rgba(139,92,246,0.1)", color: "#a78bfa", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                <RefreshCw size={13} /> Regenerate
              </button>
              <CopyBtn text={fullText} label="Copy full offer" />
              {platformLink && (
                <a href={platformLink.sell} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "10px 18px",
                    borderRadius: 10, border: "none", cursor: "pointer",
                    background: `linear-gradient(135deg, ${platformLink.color}cc, ${platformLink.color}88)`,
                    color: "#000", fontWeight: 800, fontSize: 12, textDecoration: "none",
                  }}>
                  <ExternalLink size={13} /> {platformLink.label}
                </a>
              )}
            </div>
          </>
        )}

        {/* No product warning */}
        {!product && !loading && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "40px 24px", textAlign: "center" }}>
            <Zap size={32} color="rgba(255,255,255,0.15)" style={{ margin: "0 auto 12px" }} />
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 8 }}>No product selected</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Open a product from the Dashboard to generate an offer</div>
            <button onClick={() => setLocation("/resell")}
              style={{ marginTop: 14, padding: "8px 18px", borderRadius: 10, border: "none", background: "rgba(139,92,246,0.2)", color: "#a78bfa", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
      <style>{`
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      `}</style>
    </ResellLayout>
  );
}
