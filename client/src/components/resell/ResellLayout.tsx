import React from "react";
import { AppSidebar } from "./AppSidebar";

export function ResellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", minHeight: "100dvh",
      background: "#0a0a14",
      fontFamily: "'Outfit', 'Inter', sans-serif",
    }}>
      <AppSidebar />
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}
