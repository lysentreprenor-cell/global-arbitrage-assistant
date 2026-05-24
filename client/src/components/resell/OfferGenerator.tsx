import React, { useState } from "react";
import { Sparkles, RotateCcw, Minimize2, Star, Languages, Save, Download, Check } from "lucide-react";
import type { OfferDraft } from "@/lib/resell/types";

interface Props {
  draft: OfferDraft;
  onSave: (draft: OfferDraft) => void;
  onApprove: (draft: OfferDraft) => void;
  onExport: (draft: OfferDraft) => void;
}

type TabKey = "EN" | "PL" | "NO";

export function OfferGenerator({ draft: initialDraft, onSave, onApprove, onExport }: Props) {
  const [draft, setDraft] = useState<OfferDraft>(initialDraft);
  const [tab, setTab] = useState<TabKey>("EN");
  const [loading, setLoading] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const simulateAI = (action: string, callback: () => void) => {
    setLoading(action);
    setTimeout(() => { setLoading(null); callback(); }, 1200);
  };

  const handleImprove = () => simulateAI("improve", () => {
    setDraft(d => ({ ...d, descriptionLongEN: d.descriptionLongEN + "\n\n✅ Quality guaranteed. Ships within 1-2 business days with full insurance coverage." }));
  });

  const handleShorten = () => simulateAI("shorten", () => {
    setDraft(d => ({ ...d, descriptionShortEN: d.descriptionShortEN.split(".").slice(0, 2).join(".") + "." }));
  });

  const handlePremium = () => simulateAI("premium", () => {
    setDraft(d => ({ ...d, titleEN: "✦ RARE FIND ✦ " + d.titleEN + " | Premium European Import" }));
  });

  const handleTranslate = (lang: TabKey) => simulateAI("translate", () => {
    if (lang === "PL") {
      setDraft(d => ({
        ...d,
        titlePL: "Europejski importowany produkt premium",
        descriptionPL: "Wyjątkowy produkt europejski najwyższej jakości. Idealny dla kolekcjonerów i miłośników autentycznych wyrobów. Wysyłka z ubezpieczeniem.",
      }));
    } else if (lang === "NO") {
      setDraft(d => ({
        ...d,
        titleNO: "Europeisk importert premium produkt",
        descriptionNO: "Eksepsjonelt europeisk produkt av høyeste kvalitet. Perfekt for samlere og elskere av autentiske varer. Forsendelse med forsikring.",
      }));
    }
    setTab(lang);
  });

  const handleSave = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const titleByTab: Record<TabKey, string> = {
    EN: draft.titleEN,
    PL: draft.titlePL ?? "",
    NO: draft.titleNO ?? "",
  };
  const descByTab: Record<TabKey, string> = {
    EN: draft.descriptionLongEN,
    PL: draft.descriptionPL ?? "",
    NO: draft.descriptionNO ?? "",
  };

  const TABS: TabKey[] = ["EN", "PL", "NO"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Approval banner */}
      {!draft.isApproved && (
        <div style={{
          background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.25)",
          borderRadius: 12, padding: "12px 16px", marginBottom: 16,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <Sparkles size={15} style={{ color: "#f5c842", flexShrink: 0 }} />
          <span style={{ color: "#fde68a", fontSize: 12 }}>
            Oferta jest szkicem AI — musisz ją przejrzeć i zatwierdzić przed eksportem
          </span>
        </div>
      )}

      {/* Title */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>TYTUŁ OFERTY (AI)</div>
        <textarea
          value={draft.titleEN}
          onChange={e => setDraft(d => ({ ...d, titleEN: e.target.value }))}
          rows={2}
          style={{
            width: "100%", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(139,92,246,0.25)", borderRadius: 10,
            padding: "10px 12px", color: "#fff", fontSize: 13, resize: "vertical",
            outline: "none", fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Suggested price */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.20)",
        borderRadius: 12, padding: "12px 16px", marginBottom: 16,
      }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 0.5, fontWeight: 700 }}>SUGEROWANA CENA AI</div>
          <div style={{ color: "#a78bfa", fontSize: 22, fontWeight: 800 }}>
            ${draft.suggestedPrice}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 0.5, fontWeight: 700 }}>KATEGORIA</div>
          <div style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: 600 }}>{draft.suggestedCategory}</div>
        </div>
      </div>

      {/* Language tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 14px", borderRadius: 99, border: "none", cursor: "pointer",
              background: tab === t ? "#8b5cf6" : "rgba(255,255,255,0.06)",
              color: tab === t ? "#fff" : "rgba(255,255,255,0.45)",
              fontSize: 12, fontWeight: 700, transition: "all 0.15s",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Description */}
      {titleByTab[tab] === "" && tab !== "EN" ? (
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)",
          borderRadius: 12, padding: "24px 16px", textAlign: "center", marginBottom: 16,
        }}>
          <Languages size={20} style={{ color: "rgba(255,255,255,0.25)", margin: "0 auto 8px" }} />
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
            Kliknij "Przetłumacz" aby wygenerować wersję {tab}
          </div>
        </div>
      ) : (
        <textarea
          value={descByTab[tab]}
          onChange={e => {
            if (tab === "EN") setDraft(d => ({ ...d, descriptionLongEN: e.target.value }));
            if (tab === "PL") setDraft(d => ({ ...d, descriptionPL: e.target.value }));
            if (tab === "NO") setDraft(d => ({ ...d, descriptionNO: e.target.value }));
          }}
          rows={8}
          style={{
            width: "100%", background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10,
            padding: "12px 14px", color: "rgba(255,255,255,0.80)",
            fontSize: 13, resize: "vertical", lineHeight: 1.6,
            outline: "none", fontFamily: "inherit", boxSizing: "border-box",
            marginBottom: 16,
          }}
        />
      )}

      {/* Parameters */}
      {Object.keys(draft.parameters).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>PARAMETRY PRODUKTU</div>
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12, overflow: "hidden",
          }}>
            {Object.entries(draft.parameters).map(([key, val], i) => (
              <div key={key} style={{
                display: "flex", justifyContent: "space-between", padding: "8px 14px",
                borderBottom: i < Object.keys(draft.parameters).length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}>
                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{key}</span>
                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {draft.warnings.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: "#f97316", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>⚠ OSTRZEŻENIA AI</div>
          {draft.warnings.map((w, i) => (
            <div key={i} style={{
              background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.18)",
              borderRadius: 8, padding: "7px 12px", marginBottom: 6,
              color: "#fdba74", fontSize: 11,
            }}>
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Popraw opis", action: "improve", onClick: handleImprove, color: "#8b5cf6", icon: <Sparkles size={13} /> },
          { label: "Skróć opis", action: "shorten", onClick: handleShorten, color: "#8b5cf6", icon: <Minimize2 size={13} /> },
          { label: "Zrób premium", action: "premium", onClick: handlePremium, color: "#f5c842", icon: <Star size={13} /> },
          { label: "Przetłumacz", action: "translate", onClick: () => handleTranslate(tab === "EN" ? "PL" : tab === "PL" ? "NO" : "EN"), color: "#3b82f6", icon: <Languages size={13} /> },
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.onClick}
            disabled={loading !== null}
            style={{
              padding: "10px 8px", borderRadius: 10, border: `1px solid ${btn.color}30`,
              cursor: loading !== null ? "not-allowed" : "pointer",
              background: `${btn.color}12`,
              color: loading === btn.action ? "rgba(255,255,255,0.4)" : btn.color,
              fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              transition: "all 0.15s",
            }}
          >
            {loading === btn.action ? <RotateCcw size={13} style={{ animation: "spin 1s linear infinite" }} /> : btn.icon}
            {loading === btn.action ? "..." : btn.label}
          </button>
        ))}
      </div>

      {/* Save / Export / Approve */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSave}
          style={{
            flex: 1, padding: "11px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer", background: "rgba(255,255,255,0.06)",
            color: saved ? "#4ade80" : "rgba(255,255,255,0.70)",
            fontSize: 13, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "all 0.2s",
          }}
        >
          {saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "Zapisano!" : "Zapisz szkic"}
        </button>

        <button
          onClick={() => onApprove(draft)}
          disabled={draft.isApproved}
          style={{
            flex: 1.5, padding: "11px 0", borderRadius: 12, border: "none",
            cursor: draft.isApproved ? "default" : "pointer",
            background: draft.isApproved
              ? "rgba(74,222,128,0.15)"
              : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
            color: draft.isApproved ? "#4ade80" : "#fff",
            fontSize: 13, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            boxShadow: draft.isApproved ? "none" : "0 4px 14px rgba(139,92,246,0.35)",
            transition: "all 0.2s",
          }}
        >
          {draft.isApproved ? <><Check size={14} /> Zatwierdzono</> : "Zatwierdź szkic"}
        </button>
      </div>

      {draft.isApproved && (
        <button
          onClick={() => onExport(draft)}
          style={{
            marginTop: 10, padding: "12px 0", borderRadius: 12, border: "none",
            cursor: "pointer",
            background: "linear-gradient(135deg, #f5c842 0%, #d4a020 100%)",
            color: "#0a0a0f", fontSize: 13, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            boxShadow: "0 4px 14px rgba(245,200,66,0.35)",
          }}
        >
          <Download size={14} /> Eksportuj jako CSV / Tekst
        </button>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
