import React, { useState } from "react";
import { X, Copy, Check, ExternalLink, Package, Truck, CheckCircle, DollarSign, AlertTriangle } from "lucide-react";

interface FulfillmentOrder {
  orderId?: number;
  listingId?: number;
  productName?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  sourceUrl?: string;
  sourceMarket?: string;
  buyPrice?: number;
  sellPrice?: number;
  profit?: number;
  quantity?: number;
  platform?: string;
  category?: string;
}

interface Props {
  order: FulfillmentOrder;
  onClose: () => void;
  onProcessed?: () => void;
}

type Step = "buy" | "tracking" | "done";

// ── Shipping helpers ──────────────────────────────────────────────────────────

function detectBuyerCountry(address: string): string | null {
  const a = address.toUpperCase();
  if (/\bUSA\b|\bUNITED STATES\b|\bU\.S\.A\b/.test(a)) return "US";
  if (/\bUK\b|\bUNITED KINGDOM\b|\bENGLAND\b|\bSCOTLAND\b|\bWALES\b/.test(a)) return "GB";
  if (/\bGERMANY\b|\bDEUTSCHLAND\b/.test(a)) return "DE";
  if (/\bPOLAND\b|\bPOLSKA\b/.test(a)) return "PL";
  if (/\bFRANCE\b|\bFRANKREICH\b/.test(a)) return "FR";
  if (/\bITALY\b|\bITALIA\b/.test(a)) return "IT";
  if (/\bSPAIN\b|\bESPA[NÑ]A\b/.test(a)) return "ES";
  if (/\bNETHERLANDS\b|\bHOLLAND\b/.test(a)) return "NL";
  if (/\bJAPAN\b|\bJAPONIA\b/.test(a)) return "JP";
  if (/\bCANADA\b/.test(a)) return "CA";
  if (/\bAUSTRALIA\b/.test(a)) return "AU";
  if (/\bNORWAY\b|\bNORGE\b/.test(a)) return "NO";
  // Postal code patterns
  if (/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s\d[A-Z]{2}\b/.test(a)) return "GB";
  if (/\b\d{2}-\d{3}\b/.test(a)) return "PL";
  return null;
}

function detectSourceCountry(url = "", market = ""): string | null {
  const u = url.toLowerCase(), m = market.toLowerCase();
  if (u.includes("allegro.pl") || u.includes("olx.pl")) return "PL";
  if (u.includes("kleinanzeigen.de") || u.includes("ebay.de")) return "DE";
  if (u.includes("ebay.fr") || u.includes("leboncoin.fr")) return "FR";
  if (u.includes("ebay.co.uk") || u.includes("gumtree.com")) return "GB";
  if (u.includes("marktplaats.nl") || u.includes("ebay.nl")) return "NL";
  if (u.includes("wallapop") || u.includes("ebay.es")) return "ES";
  if (u.includes("subito.it") || u.includes("ebay.it")) return "IT";
  if (u.includes("yahoo.co.jp") || u.includes(".co.jp")) return "JP";
  if (u.includes("ebay.com") || u.includes("craigslist")) return "US";
  if (m.includes("pl")) return "PL";
  if (m.includes("de")) return "DE";
  if (m.includes("gb") || m.includes("uk")) return "GB";
  if (m.includes("fr")) return "FR";
  if (m.includes("us")) return "US";
  if (m.includes("jp")) return "JP";
  return null;
}

const EU = ["PL","DE","FR","IT","ES","NL","CZ","AT","BE","SE","DK","FI","PT","HU","RO"];

function estimateShipping(src: string | null, dst: string | null, category = ""): { cost: number; days: string } {
  if (!src || !dst) return { cost: 22, days: "7–21" };
  if (src === dst) return { cost: 5, days: "2–4" };
  const heavy = ["Electronics","Antiques","Spirits"].includes(category);
  const base = heavy ? 15 : 0;
  // EU → US / CA
  if (EU.includes(src) && (dst === "US" || dst === "CA")) return { cost: 28 + base, days: "7–14" };
  // EU → GB
  if (EU.includes(src) && dst === "GB") return { cost: 15 + base, days: "4–8" };
  // EU → EU
  if (EU.includes(src) && EU.includes(dst)) return { cost: 9 + base, days: "3–6" };
  // GB → US
  if (src === "GB" && dst === "US") return { cost: 20 + base, days: "5–10" };
  // GB → EU
  if (src === "GB" && EU.includes(dst)) return { cost: 14 + base, days: "4–8" };
  // US → EU / GB
  if (src === "US" && (EU.includes(dst) || dst === "GB")) return { cost: 30 + base, days: "7–14" };
  // JP → anywhere
  if (src === "JP") return { cost: dst === "US" ? 22 : 30, days: "5–12" };
  return { cost: 25 + base, days: "10–21" };
}

