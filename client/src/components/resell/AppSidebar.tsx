import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Search, TrendingUp, Globe,
  GitCompare, BarChart2, PlusCircle, Package, Settings,
  Boxes, DollarSign, Bookmark, Zap,
} from "lucide-react";
import { NotificationBell } from "@/components/resell/NotificationBell";
import * as palette from "@/design/palette";

const SECTIONS = [
  {
    title: "DISCOVER",
    items: [
      { href: "/resell",         label: "Dashboard",        icon: LayoutDashboard },
      { href: "/resell/search",  label: "AI Search",        icon: Search },
      { href: "/resell/saved",   label: "Saved Opps",       icon: Bookmark },
    ],
  },
  {
    title: "ANALYZE",
    items: [
      { href: "/resell/compare", label: "Platform Compare", icon: GitCompare },
      { href: "/resell/market-scan",  label: "Market Scan",      icon: Globe },
      { href: "/resell/profit/0",label: "Profit Calc",      icon: DollarSign },
    ],
  },
  {
    title: "MANAGE",
    items: [
      { href: "/resell/autopilot",label: "Autopilot",       icon: Zap },
      { href: "/resell/dropship", label: "Dropship Mgr",    icon: Boxes },
      { href: "/resell/add",      label: "Add Product",     icon: PlusCircle },
      { href: "/resell/products", label: "My Products",     icon: Package },
    ],
  },
  {
    title: "CONFIG",
    items: [
      { href: "/resell/settings",label: "API Settings",     icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/resell") return location === "/resell";
    // /resell/profit/0 should also activate on /resell/profit/:id
    const base = href.replace(/\/\d+$/, "");
    return location.startsWith(base);
  };

  return (
    <aside style={{
      width: 220, minWidth: 220, height: "100dvh",
      background: palette.alpha(palette.violetInk.deepest, 0.97),
      borderRight: `1px solid ${palette.alpha(palette.ai.strong, 0.15)}`,
      display: "flex", flexDirection: "column",
      position: "sticky", top: 0, flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: "20px 16px 16px",
        borderBottom: `1px solid ${palette.alpha(palette.ai.strong, 0.12)}`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: `linear-gradient(135deg, ${palette.ai.deep}, ${palette.ai.strong})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 4px 14px ${palette.alpha(palette.ai.strong, 0.4)}`,
        }}>
          <TrendingUp size={16} color={palette.ink.white} />
        </div>
        <div>
          <div style={{ color: palette.brand.gold, fontWeight: 900, fontSize: 12, letterSpacing: 0.8 }}>RESELLASSIST</div>
          <div style={{ color: palette.alpha(palette.ink.white, 0.3), fontSize: 9, letterSpacing: 1.2 }}>AI ARBITRAGE</div>
        </div>
      </div>

      {/* Nav sections */}
      <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 0, overflowY: "auto" }}>
        {SECTIONS.map(section => (
          <div key={section.title} style={{ marginBottom: 4 }}>
            <div style={{ color: palette.alpha(palette.ink.white, 0.2), fontSize: 9, fontWeight: 700, letterSpacing: 1.2, padding: "10px 10px 4px" }}>
              {section.title}
            </div>
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link key={href} href={href}>
                  <a
                    style={{
                      display: "flex", alignItems: "center", gap: 9,
                      padding: "8px 12px", borderRadius: 9, marginBottom: 1,
                      background: active ? palette.alpha(palette.ai.strong, 0.18) : "transparent",
                      color: active ? palette.ai.soft : palette.alpha(palette.ink.white, 0.45),
                      fontWeight: active ? 700 : 500, fontSize: 12,
                      textDecoration: "none", transition: "all 0.12s",
                      border: active ? `1px solid ${palette.alpha(palette.ai.strong, 0.28)}` : "1px solid transparent",
                    }}
                    onMouseEnter={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.background = palette.alpha(palette.ink.white, 0.05); el.style.color = palette.ink.white; } }}
                    onMouseLeave={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.background = "transparent"; el.style.color = palette.alpha(palette.ink.white, 0.45); } }}
                  >
                    <Icon size={14} />
                    {label}
                  </a>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer with notification bell */}
      <div style={{
        padding: "10px 16px",
        borderTop: `1px solid ${palette.alpha(palette.ai.strong, 0.1)}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ color: palette.alpha(palette.ink.white, 0.15), fontSize: 10 }}>AI Arbitrage v2.0</span>
        <NotificationBell />
      </div>
    </aside>
  );
}
