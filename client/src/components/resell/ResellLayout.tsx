import React from "react";
import { TopNav } from "./TopNav";

export function ResellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", minHeight: "100dvh",
      background: "linear-gradient(160deg, #001a0a 0%, #002210 40%, #001508 100%)",
      fontFamily: "'Outfit', 'Inter', sans-serif",
    }}>
      <TopNav />
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}
