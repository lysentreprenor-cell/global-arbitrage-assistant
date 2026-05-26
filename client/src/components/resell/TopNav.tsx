import { Link, useLocation } from "wouter";
import { LayoutDashboard, PlusCircle, History, TrendingUp, Globe, ShoppingBag } from "lucide-react";

const NAV_ITEMS = [
  { href: "/resell", label: "Dashboard", icon: LayoutDashboard },
  { href: "/resell/market-scan", label: "Skanuj Rynki", icon: Globe },
  { href: "/resell/dropship", label: "Dropship", icon: ShoppingBag },
  { href: "/resell/products", label: "Historia", icon: History },
];

export function TopNav() {
  const [location] = useLocation();

  return (
    <header style={{
      background: "#001a0a",
      borderBottom: "1px solid rgba(34,197,94,0.2)",
      padding: "0 16px",
      position: "sticky", top: 0, zIndex: 100,
    }}>
      {/* Logo row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "14px 0 10px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: "linear-gradient(135deg, #16a34a, #15803d, #4ade80)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(74,222,128,0.3)",
        }}>
          <TrendingUp size={16} color="#fff" />
        </div>
        <div>
          <div style={{ color: "#f5c842", fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>RESELLASSIST</div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, letterSpacing: 1.4 }}>GLOBAL INTELLIGENCE</div>
        </div>
      </div>

      {/* Nav items row */}
      <nav style={{
        display: "flex", gap: 4,
        padding: "8px 0",
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = location === href || (href !== "/resell" && location.startsWith(href));
          return (
            <Link key={href} href={href}>
              <a style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, whiteSpace: "nowrap",
                background: active ? "rgba(34,197,94,0.18)" : "transparent",
                color: active ? "#86efac" : "rgba(255,255,255,0.5)",
                fontWeight: active ? 700 : 500, fontSize: 13,
                textDecoration: "none", transition: "all 0.15s",
                border: active ? "1px solid rgba(34,197,94,0.3)" : "1px solid transparent",
                flexShrink: 0,
              }}>
                <Icon size={14} />
                {label}
              </a>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
