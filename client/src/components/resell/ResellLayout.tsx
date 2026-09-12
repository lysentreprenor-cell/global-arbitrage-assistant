import React from "react";
import { TopNav } from "./TopNav";
import { surface } from "@/design/palette";

export function ResellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", minHeight: "100dvh",
      background: `linear-gradient(160deg, ${surface.canvas} 0%, ${surface.canvasMid} 40%, ${surface.canvasDeep} 100%)`,
      fontFamily: "'Outfit', 'Inter', sans-serif",
    }}>
      <TopNav />
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}
