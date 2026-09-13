import React from "react";
import { TopNav } from "./TopNav";
import * as palette from "@/design/palette";

export function ResellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", minHeight: "100dvh",
      background: `linear-gradient(160deg, ${palette.surface.canvas} 0%, ${palette.surface.canvasMid} 40%, ${palette.surface.canvasDeep} 100%)`,
      fontFamily: "'Outfit', 'Inter', sans-serif",
    }}>
      <TopNav />
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}
