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
    <div style={{ minHeight: "100dvh", background: "linear-gradient(160deg, #0d0010 0%, #080014 40%, #0a0a14 100%)", fontFamily: "'Outfit','Inter',sans-serif" }}>
      {/* Nav */}
      <div style={{
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(139,92,246,0.15)",
        padding: "0 24px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", height: 60, gap: 14 }}>
          <button onClick={() => setLocation("/resell")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600 }}>
            <ArrowLeft size={15} /> Powrót
          </button>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.10)" }} />
          <Sparkles size={15} style={{ color: "#a78bfa" }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>Generator oferty AI</span>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px 80px" }}>
        <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 900, marginBottom: 6 }}>Generator oferty</h1>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 24 }}>
          AI tworzy własny, oryginalny opis — nie kopię. Zatwierdź szkic, dopiero potem eksportuj.
        </p>

        {exported && (
          <div style={{
            background: "rgba(74,222,128,0.10)", border: "1px solid rgba(74,222,128,0.25)",
            borderRadius: 14, padding: "14px 18px", marginBottom: 24,
          }}>
            <p style={{ color: "#4ade80", fontSize: 13, margin: 0, fontWeight: 700 }}>
              ✓ Oferta wyeksportowana jako plik .txt — gotowa do ręcznego wklejenia na marketplace.
            </p>
          </div>
        )}

        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20, padding: "28px",
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
