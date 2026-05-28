import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  Bookmark, Trash2, ExternalLink, ChevronDown, ChevronRight,
  Check, Clock, ShoppingCart, Tag, Trophy, Ban, Plus, Pencil,
} from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import {
  loadPipeline, savePipeline, updatePipelineItem, removeFromPipeline,
  type PipelineItem, type PipelineStatus,
} from "@/lib/pipeline";

const STATUS_CONFIG: Record<PipelineStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  planned:   { label: "Planowane",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: <Clock size={11} /> },
  bought:    { label: "Kupione",    color: "#f5c842", bg: "rgba(245,200,66,0.12)",  icon: <ShoppingCart size={11} /> },
  listed:    { label: "Wystawione", color: "#a78bfa", bg: "rgba(139,92,246,0.12)", icon: <Tag size={11} /> },
  sold:      { label: "Sprzedane",  color: "#4ade80", bg: "rgba(74,222,128,0.12)", icon: <Trophy size={11} /> },
  abandoned: { label: "Porzucone",  color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: <Ban size={11} /> },
};

const STATUS_ORDER: PipelineStatus[] = ["planned", "bought", "listed", "sold", "abandoned"];

export default function SavedPage() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<PipelineItem[]>(loadPipeline);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [filterStatus, setFilterStatus] = useState<PipelineStatus | "all">("all");

  const key = (i: PipelineItem) => `${i.id}:${i.name}`;

  const update = (id: number, name: string, patch: Partial<PipelineItem>) => {
    setItems(updatePipelineItem(id, name, patch));
  };

  const remove = (id: number, name: string) => {
    setItems(removeFromPipeline(id, name));
  };

  const toggleExpand = (k: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });

  const filtered = filterStatus === "all" ? items : items.filter(i => i.status === filterStatus);

  const counts = STATUS_ORDER.reduce((acc, s) => ({ ...acc, [s]: items.filter(i => i.status === s).length }), {} as Record<PipelineStatus, number>);
  const totalEarned = items.filter(i => i.status === "sold").reduce((s, i) => s + (i.soldPrice ?? i.sell), 0);
  const totalPotential = items.filter(i => i.status !== "sold" && i.status !== "abandoned").reduce((s, i) => s + (i.netProfit ?? i.profit), 0);

  return (
    <ResellLayout>
      <div style={{ padding: "28px 20px 80px", maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bookmark size={18} color="#fff" />
            </div>
            <div>
              <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 900, margin: 0 }}>Mój Pipeline</h1>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{items.length} ogłoszeń · zarobione: <span style={{ color: "#4ade80", fontWeight: 700 }}>${totalEarned}</span> · potencjał: <span style={{ color: "#a78bfa", fontWeight: 700 }}>+${totalPotential}</span></div>
            </div>
          </div>
          <button onClick={() => setLocation("/resell")} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.1)", color: "#a78bfa", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            + Dodaj z Dashboardu
          </button>
        </div>

        {/* Status summary pills */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterStatus("all")}
            style={{ padding: "5px 12px", borderRadius: 99, border: `1px solid ${filterStatus === "all" ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}`, background: filterStatus === "all" ? "rgba(255,255,255,0.1)" : "transparent", color: filterStatus === "all" ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            Wszystkie ({items.length})
          </button>
          {STATUS_ORDER.map(s => {
            const cfg = STATUS_CONFIG[s];
            const active = filterStatus === s;
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ padding: "5px 12px", borderRadius: 99, border: `1px solid ${active ? cfg.color + "60" : cfg.color + "25"}`, background: active ? cfg.bg : "transparent", color: active ? cfg.color : cfg.color + "99", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {cfg.icon} {cfg.label} ({counts[s] ?? 0})
              </button>
            );
          })}
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.2)" }}>
            <Bookmark size={40} style={{ margin: "0 auto 12px", display: "block", opacity: 0.2 }} />
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Brak zapisanych ogłoszeń</div>
            <div style={{ fontSize: 12, marginBottom: 20 }}>Na Dashboardzie kliknij "Save" przy okazji żeby dodać ją tutaj</div>
            <button onClick={() => setLocation("/resell")} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Idź do Dashboardu →
            </button>
          </div>
        )}

        {/* Pipeline items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(item => {
            const cfg = STATUS_CONFIG[item.status];
            const k = key(item);
            const isOpen = expanded.has(k);
            const platforms = item.markets && item.markets.length > 0 ? item.markets : [item.market];

            return (
              <div key={k} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${cfg.color}22`, borderRadius: 14, overflow: "hidden" }}>

                {/* Main row */}
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => toggleExpand(k)}>
                  {/* Status badge */}
                  <div style={{ background: cfg.bg, border: `1px solid ${cfg.color}40`, borderRadius: 8, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4, color: cfg.color, fontSize: 10, fontWeight: 800, flexShrink: 0, letterSpacing: 0.3 }}>
                    {cfg.icon} {cfg.label.toUpperCase()}
                  </div>

                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{item.flag} · {item.category} · {item.daysToSell ? `~${item.daysToSell}d sprzedaży` : ""}</div>
                  </div>

                  {/* Profit */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: item.status === "sold" ? "#4ade80" : "#a78bfa", fontWeight: 900, fontSize: 18 }}>
                      {item.status === "sold" ? `$${item.soldPrice ?? item.sell}` : `+$${item.netProfit ?? item.profit}`}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{item.status === "sold" ? "sprzedano" : "net profit"}</div>
                  </div>

                  <div style={{ color: "rgba(255,255,255,0.2)" }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

                    {/* Buy/sell prices */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, padding: "6px 12px" }}>
                        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700 }}>KUP ZA</div>
                        <div style={{ color: "#4ade80", fontWeight: 900, fontSize: 16 }}>${item.buy}</div>
                      </div>
                      <div style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 8, padding: "6px 12px" }}>
                        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700 }}>SPRZEDAJ ZA</div>
                        <div style={{ color: "#a78bfa", fontWeight: 900, fontSize: 16 }}>${item.sell}</div>
                      </div>
                      <div style={{ background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 8, padding: "6px 12px" }}>
                        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700 }}>MARŻA</div>
                        <div style={{ color: "#f5c842", fontWeight: 900, fontSize: 16 }}>{item.margin}%</div>
                      </div>
                      {item.sourceUrl && (
                        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ade80", fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
                          <ExternalLink size={11} /> Kup tutaj
                        </a>
                      )}
                    </div>

                    {/* Tip */}
                    {item.tip && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontStyle: "italic" }}>💡 {item.tip}</div>}
                    {item.buyHint && <div style={{ color: "rgba(96,165,250,0.7)", fontSize: 11 }}>🛒 {item.buyHint}</div>}

                    {/* Platforms to list on */}
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>WYSTAW NA PLATFORMACH:</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {platforms.map(platform => {
                          const done = item.listedOn.includes(platform);
                          const url = item.sellUrls?.[platform] || item.sellUrl || "";
                          return (
                            <div key={platform} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <a href={url || undefined} target="_blank" rel="noopener noreferrer"
                                style={{ padding: "4px 10px", borderRadius: 7, background: done ? "rgba(74,222,128,0.12)" : "rgba(139,92,246,0.1)", border: `1px solid ${done ? "rgba(74,222,128,0.3)" : "rgba(139,92,246,0.25)"}`, color: done ? "#4ade80" : "#a78bfa", fontSize: 11, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                                {done && <Check size={10} />} {platform}
                              </a>
                              <button
                                onClick={() => {
                                  const listedOn = done
                                    ? item.listedOn.filter(p => p !== platform)
                                    : [...item.listedOn, platform];
                                  const newStatus = listedOn.length > 0 && item.status === "bought" ? "listed" : item.status;
                                  update(item.id, item.name, { listedOn, status: newStatus });
                                }}
                                style={{ background: "none", border: "none", cursor: "pointer", color: done ? "#4ade80" : "rgba(255,255,255,0.25)", padding: 2, fontSize: 10 }}
                                title={done ? "Odznacz jako wystawione" : "Zaznacz jako wystawione"}
                              >
                                {done ? "✓" : "○"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>NOTATKA:</div>
                      {editingNote === k ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            autoFocus
                            value={noteText}
                            onChange={e => setNoteText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") { update(item.id, item.name, { note: noteText }); setEditingNote(null); }
                              if (e.key === "Escape") setEditingNote(null);
                            }}
                            style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, padding: "6px 10px", color: "#fff", fontSize: 12, outline: "none" }}
                            placeholder="np. znalazłem na Allegro za 180 PLN, link zapisany..."
                          />
                          <button onClick={() => { update(item.id, item.name, { note: noteText }); setEditingNote(null); }}
                            style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: "rgba(74,222,128,0.2)", color: "#4ade80", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Zapisz</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: item.note ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)", fontSize: 12, flex: 1 }}>
                            {item.note || "Brak notatki — kliknij żeby dodać"}
                          </span>
                          <button onClick={() => { setEditingNote(k); setNoteText(item.note); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 4 }}>
                            <Pencil size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Status change buttons */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>ZMIEŃ STATUS:</span>
                      {STATUS_ORDER.filter(s => s !== item.status).map(s => {
                        const c = STATUS_CONFIG[s];
                        return (
                          <button key={s} onClick={() => {
                            const patch: Partial<PipelineItem> = { status: s };
                            if (s === "bought") patch.boughtAt = Date.now();
                            if (s === "sold") { patch.soldAt = Date.now(); patch.soldPrice = item.sell; }
                            update(item.id, item.name, patch);
                          }}
                            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: `1px solid ${c.color}30`, background: c.bg, color: c.color, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3 }}>
                            {c.icon} {c.label}
                          </button>
                        );
                      })}
                      <button onClick={() => remove(item.id, item.name)}
                        style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.06)", color: "#f87171", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                        <Trash2 size={10} /> Usuń
                      </button>
                    </div>

                    {/* Sold price input when status=sold */}
                    {item.status === "sold" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Cena sprzedaży:</span>
                        <input
                          type="number"
                          value={item.soldPrice ?? item.sell}
                          onChange={e => update(item.id, item.name, { soldPrice: parseFloat(e.target.value) || item.sell })}
                          style={{ width: 80, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 7, padding: "4px 8px", color: "#4ade80", fontSize: 13, fontWeight: 700, outline: "none", textAlign: "center" }}
                        />
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>USD</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <style>{`input::placeholder { color: rgba(255,255,255,0.2); }`}</style>
    </ResellLayout>
  );
}
