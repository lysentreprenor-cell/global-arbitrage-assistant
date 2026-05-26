import { Link, useLocation } from "wouter";
import { LayoutDashboard, PlusCircle, History, TrendingUp } from "lucide-react";

const NAV_ITEMS = [
  { href: "/resell", label: "Dashboard", icon: LayoutDashboard },
  { href: "/resell/add", label: "Add Product", icon: PlusCircle },
  { href: "/resell/products", label: "Product History", icon: History },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <aside style={{
      width: 240, minWidth: 240, height: "100dvh",
      background: "#0f0f1a",
      borderRight: "1px solid rgba(139,92,246,0.18)",
      display: "flex", flexDirection: "column",
      position: "sticky", top: 0, flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: "24px 20px 20px",
        borderBottom: "1px solid rgba(139,92,246,0.15)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: "linear-gradient(135deg, #8b5cf6, #7c3aed, #f5c842)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(139,92,246,0.4)",
        }}>
          <TrendingUp size={18} color="#fff" />
        </div>
        <div>
          <div style={{ color: "#f5c842", fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>RESELLASSIST</div>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, letterSpacing: 1.4 }}>GLOBAL INTELLIGENCE</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = location === href || (href !== "/resell" && location.startsWith(href));
          return (
            <Link key={href} href={href}>
              <a
                data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 10,
                  background: active ? "rgba(139,92,246,0.22)" : "transparent",
                  color: active ? "#c4b5fd" : "rgba(255,255,255,0.5)",
                  fontWeight: active ? 700 : 500, fontSize: 13,
                  textDecoration: "none", transition: "all 0.15s",
                  border: active ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
                }}
                onMouseEnter={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(255,255,255,0.05)"; el.style.color = "#fff"; } }}
                onMouseLeave={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.background = "transparent"; el.style.color = "rgba(255,255,255,0.5)"; } }}
              >
                <Icon size={16} />
                {label}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: "12px 20px",
        borderTop: "1px solid rgba(139,92,246,0.12)",
        color: "rgba(255,255,255,0.2)", fontSize: 11, textAlign: "center",
      }}>
        v1.0.0 Enterprise
      </div>
    </aside>
  );
}
