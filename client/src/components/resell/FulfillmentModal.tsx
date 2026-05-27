import React, { useState } from "react";
import { X, Copy, Check, ExternalLink, Package, Truck, CheckCircle, DollarSign } from "lucide-react";

interface FulfillmentOrder {
  orderId?: number;
  listingId?: number;
  productName?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  sourceUrl?: string;
  buyPrice?: number;
  sellPrice?: number;
  profit?: number;
  quantity?: number;
  platform?: string;
}

interface Props {
  order: FulfillmentOrder;
  onClose: () => void;
  onProcessed?: () => void;
}

type Step = "buy" | "tracking" | "done";

export function FulfillmentModal({ order, onClose, onProcessed }: Props) {
  const [step, setStep] = useState<Step>("buy");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const formattedAddress = [order.buyerName, order.buyerAddress]
    .filter(Boolean).join("\n");

  const copyAddress = () => {
    navigator.clipboard.writeText(formattedAddress).then(() => {
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    });
  };

  const openSource = () => {
    if (order.sourceUrl) {
      window.open(order.sourceUrl, "_blank");
      // Move to tracking step after they've gone to buy
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
      setSubmitError(err.message || "Failed to save — please try again");
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
              {[
                { label: "BUY", val: `$${order.buyPrice ?? "?"}`, color: "#60a5fa" },
                { label: "SELL", val: `$${order.sellPrice ?? "?"}`, color: "#a78bfa" },
                { label: "NET PROFIT", val: `+$${order.profit ?? "?"}`, color: "#4ade80" },
              ].map(s => (
                <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, fontWeight: 700, letterSpacing: 0.5, marginBottom: 3 }}>{s.label}</div>
                  <div style={{ color: s.color, fontWeight: 900, fontSize: 14 }}>{s.val}</div>
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
