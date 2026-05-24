import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Shield } from "lucide-react";
import { ComplianceChecklist } from "@/components/resell/ComplianceChecklist";
import { MOCK_COMPLIANCE } from "@/lib/resell/mockData";

export default function CompliancePage() {
  const [, setLocation] = useLocation();

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
          <Shield size={15} style={{ color: "#4ade80" }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>Ryzyka i zgodność prawna</span>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px" }}>
        <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 900, marginBottom: 6 }}>Lista kontrolna</h1>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 24 }}>
          Zaznacz wszystkie punkty krytyczne, żeby odblokować eksport oferty. To chroni Cię prawnie.
        </p>

        <div style={{
          background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.18)",
          borderRadius: 14, padding: "14px 18px", marginBottom: 28,
        }}>
          <p style={{ color: "#86efac", fontSize: 12, lineHeight: 1.7, margin: 0 }}>
            Aplikacja nie pozwoli wyeksportować oferty bez potwierdzenia kluczowych wymogów. Chroni to przed naruszeniem regulaminów marketplace i prawa autorskiego. Każdy punkt jest ważny dla bezpiecznego prowadzenia biznesu resell.
          </p>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20, padding: "28px",
        }}>
          <ComplianceChecklist
            initial={MOCK_COMPLIANCE["prod-002"]?.checks}
            onExport={() => setLocation("/resell/generator")}
          />
        </div>
      </div>
    </div>
  );
}
