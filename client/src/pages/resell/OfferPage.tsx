import React, { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, FileText, Copy, Check } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

const MOCK_OFFER = {
  title: "Authentic Levi's 501 Original Jeans W32 L32 — Made in Poland, Excellent Condition",
  description: `Genuine Levi's 501 straight-leg jeans, size W32 L32. Purchased new in Poland, worn twice. Original stitching, no alterations, no damage.

Features:
• 100% cotton denim
• Classic straight fit
• 5-pocket design
• Button fly
• Made in Poland (EU production)

Ships from Poland via DHL Express (3-5 business days). Returns accepted within 30 days. All items are personally photographed and described — no stock images used.`,
  price: "$78",
  tags: ["levi's", "501", "jeans", "denim", "poland", "vintage", "men"],
};

export default function OfferPage() {
  const [, params] = useRoute("/resell/offer/:id");
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const [approved, setApproved] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(`${MOCK_OFFER.title}\n\n${MOCK_OFFER.description}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ResellLayout>
      <div style={{ padding: "36px 32px", maxWidth: 700 }}>
        <button onClick={() => setLocation(`/resell/product/${params?.id ?? "1"}`)} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.45)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 28 }}>
          <ArrowLeft size={15} /> Back
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #a78bfa, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileText size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>AI-Generated Offer</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>Review, approve, then export</p>
          </div>
        </div>

        <div style={{ background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 24, color: "#fde68a", fontSize: 12 }}>
          ⚠ This is a draft generated from your product data. Review carefully before publishing. You are responsible for accuracy.
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>TITLE</div>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, lineHeight: 1.5, marginBottom: 20 }}>{MOCK_OFFER.title}</div>

          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>DESCRIPTION</div>
          <pre style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, marginBottom: 20 }}>{MOCK_OFFER.description}</pre>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MOCK_OFFER.tags.map(t => (
              <span key={t} style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 99, padding: "3px 10px", color: "#a78bfa", fontSize: 11 }}>#{t}</span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={copy} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy text</>}
          </button>
          <button
            onClick={() => setApproved(true)}
            style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer", background: approved ? "rgba(74,222,128,0.15)" : "linear-gradient(135deg, #a78bfa, #7c3aed)", color: approved ? "#4ade80" : "#fff", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            {approved ? <><Check size={14} /> Approved — ready to publish</> : "Approve & mark as ready"}
          </button>
        </div>
      </div>
    </ResellLayout>
  );
}
