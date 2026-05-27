import React, { useState, useRef, useEffect } from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { getUserLocation, setUserLocation, SUPPORTED_LOCATIONS, type UserLocation } from "@/lib/apiKeys";

type Props = {
  onChange?: (loc: UserLocation) => void;
};

export function LocationPicker({ onChange }: Props) {
  const [current, setCurrent] = useState<UserLocation>(getUserLocation);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (loc: UserLocation) => {
    setUserLocation(loc);
    setCurrent(loc);
    setOpen(false);
    onChange?.(loc);
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "7px 12px", borderRadius: 9,
          border: "1px solid rgba(96,165,250,0.25)",
          background: "rgba(96,165,250,0.08)",
          color: "#93c5fd", fontSize: 12, fontWeight: 700,
          cursor: "pointer", transition: "all 0.15s",
        }}
        title="Set your location for localised buy-market results"
      >
        <MapPin size={13} />
        {current.flag} {current.label}
        <ChevronDown size={12} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 999,
          background: "#1a1030", border: "1px solid rgba(96,165,250,0.25)",
          borderRadius: 12, padding: 6, minWidth: 180,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: 0.8, padding: "4px 10px 6px" }}>
            YOUR BUY MARKET
          </div>
          {SUPPORTED_LOCATIONS.map(loc => (
            <button
              key={loc.country}
              onClick={() => select(loc)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "7px 10px", borderRadius: 8,
                background: current.country === loc.country ? "rgba(96,165,250,0.15)" : "transparent",
                border: "none", color: current.country === loc.country ? "#93c5fd" : "rgba(255,255,255,0.6)",
                fontSize: 12, fontWeight: current.country === loc.country ? 700 : 500,
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={e => { if (current.country !== loc.country) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { if (current.country !== loc.country) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ fontSize: 16 }}>{loc.flag}</span>
              <span>{loc.label}</span>
              <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.2)", fontSize: 10 }}>{loc.currency}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
