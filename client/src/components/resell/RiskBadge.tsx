import React from "react";
import { getProfitabilityLabel } from "@/lib/resell/calculations";

interface RiskBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showScore?: boolean;
}

export function RiskBadge({ score, size = "md", showScore = true }: RiskBadgeProps) {
  const { label, color, bgColor } = getProfitabilityLabel(score);

  const padding = size === "sm" ? "2px 8px" : size === "lg" ? "6px 16px" : "3px 12px";
  const fontSize = size === "sm" ? 10 : size === "lg" ? 13 : 11;

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: bgColor, borderRadius: 99,
      padding,
      border: `1px solid ${color}33`,
    }}>
      <div style={{
        width: size === "sm" ? 6 : 8, height: size === "sm" ? 6 : 8,
        borderRadius: "50%", background: color,
        boxShadow: `0 0 6px ${color}`,
        flexShrink: 0,
      }} />
      <span style={{ color, fontSize, fontWeight: 700, letterSpacing: 0.3 }}>
        {label}
        {showScore && <span style={{ opacity: 0.75, marginLeft: 4 }}>({score})</span>}
      </span>
    </div>
  );
}
