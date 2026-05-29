import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Plus, TrendingUp, TrendingDown, Minus, ListTodo } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { loadPipeline, type PipelineItem } from "@/lib/pipeline";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  planned:   { label: "Planowane",   color: "#a78bfa" },
  bought:    { label: "Kupione",     color: "#60a5fa" },
  listed:    { label: "Wystawione",  color: "#f5c842" },
  sold:      { label: "Sprzedane",   color: "#4ade80" },
  abandoned: { label: "Porzucone",   color: "rgba(255,255,255,0.35)" },
};

export default function Products() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<PipelineItem[]>([]);

  useEffect(() => {
    const reload = () => setItems(loadPipeline());
    reload();
    window.addEventListener("focus", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  return (
    <ResellLayout>
      <div style={{ padding: "36px 32px", maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>Historia produktów</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 6 }}>Wszystkie zapisane okazje z Twojego pipeline.</p>
          </div>
          <button
            data-testid="button-add-product"
            onClick={() => setLocation("/resell/add")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: "#fff", fontWeight: 700, fontSize: 13,
              boxShadow: "0 4px 14px rgba(139,92,246,0.35)",
            }}
          >
            <Plus size={15} /> Dodaj produkt
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: "56px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, marginBottom: 6 }}>Brak zapisanych produktów</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginBottom: 22 }}>
              Zapisz okazje z Dashboardu — pojawią się tutaj i w Pipeline.
            </div>
            <button
              onClick={() => setLocation("/resell")}
              style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", borderRadius: 10, padding: "11px 22px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Przejdź do Dashboardu
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map(p => {
              const scoreColor = p.score >= 70 ? "#4ade80" : p.score >= 50 ? "#f5c842" : "#f87171";
              const Icon = p.score >= 70 ? TrendingUp : p.score >= 50 ? Minus : TrendingDown;
              const status = STATUS_LABEL[p.status] ?? STATUS_LABEL.planned;
              const netP = p.soldPrice ?? p.netProfit ?? p.profit;
              const buyShown = p.realBuyPrice ?? p.buy;
              return (
                <div
                  key={`${p.id}:${p.name}`}
                  onClick={() => {
                    sessionStorage.setItem("resell_opportunity", JSON.stringify(p));
                    setLocation(`/resell/product/${p.id}`);
                  }}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 14, padding: "16px 20px",
                    display: "flex", alignItems: "center", gap: 16,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.25)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
                >
                  {/* Score badge */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                    background: `${scoreColor}12`, border: `1px solid ${scoreColor}30`,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={14} color={scoreColor} />
                    <div style={{ color: scoreColor, fontSize: 12, fontWeight: 800 }}>{p.score}</div>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      <span style={{ flexShrink: 0, background: `${status.color}18`, border: `1px solid ${status.color}35`, borderRadius: 6, padding: "1px 7px", color: status.color, fontSize: 9, fontWeight: 800 }}>{status.label}</span>
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 3 }}>
                      {p.flag} {p.category} · {p.market}
                    </div>
                  </div>

                  {/* Buy price */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Zakup</div>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>${buyShown}</div>
                  </div>

                  {/* Profit */}
                  <div style={{ textAlign: "right", flexShrink: 0, minWidth: 64 }}>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{p.status === "sold" ? "Zysk" : "Szac. zysk"}</div>
                    <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 15 }}>+${netP}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <button
            onClick={() => setLocation("/resell/saved")}
            style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 9, padding: "9px 16px", color: "#a78bfa", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            <ListTodo size={14} /> Zarządzaj w Pipeline
          </button>
        )}
      </div>
    </ResellLayout>
  );
}
