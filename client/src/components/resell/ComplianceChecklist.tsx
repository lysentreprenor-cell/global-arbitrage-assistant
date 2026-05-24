import React, { useState } from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import type { ComplianceCheck } from "@/lib/resell/types";

const CHECKS: { key: keyof ComplianceCheck["checks"]; label: string; description: string; critical: boolean }[] = [
  { key: "hasOwnPhotos", label: "Mam własne zdjęcia produktu", description: "Nie kopiujesz zdjęć z cudzych ogłoszeń ani internetu — używasz tylko swoich fotografii.", critical: true },
  { key: "hasOwnDescription", label: "Opis jest w pełni własny", description: "AI stworzyło oryginalny opis. Nie kopiujesz opisów od innych sprzedawców.", critical: true },
  { key: "isLegalInTarget", label: "Produkt jest legalny w kraju sprzedaży", description: "Sprawdziłeś regulacje prawne — produkt nie jest zabroniony w USA/Europie.", critical: true },
  { key: "hasDutyCalculated", label: "Cło zostało obliczone", description: "Znasz stawkę celną dla tego produktu i uwzględniłeś ją w kalkulacji zysku.", critical: false },
  { key: "hasReturnsCalculated", label: "Zwroty zostały uwzględnione", description: "Masz politykę zwrotów i koszty zwrotów zostały uwzględnione w kalkulatorze.", critical: false },
  { key: "noRestrictedBrand", label: "Brak ograniczeń marki", description: "Produkt nie pochodzi od marki z prawami wyłączności, zakazem resellers lub zastrzeżonym znakiem towarowym.", critical: true },
  { key: "hasPhysicalAccess", label: "Masz fizyczny dostęp do produktu", description: "Produkt jest w Twoim posiadaniu. Nie sprzedajesz z dropshippingu bez weryfikacji.", critical: true },
];

interface Props {
  initial?: ComplianceCheck["checks"];
  onComplete?: (checks: ComplianceCheck["checks"], isComplete: boolean) => void;
  onExport?: () => void;
}

const DEFAULT: ComplianceCheck["checks"] = {
  hasOwnPhotos: false, hasOwnDescription: false, isLegalInTarget: false,
  hasDutyCalculated: false, hasReturnsCalculated: false,
  noRestrictedBrand: false, hasPhysicalAccess: false,
};

export function ComplianceChecklist({ initial = DEFAULT, onComplete, onExport }: Props) {
  const [checks, setChecks] = useState<ComplianceCheck["checks"]>(initial);

  const toggle = (key: keyof ComplianceCheck["checks"]) => {
    const next = { ...checks, [key]: !checks[key] };
    setChecks(next);
    const allCritical = CHECKS.filter(c => c.critical).every(c => next[c.key]);
    const allChecks = CHECKS.every(c => next[c.key]);
    onComplete?.(next, allChecks);
  };

  const criticalCount = CHECKS.filter(c => c.critical && checks[c.key]).length;
  const totalCritical = CHECKS.filter(c => c.critical).length;
  const allDone = CHECKS.every(c => checks[c.key]);
  const canExport = CHECKS.filter(c => c.critical).every(c => checks[c.key]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
            Kluczowe wymogi ({criticalCount}/{totalCritical})
          </span>
          <span style={{ color: canExport ? "#4ade80" : "#f87171", fontSize: 12, fontWeight: 700 }}>
            {canExport ? "Gotowe do eksportu" : "Wymagane"}
          </span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
          <div style={{
            height: "100%", borderRadius: 3,
            width: `${(criticalCount / totalCritical) * 100}%`,
            background: canExport
              ? "linear-gradient(90deg, #4ade80, #22c55e)"
              : "linear-gradient(90deg, #8b5cf6, #f5c842)",
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>

      {/* Checklist items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {CHECKS.map(item => {
          const isChecked = checks[item.key];
          return (
            <button
              key={item.key}
              onClick={() => toggle(item.key)}
              style={{
                background: isChecked
                  ? "rgba(74,222,128,0.06)"
                  : "rgba(255,255,255,0.03)",
                border: `1px solid ${isChecked ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 14, padding: "14px 16px",
                cursor: "pointer", textAlign: "left", width: "100%",
                transition: "all 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                {/* Checkbox */}
                <div style={{
                  width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                  background: isChecked ? "#4ade80" : "rgba(255,255,255,0.08)",
                  border: `1.5px solid ${isChecked ? "#4ade80" : "rgba(255,255,255,0.15)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                }}>
                  {isChecked && <Check size={13} color="#0a0a0f" strokeWidth={3} />}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ color: isChecked ? "#fff" : "rgba(255,255,255,0.80)", fontSize: 13, fontWeight: 600 }}>
                      {item.label}
                    </span>
                    {item.critical && (
                      <span style={{
                        background: "rgba(248,113,113,0.12)", color: "#f87171",
                        fontSize: 9, padding: "1px 6px", borderRadius: 99, fontWeight: 700,
                      }}>WYMAGANE</span>
                    )}
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                    {item.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Warning if not complete */}
      {!canExport && (
        <div style={{
          marginTop: 16, background: "rgba(249,115,22,0.08)",
          border: "1px solid rgba(249,115,22,0.25)", borderRadius: 12,
          padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <AlertTriangle size={16} style={{ color: "#f97316", flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: "#fdba74", fontSize: 12, margin: 0, lineHeight: 1.5 }}>
            Musisz potwierdzić wszystkie kluczowe wymogi przed eksportem oferty. Chroni to przed naruszeniem regulaminów marketplace i prawa.
          </p>
        </div>
      )}

      {/* Export button */}
      <button
        onClick={canExport ? onExport : undefined}
        disabled={!canExport}
        style={{
          marginTop: 20, padding: "13px 0", borderRadius: 14, border: "none",
          cursor: canExport ? "pointer" : "not-allowed",
          background: canExport
            ? "linear-gradient(135deg, #4ade80 0%, #22c55e 100%)"
            : "rgba(255,255,255,0.06)",
          color: canExport ? "#0a0a0f" : "rgba(255,255,255,0.25)",
          fontWeight: 800, fontSize: 14, letterSpacing: 0.5,
          boxShadow: canExport ? "0 6px 20px rgba(74,222,128,0.30)" : "none",
          transition: "all 0.2s",
        }}
      >
        {canExport ? "Przejdź do generatora oferty →" : "Uzupełnij listę kontrolną"}
      </button>
    </div>
  );
}
