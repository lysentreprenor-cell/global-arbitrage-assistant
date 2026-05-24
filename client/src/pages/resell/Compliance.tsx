import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Shield } from "lucide-react";
import { ComplianceChecklist } from "@/components/resell/ComplianceChecklist";
import { MOCK_COMPLIANCE } from "@/lib/resell/mockData";

export default function CompliancePage() {
  const [, setLocation] = useLocation();

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
            background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size={18} style={{ color: "#4ade80" }} />
          </div>
          <div>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 800 }}>Ryzyka i zgodność</div>
            <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}>Lista kontrolna przed eksportem</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 20px" }}>
        {/* Info */}
        <div style={{
          background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.18)",
          borderRadius: 12, padding: "12px 16px", marginBottom: 20,
        }}>
          <p style={{ color: "#86efac", fontSize: 11, lineHeight: 1.6, margin: 0 }}>
            Zaznacz wszystkie wymagane punkty aby móc przejść do generatora oferty i eksportu. Aplikacja chroni Cię przed naruszeniem regulaminów marketplace i prawa autorskiego.
          </p>
        </div>

        {/* Checklist */}
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 20, padding: "20px", marginBottom: 16,
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
