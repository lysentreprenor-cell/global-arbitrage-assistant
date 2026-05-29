import React, { useState } from "react";
import { Truck, Plus, Trash2, Edit3, ExternalLink, Star, X, Search } from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";

// ── Types ─────────────────────────────────────────────────────────────────────

type Supplier = {
  id: string;
  name: string;
  url: string;
  categories: string[];
  avgPrice: string;
  leadTime: string;
  moq: string;
  rating: number;
  notes: string;
  addedAt: number;
  country: string;
};

// ── localStorage CRUD ─────────────────────────────────────────────────────────

const SUPPLIERS_KEY = "resell_suppliers";

function loadSuppliers(): Supplier[] {
  try {
    const saved = localStorage.getItem(SUPPLIERS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveSuppliers(s: Supplier[]): void {
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(s));
}

function addSupplier(s: Omit<Supplier, "id" | "addedAt">): Supplier[] {
  const list = loadSuppliers();
  const newItem: Supplier = { ...s, id: crypto.randomUUID(), addedAt: Date.now() };
  const updated = [newItem, ...list];
  saveSuppliers(updated);
  return updated;
}

function removeSupplier(id: string): Supplier[] {
  const updated = loadSuppliers().filter(s => s.id !== id);
  saveSuppliers(updated);
  return updated;
}

function updateSupplier(id: string, patch: Partial<Supplier>): Supplier[] {
  const updated = loadSuppliers().map(s => s.id === id ? { ...s, ...patch } : s);
  saveSuppliers(updated);
  return updated;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = [
  "Electronics", "Odzież", "Zegarki", "Biżuteria",
  "Telefony", "Gry", "Antyki", "Sneakers", "Inne",
];

const COUNTRIES = [
  { code: "CN", label: "Chiny 🇨🇳" },
  { code: "PL", label: "Polska 🇵🇱" },
  { code: "DE", label: "Niemcy 🇩🇪" },
  { code: "US", label: "USA 🇺🇸" },
  { code: "JP", label: "Japonia 🇯🇵" },
  { code: "GB", label: "UK 🇬🇧" },
  { code: "TR", label: "Turcja 🇹🇷" },
  { code: "IN", label: "Indie 🇮🇳" },
  { code: "OTHER", label: "Inne 🌐" },
];

const FLAG: Record<string, string> = {
  CN: "🇨🇳", PL: "🇵🇱", DE: "🇩🇪", US: "🇺🇸",
  JP: "🇯🇵", GB: "🇬🇧", TR: "🇹🇷", IN: "🇮🇳", OTHER: "🌐",
};

const QUICK_PRESETS: Array<{ name: string; url: string; country: string }> = [
  { name: "AliExpress", url: "https://aliexpress.com", country: "CN" },
  { name: "Alibaba", url: "https://alibaba.com", country: "CN" },
  { name: "Temu", url: "https://temu.com", country: "CN" },
  { name: "Hurtownia.pl", url: "https://hurtownia.pl", country: "PL" },
  { name: "eBay Wholesale", url: "https://ebay.com/wholesale", country: "US" },
  { name: "DHgate", url: "https://dhgate.com", country: "CN" },
  { name: "SHEIN", url: "https://shein.com", country: "CN" },
];

// ── Shared input style ────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13,
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

// ── SupplierForm (used for both Add and Edit) ─────────────────────────────────

type FormState = {
  name: string; url: string; country: string;
  avgPrice: string; leadTime: string; moq: string;
  rating: number; categories: string[]; notes: string;
};

const blankForm = (): FormState => ({
  name: "", url: "", country: "CN", avgPrice: "",
  leadTime: "", moq: "", rating: 0, categories: [], notes: "",
});

function SupplierForm({
  initial, onSave, onCancel, borderColor = "rgba(245,158,11,0.35)",
}: {
  initial: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  borderColor?: string;
}) {
  const [f, setF] = useState<FormState>(initial);

  const toggleCat = (cat: string) =>
    setF(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }));

  const canSave = f.name.trim().length > 0;

  return (
    <div style={{
      background: "rgba(245,158,11,0.05)", border: `1px solid ${borderColor}`,
      borderRadius: 14, padding: 18,
    }}>
      {/* Row 1: name + url */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>NAZWA *</div>
          <input
            style={inp} value={f.name}
            onChange={e => setF(p => ({ ...p, name: e.target.value }))}
            placeholder="np. AliExpress"
          />
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>URL</div>
          <input
            style={inp} value={f.url}
            onChange={e => setF(p => ({ ...p, url: e.target.value }))}
            placeholder="https://aliexpress.com"
          />
        </div>
      </div>

      {/* Row 2: country + avgPrice + leadTime + moq */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>KRAJ</div>
          <select
            value={f.country}
            onChange={e => setF(p => ({ ...p, country: e.target.value }))}
            style={{ ...inp, appearance: "none" as any, cursor: "pointer" }}
          >
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>CENA ŚR.</div>
          <input
            style={inp} value={f.avgPrice}
            onChange={e => setF(p => ({ ...p, avgPrice: e.target.value }))}
            placeholder="$5-50"
          />
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>CZAS DOSTAWY</div>
          <input
            style={inp} value={f.leadTime}
            onChange={e => setF(p => ({ ...p, leadTime: e.target.value }))}
            placeholder="7-14 dni"
          />
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>MOQ</div>
          <input
            style={inp} value={f.moq}
            onChange={e => setF(p => ({ ...p, moq: e.target.value }))}
            placeholder="1 szt."
          />
        </div>
      </div>

      {/* Rating */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>OCENA</div>
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              onClick={() => setF(p => ({ ...p, rating: p.rating === star ? 0 : star }))}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, fontSize: 22, color: star <= f.rating ? "#f59e0b" : "rgba(255,255,255,0.15)", lineHeight: 1 }}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>KATEGORIE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ALL_CATEGORIES.map(cat => {
            const active = f.categories.includes(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCat(cat)}
                style={{
                  padding: "4px 10px", borderRadius: 99, border: "none", cursor: "pointer",
                  fontSize: 11, fontWeight: 600,
                  background: active ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)",
                  color: active ? "#4ade80" : "rgba(255,255,255,0.4)",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, marginBottom: 5 }}>NOTATKI</div>
        <textarea
          style={{ ...inp, height: 60, resize: "vertical" }}
          value={f.notes}
          onChange={e => setF(p => ({ ...p, notes: e.target.value }))}
          placeholder="Dodatkowe informacje o dostawcy..."
        />
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => canSave && onSave(f)}
          disabled={!canSave}
          style={{
            padding: "9px 20px", borderRadius: 9, border: "none",
            background: canSave ? "linear-gradient(135deg,#22c55e,#16a34a)" : "rgba(255,255,255,0.08)",
            color: canSave ? "#fff" : "rgba(255,255,255,0.3)", fontWeight: 700, fontSize: 13,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          Zapisz
        </button>
        <button
          onClick={onCancel}
          style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}

// ── StarDisplay ───────────────────────────────────────────────────────────────

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ color: s <= rating ? "#f59e0b" : "rgba(255,255,255,0.12)", fontSize: 13 }}>★</span>
      ))}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(loadSuppliers);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [filterCat, setFilterCat] = useState<string | null>(null);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = suppliers.filter(s => {
    const matchesSearch = !searchText || s.name.toLowerCase().includes(searchText.toLowerCase());
    const matchesCat = !filterCat || s.categories.includes(filterCat);
    return matchesSearch && matchesCat;
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAdd = (f: FormState) => {
    const updated = addSupplier(f);
    setSuppliers(updated);
    setShowForm(false);
  };

  const handleUpdate = (id: string, f: FormState) => {
    const updated = updateSupplier(id, f);
    setSuppliers(updated);
    setEditingId(null);
  };

  const handleRemove = (id: string) => {
    if (!confirm("Usunąć tego dostawcę?")) return;
    setSuppliers(removeSupplier(id));
  };

  const handlePreset = (preset: typeof QUICK_PRESETS[0]) => {
    const updated = addSupplier({
      name: preset.name, url: preset.url, country: preset.country,
      categories: [], avgPrice: "", leadTime: "", moq: "", rating: 0, notes: "",
    });
    setSuppliers(updated);
  };

  // ── All categories used (for filter chips) ─────────────────────────────────

  const usedCats = Array.from(new Set(suppliers.flatMap(s => s.categories))).sort();

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "linear-gradient(135deg,#06b6d4,#0891b2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Truck size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>Baza Dostawców</h1>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 2 }}>
                Zarządzaj zaufanymi dostawcami i hurtowniami
              </div>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(v => !v); setEditingId(null); }}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 16px",
              borderRadius: 10, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#22c55e,#16a34a)",
              color: "#fff", fontWeight: 700, fontSize: 13,
            }}
          >
            <Plus size={15} /> Dodaj dostawcę
          </button>
        </div>

        {/* ── Add form ────────────────────────────────────────────────────── */}
        {showForm && (
          <div style={{ marginBottom: 24 }}>
            <SupplierForm
              initial={blankForm()}
              onSave={handleAdd}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* ── Search + filter bar ─────────────────────────────────────────── */}
        {suppliers.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {/* Search input */}
              <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)" }} />
                <input
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="Szukaj dostawcy..."
                  style={{ ...inp, paddingLeft: 30 }}
                />
              </div>

              {/* Category filter chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  onClick={() => setFilterCat(null)}
                  style={{
                    padding: "5px 11px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    background: !filterCat ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)",
                    color: !filterCat ? "#4ade80" : "rgba(255,255,255,0.4)",
                  }}
                >
                  Wszystkie
                </button>
                {usedCats.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCat(filterCat === cat ? null : cat)}
                    style={{
                      padding: "5px 11px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                      background: filterCat === cat ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)",
                      color: filterCat === cat ? "#4ade80" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {suppliers.length === 0 && !showForm && (
          <div style={{ textAlign: "center", padding: "60px 0 32px" }}>
            <Truck size={48} style={{ margin: "0 auto 16px", display: "block", opacity: 0.12, color: "#fff" }} />
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Brak dostawców
            </div>
            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 13, marginBottom: 28, maxWidth: 380, margin: "0 auto 28px" }}>
              Dodaj pierwszego dostawcę żeby śledzić źródła zakupów.
            </div>

            {/* Quick-add presets */}
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 700, letterSpacing: 0.7, marginBottom: 12 }}>
              SZYBKI DODAJ
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {QUICK_PRESETS.map(p => (
                <button
                  key={p.name}
                  onClick={() => handlePreset(p)}
                  style={{
                    padding: "8px 16px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.65)",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {FLAG[p.country]} {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── No results from filter ───────────────────────────────────────── */}
        {suppliers.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
            Brak wyników dla podanych filtrów
          </div>
        )}

        {/* ── Supplier grid ───────────────────────────────────────────────── */}
        {filtered.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}>
            {filtered.map(s => {
              const isEditing = editingId === s.id;
              return (
                <div
                  key={s.id}
                  style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 16, padding: isEditing ? 16 : "16px 16px 14px", overflow: "hidden",
                  }}
                >
                  {isEditing ? (
                    <SupplierForm
                      initial={{
                        name: s.name, url: s.url, country: s.country,
                        avgPrice: s.avgPrice, leadTime: s.leadTime, moq: s.moq,
                        rating: s.rating, categories: [...s.categories], notes: s.notes,
                      }}
                      onSave={f => handleUpdate(s.id, f)}
                      onCancel={() => setEditingId(null)}
                      borderColor="rgba(34,197,94,0.25)"
                    />
                  ) : (
                    <>
                      {/* Name + flag */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 16 }}>{FLAG[s.country] ?? "🌐"}</span>
                            {s.url ? (
                              <a
                                href={s.url.startsWith("http") ? s.url : `https://${s.url}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ color: "#fff", fontWeight: 800, fontSize: 15, textDecoration: "none" }}
                              >
                                {s.name}
                              </a>
                            ) : (
                              <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>{s.name}</span>
                            )}
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <StarDisplay rating={s.rating} />
                          </div>
                        </div>
                      </div>

                      {/* Category chips */}
                      {s.categories.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                          {s.categories.map(cat => (
                            <span
                              key={cat}
                              style={{
                                padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                                background: "rgba(34,197,94,0.15)", color: "#4ade80",
                                border: "1px solid rgba(34,197,94,0.2)",
                              }}
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Metrics row */}
                      <div style={{
                        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 6, marginBottom: 10,
                      }}>
                        {[
                          { label: "CENA", val: s.avgPrice || "—" },
                          { label: "DOSTAWA", val: s.leadTime || "—" },
                          { label: "MOQ", val: s.moq || "—" },
                        ].map(m => (
                          <div
                            key={m.label}
                            style={{
                              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                              borderRadius: 8, padding: "6px 8px",
                            }}
                          >
                            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>{m.label}</div>
                            <div style={{ color: "#fff", fontSize: 12, fontWeight: 700, marginTop: 1 }}>{m.val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Notes */}
                      {s.notes && (
                        <div style={{
                          color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 1.5,
                          marginBottom: 12,
                          display: "-webkit-box", WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical", overflow: "hidden",
                        } as React.CSSProperties}>
                          {s.notes}
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {s.url && (
                          <a
                            href={s.url.startsWith("http") ? s.url : `https://${s.url}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "6px 12px", borderRadius: 8, textDecoration: "none",
                              background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
                              color: "#4ade80", fontSize: 11, fontWeight: 700,
                            }}
                          >
                            <ExternalLink size={11} /> Otwórz
                          </a>
                        )}
                        <button
                          onClick={() => { setEditingId(s.id); setShowForm(false); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "6px 11px", borderRadius: 8,
                            border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
                            color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          <Edit3 size={11} /> Edytuj
                        </button>
                        <button
                          onClick={() => handleRemove(s.id)}
                          style={{
                            marginLeft: "auto", background: "none", border: "none",
                            cursor: "pointer", color: "rgba(248,113,113,0.4)", padding: 4,
                          }}
                          title="Usuń"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.2) !important; }
        select option { background: #001a0a; color: #fff; }
        input:focus, textarea:focus, select:focus { border-color: rgba(34,197,94,0.4) !important; }
      `}</style>
    </ResellLayout>
  );
}