function getShippingWarning(src: string | null, dst: string | null, url = ""): { level: "warn" | "ok" | "check"; text: string } | null {
  if (!src || !dst) return null;
  // Same country — no issue
  if (src === dst) return { level: "ok", text: "Wysyłka krajowa — bez problemu." };
  // Allegro: many sellers domestic only
  if (url.includes("allegro.pl") || url.includes("olx.pl")) {
    return { level: "warn", text: `Uwaga: większość sprzedawców na Allegro wysyła TYLKO w Polsce. Przed zakupem sprawdź opcje wysyłki i zapytaj sprzedawcę o wysyłkę do ${dst}.` };
  }
  // Kleinanzeigen: mostly local pickup
  if (url.includes("kleinanzeigen.de")) {
    return { level: "warn", text: "Uwaga: Kleinanzeigen.de to głównie sprzedaż lokalna (odbiór osobisty). Wielu sprzedawców nie wysyła paczek — sprawdź ogłoszenie dokładnie." };
  }
  // Vinted: domestic only
  if (url.includes("vinted.")) {
    return { level: "warn", text: "Uwaga: Vinted zazwyczaj obsługuje tylko wysyłkę krajową. Upewnij się że sprzedawca wysyła za granicę." };
  }
  // Facebook Marketplace
  if (url.includes("facebook.com") || url.includes("fb.com")) {
    return { level: "warn", text: "Uwaga: Facebook Marketplace to głównie sprzedaż lokalna. Wysyłka zależy wyłącznie od sprzedawcy." };
  }
  // eBay — generally ships internationally
  if (url.includes("ebay.")) {
    return { level: "check", text: `Sprawdź na stronie oferty czy sprzedawca wysyła do ${dst} (opcja 'International shipping').` };
  }
  // Generic international warning
  return { level: "check", text: `Przesyłka ${src}→${dst}: upewnij się że sprzedawca oferuje wysyłkę zagraniczną przed dokonaniem zakupu.` };
}

const COUNTRY_NAMES: Record<string, string> = {
  US:"USA", GB:"UK", DE:"Niemcy", PL:"Polska", FR:"Francja", IT:"Włochy",
  ES:"Hiszpania", NL:"Holandia", JP:"Japonia", CA:"Kanada", AU:"Australia", NO:"Norwegia",
};

// ─────────────────────────────────────────────────────────────────────────────

