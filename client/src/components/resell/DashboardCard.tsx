import React from "react";
import { useLocation } from "wouter";

interface DashboardCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  gradient: string;
  accentColor: string;
  stats?: { label: string; value: string }[];
}

export function DashboardCard({
  title, description, icon, href, gradient, accentColor, stats,
}: DashboardCardProps) {
  const [, setLocation] = useLocation();

  return (
    <button
      onClick={() => setLocation(href)}
      style={{
        background: gradient,
        borderRadius: 20,
        padding: "20px",
        border: `1px solid ${accentColor}28`,
        boxShadow: `0 8px 24px rgba(0,0,0,0.35), inset 0 1.5px 0 rgba(255,255,255,0.08)`,
        cursor: "pointer", textAlign: "left", width: "100%",
        position: "relative", overflow: "hidden",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 32px rgba(0,0,0,0.45), inset 0 1.5px 0 rgba(255,255,255,0.08)`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px rgba(0,0,0,0.35), inset 0 1.5px 0 rgba(255,255,255,0.08)`;
      }}
    >
      {/* glint */}
      <div style={{
        position: "absolute", top: 0, left: "15%", right: "15%", height: 1,
        background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)`,
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14, flexShrink: 0,
          background: `${accentColor}22`,
          border: `1px solid ${accentColor}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        <div>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{title}</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.4 }}>{description}</div>
        </div>
      </div>

      {stats && stats.length > 0 && (
        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap",
          borderTop: `1px solid ${accentColor}20`, paddingTop: 12,
        }}>
          {stats.map(s => (
            <div key={s.label}>
              <div style={{ color: accentColor, fontSize: 14, fontWeight: 800 }}>{s.value}</div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        position: "absolute", bottom: 16, right: 16,
        color: `${accentColor}80`, fontSize: 20, fontWeight: 900,
      }}>›</div>
    </button>
  );
}
