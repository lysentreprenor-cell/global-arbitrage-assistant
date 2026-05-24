import React, { useState } from "react";
import { useLocation } from "wouter";
import type { Product } from "@/lib/resell/types";
import { RiskBadge } from "./RiskBadge";
import { formatCurrency } from "@/lib/resell/calculations";

const STATUS_CONFIG = {
  analyzing: { label: "Analizowany", color: "#60a5fa", bg: "rgba(96,165,250,0.10)" },
  profitable: { label: "Opłacalny", color: "#4ade80", bg: "rgba(74,222,128,0.10)" },
  rejected: { label: "Odrzucony", color: "#f87171", bg: "rgba(248,113,113,0.10)" },
  draft_ready: { label: "Szkic gotowy", color: "#a78bfa", bg: "rgba(167,139,250,0.10)" },
  sold: { label: "Sprzedany", color: "#fbbf24", bg: "rgba(251,191,36,0.10)" },
};

interface Props {
  products: Product[];
}

export function ProductHistory({ products }: Props) {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<Product["status"] | "all">("all");
  const [sortBy, setSortBy] = useState<"date" | "score" | "price">("date");

  const filtered = products
    .filter(p => filter === "all" || p.status === filter)
    .sort((a, b) => {
      if (sortBy === "score") return b.score - a.score;
      if (sortBy === "price") return b.buyPrice - a.buyPrice;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const STATUSES = ["all", "analyzing", "profitable", "rejected", "draft_ready", "sold"] as const;

  return (
    <div>
      {/* Filters */}
      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6, minWidth: "max-content", paddingBottom: 4 }}>
          {STATUSES.map(s => {
            const cfg = s === "all" ? { label: "Wszystkie", color: "#fff", bg: "rgba(255,255,255,0.08)" } : STATUS_CONFIG[s];
            const active = filter === s;
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                style={{
                  padding: "6px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                  background: active ? cfg.bg : "rgba(255,255,255,0.04)",
                  color: active ? cfg.color : "rgba(255,255,255,0.35)",
                  border: active ? `1px solid ${cfg.color}30` : "1px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sort */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Sortuj:</span>
        {([["date", "Data"], ["score", "Wynik"], ["price", "Cena"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            style={{
              padding: "4px 10px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11,
              background: sortBy === key ? "rgba(139,92,246,0.20)" : "transparent",
              color: sortBy === key ? "#a78bfa" : "rgba(255,255,255,0.35)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.30)", padding: "40px 0", fontSize: 13 }}>
          Brak produktów w tej kategorii
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(p => {
            const statusCfg = STATUS_CONFIG[p.status];
            return (
              <button
                key={p.id}
                onClick={() => setLocation(`/resell/analysis/${p.id}`)}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "14px 16px",
                  cursor: "pointer", textAlign: "left", width: "100%",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1, marginRight: 10 }}>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 3, lineHeight: 1.3 }}>{p.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}>
                      {p.category} · {p.buyCountry} → {p.sellCountry}
                    </div>
                  </div>
                  <div style={{
                    background: statusCfg.bg, color: statusCfg.color,
                    padding: "3px 9px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                    flexShrink: 0, border: `1px solid ${statusCfg.color}25`,
                  }}>
                    {statusCfg.label}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <RiskBadge score={p.score} size="sm" />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#f5c842", fontSize: 13, fontWeight: 700 }}>
                      {formatCurrency(p.buyPrice, p.buyCurrency)}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.30)", fontSize: 10 }}>
                      {new Date(p.createdAt).toLocaleDateString("pl-PL")}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
