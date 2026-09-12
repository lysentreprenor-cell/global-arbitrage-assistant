import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Globe, ShoppingBag, BarChart2, Settings, TrendingUp,
  Camera, ListTodo, Search, Rocket, Bell, Copy, Flame, LineChart,
  Truck, Crosshair, Megaphone, Bot, Activity, Mic, Image as ImageIcon, Clapperboard, RefreshCw,
} from "lucide-react";
import { triggeredAlertsCount } from "@/lib/priceAlerts";
import * as palette from "@/design/palette";

const NAV_ITEMS = [
  { href: "/resell",              label: "Dashboard",   icon: LayoutDashboard },
  { href: "/resell/agent",        label: "Agent AI",    icon: Bot },
  { href: "/resell/marketing",    label: "Marketing",   icon: Megaphone },
  { href: "/resell/search",       label: "Szukaj",      icon: Search },
  { href: "/resell/saved",        label: "Pipeline",    icon: ListTodo },
  { href: "/resell/pnl",          label: "P&L",         icon: LineChart },
  { href: "/resell/alerts",       label: "Alerty",      icon: Bell, badge: true },
  { href: "/resell/trends",       label: "Trendy",      icon: Flame },
  { href: "/resell/competitors",  label: "Rywale",      icon: Crosshair },
  { href: "/resell/compare",      label: "Porównaj",    icon: BarChart2 },
  { href: "/resell/market-scan",  label: "Rynki",       icon: Globe },
  { href: "/resell/dropship",     label: "Dropship",    icon: ShoppingBag },
  { href: "/resell/suppliers",    label: "Dostawcy",    icon: Truck },
  { href: "/resell/photo",        label: "Ze Zdjęcia",  icon: Camera },
  { href: "/resell/quick-list",   label: "Kopiuj",      icon: Copy },
  { href: "/resell/autopilot",    label: "Autopilot",   icon: Rocket },
  { href: "/resell/trading-bot",  label: "Trading Bot", icon: Activity },
  { href: "/resell/settings",     label: "API",         icon: Settings },
  // Gadacz na miejscu dawnego Transportu — na końcu paska, jak chce użytkownik.
  { href: "/resell/assistant",    label: "🗣️ Gadacz",   icon: Mic },
  // Reklama ZARAZ PO Gadaczu — memy (zapis, przeróbki, także z ekranu telefonu) i reklamy.
  { href: "/resell/ads",          label: "📢 Reklama",  icon: ImageIcon },
  { href: "/resell/video",        label: "🎬 Filmiki",  icon: Clapperboard },
  { href: "/resell/update",       label: "🔄 Aktualizacja", icon: RefreshCw },
];

export function TopNav() {
  const [location] = useLocation();
  const [alertBadge, setAlertBadge] = useState(0);

  useEffect(() => {
    const update = () => setAlertBadge(triggeredAlertsCount());
    update();
    window.addEventListener("focus", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("focus", update); window.removeEventListener("storage", update); };
  }, []);

  return (
    <header style={{
      background: palette.surface.canvas,
      borderBottom: `1px solid ${palette.alpha(palette.profit.strong, 0.2)}`,
      padding: "0 16px",
      position: "sticky", top: 0, zIndex: 100,
    }}>
      {/* Logo row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "14px 0 10px",
        borderBottom: `1px solid ${palette.alpha(palette.ink.white, 0.05)}`,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: `linear-gradient(135deg, ${palette.profit.deep}, ${palette.profit.deeper}, ${palette.profit.base})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 4px 14px ${palette.alpha(palette.profit.base, 0.3)}`,
        }}>
          <TrendingUp size={16} color={palette.ink.white} />
        </div>
        <div>
          <div style={{ color: palette.brand.gold, fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>RESELLASSIST</div>
          <div style={{ color: palette.alpha(palette.ink.white, 0.3), fontSize: 9, letterSpacing: 1.4 }}>GLOBAL INTELLIGENCE</div>
        </div>
      </div>

      {/* Nav items row */}
      <nav style={{
        display: "flex", gap: 4,
        padding: "8px 0",
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => {
          const active = location === href || (href !== "/resell" && location.startsWith(href));
          const badgeCount = badge ? alertBadge : 0;
          return (
            <Link key={href} href={href}>
              <a style={{
                display: "flex", alignItems: "center", gap: 6, position: "relative",
                padding: "7px 14px", borderRadius: 8, whiteSpace: "nowrap",
                background: active ? palette.alpha(palette.profit.strong, 0.18) : "transparent",
                color: active ? palette.profit.soft : palette.alpha(palette.ink.white, 0.5),
                fontWeight: active ? 700 : 500, fontSize: 13,
                textDecoration: "none", transition: "all 0.15s",
                border: active ? `1px solid ${palette.alpha(palette.profit.strong, 0.3)}` : "1px solid transparent",
                flexShrink: 0,
              }}>
                <Icon size={14} />
                {label}
                {badgeCount > 0 && (
                  <span style={{
                    position: "absolute", top: 2, right: 2,
                    minWidth: 14, height: 14, borderRadius: 7, background: palette.brand.amber,
                    color: palette.ink.black, fontSize: 9, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 3px",
                  }}>{badgeCount}</span>
                )}
              </a>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
