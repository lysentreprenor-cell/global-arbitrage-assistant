import React, { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Sparkles } from "lucide-react";
import { OfferGenerator } from "@/components/resell/OfferGenerator";
import { MOCK_OFFER_DRAFTS } from "@/lib/resell/mockData";
import type { OfferDraft } from "@/lib/resell/types";

export default function GeneratorPage() {
  const [, setLocation] = useLocation();
  const [draft, setDraft] = useState<OfferDraft>(MOCK_OFFER_DRAFTS[0]);
  const [exported, setExported] = useState(false);

  const handleSave = (d: OfferDraft) => setDraft({ ...d });

  const handleApprove = (d: OfferDraft) => setDraft({ ...d, isApproved: true });

  const handleExport = (d: OfferDraft) => {
    const content = [
      `TYTUŁ: ${d.titleEN}`,
      ``,
      `OPIS KRÓTKI:`,
      d.descriptionShortEN,
      ``,
      `OPIS DŁUGI:`,
      d.descriptionLongEN,
      ``,
      `SUGEROWANA CENA: $${d.suggestedPrice}`,
      `KATEGORIA: ${d.suggestedCategory}`,
      ``,
      `PARAMETRY:`,
      ...Object.entries(d.parameters).map(([k, v]) => `${k}: ${v}`),
      ``,
      `OSTRZEŻENIA:`,
      ...d.warnings.map(w => `⚠ ${w}`),
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oferta_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(160deg, #0d0010 0%, #080014 40%, #0a0a14 100%)",
      paddingBottom: 100,
    }}>
      {/* Header */}
      <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => setLocation("/resell")}
          style={{
            width: 36, height: 36, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.05)", cursor: "pointer", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11,
            background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(245,200,66,0.15))",
            border: "1px solid rgba(139,92,246,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Sparkles size={18} style={{ color: "#a78bfa" }} />
          </div>
          <div>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 800 }}>Generator oferty AI</div>
            <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}>Własny opis, nie kopista</div>
          </div>
        </div>
      </div>

      {exported && (
        <div style={{ margin: "0 20px 16px", background: "rgba(74,222,128,0.10)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 12, padding: "12px 16px" }}>
          <p style={{ color: "#4ade80", fontSize: 12, margin: 0, fontWeight: 700 }}>
            ✓ Oferta wyeksportowana jako plik tekstowy. Gotowa do ręcznego wklejenia na marketplace.
          </p>
        </div>
      )}

      <div style={{ padding: "0 20px" }}>
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 20, padding: "20px",
        }}>
          <OfferGenerator
            draft={draft}
            onSave={handleSave}
            onApprove={handleApprove}
            onExport={handleExport}
          />
        </div>
      </div>
    </div>
  );
}