export function FulfillmentModal({ order, onClose, onProcessed }: Props) {
  const [step, setStep] = useState<Step>("buy");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const formattedAddress = [order.buyerName, order.buyerAddress].filter(Boolean).join("\n");

  const buyerCountry  = detectBuyerCountry(order.buyerAddress || "");
  const sourceCountry = detectSourceCountry(order.sourceUrl, order.sourceMarket);
  const shipping      = estimateShipping(sourceCountry, buyerCountry, order.category);
  const warning       = getShippingWarning(sourceCountry, buyerCountry, order.sourceUrl || "");

  const copyAddress = () => {
    navigator.clipboard.writeText(formattedAddress).then(() => {
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    });
  };

  const openSource = () => {
    if (order.sourceUrl) {
      window.open(order.sourceUrl, "_blank");
      setTimeout(() => setStep("tracking"), 1500);
    }
  };

  const submitTracking = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (order.orderId) {
        const res = await fetch(`/api/dropship/orders/${order.orderId}/process`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trackingNumber: trackingNumber.trim() }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as any).error || `Server error ${res.status}`);
        }
      }
      setStep("done");
      onProcessed?.();
    } catch (err: any) {
      setSubmitError(err.message || "Błąd zapisu — spróbuj ponownie");
    } finally { setSubmitting(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 9, color: "#fff", fontSize: 14, padding: "10px 14px", outline: "none",
    fontFamily: "inherit",
  };


  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "100%", maxWidth: 480, background: "linear-gradient(135deg, #1a1030, #130d22)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 18, padding: 28, position: "relative" }}>

        {/* Close */}
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: 7 }}>
          <X size={15} />
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #f5c842, #f59e0b)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Package size={16} color="#000" />
          </div>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>Fulfillment Assistant</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{order.productName?.slice(0, 50)}</div>
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
          {[
            { key: "buy", label: "1. Buy" },
            { key: "tracking", label: "2. Tracking" },
            { key: "done", label: "3. Done" },
          ].map((s, i, arr) => {
            const isActive = s.key === step;
            const isDone = (step === "tracking" && s.key === "buy") || (step === "done" && s.key !== "done");
            return (
              <React.Fragment key={s.key}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0,
                    background: isDone ? "#4ade80" : isActive ? "#8b5cf6" : "rgba(255,255,255,0.08)",
                    color: isDone || isActive ? "#fff" : "rgba(255,255,255,0.3)",
                  }}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? "#fff" : "rgba(255,255,255,0.35)" }}>{s.label}</span>
                </div>
                {i < arr.length - 1 && <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)", margin: "0 8px" }} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Step 1: Buy ── */}
        {step === "buy" && (
          <div>
            {/* Profit summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 7, marginBottom: 20 }}>
              {[
                { label: "BUY", val: `$${order.buyPrice ?? "?"}`, color: "#60a5fa" },
                { label: "SELL", val: `$${order.sellPrice ?? "?"}`, color: "#a78bfa" },
                { label: "NET PROFIT", val: `+$${order.profit ?? "?"}`, color: "#4ade80" },
                { label: "SHIP EST", val: `~$${shipping.cost}`, color: "#f5c842", sub: shipping.days + "d" },
              ].map(s => (
                <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "7px 6px", textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 7, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>{s.label}</div>
                  <div style={{ color: s.color, fontWeight: 900, fontSize: 13 }}>{s.val}</div>
                  {"sub" in s && s.sub && <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, marginTop: 1 }}>{s.sub}</div>}
                </div>
              ))}
            </div>

            {/* Shipping address — BIG and easy to copy */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>
                📦 SHIP DIRECTLY TO THIS ADDRESS
              </div>
              <div style={{ background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.25)", borderRadius: 11, padding: 14, position: "relative" }}>
                <pre style={{ color: "#fff", fontSize: 13, fontWeight: 600, margin: 0, fontFamily: "inherit", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {formattedAddress || "No address provided"}
                </pre>
                {order.buyerEmail && (
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 6 }}>{order.buyerEmail}</div>
                )}
                <button
                  onClick={copyAddress}
                  style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                    background: copiedAddress ? "rgba(74,222,128,0.2)" : "rgba(245,200,66,0.15)",
                    color: copiedAddress ? "#4ade80" : "#f5c842",
                  }}>
                  {copiedAddress ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
                </button>
              </div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 6 }}>
                ↑ Paste this as the delivery address when ordering from the source
              </div>
            </div>

            {/* Shipping feasibility warning */}
            {warning && (
              <div style={{
                background: warning.level === "warn" ? "rgba(248,113,113,0.1)" : warning.level === "ok" ? "rgba(74,222,128,0.08)" : "rgba(245,200,66,0.08)",
                border: `1px solid ${warning.level === "warn" ? "rgba(248,113,113,0.3)" : warning.level === "ok" ? "rgba(74,222,128,0.25)" : "rgba(245,200,66,0.25)"}`,
                borderRadius: 10, padding: "10px 14px", marginBottom: 16,
                display: "flex", alignItems: "flex-start", gap: 8,
              }}>
                <AlertTriangle size={13} color={warning.level === "warn" ? "#f87171" : warning.level === "ok" ? "#4ade80" : "#f5c842"} style={{ marginTop: 1, flexShrink: 0 }} />
                <div style={{ color: warning.level === "warn" ? "#f87171" : warning.level === "ok" ? "#86efac" : "#fde68a", fontSize: 11, lineHeight: 1.55 }}>
                  {warning.text}
                  {(sourceCountry || buyerCountry) && (
                    <span style={{ display: "inline-block", marginTop: 4, color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
                      {" "}({sourceCountry ?? "?"} → {buyerCountry ?? "?"}, ~{shipping.days} days)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Instructions */}
            <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <div style={{ color: "#93c5fd", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>HOW TO COMPLETE THIS ORDER:</div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.8 }}>
                1. Click <strong style={{ color: "#fff" }}>"Open Source & Buy"</strong> below<br />
                2. Find the item and add to cart<br />
                3. <strong style={{ color: "#f5c842" }}>Paste the buyer's address</strong> as the delivery address<br />
                4. Complete the purchase — the seller ships directly to your buyer<br />
                5. Come back here and enter the tracking number
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              {order.sourceUrl ? (
                <button onClick={openSource}
                  style={{ flex: 1, padding: "13px", borderRadius: 11, border: "none", background: "linear-gradient(135deg, #f5c842, #f59e0b)", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <ExternalLink size={15} /> Open Source & Buy
                </button>
              ) : (
                <button onClick={() => setStep("tracking")}
                  style={{ flex: 1, padding: "13px", borderRadius: 11, border: "none", background: "rgba(139,92,246,0.2)", color: "#a78bfa", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  I've already bought it →
                </button>
              )}
            </div>

            {order.sourceUrl && (
              <button onClick={() => setStep("tracking")}
                style={{ width: "100%", marginTop: 8, padding: "9px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                I've already placed the order →
              </button>
            )}
          </div>
        )}

        {/* ── Step 2: Tracking ── */}
        {step === "tracking" && (
          <div>
            <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 11, padding: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <CheckCircle size={18} color="#4ade80" />
              <div>
                <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 13 }}>Purchase confirmed!</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>The seller will ship directly to your buyer's address</div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>TRACKING NUMBER <span style={{ fontWeight: 400 }}>(optional)</span></div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={trackingNumber}
                  onChange={e => setTrackingNumber(e.target.value)}
                  placeholder="e.g. PL123456789PL"
                  style={inputStyle}
                  onKeyDown={e => e.key === "Enter" && submitTracking()}
                />
                {trackingNumber && (
                  <button onClick={() => { navigator.clipboard.writeText(trackingNumber); setCopiedTracking(true); setTimeout(() => setCopiedTracking(false), 1500); }}
                    style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: copiedTracking ? "#4ade80" : "rgba(255,255,255,0.4)", cursor: "pointer" }}>
                    {copiedTracking ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                )}
              </div>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 6 }}>
                Enter the tracking number you received from the source seller
              </div>
            </div>

            {/* Buyer address reminder */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: 12, marginBottom: 20 }}>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>SHIPPED TO</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 1.5 }}>{formattedAddress}</div>
            </div>

            {submitError && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 9, padding: "10px 14px", marginBottom: 12, color: "#f87171", fontSize: 12, fontWeight: 600 }}>
                ⚠ {submitError}
              </div>
            )}
            <button onClick={submitTracking} disabled={submitting}
              style={{ width: "100%", padding: "13px", borderRadius: 11, border: "none", background: "linear-gradient(135deg, #4ade80, #22c55e)", color: "#000", fontWeight: 800, fontSize: 14, cursor: submitting ? "default" : "pointer" }}>
              {submitting ? "Saving…" : trackingNumber ? "Save Tracking & Mark Done ✓" : "Mark as Fulfilled ✓"}
            </button>
          </div>
        )}

        {/* ── Step 3: Done ── */}
        {step === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(74,222,128,0.15)", border: "2px solid rgba(74,222,128,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Truck size={26} color="#4ade80" />
            </div>
            <div style={{ color: "#4ade80", fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Order Fulfilled! 🎉</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 4 }}>
              The item is on its way to {order.buyerName}
            </div>
            {trackingNumber && (
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginBottom: 4 }}>
                Tracking: <strong style={{ color: "#fff" }}>{trackingNumber}</strong>
              </div>
            )}
            <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: "10px 16px" }}>
              <DollarSign size={14} color="#4ade80" />
              <span style={{ color: "#4ade80", fontWeight: 800, fontSize: 14 }}>+${order.profit} profit earned</span>
            </div>
            <br />
            <button onClick={onClose}
              style={{ marginTop: 20, padding: "10px 28px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
