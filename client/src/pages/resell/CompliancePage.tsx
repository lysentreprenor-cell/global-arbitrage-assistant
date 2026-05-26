import React, { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Shield, Check, X } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

const CHECKS = [
  { id: 1, label: "Own photos taken (not copied from original listing)", required: true },
  { id: 2, label: "Original description written (not copied)", required: true },
  { id: 3, label: "Product is legally exportable from country of origin", required: true },
  { id: 4, label: "Duty & import tax calculated for destination country", required: true },
  { id: 5, label: "Platform terms of service reviewed (eBay/Amazon/Etsy)", required: true },
  { id: 6, label: "Product does not infringe trademarks or IP", required: true },
  { id: 7, label: "Return policy prepared for destination market", required: false },
];

export default function CompliancePage() {
  const [, params] = useRoute("/resell/compliance/:id");
  const [, setLocation] = useLocation();
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (id: number) => setChecked(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const required = CHECKS.filter(c => c.required);
  const allRequired = required.every(c => checked.has(c.id));

  return (
    <ResellLayout>
      <div style={{ padding: "36px 32px", maxWidth: 640 }}>
        <button onClick={() => setLocation(`/resell/product/${params?.id ?? "1"}`)} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.45)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 28 }}>
          <ArrowLeft size={15} /> Back
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #60a5fa, #2563eb)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>Compliance Check</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>7-point legal checklist before export</p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {CHECKS.map(c => {
            const done = checked.has(c.id);
            return (
              <div
                key={c.id}
                onClick={() => toggle(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: done ? "rgba(74,222,128,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${done ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 12, padding: "14px 18px", cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <div style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                  background: done ? "#4ade80" : "rgba(255,255,255,0.08)",
                  border: done ? "none" : "1px solid rgba(255,255,255,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {done && <Check size={14} color="#000" strokeWidth={3} />}
                </div>
                <span style={{ color: done ? "#d1fae5" : "rgba(255,255,255,0.65)", fontSize: 13, flex: 1 }}>{c.label}</span>
                {!c.required && <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, flexShrink: 0 }}>optional</span>}
              </div>
            );
          })}
        </div>

        <div style={{
          background: allRequired ? "rgba(74,222,128,0.08)" : "rgba(245,200,66,0.08)",
          border: `1px solid ${allRequired ? "rgba(74,222,128,0.25)" : "rgba(245,200,66,0.25)"}`,
          borderRadius: 14, padding: "16px 20px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          {allRequired ? <Check size={18} color="#4ade80" /> : <Shield size={18} color="#f5c842" />}
          <span style={{ color: allRequired ? "#86efac" : "#fde68a", fontSize: 13, fontWeight: 600 }}>
            {allRequired ? "All required checks passed — safe to proceed" : `${required.filter(c => checked.has(c.id)).length}/${required.length} required checks completed`}
          </span>
        </div>

        <button
          onClick={() => setLocation(`/resell/offer/${params?.id ?? "1"}`)}
          disabled={!allRequired}
          style={{
            width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
            cursor: allRequired ? "pointer" : "not-allowed",
            background: allRequired ? "linear-gradient(135deg, #a78bfa, #7c3aed)" : "rgba(255,255,255,0.08)",
            color: allRequired ? "#fff" : "rgba(255,255,255,0.3)", fontWeight: 800, fontSize: 15,
          }}
        >
          Generate Offer →
        </button>
      </div>
    </ResellLayout>
  );
}
