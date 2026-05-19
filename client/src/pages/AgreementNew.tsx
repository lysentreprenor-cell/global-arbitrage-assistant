import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type CurrencyCode } from "@/lib/store";

// ——— Types
type Category = "usluga" | "remont" | "sprzedaz" | "wynajem" | "wlasna" | "pozyczka";
type PricingMethod = string;
type DeadlineType = "single" | "range" | "stages" | "cyclic" | "tbd";
type ProtocolStatus = "accepted" | "with_notes" | "needs_fixes" | "rejected";
type PaymentMethodType = "upfront" | "after" | "stages" | "deposit" | "partial_deposit";

interface Party {
  name: string;
  phone: string;
  email: string;
}

interface AdditionalItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  payer: "client" | "contractor";
  inDeposit: boolean;
}

interface PaymentStage {
  id: string;
  name: string;
  amount: number;
  quantity?: number;
  description?: string;
  deadline?: string;
}

interface Room {
  id: string;
  name: string;
  floorArea: number;
  wallArea: number;
  ceiling: boolean;
  floor: boolean;
  notes: string;
}

interface VehicleDetails {
  brand: string; model: string; year: string;
  vin: string; engineNumber: string; licensePlate: string;
  color: string; mileage: string;
  fuel: "benzyna" | "diesel" | "lpg" | "elektryczny" | "hybryda" | "";
  gearbox: "manualna" | "automatyczna" | "";
  condition: "bardzo_dobry" | "dobry" | "sredni" | "do_naprawy" | "";
  hasServiceBook: boolean; hasTwoKeys: boolean; hasOC: boolean;
  noAccidents: boolean; noPledge: boolean; notStolen: boolean;
}

interface ElectronicsDetails {
  type: "telefon" | "laptop" | "konsola" | "tablet" | "tv" | "inne";
  brand: string;
  model: string;
  imei: string;
  condition: "nowy" | "bardzo_dobry" | "uzywany" | "uszkodzony";
  icloudLock: boolean;
  screenCrack: boolean;
  batteryPct: number;
  loggedOut: boolean;
  accessories: string[];
  processor: string;
  ram: string;
  storage: string;
  os: string;
  charger: boolean;
  consolePads: number;
  consoleGames: number;
  consoleDrive: string;
  consoleOnline: boolean;
}

interface SaleItem {
  id: string;
  name: string;
  condition: string;
  serial: string;
}

interface UnitItem {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

interface WizardData {
  myRole: "client" | "contractor" | "";
  inviteContact: string;
  category: Category | "";
  subcategory: string;
  client: Party;
  contractor: Party;
  pricingMethod: PricingMethod;
  basePrice: number;
  currency: CurrencyCode;
  deadlineType: DeadlineType;
  deadlineSingle: string;
  deadlineFrom: string;
  deadlineTo: string;
  deadlineTbd: boolean;
  scopeDescription: string;
  scopeLocation: string;
  scopeMaterials: boolean;
  scopeWarranty: boolean;
  scopeAcceptance: boolean;
  scopeInstallations: string[];
  scopeDemolition: boolean;
  scopeCleaning: boolean;
  scopeBeforePhotos: boolean;
  itemDescription: string;
  itemCondition: string;
  itemSerial: string;
  rentalDescription: string;
  rentalConditionBefore: string;
  rentalProtocol: boolean;
  customTitle: string;
  customDesc: string;
  paymentStages: PaymentStage[];
  rooms: Room[];
  vehicle: Partial<VehicleDetails>;
  electronics: Partial<ElectronicsDetails>;
  rentalFrom: string;
  rentalTo: string;
  rentalDeposit: number;
  rentalReturnNotes: string;
  rentalDamageLiability: boolean;
  rentalNoticePeriod: number;
  rentalTenants: number;
  rentalFurnitured: boolean;
  rentalPets: "" | "allowed" | "not_allowed" | "allowed_deposit";
  rentalKeys: number;
  rentalParking: boolean;
  rentalUtilities: "" | "included" | "tenant" | "split";
  rentalSubletting: boolean;
  rentalDepositReturnDays: number;
  cyclicInterval: number;
  cyclicUnit: "days" | "weeks" | "months";
  additionalItems: AdditionalItem[];
  paymentMethod: PaymentMethodType | "";
  depositCovers: string[];
  materialsBy: "client" | "contractor" | "split";
  transportBy: "client" | "contractor";
  weekendWork: boolean;
  requireApproval: boolean;
  priceChangeApproval: boolean;
  warranty: boolean;
  warrantyDays: number;
  latePenalty: boolean;
  latePenaltyAmount: number;
  protocolStatus: ProtocolStatus | "";
  beforePhotos: boolean;
  afterPhotos: boolean;
  protocolDesc: string;
  protocolIssues: string;
  protocolFixDeadline: string;
  estimatedHours: number;
  unitItems: UnitItem[];
  saleItems: SaleItem[];
  rentalDays: number;
  rentalWeeks: number;
  rentalMonths: number;
  releaseDeposit: boolean;
  signed: boolean;
  bankAccount: string;
  bankBlik: string;
  paymentTitle: string;
}

const INITIAL: WizardData = {
  myRole: "", inviteContact: "",
  category: "", subcategory: "",
  client: { name: "", phone: "", email: "" },
  contractor: { name: "", phone: "", email: "" },
  pricingMethod: "", basePrice: 0, currency: "PLN",
  deadlineType: "single", deadlineSingle: "", deadlineFrom: "", deadlineTo: "", deadlineTbd: false,
  scopeDescription: "", scopeLocation: "", scopeMaterials: false, scopeWarranty: false, scopeAcceptance: false,
  scopeInstallations: [], scopeDemolition: false, scopeCleaning: false, scopeBeforePhotos: false,
  itemDescription: "", itemCondition: "", itemSerial: "",
  rentalDescription: "", rentalConditionBefore: "", rentalProtocol: false,
  customTitle: "", customDesc: "",
  paymentStages: [], rooms: [], vehicle: {}, electronics: {},
  rentalFrom: "", rentalTo: "", rentalDeposit: 0, rentalReturnNotes: "", rentalDamageLiability: false,
  rentalNoticePeriod: 30, rentalTenants: 1, rentalFurnitured: false, rentalPets: "", rentalKeys: 1, rentalParking: false,
  rentalUtilities: "", rentalSubletting: false, rentalDepositReturnDays: 30,
  cyclicInterval: 1, cyclicUnit: "months",
  additionalItems: [],
  paymentMethod: "", depositCovers: [],
  materialsBy: "contractor", transportBy: "contractor",
  weekendWork: false, requireApproval: true, priceChangeApproval: true,
  warranty: false, warrantyDays: 30, latePenalty: false, latePenaltyAmount: 50,
  protocolStatus: "", beforePhotos: false, afterPhotos: false,
  protocolDesc: "", protocolIssues: "", protocolFixDeadline: "", releaseDeposit: false,
  estimatedHours: 0, unitItems: [], saleItems: [],
  rentalDays: 0, rentalWeeks: 0, rentalMonths: 0,
  signed: false,
  bankAccount: "", bankBlik: "", paymentTitle: "",
};

// ——— Style helpers
// ——— LOCAL STORAGE HELPERS
type ContractPhaseValue = "" | "awaiting_counterparty" | "awaiting_deposit" | "in_progress" | "awaiting_release" | "completed";

interface ActivityEvent {
  id: string;
  timestamp: string;
  type: "phase_change" | "share" | "dispute" | "note";
  label: string;
  icon: string;
}

interface SavedContract {
  id: string;
  contractId: string;
  data: WizardData;
  totalPrice: number;
  phase: ContractPhaseValue;
  createdAt: string;
  updatedAt: string;
  events: ActivityEvent[];
  rating?: number;
  ratingNote?: string;
  paidStages?: string[];
  paymentSentAt?: string;
  paymentConfirmedAt?: string;
}

const LS_DRAFT_KEY = "itemprise_draft";
const LS_CONTRACTS_KEY = "itemprise_contracts";

function loadDraft(): { data: WizardData; stepIndex: number; contractId: string } | null {
  try {
    const raw = localStorage.getItem(LS_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDraft(data: WizardData, stepIndex: number, contractId: string) {
  try { localStorage.setItem(LS_DRAFT_KEY, JSON.stringify({ data, stepIndex, contractId })); } catch {}
}

function clearDraft() {
  try { localStorage.removeItem(LS_DRAFT_KEY); } catch {}
}

function loadContracts(): SavedContract[] {
  try {
    const raw = localStorage.getItem(LS_CONTRACTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveContract(contract: SavedContract) {
  try {
    const existing = loadContracts();
    const idx = existing.findIndex(c => c.id === contract.id);
    if (idx >= 0) existing[idx] = contract;
    else existing.unshift(contract);
    localStorage.setItem(LS_CONTRACTS_KEY, JSON.stringify(existing.slice(0, 50)));
  } catch {}
}

function addContractEvent(contractId: string, event: Omit<ActivityEvent, "id" | "timestamp">) {
  try {
    const existing = loadContracts();
    const idx = existing.findIndex(c => c.contractId === contractId);
    if (idx >= 0) {
      existing[idx].events = existing[idx].events || [];
      existing[idx].events.unshift({ ...event, id: Math.random().toString(36).slice(2), timestamp: new Date().toISOString() });
      localStorage.setItem(LS_CONTRACTS_KEY, JSON.stringify(existing));
    }
  } catch {}
}

const PHASE_EVENTS: Record<string, { label: string; icon: string }> = {
  awaiting_counterparty: { icon: "✍️", label: "Umowa podpisana — oczekuje na akceptację" },
  awaiting_deposit:      { icon: "💳", label: "Akceptacja potwierdzona — oczekuje na wpłatę" },
  in_progress:           { icon: "🔨", label: "Wpłata na escrow potwierdzona — realizacja rozpoczęta" },
  awaiting_release:      { icon: "📋", label: "Wykonanie zgłoszone — oczekuje na zatwierdzenie" },
  completed:             { icon: "🔓", label: "Odbiór zatwierdzony — środki odblokowane" },
};

// ——— CONTRACT TEMPLATES
const TEMPLATES: { id: string; icon: string; label: string; desc: string; preset: Partial<WizardData> }[] = [
  {
    id: "service", icon: "🔨", label: "Usługa", desc: "Praca, pomoc, naprawa",
    preset: { category: "usluga", subcategory: "Inne", pricingMethod: "fixed", warranty: true, warrantyDays: 30, latePenalty: true, latePenaltyAmount: 100, requireApproval: true },
  },
  {
    id: "rental", icon: "🏠", label: "Wynajem", desc: "Mieszkanie, lokal, sprzęt",
    preset: { category: "wynajem", subcategory: "Mieszkanie", pricingMethod: "per_month", rentalDeposit: 2000, rentalDamageLiability: true, rentalProtocol: true },
  },
  {
    id: "car", icon: "🚗", label: "Sprzedaż auta", desc: "Samochód, motocykl",
    preset: { category: "sprzedaz", subcategory: "Samochód", pricingMethod: "fixed" },
  },
  {
    id: "remont", icon: "🛠", label: "Remont", desc: "Malowanie, instalacje",
    preset: { category: "remont", subcategory: "Generalny remont", pricingMethod: "stages", scopeBeforePhotos: true, warranty: true, warrantyDays: 365, latePenalty: true, latePenaltyAmount: 200 },
  },
];

const PHASE_LABELS: Record<string, string> = {
  awaiting_counterparty: "Oczekuje na akceptację",
  awaiting_deposit: "Oczekuje na wpłatę",
  in_progress: "W realizacji",
  awaiting_release: "Oczekuje na zatwierdzenie",
  completed: "Zakończona",
};
const PHASE_COLORS: Record<string, string> = {
  awaiting_counterparty: "#f59e0b",
  awaiting_deposit: "#f59e0b",
  in_progress: "var(--color-primary)",
  awaiting_release: "#16a34a",
  completed: "#6b7280",
};
const CAT_LABELS: Record<string, string> = {
  usluga: "Usługa", remont: "Remont", sprzedaz: "Sprzedaż",
  wynajem: "Wynajem", wlasna: "Własna", pozyczka: "Pożyczka",
};

// ——— HOME SCREEN
function HomeScreen({ onNew, onResume, onTemplate, draft, contracts, onOpenContract }: {
  onNew: () => void;
  onResume: () => void;
  onTemplate: (preset: Partial<WizardData>) => void;
  draft: { data: WizardData; stepIndex: number } | null;
  contracts: SavedContract[];
  onOpenContract: (c: SavedContract) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "done" | "action">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "deadline" | "value">("newest");

  // Stats
  const active = contracts.filter(c => c.phase && c.phase !== "completed");
  const activeValue = active.reduce((s, c) => s + (c.totalPrice || 0), 0);
  const needAction = contracts.filter(c => c.phase === "awaiting_release").length;
  const currency = contracts[0]?.data.currency || "PLN";

  // Deadline helpers
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const deadlineBadge = (c: SavedContract): "overdue" | "soon" | null => {
    const d = c.data.deadlineSingle;
    if (!d || c.phase === "completed") return null;
    const dl = new Date(d); dl.setHours(0, 0, 0, 0);
    const diff = Math.round((dl.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return "overdue";
    if (diff <= 2) return "soon";
    return null;
  };

  // Filter + search + sort
  const visible = contracts.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      c.contractId.toLowerCase().includes(q) ||
      (c.data.inviteContact || "").toLowerCase().includes(q) ||
      (c.data.subcategory || "").toLowerCase().includes(q) ||
      (CAT_LABELS[c.data.category] || "").toLowerCase().includes(q) ||
      (c.data.customTitle || "").toLowerCase().includes(q) ||
      (c.data.scopeDescription || "").toLowerCase().includes(q) ||
      (c.data.saleItems || []).some(i => (i.name || "").toLowerCase().includes(q)) ||
      (c.data.client.name || "").toLowerCase().includes(q) ||
      (c.data.contractor.name || "").toLowerCase().includes(q);
    const matchFilter =
      filter === "all" ? true :
      filter === "active" ? (c.phase !== "completed") :
      filter === "done" ? (c.phase === "completed") :
      filter === "action" ? (c.phase === "awaiting_release") : true;
    return matchSearch && matchFilter;
  }).sort((a, b) => {
    if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sortBy === "deadline") {
      const da = a.data.deadlineSingle || "9999-99-99";
      const db = b.data.deadlineSingle || "9999-99-99";
      return da.localeCompare(db);
    }
    if (sortBy === "value") return (b.totalPrice || 0) - (a.totalPrice || 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // newest default
  });

  const filterOpts: { key: typeof filter; label: string }[] = [
    { key: "all", label: "Wszystkie" },
    { key: "active", label: "Aktywne" },
    { key: "done", label: "Zakończone" },
    { key: "action", label: "Moje działanie" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", maxWidth: "min(560px, 100vw)", margin: "0 auto", padding: "24px 16px 100px", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ color: "var(--color-primary)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 2 }}>ItemPrise</div>
          <h1 style={{ color: "var(--color-foreground)", fontSize: 26, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>Moje umowy</h1>
        </div>
        <button onClick={onNew} style={{ background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 12, padding: "10px 18px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>+ Nowa</button>
      </div>

      {/* Stats bar */}
      {contracts.length > 0 && (
        <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 0 }}>
          <div style={{ flex: 1, textAlign: "center", borderRight: "1px solid var(--color-border)", paddingRight: 8 }}>
            <div style={{ color: "var(--color-primary)", fontSize: 18, fontWeight: 900 }}>{active.length}</div>
            <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 600 }}>Aktywne</div>
          </div>
          <div style={{ flex: 2, textAlign: "center", borderRight: needAction > 0 ? "1px solid var(--color-border)" : undefined, padding: "0 8px" }}>
            <div style={{ color: "var(--color-foreground)", fontSize: 18, fontWeight: 900 }}>{activeValue > 0 ? `${activeValue.toLocaleString("pl-PL")} ${currency}` : "—"}</div>
            <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 600 }}>Łączna wartość</div>
          </div>
          {needAction > 0 && (
            <div style={{ flex: 1, textAlign: "center", paddingLeft: 8 }}>
              <div style={{ color: "#dc2626", fontSize: 18, fontWeight: 900 }}>{needAction}</div>
              <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 600 }}>Do zrobienia</div>
            </div>
          )}
        </div>
      )}

      {/* Draft resume banner */}
      {draft && (
        <div style={{ background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", border: "1.5px solid color-mix(in srgb, var(--color-primary) 40%, transparent)", borderRadius: 14, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>📝</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, marginBottom: 1 }}>Niedokończona umowa</div>
            <div style={{ color: "var(--color-muted-foreground)", fontSize: 12 }}>{CAT_LABELS[draft.data.category] || "Bez kategorii"}{draft.data.subcategory ? ` › ${draft.data.subcategory}` : ""} · Krok {draft.stepIndex + 1}</div>
          </div>
          <button onClick={onResume} style={{ background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Wznów</button>
        </div>
      )}

      {/* Templates */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Zacznij od szablonu</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => onTemplate(t.preset)}
              style={{ background: "var(--color-card)", border: "1.5px solid var(--color-border)", borderRadius: 14, padding: "14px 12px", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 4 }}
            >
              <span style={{ fontSize: 22 }}>{t.icon}</span>
              <span style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{t.label}</span>
              <span style={{ color: "var(--color-muted-foreground)", fontSize: 11 }}>{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search + filter */}
      {contracts.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍  Szukaj po stronie, kategorii..."
            style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-foreground)", fontSize: 14, boxSizing: "border-box", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {filterOpts.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${filter === f.key ? "var(--color-primary)" : "var(--color-border)"}`, background: filter === f.key ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", color: filter === f.key ? "var(--color-primary)" : "var(--color-muted-foreground)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sort bar */}
      {contracts.length > 1 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 12 }}>
          {([
            { key: "newest", label: "📅 Najnowsze" },
            { key: "oldest", label: "⬆ Najstarsze" },
            { key: "deadline", label: "⏰ Termin" },
            { key: "value", label: "💰 Wartość" },
          ] as { key: typeof sortBy; label: string }[]).map(s => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${sortBy === s.key ? "var(--color-primary)" : "var(--color-border)"}`, background: sortBy === s.key ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", color: sortBy === s.key ? "var(--color-primary)" : "var(--color-muted-foreground)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Contracts list */}
      {contracts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 20px", color: "var(--color-muted-foreground)" }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>📄</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Brak umów</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>Wybierz szablon lub kliknij "+ Nowa".</div>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 20px", color: "var(--color-muted-foreground)" }}>
          <div style={{ fontSize: 13 }}>Brak wyników dla podanych kryteriów.</div>
        </div>
      ) : (
        <>
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Umowy ({visible.length})
          </div>
          {visible.map(c => {
            const badge = deadlineBadge(c);
            const catIcon: Record<string,string> = { usluga:"🛠️", remont:"🔨", sprzedaz:"🛍️", wynajem:"🏠", wlasna:"📝", pozyczka:"💰" };
            const otherRole = c.data.myRole === "client"
              ? (c.data.category === "wynajem" ? "Wynajmujący" : c.data.category === "sprzedaz" ? "Sprzedający" : "Wykonawca")
              : (c.data.category === "wynajem" ? "Najemca" : c.data.category === "sprzedaz" ? "Kupujący" : "Zamawiający");
            const otherName = c.data.myRole === "client"
              ? (c.data.contractor.name || c.data.inviteContact || "")
              : (c.data.client.name || c.data.inviteContact || "");
            return (
              <div key={c.id} onClick={() => onOpenContract(c)} style={{ background: "var(--color-card)", border: `1.5px solid ${badge === "overdue" ? "#dc2626" : badge === "soon" ? "#f59e0b" : "var(--color-border)"}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1, marginTop: 1 }}>{catIcon[c.data.category] || "📄"}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "var(--color-foreground)", fontSize: 15, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.data.customTitle || (c.data.subcategory ? `${CAT_LABELS[c.data.category] || "Umowa"} › ${c.data.subcategory}` : CAT_LABELS[c.data.category] || "Umowa")}
                      </div>
                      {otherName && (
                        <div style={{ color: "var(--color-muted-foreground)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {otherRole}: <span style={{ color: "var(--color-foreground)", fontWeight: 600 }}>{otherName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                    {c.totalPrice > 0 && (
                      <div style={{ color: "var(--color-primary)", fontSize: 15, fontWeight: 800 }}>{c.totalPrice.toLocaleString("pl-PL")} {c.data.currency}</div>
                    )}
                    {c.rating && (
                      <div style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700 }}>{"★".repeat(c.rating)}{"☆".repeat(5 - c.rating)}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {c.phase && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: `color-mix(in srgb, ${PHASE_COLORS[c.phase] || "var(--color-border)"} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${PHASE_COLORS[c.phase] || "var(--color-border)"} 30%, transparent)` }}>
                      <div style={{ width: 5, height: 5, borderRadius: 3, background: PHASE_COLORS[c.phase] || "var(--color-border)" }} />
                      <span style={{ color: PHASE_COLORS[c.phase] || "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700 }}>{PHASE_LABELS[c.phase] || c.phase}</span>
                    </div>
                  )}
                  <span style={{ color: "var(--color-muted-foreground)", fontSize: 11 }}>#{c.contractId} · {new Date(c.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</span>
                  {badge === "overdue" && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, background: "color-mix(in srgb, #dc2626 12%, transparent)", border: "1px solid color-mix(in srgb, #dc2626 30%, transparent)" }}>
                      <span style={{ color: "#dc2626", fontSize: 11, fontWeight: 700 }}>⚠ Termin minął</span>
                    </div>
                  )}
                  {badge === "soon" && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, background: "color-mix(in srgb, #f59e0b 12%, transparent)", border: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)" }}>
                      <span style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700 }}>⏰ Termin wkrótce</span>
                    </div>
                  )}
                  {badge === "overdue" && otherName && (
                    <a
                      href={otherName.includes("@") ? `mailto:${otherName}` : `tel:${otherName}`}
                      onClick={e => e.stopPropagation()}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, color: "#dc2626", fontSize: 11, fontWeight: 700, textDecoration: "none" }}
                    >
                      📞 Skontaktuj się z {otherRole.toLowerCase()}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 16px", borderRadius: 10, minHeight: 44,
  border: "1px solid var(--color-border)", background: "var(--color-card)",
  color: "var(--color-foreground)", fontSize: 16, boxSizing: "border-box",
};
const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: "vertical", minHeight: 90, fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.07em", color: "var(--color-muted-foreground)", marginBottom: 8, display: "block",
};
const cardStyle = (active = false): React.CSSProperties => ({
  padding: "12px 14px", borderRadius: 12, boxSizing: "border-box", width: "100%",
  border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)",
  background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)",
  cursor: "pointer",
});
const sectionCard: React.CSSProperties = {
  padding: 14, borderRadius: 12, border: "1px solid var(--color-border)",
  background: "var(--color-card)", marginBottom: 14, boxSizing: "border-box",
};
const tileGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%",
};
const btnPrimary: React.CSSProperties = {
  padding: "14px 20px", borderRadius: 12, border: "none",
  background: "var(--color-primary)", color: "#fff",
  fontSize: 16, fontWeight: 700, cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "13px 20px", borderRadius: 12,
  border: "1px solid var(--color-border)", background: "transparent",
  color: "var(--color-muted-foreground)", fontSize: 15, fontWeight: 600, cursor: "pointer",
};
const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 20, cursor: "pointer", fontSize: 13,
  fontWeight: active ? 700 : 500,
  border: `1.5px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
  background: active ? "var(--color-primary)" : "var(--color-card)",
  color: active ? "#fff" : "var(--color-muted-foreground)",
  transition: "background 0.15s, color 0.15s, border-color 0.15s",
  flexShrink: 0,
});

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid var(--color-border)", cursor: "pointer", userSelect: "none" }}
    >
      <span style={{ color: "var(--color-foreground)", fontSize: 15, lineHeight: 1.4, flex: 1, paddingRight: 12 }}>{label}</span>
      <div
        style={{
          width: 48, height: 28, borderRadius: 14,
          background: on ? "var(--color-primary)" : "var(--color-border)",
          position: "relative", flexShrink: 0, transition: "background 0.2s",
          boxShadow: on ? "0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent)" : "none",
        }}
      >
        <div style={{
          position: "absolute", top: 4, left: on ? 24 : 4, width: 20, height: 20,
          borderRadius: 10, background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
    </div>
  );
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...labelStyle, ...style }}>{children}</div>;
}

const SUBCATEGORIES: Record<string, string[]> = {
  usluga: ["Naprawa", "Montaż", "Transport", "Sprzątanie", "Pomoc/opieka", "Usługa techniczna", "Inna"],
  remont: ["Malowanie", "Szpachlowanie", "Podłogi", "Łazienka", "Kuchnia", "Elektryka", "Hydraulika", "Cały remont"],
  sprzedaz: ["Auto/pojazd", "Elektronika", "Meble", "Narzędzia", "Sprzęt domowy", "Towar firmowy", "Inna rzecz"],
  wynajem: ["Mieszkanie", "Pokój", "Lokal", "Garaż/parking", "Auto/pojazd", "Sprzęt", "Inny wynajem"],
};

const PRICING_OPTIONS: Record<string, { value: string; label: string }[]> = {
  usluga: [
    { value: "total", label: "Cena za całość" },
    { value: "hourly", label: "Za godzinę" },
    { value: "unit", label: "Za sztukę" },
    { value: "stages", label: "Etapami" },
  ],
  remont: [
    { value: "m2", label: "Cena za m²" },
    { value: "materials_labor", label: "Materiały + robocizna" },
    { value: "stages", label: "Etapami" },
    { value: "per_point", label: "Za punkt" },
    { value: "total", label: "Za całość" },
  ],
  sprzedaz: [
    { value: "fixed", label: "Cena stała" },
    { value: "negotiated", label: "Cena negocjowana" },
    { value: "deposit_pickup", label: "Z depozytem do odbioru" },
  ],
  wynajem: [
    { value: "per_day", label: "Za dzień" },
    { value: "per_week", label: "Za tydzień" },
    { value: "per_month", label: "Za miesiąc" },
  ],
  wlasna: [
    { value: "price", label: "Cena" },
    { value: "value", label: "Wartość umowy" },
  ],
};

const ADDITIONAL_PRESETS = [
  "Materiały", "Transport", "Dojazd", "Demontaż", "Utylizacja",
  "Sprzątanie", "Poprawki", "Gwarancja", "Praca w weekend", "Pilny termin",
];

const DEPOSIT_COVERS_OPTIONS = [
  "Całość", "Robocizna", "Materiały", "Wybrane etapy",
  "Ostatnia rata", "Poprawki/usterki", "Kaucja za szkody",
];

const CATEGORY_LABELS: Record<string, string> = {
  usluga: "Usługa", remont: "Remont", sprzedaz: "Sprzedaż", wynajem: "Wynajem", wlasna: "Własna",
};

// Module-level presets — defined once, not re-created on every render
const HOUR_PRESETS = [
  { label: "1 h", h: 1 }, { label: "2 h", h: 2 }, { label: "4 h", h: 4 },
  { label: "8 h", h: 8 }, { label: "16 h", h: 16 }, { label: "40 h", h: 40 },
];
const DAY_PRESETS = [
  { label: "3 dni", d: 3 }, { label: "1 tydz.", d: 7 },
  { label: "2 tyg.", d: 14 }, { label: "1 mies.", d: 30 }, { label: "2 mies.", d: 60 },
];
const WEEK_PRESETS = [
  { label: "1 tydz.", w: 1 }, { label: "2 tyg.", w: 2 },
  { label: "1 mies.", w: 4 }, { label: "2 mies.", w: 8 }, { label: "3 mies.", w: 13 },
];
const MONTH_PRESETS = [
  { label: "1 mies.", m: 1 }, { label: "3 mies.", m: 3 },
  { label: "6 mies.", m: 6 }, { label: "1 rok", m: 12 }, { label: "2 lata", m: 24 },
];
const WARRANTY_PRESETS = [
  { l: "30 dni", d: 30 }, { l: "90 dni", d: 90 }, { l: "6 mies.", d: 180 },
  { l: "1 rok", d: 365 }, { l: "2 lata", d: 730 },
];
const PENALTY_PRESETS = [50, 100, 200, 500];

const STEP_HINTS: Record<string, { icon: string; text: string }> = {
  podkategoria: { icon: "🎯", text: "Precyzyjny typ umowy = mniej sporów i lepsza ochrona." },
  strony: { icon: "🔒", text: "Dane stron są używane wyłącznie w tej umowie. Obie strony muszą je zaakceptować." },
  wycena: { icon: "💡", text: "Jasna cena od początku eliminuje 80% konfliktów przy rozliczeniu." },
  termin: { icon: "📅", text: "Konkretny termin + kara za opóźnienie to najlepsza motywacja do dotrzymania słowa." },
  zakres: { icon: "📋", text: "Im dokładniejszy zakres, tym mniej miejsca na nieporozumienia." },
  pomieszczenia: { icon: "📐", text: "Pomiary i zdjęcia przed pracą to Twój dowód w razie sporu." },
  szczegoly: { icon: "🔍", text: "Numer seryjny i stan urządzenia to jedyne zabezpieczenie przy sporze o stan przed sprzedażą." },
  szczegoly_wynajmu: { icon: "🏠", text: "Protokół wydania chroni zarówno wynajmującego, jak i najemcę." },
  dodatki: { icon: "➕", text: "Zapomniane koszty to najczęstszy powód kłótni. Dodaj wszystko teraz." },
  wycena_koncowa: { icon: "💰", text: "Sprawdź dokładnie. Po podpisaniu zmiany wymagają aneksu." },
  platnosc: { icon: "🛡️", text: "Depozyt blokuje środki do odbioru — chronisz siebie bez ryzykowania relacji." },
  warunki: { icon: "⚖️", text: "Jasne warunki = brak zaskoczeń. Każda strona wie czego się spodziewać." },
  przeglad: { icon: "👁️", text: "Ostatnia szansa na sprawdzenie. Każdy błąd teraz = problem po podpisaniu." },
};

function getContextualNudge(data: WizardData): { icon: string; text: string; color: string } | null {
  if (data.category === "remont" && !data.paymentMethod) return { icon: "🛡️", text: "Przy remontach 9 na 10 sporów dotyczy wypłaty — depozyt eliminuje ten problem.", color: "#7c3aed" };
  if (data.category === "sprzedaz" && data.subcategory === "Elektronika") return { icon: "📱", text: "IMEI i numer seryjny to jedyny dowód tożsamości urządzenia. Bez nich nie masz ochrony.", color: "#0369a1" };
  if (data.category === "wynajem" && !data.rentalDeposit) return { icon: "⚠️", text: "Brak kaucji = brak ochrony przy zniszczeniu. Nawet symboliczna kwota ma znaczenie prawne.", color: "#b45309" };
  if (data.basePrice > 5000 && data.paymentMethod !== "deposit") return { icon: "💡", text: `Umowa na ${data.basePrice.toLocaleString("pl-PL")} ${data.currency} — rozważ depozyt. Przy tej kwocie to kluczowe zabezpieczenie.`, color: "#7c3aed" };
  return null;
}

function getSteps(category: string) {
  const base = [
    { id: "rola", label: "Moja rola" },
    { id: "kategoria", label: "Typ umowy" },
    { id: "podkategoria", label: "Szczegółowy typ" },
    { id: "strony", label: "Druga strona" },
    { id: "wycena", label: "Wycena" },
    { id: "termin", label: "Termin" },
  ];
  if (category !== "sprzedaz") base.push({ id: "zakres", label: "Zakres prac" });
  if (category === "remont") base.push({ id: "pomieszczenia", label: "Pomieszczenia" });
  if (category === "sprzedaz") base.push({ id: "szczegoly", label: "Opis przedmiotu" });
  if (category === "wynajem") base.push({ id: "szczegoly_wynajmu", label: "Szczegóły wynajmu" });
  base.push({ id: "dodatki", label: "Koszty dodatkowe" });
  base.push({ id: "wycena_koncowa", label: "Wycena końcowa" });
  base.push({ id: "platnosc", label: "Sposób płatności" });
  base.push({ id: "warunki", label: "Warunki" });
  base.push(
    { id: "przeglad", label: "Podsumowanie" },
    { id: "podpis", label: "Podpisz" },
  );
  return base;
}

function calcTotal(data: WizardData): number {
  let base = 0;
  if (data.pricingMethod === "hourly") base = data.basePrice * (data.estimatedHours || 0);
  else if (data.pricingMethod === "unit") base = data.unitItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  else if (data.pricingMethod === "stages") base = data.paymentStages.reduce((s, e) => s + e.amount * (e.quantity || 1), 0);
  else if (data.pricingMethod === "per_day") base = data.basePrice * (data.rentalDays || 0);
  else if (data.pricingMethod === "per_week") base = data.basePrice * (data.rentalWeeks || 0);
  else if (data.pricingMethod === "per_month") base = data.basePrice * (data.rentalMonths || 0);
  else base = data.basePrice; // fixed, m2, materials_labor, wlasna
  const additional = data.additionalItems.reduce((s, i) => s + i.qty * i.price, 0);
  const deposit = (data.category === "wynajem") ? (data.rentalDeposit || 0) : 0;
  return base + additional + deposit;
}

function calcTickerLabel(data: WizardData): string {
  const c = data.currency;
  if (data.pricingMethod === "hourly" && data.estimatedHours > 0)
    return `${data.estimatedHours} godz. × ${data.basePrice.toLocaleString("pl-PL")} ${c}`;
  if (data.pricingMethod === "unit" && data.unitItems.length > 0)
    return `${data.unitItems.length} ${data.unitItems.length === 1 ? "pozycja" : "pozycje"}`;
  if (data.pricingMethod === "stages" && data.paymentStages.length > 0)
    return `${data.paymentStages.length} ${data.paymentStages.length === 1 ? "etap" : "etapów"}`;
  if (data.pricingMethod === "per_day" && data.rentalDays > 0)
    return `${data.rentalDays} dni × ${data.basePrice.toLocaleString("pl-PL")} ${c}`;
  if (data.pricingMethod === "per_week" && data.rentalWeeks > 0)
    return `${data.rentalWeeks} tydz. × ${data.basePrice.toLocaleString("pl-PL")} ${c}`;
  if (data.pricingMethod === "per_month" && data.rentalMonths > 0)
    return `${data.rentalMonths} mies. × ${data.basePrice.toLocaleString("pl-PL")} ${c}`;
  if (data.basePrice > 0) return "Cena za całość";
  return "";
}

function LiveTicker({ total, label, currency }: { total: number; label: string; currency: string }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(total);

  useEffect(() => {
    if (total !== prev.current) {
      if (total > 0) setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      prev.current = total;
      return () => clearTimeout(t);
    }
  }, [total]);

  if (total === 0) return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 14px", borderRadius: 12, marginBottom: 8, background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
      <span style={{ color: "var(--color-muted-foreground)", fontSize: 12 }}>Suma umowy</span>
      <span style={{ color: "var(--color-muted-foreground)", fontSize: 15, fontWeight: 600 }}>—</span>
    </div>
  );

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "7px 14px", borderRadius: 12, marginBottom: 8,
      background: flash
        ? "color-mix(in srgb, var(--color-primary) 20%, transparent)"
        : "color-mix(in srgb, var(--color-primary) 8%, transparent)",
      border: `1.5px solid color-mix(in srgb, var(--color-primary) ${flash ? 60 : 22}%, transparent)`,
      transition: "background 0.4s, border-color 0.4s",
      boxShadow: flash ? "0 0 12px color-mix(in srgb, var(--color-primary) 25%, transparent)" : "none",
    }}>
      <span style={{ color: "var(--color-muted-foreground)", fontSize: 12, fontWeight: 500 }}>
        {label ? `= ${label}` : "Suma"}
      </span>
      <span style={{ color: "var(--color-primary)", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em" }}>
        {total.toLocaleString("pl-PL")} {currency}
      </span>
    </div>
  );
}

export default function AgreementNew() {
  const { defaultCurrency } = useAppStore();
  const [view, setView] = useState<"home" | "wizard">(() => {
    const hasDraft = !!loadDraft();
    const hasContracts = loadContracts().length > 0;
    return (hasDraft || hasContracts) ? "home" : "wizard";
  });
  const [savedContracts, setSavedContracts] = useState<SavedContract[]>(() => loadContracts());
  const [draft, setDraft] = useState<{ data: WizardData; stepIndex: number } | null>(() => loadDraft());

  const [stepIndex, setStepIndex] = useState(() => loadDraft()?.stepIndex ?? 0);
  const [data, setData] = useState<WizardData>(() => loadDraft()?.data ?? { ...INITIAL, currency: defaultCurrency });
  const [contractPhase, setContractPhase] = useState<
    "" | "awaiting_counterparty" | "awaiting_deposit" | "in_progress" | "awaiting_release" | "completed"
  >("");
  const [contractId, setContractId] = useState(() => loadDraft()?.contractId ?? `UMW-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`);
  const [invitationDismissed, setInvitationDismissed] = useState(false);
  const [showDocument, setShowDocument] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const [contractEvents, setContractEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    document.body.style.overflowX = "hidden";
    document.documentElement.style.overflowX = "hidden";
    return () => {
      document.body.style.overflowX = "";
      document.documentElement.style.overflowX = "";
    };
  }, []);

  // Auto-save draft with 600ms debounce to avoid writing localStorage on every keystroke
  useEffect(() => {
    if (view === "wizard" && !contractPhase) {
      const timer = setTimeout(() => {
        saveDraft(data, stepIndex, contractId);
        setDraft({ data, stepIndex });
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [data, stepIndex, contractId, view, contractPhase]);

  // Save/update contract in localStorage whenever phase changes
  useEffect(() => {
    if (!contractPhase) return;
    const now = new Date().toISOString();
    const existing = loadContracts();
    const idx = existing.findIndex(c => c.contractId === contractId);
    if (idx >= 0) {
      existing[idx].phase = contractPhase;
      existing[idx].updatedAt = now;
      existing[idx].events = existing[idx].events || [];
      const ev = PHASE_EVENTS[contractPhase];
      if (ev) existing[idx].events.unshift({ ...ev, id: Math.random().toString(36).slice(2), timestamp: now, type: "phase_change" });
      try { localStorage.setItem(LS_CONTRACTS_KEY, JSON.stringify(existing)); } catch {}
      setContractEvents([...existing[idx].events]);
    } else {
      const ev = PHASE_EVENTS[contractPhase];
      const initEvents: ActivityEvent[] = ev ? [{ ...ev, id: Math.random().toString(36).slice(2), timestamp: now, type: "phase_change" }] : [];
      const contract: SavedContract = {
        id: contractId, contractId, data,
        totalPrice: calcTotal(data),
        phase: contractPhase,
        createdAt: now, updatedAt: now,
        events: initEvents,
      };
      saveContract(contract);
      setContractEvents(initEvents);
    }
    clearDraft();
    setDraft(null);
    setSavedContracts(loadContracts());
  }, [contractPhase]);

  const update = (patch: Partial<WizardData>) => setData(prev => ({ ...prev, ...patch }));

  const startNewWizard = () => {
    const newId = `UMW-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    setContractId(newId);
    setData({ ...INITIAL, currency: defaultCurrency });
    setStepIndex(0);
    setContractPhase("");
    setInvitationDismissed(false);
    setShowDocument(false);
    setRatingDone(false);
    setContractEvents([]);
    setView("wizard");
  };

  const startFromTemplate = (preset: Partial<WizardData>) => {
    const newId = `UMW-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    setContractId(newId);
    setData({ ...INITIAL, currency: defaultCurrency, ...preset });
    // Skip rola/kategoria/podkategoria since template pre-fills them — go to strony
    const templateSteps = getSteps(preset.category || "");
    const startIdx = templateSteps.findIndex(s => s.id === "strony");
    setStepIndex(startIdx > 0 ? startIdx : 0);
    setContractPhase("");
    setInvitationDismissed(false);
    setShowDocument(false);
    setRatingDone(false);
    setContractEvents([]);
    setView("wizard");
  };

  const resumeWizard = () => {
    setView("wizard");
  };

  const openContract = (c: SavedContract) => {
    setContractId(c.contractId);
    setData(c.data);
    setContractPhase(c.phase || "awaiting_counterparty");
    setContractEvents(c.events || []);
    setInvitationDismissed(true);
    setRatingDone(!!c.rating);
    setView("wizard");
  };

  const steps = useMemo(() => getSteps(data.category), [data.category]);
  const totalSteps = steps.length;
  const currentStep = steps[stepIndex]?.id ?? "";

  const additionalTotal = useMemo(
    () => data.additionalItems.reduce((s, i) => s + i.qty * i.price, 0),
    [data.additionalItems]
  );
  const totalPrice = useMemo(() => calcTotal(data), [
    data.pricingMethod, data.basePrice, data.estimatedHours,
    data.unitItems, data.paymentStages, data.additionalItems,
    data.rentalDays, data.rentalWeeks, data.rentalMonths,
    data.rentalDeposit, data.category,
  ]);

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (data.category === "remont" && !data.scopeBeforePhotos) w.push("Brakuje zdjęć przed pracą");
    if (data.category !== "wlasna" && !data.scopeMaterials && data.category !== "sprzedaz" && data.category !== "wynajem")
      w.push("Nie ustalono kto kupuje materiały");
    if (data.paymentMethod === "deposit" && data.depositCovers.length === 0)
      w.push("Depozyt nie jest przypisany do konkretnych etapów");
    if (data.pricingMethod && totalPrice === 0)
      w.push("Kwota umowy wynosi 0 — uzupełnij wycenę");
    if (data.category === "wynajem" && !data.rentalDeposit)
      w.push("Brak kaucji — ryzyko przy zniszczeniu mienia");
    if (data.latePenalty && !data.latePenaltyAmount)
      w.push("Włączona kara za opóźnienie, ale kwota wynosi 0");
    if (data.warranty && !data.warrantyDays)
      w.push("Włączona gwarancja, ale liczba dni wynosi 0");
    return w;
  }, [data.category, data.scopeBeforePhotos, data.scopeMaterials, data.paymentMethod,
      data.depositCovers, data.pricingMethod, totalPrice, data.rentalDeposit,
      data.latePenalty, data.latePenaltyAmount, data.warranty, data.warrantyDays]);

  const getNextBlockReason = (): string | null => {
    if (currentStep === "rola" && !data.myRole) return "Wybierz swoją rolę w umowie";
    if (currentStep === "kategoria") {
      if (!data.category) return "Wybierz typ umowy";
    }
    if (currentStep === "podkategoria" && !data.subcategory) return "Wybierz podkategorię";
    if (currentStep === "strony" && !data.inviteContact) return "Podaj e-mail lub telefon drugiej strony";
    if (currentStep === "wycena") {
      if (!data.pricingMethod) return "Wybierz sposób wyceny";
      if (data.pricingMethod === "stages" && data.paymentStages.length === 0) return "Dodaj co najmniej jeden etap płatności";
      if (data.pricingMethod === "unit" && data.unitItems.length === 0) return "Dodaj co najmniej jedną pozycję";
      if (data.pricingMethod !== "stages" && data.pricingMethod !== "unit" && data.basePrice <= 0) return "Wpisz kwotę";
    }
    if (currentStep === "termin") {
      if (data.deadlineType === "single" && !data.deadlineSingle) return "Wybierz datę realizacji";
      if ((data.deadlineType === "range" || data.deadlineType === "cyclic") && (!data.deadlineFrom || !data.deadlineTo)) return "Podaj datę od i datę do";
    }
    return null;
  };

  const canGoNext = () => getNextBlockReason() === null;

  const goNext = () => {
    if (stepIndex < totalSteps - 1) setStepIndex(s => s + 1);
  };
  const goBack = () => {
    if (stepIndex > 0) setStepIndex(s => s - 1);
  };

  const renderStep = () => {
    switch (currentStep) {
      case "rola": return <StepRola data={data} update={update} goNext={goNext} />;
      case "kategoria": return <StepKategoria data={data} update={update} goNext={goNext} />;
      case "podkategoria": return <StepPodkategoria data={data} update={update} goNext={goNext} />;
      case "strony": return <StepStrony data={data} update={update} />;
      case "wycena": return <StepWycena data={data} update={update} />;
      case "termin": return <StepTermin data={data} update={update} />;
      case "zakres": return <StepZakres data={data} update={update} />;
      case "pomieszczenia": return <StepPomieszczenia data={data} update={update} />;
      case "szczegoly": return <StepSzczegolySprzedaz data={data} update={update} />;
      case "szczegoly_wynajmu": return <StepSzczegolyWynajem data={data} update={update} />;
      case "dodatki": return <StepDodatki data={data} update={update} additionalTotal={additionalTotal} />;
      case "wycena_koncowa": return <StepWycenaKoncowa data={data} update={update} totalPrice={totalPrice} additionalTotal={additionalTotal} goBack={goBack} />;
      case "platnosc": return <StepPlatnosc data={data} update={update} totalPrice={totalPrice} />;
      case "warunki": return <StepWarunki data={data} update={update} />;
      case "przeglad": return <StepPrzeglad data={data} steps={steps} goToStep={setStepIndex} warnings={warnings} totalPrice={totalPrice} />;
      case "podpis": return <StepPodpis data={data} update={update} onSign={() => setContractPhase("awaiting_counterparty")} />;
      default: return null;
    }
  };

  if (view === "home") {
    return (
      <HomeScreen
        onNew={startNewWizard}
        onResume={resumeWizard}
        onTemplate={startFromTemplate}
        draft={draft}
        contracts={savedContracts}
        onOpenContract={openContract}
      />
    );
  }

  if (contractPhase) {
    if (contractPhase === "awaiting_counterparty" && !invitationDismissed) {
      return (
        <InvitationScreen
          data={data}
          contractId={contractId}
          totalPrice={totalPrice}
          onContinue={() => setInvitationDismissed(true)}
        />
      );
    }
    if (contractPhase === "completed" && !ratingDone) {
      return (
        <RatingScreen
          contractId={contractId}
          data={data}
          onDone={() => {
            setRatingDone(true);
            setSavedContracts(loadContracts());
            setView("home");
          }}
        />
      );
    }
    return (
      <>
        <ContractLifecycle
          data={data}
          phase={contractPhase}
          setPhase={setContractPhase}
          totalPrice={totalPrice}
          contractId={contractId}
          showDocument={showDocument}
          setShowDocument={setShowDocument}
          events={contractEvents}
          onNewContract={() => {
            setSavedContracts(loadContracts());
            setView("home");
          }}
        />
        {showDocument && (
          <ContractDocument data={data} contractId={contractId} onClose={() => setShowDocument(false)} />
        )}
      </>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", display: "flex", flexDirection: "column", width: "100%", maxWidth: "min(560px, 100vw)", margin: "0 auto", paddingBottom: 200, boxSizing: "border-box" }}>
      {/* Progress bar */}
      <div style={{ padding: "10px 16px 8px", position: "sticky", top: 0, background: "var(--color-background)", zIndex: 10, borderBottom: "1px solid var(--color-border)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        {/* Dots row */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {steps.map((s, i) => {
            const active = i === stepIndex;
            const done = i < stepIndex;
            return (
              <div
                key={s.id}
                onClick={() => done && setStepIndex(i)}
                title={s.label}
                style={{
                  flex: 1, height: 5, borderRadius: 3,
                  background: active ? "var(--color-primary)" : done ? "var(--color-primary)" : "var(--color-border)",
                  opacity: done ? 0.5 : 1,
                  cursor: done ? "pointer" : "default",
                  transition: "background 0.2s, opacity 0.2s",
                }}
              />
            );
          })}
        </div>
        {/* Step label + breadcrumb + % */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
            <span style={{ color: "var(--color-primary)", fontSize: 12, fontWeight: 800 }}>
              {steps[stepIndex]?.label}
            </span>
            {data.category && (
              <span style={{ color: "var(--color-muted-foreground)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {" · "}{CATEGORY_LABELS[data.category]}{data.subcategory ? ` › ${data.subcategory}` : ""}
              </span>
            )}
          </div>
          <span style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
            {stepIndex + 1}/{totalSteps}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "16px 16px 180px", overflowY: "auto", overflowX: "hidden" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
          >
            {STEP_HINTS[currentStep] && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--color-primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)", marginBottom: 16 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{STEP_HINTS[currentStep].icon}</span>
                <span style={{ color: "var(--color-muted-foreground)", fontSize: 14, lineHeight: 1.6 }}>{STEP_HINTS[currentStep].text}</span>
              </div>
            )}
            {(() => {
              const nudge = getContextualNudge(data);
              return nudge && (currentStep === "platnosc" || currentStep === "wycena" || currentStep === "szczegoly" || currentStep === "szczegoly_wynajmu") ? (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: `color-mix(in srgb, ${nudge.color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${nudge.color} 30%, transparent)`, marginBottom: 16 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{nudge.icon}</span>
                  <span style={{ color: "var(--color-foreground)", fontSize: 14, lineHeight: 1.6 }}>{nudge.text}</span>
                </div>
              ) : null;
            })()}
            {currentStep === "platnosc" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "color-mix(in srgb, #16a34a 8%, transparent)", border: "1px solid color-mix(in srgb, #16a34a 25%, transparent)", marginBottom: 14 }}>
                <span style={{ fontSize: 14 }}>👥</span>
                <span style={{ color: "#16a34a", fontSize: 11, fontWeight: 600 }}>93% użytkowników wybiera depozyt przy umowach powyżej 1000 zł</span>
              </div>
            )}
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: "min(560px, 100vw)", background: "var(--color-background)", borderTop: "1px solid var(--color-border)", padding: "8px 16px 16px", boxSizing: "border-box", boxShadow: "0 -2px 12px rgba(0,0,0,0.07)" }}>
        <LiveTicker total={totalPrice} label={calcTickerLabel(data)} currency={data.currency} />
        {(() => { const reason = getNextBlockReason(); return reason && currentStep !== "podpis" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 8, background: "color-mix(in srgb, #f59e0b 10%, transparent)", borderLeft: "3px solid #f59e0b", marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>⚠</span>
            <span style={{ color: "#92400e", fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{reason}</span>
          </div>
        ) : null; })()}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <button
            onClick={stepIndex === 0 ? () => setView("home") : goBack}
            style={{ width: 52, height: 52, borderRadius: 26, border: "1.5px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-muted-foreground)", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            {stepIndex === 0 ? "⌂" : "←"}
          </button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ color: "var(--color-muted-foreground)", fontSize: 12, fontWeight: 600 }}>{steps[stepIndex]?.label}</div>
            <div style={{ display: "flex", gap: 3, justifyContent: "center", marginTop: 4 }}>
              {steps.map((_, i) => (
                <div key={i} style={{ width: i === stepIndex ? 16 : 6, height: 4, borderRadius: 2, background: i < stepIndex ? "var(--color-primary)" : i === stepIndex ? "var(--color-primary)" : "var(--color-border)", opacity: i < stepIndex ? 0.5 : 1, transition: "width 0.2s" }} />
              ))}
            </div>
          </div>
          {currentStep !== "podpis" && (
            <button
              onClick={goNext}
              disabled={!canGoNext()}
              style={{ width: 52, height: 52, borderRadius: 26, border: "none", background: canGoNext() ? "var(--color-primary)" : "var(--color-border)", color: "#fff", fontSize: 22, cursor: canGoNext() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: canGoNext() ? "0 3px 10px color-mix(in srgb, var(--color-primary) 35%, transparent)" : "none", transition: "background 0.2s, box-shadow 0.2s" }}
            >
              →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ——— STEP 0: Rola
function StepRola({ data, update, goNext }: { data: WizardData; update: (p: Partial<WizardData>) => void; goNext: () => void }) {
  const roles: { value: "client" | "contractor"; icon: string; label: string; desc: string }[] = [
    { value: "client", icon: "🤝", label: "Klient / Zleceniodawca", desc: "Zamawiasz usługę, kupujesz, wynajmujesz" },
    { value: "contractor", icon: "🔨", label: "Wykonawca / Sprzedający", desc: "Wykonujesz usługę, sprzedajesz, wynajmujesz" },
  ];
  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Tworzysz jako...</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 20, lineHeight: 1.5 }}>
        Określ swoją rolę w tej umowie.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {roles.map(r => (
          <div
            key={r.value}
            onClick={() => { update({ myRole: r.value }); goNext(); }}
            style={{ ...cardStyle(false), display: "flex", alignItems: "center", gap: 14, padding: 18, cursor: "pointer" }}
          >
            <div style={{ fontSize: 32, flexShrink: 0 }}>{r.icon}</div>
            <div>
              <div style={{ color: "var(--color-foreground)", fontSize: 16, fontWeight: 700, marginBottom: 3 }}>{r.label}</div>
              <div style={{ color: "var(--color-muted-foreground)", fontSize: 12, lineHeight: 1.4 }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ——— STEP 1: Kategoria
function StepKategoria({ data, update, goNext }: { data: WizardData; update: (p: Partial<WizardData>) => void; goNext: () => void }) {
  const [showLoanInfo, setShowLoanInfo] = useState(false);
  const categories: { value: Category; label: string; icon: string }[] = [
    { value: "usluga", label: "Usługa", icon: "🛠️" },
    { value: "remont", label: "Remont", icon: "🔨" },
    { value: "sprzedaz", label: "Sprzedaż", icon: "🛍️" },
    { value: "wynajem", label: "Wynajem", icon: "🏠" },
    { value: "wlasna", label: "Stwórz własną", icon: "📝" },
  ];
  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Nowa umowa</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 18, lineHeight: 1.5 }}>Wybierz kategorię umowy.</p>
      <div style={tileGrid}>
        {categories.map(c => (
          <div
            key={c.value}
            onClick={() => { update({ category: c.value, subcategory: "" }); goNext(); }}
            style={{ ...cardStyle(false), cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", minWidth: 0 }}
          >
            <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>{c.icon}</span>
            <span style={{ color: "var(--color-foreground)", fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
          </div>
        ))}
        {/* Pożyczka — coming soon */}
        <div
          onClick={() => setShowLoanInfo(v => !v)}
          style={{ ...cardStyle(false), cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", minWidth: 0, opacity: 0.6, position: "relative", overflow: "hidden" }}
        >
          <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>💰</span>
          <span style={{ color: "var(--color-foreground)", fontSize: 15, fontWeight: 700 }}>Pożyczka</span>
          <span style={{ position: "absolute", top: 4, right: 6, fontSize: 9, fontWeight: 800, color: "#fff", background: "#f59e0b", borderRadius: 6, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Wkrótce</span>
        </div>
      </div>
      {showLoanInfo && (
        <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "color-mix(in srgb, #f59e0b 10%, transparent)", border: "1px solid #f59e0b" }}>
          <div style={{ color: "#d97706", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>💰 Umowa pożyczki — wkrótce</div>
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 13, lineHeight: 1.6 }}>Kategoria "Pożyczka" z harmonogramem spłat i odsetkami jest w przygotowaniu. Na razie możesz skorzystać z kategorii "Własna".</div>
        </div>
      )}
    </div>
  );
}

// ——— STEP 2: Podkategoria
function StepPodkategoria({ data, update, goNext }: { data: WizardData; update: (p: Partial<WizardData>) => void; goNext: () => void }) {
  if (data.category === "wlasna") {
    return (
      <div>
        <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Własna umowa</h2>
        <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 18, lineHeight: 1.5 }}>Nazwij swoją umowę i opisz jej przedmiot.</p>
        <div style={sectionCard}>
          <SectionLabel>Nazwa umowy</SectionLabel>
          <input
            value={data.customTitle}
            onChange={e => update({ customTitle: e.target.value })}
            placeholder="np. Umowa o opiekę nad zwierzęciem"
            style={inputStyle}
          />
        </div>
        <div style={sectionCard}>
          <SectionLabel>Opis (opcjonalnie)</SectionLabel>
          <textarea
            value={data.customDesc}
            onChange={e => update({ customDesc: e.target.value })}
            placeholder="Krótki opis przedmiotu umowy..."
            style={textareaStyle}
          />
        </div>
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, var(--color-primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)" }}>
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 13, lineHeight: 1.6 }}>
            💡 Pozostałe szczegóły — cena, termin, warunki — uzupełnisz na kolejnych krokach.
          </div>
        </div>
      </div>
    );
  }
  const subs = SUBCATEGORIES[data.category] ?? [];
  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Podkategoria</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 18, lineHeight: 1.5 }}>Wybierz rodzaj umowy.</p>
      <div style={tileGrid}>
        {subs.map(s => (
          <div key={s} onClick={() => { update({ subcategory: s }); goNext(); }} style={{ ...cardStyle(false), cursor: "pointer", padding: "10px 12px", minWidth: 0 }}>
            <div style={{ color: "var(--color-foreground)", fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ——— STEP 3: Strony
function StepStrony({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const clientLabel = data.category === "wynajem" ? "Najemca" : data.category === "sprzedaz" ? "Kupujący" : "Zleceniodawca";
  const contractorLabel = data.category === "wynajem" ? "Wynajmujący" : data.category === "sprzedaz" ? "Sprzedający" : "Wykonawca";
  const myLabel = data.myRole === "client" ? clientLabel : contractorLabel;
  const otherLabel = data.myRole === "client" ? contractorLabel : clientLabel;

  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Zaproś drugą stronę</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 20, lineHeight: 1.6 }}>
        Tworzysz jako <b>{myLabel}</b>. Podaj kontakt do {otherLabel.toLowerCase()}y — wyślesz zaproszenie do podpisania umowy.
      </p>

      <div style={sectionCard}>
        <SectionLabel>Kontakt do {otherLabel}</SectionLabel>
        <input
          value={data.inviteContact}
          onChange={e => update({ inviteContact: e.target.value })}
          placeholder="@nick, adres email lub numer telefonu"
          style={inputStyle}
          autoComplete="off"
        />
        <div style={{ color: "var(--color-muted-foreground)", fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
          Druga strona dostanie link do przeglądu i podpisania umowy.
        </div>
      </div>

      <div style={{ padding: "12px 14px", borderRadius: 10, background: "color-mix(in srgb, #16a34a 7%, transparent)", border: "1px solid color-mix(in srgb, #16a34a 25%, transparent)", marginTop: 4 }}>
        <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 600 }}>🔒 Dane obu stron pobierane są z ich kont przy akceptacji umowy.</span>
      </div>
    </div>
  );
}

// ——— STEP 4: Wycena
function StagesEditor({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const stages = data.paymentStages;
  const total = stages.reduce((s, e) => s + e.amount * (e.quantity || 1), 0);

  const addStage = () => update({
    paymentStages: [...stages, { id: Date.now().toString(), name: `Etap ${stages.length + 1}`, amount: 0, quantity: 1 }],
  });
  const updateStage = (id: string, patch: Partial<PaymentStage>) =>
    update({ paymentStages: stages.map(s => s.id === id ? { ...s, ...patch } : s) });
  const removeStage = (id: string) =>
    update({ paymentStages: stages.filter(s => s.id !== id) });

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <SectionLabel>Etapy płatności</SectionLabel>
        {total > 0 && (
          <span style={{ color: "var(--color-primary)", fontSize: 14, fontWeight: 700 }}>
            Σ {total.toLocaleString("pl-PL")} {data.currency}
          </span>
        )}
      </div>

      {stages.length === 0 && (
        <div style={{ padding: "20px 16px", borderRadius: 12, border: "1.5px dashed var(--color-border)", textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📋</div>
          <div style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Brak etapów</div>
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>Kliknij "+ Dodaj etap" poniżej ↓</div>
        </div>
      )}

      {stages.map((stage, i) => (
        <div key={stage.id} style={{ ...sectionCard, marginBottom: 10, padding: "14px" }}>
          {/* Header: numer + usuń */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: "var(--color-primary)", fontSize: 11, fontWeight: 800, background: "color-mix(in srgb, var(--color-primary) 12%, transparent)", borderRadius: 4, padding: "2px 10px", flexShrink: 0 }}>
              Etap {i + 1}
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => removeStage(stage.id)}
              style={{ border: "none", background: "transparent", color: "var(--color-muted-foreground)", fontSize: 20, cursor: "pointer", padding: "2px 6px", flexShrink: 0, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          {/* Nazwa etapu */}
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", marginBottom: 4 }}>NAZWA ETAPU</div>
          <input
            value={stage.name}
            onChange={e => updateStage(stage.id, { name: e.target.value })}
            placeholder="np. Fundamenty, Malowanie..."
            style={{ ...inputStyle, fontSize: 15, marginBottom: 10 }}
          />
          {/* Opis zakresu */}
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", marginBottom: 4 }}>ZAKRES PRAC W ETAPIE</div>
          <input
            value={stage.description || ""}
            onChange={e => updateStage(stage.id, { description: e.target.value })}
            placeholder="np. Wylewka, instalacja elektryczna..."
            style={{ ...inputStyle, fontSize: 14, marginBottom: 10 }}
          />
          {/* Ilość i cena */}
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", marginBottom: 4 }}>ILOŚĆ / JEDNOSTKI</div>
              <input
                type="number"
                value={stage.quantity || ""}
                onChange={e => updateStage(stage.id, { quantity: parseFloat(e.target.value) || undefined })}
                placeholder="np. 1"
                style={{ ...inputStyle, fontSize: 15 }}
                min={1}
              />
            </div>
            <div style={{ flex: 2 }}>
              <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", marginBottom: 4 }}>KWOTA ZA ETAP ({data.currency})</div>
              <input
                type="number"
                value={stage.amount || ""}
                onChange={e => updateStage(stage.id, { amount: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
              />
            </div>
          </div>
          {/* Podsumowanie etapu */}
          {stage.amount > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <span style={{ color: "var(--color-primary)", fontSize: 15, fontWeight: 800 }}>
                {stage.quantity && stage.quantity > 1 ? `${stage.quantity} × ` : ""}
                {stage.amount.toLocaleString("pl-PL")} {data.currency}
                {stage.quantity && stage.quantity > 1 ? ` = ${(stage.quantity * stage.amount).toLocaleString("pl-PL")} ${data.currency}` : ""}
              </span>
            </div>
          )}
        </div>
      ))}

      <button
        onClick={addStage}
        style={{ ...btnSecondary, width: "100%", padding: "12px", fontSize: 15, borderStyle: "dashed" }}
      >
        + Dodaj etap
      </button>
    </div>
  );
}

function UnitsEditor({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const items = data.unitItems;
  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  const addItem = () => update({
    unitItems: [...items, { id: Date.now().toString(), name: "", unitPrice: 0, quantity: 1 }],
  });
  const updateItem = (id: string, patch: Partial<UnitItem>) =>
    update({ unitItems: items.map(i => i.id === id ? { ...i, ...patch } : i) });
  const removeItem = (id: string) =>
    update({ unitItems: items.filter(i => i.id !== id) });

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <SectionLabel>Pozycje</SectionLabel>
        {total > 0 && (
          <span style={{ color: "var(--color-primary)", fontSize: 14, fontWeight: 700 }}>
            Σ {total.toLocaleString("pl-PL")} {data.currency}
          </span>
        )}
      </div>

      {items.length === 0 && (
        <div style={{ padding: "20px 16px", borderRadius: 12, border: "1.5px dashed var(--color-border)", textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🧾</div>
          <div style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Brak pozycji</div>
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>Kliknij "+ Dodaj pozycję" poniżej ↓</div>
        </div>
      )}

      {items.map(item => (
        <div key={item.id} style={{ ...sectionCard, marginBottom: 8, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input
              value={item.name}
              onChange={e => updateItem(item.id, { name: e.target.value })}
              placeholder="Nazwa (np. TV, sofa…)"
              style={{ ...inputStyle, flex: 1, padding: "8px 12px", fontSize: 15 }}
            />
            <button onClick={() => removeItem(item.id)} style={{ border: "none", background: "transparent", color: "var(--color-muted-foreground)", fontSize: 20, cursor: "pointer", padding: "4px", flexShrink: 0 }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 2 }}>
              <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Cena / szt.</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  value={item.unitPrice || ""}
                  onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  style={{ ...inputStyle, fontSize: 16, fontWeight: 700 }}
                />
                <span style={{ color: "var(--color-muted-foreground)", fontSize: 13, flexShrink: 0 }}>{data.currency}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ilość</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={() => updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })} style={{ width: 32, height: 40, borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-foreground)", fontSize: 18, cursor: "pointer", flexShrink: 0 }}>−</button>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={e => updateItem(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  style={{ ...inputStyle, fontSize: 16, fontWeight: 700, textAlign: "center", padding: "8px 4px" }}
                />
                <button onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })} style={{ width: 32, height: 40, borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-foreground)", fontSize: 18, cursor: "pointer", flexShrink: 0 }}>+</button>
              </div>
            </div>
          </div>
          {item.unitPrice > 0 && item.quantity > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <span style={{ color: "var(--color-primary)", fontSize: 15, fontWeight: 700 }}>
                = {(item.unitPrice * item.quantity).toLocaleString("pl-PL")} {data.currency}
              </span>
            </div>
          )}
        </div>
      ))}

      <button onClick={addItem} style={{ ...btnSecondary, width: "100%", padding: 12, fontSize: 15, borderStyle: "dashed" }}>
        + Dodaj pozycję
      </button>
    </div>
  );
}

function StepWycena({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const opts = PRICING_OPTIONS[data.category] ?? PRICING_OPTIONS["wlasna"];
  const currencies: CurrencyCode[] = ["PLN", "EUR", "USD", "GBP", "CZK"];
  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Sposób wyceny</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 16 }}>Wybierz model rozliczenia.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {opts.map(o => {
          const active = data.pricingMethod === o.value;
          return (
            <div key={o.value} onClick={() => update({ pricingMethod: o.value })} style={{ ...cardStyle(active), display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: active ? "var(--color-primary)" : "var(--color-foreground)", fontSize: 14, fontWeight: 600 }}>{o.label}</div>
              </div>
              <div style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {active && <div style={{ width: 10, height: 10, borderRadius: 5, background: "var(--color-primary)" }} />}
              </div>
            </div>
          );
        })}
      </div>
      {data.pricingMethod !== "stages" && data.pricingMethod !== "unit" && <div style={sectionCard}>
        <SectionLabel>
          {data.pricingMethod === "per_month" ? "Czynsz miesięczny"
            : data.pricingMethod === "per_week" ? "Stawka tygodniowa"
            : data.pricingMethod === "per_day" ? "Stawka dzienna"
            : data.pricingMethod === "hourly" ? "Stawka za godzinę"
            : data.pricingMethod === "unit" ? "Cena za sztukę"
            : "Kwota bazowa"}
          {" "}({data.currency})
        </SectionLabel>
        <input
          type="number"
          value={data.basePrice || ""}
          onChange={e => update({ basePrice: parseFloat(e.target.value) || 0 })}
          placeholder="0"
          style={{ ...inputStyle, fontSize: 20, fontWeight: 700, marginBottom: 10 }}
        />

        {/* Za godzinę */}
        {data.pricingMethod === "hourly" && (
          <>
            <SectionLabel>Liczba godzin</SectionLabel>
            <input
              type="number"
              value={data.estimatedHours || ""}
              onChange={e => update({ estimatedHours: parseFloat(e.target.value) || 0 })}
              placeholder="np. 8"
              style={{ ...inputStyle, fontSize: 18, fontWeight: 600, marginBottom: 10 }}
            />
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {HOUR_PRESETS.map(s => (
                <div key={s.h} onClick={() => update({ estimatedHours: s.h })} style={pillStyle(data.estimatedHours === s.h)}>
                  {s.label}
                </div>
              ))}
            </div>
            {data.basePrice > 0 && data.estimatedHours > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", border: "1px solid var(--color-primary)" }}>
                <span style={{ color: "var(--color-muted-foreground)", fontSize: 14 }}>{data.estimatedHours} godz. × {data.basePrice.toLocaleString("pl-PL")} {data.currency}</span>
                <span style={{ color: "var(--color-primary)", fontSize: 17, fontWeight: 800 }}>= {(data.basePrice * data.estimatedHours).toLocaleString("pl-PL")} {data.currency}</span>
              </div>
            )}
          </>
        )}


        {/* Za dzień */}
        {data.pricingMethod === "per_day" && (
          <>
            <SectionLabel>Liczba dni</SectionLabel>
            <input
              type="number"
              value={data.rentalDays || ""}
              onChange={e => update({ rentalDays: parseInt(e.target.value) || 0 })}
              placeholder="np. 14"
              style={{ ...inputStyle, fontSize: 18, fontWeight: 600, marginBottom: 10 }}
            />
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {DAY_PRESETS.map(s => (
                <div key={s.d} onClick={() => update({ rentalDays: s.d })} style={pillStyle(data.rentalDays === s.d)}>
                  {s.label}
                </div>
              ))}
            </div>
            {data.basePrice > 0 && data.rentalDays > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", border: "1px solid var(--color-primary)" }}>
                <span style={{ color: "var(--color-muted-foreground)", fontSize: 14 }}>{data.rentalDays} dni × {data.basePrice.toLocaleString("pl-PL")} {data.currency}</span>
                <span style={{ color: "var(--color-primary)", fontSize: 17, fontWeight: 800 }}>= {(data.basePrice * data.rentalDays).toLocaleString("pl-PL")} {data.currency}</span>
              </div>
            )}
          </>
        )}

        {/* Za tydzień */}
        {data.pricingMethod === "per_week" && (
          <>
            <SectionLabel>Liczba tygodni</SectionLabel>
            <input
              type="number"
              value={data.rentalWeeks || ""}
              onChange={e => update({ rentalWeeks: parseInt(e.target.value) || 0 })}
              placeholder="np. 4"
              style={{ ...inputStyle, fontSize: 18, fontWeight: 600, marginBottom: 10 }}
            />
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {WEEK_PRESETS.map(s => (
                <div key={s.w} onClick={() => update({ rentalWeeks: s.w })} style={pillStyle(data.rentalWeeks === s.w)}>
                  {s.label}
                </div>
              ))}
            </div>
            {data.basePrice > 0 && data.rentalWeeks > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", border: "1px solid var(--color-primary)" }}>
                <span style={{ color: "var(--color-muted-foreground)", fontSize: 14 }}>{data.rentalWeeks} tydz. × {data.basePrice.toLocaleString("pl-PL")} {data.currency}</span>
                <span style={{ color: "var(--color-primary)", fontSize: 17, fontWeight: 800 }}>= {(data.basePrice * data.rentalWeeks).toLocaleString("pl-PL")} {data.currency}</span>
              </div>
            )}
          </>
        )}

        {/* Za miesiąc */}
        {data.pricingMethod === "per_month" && (
          <>
            <SectionLabel>Liczba miesięcy</SectionLabel>
            <input
              type="number"
              value={data.rentalMonths || ""}
              onChange={e => update({ rentalMonths: parseInt(e.target.value) || 0 })}
              placeholder="np. 12"
              style={{ ...inputStyle, fontSize: 18, fontWeight: 600, marginBottom: 10 }}
            />
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {MONTH_PRESETS.map(s => (
                <div key={s.m} onClick={() => update({ rentalMonths: s.m })} style={pillStyle(data.rentalMonths === s.m)}>
                  {s.label}
                </div>
              ))}
            </div>
            {data.basePrice > 0 && data.rentalMonths > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", border: "1px solid var(--color-primary)" }}>
                <span style={{ color: "var(--color-muted-foreground)", fontSize: 14 }}>{data.rentalMonths} mies. × {data.basePrice.toLocaleString("pl-PL")} {data.currency}</span>
                <span style={{ color: "var(--color-primary)", fontSize: 17, fontWeight: 800 }}>= {(data.basePrice * data.rentalMonths).toLocaleString("pl-PL")} {data.currency}</span>
              </div>
            )}
          </>
        )}

        <SectionLabel style={{ marginTop: 14 }}>Waluta</SectionLabel>
        <div style={{ display: "flex", gap: 6 }}>
          {currencies.map(c => {
            const active = data.currency === c;
            return (
              <div key={c} onClick={() => update({ currency: c })} style={{ flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 8, border: `1.5px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`, background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer" }}>
                <div style={{ color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700 }}>{c}</div>
              </div>
            );
          })}
        </div>
      </div>}

      {data.pricingMethod === "stages" && (
        <StagesEditor data={data} update={update} />
      )}

      {data.pricingMethod === "unit" && (
        <UnitsEditor data={data} update={update} />
      )}

      {(data.pricingMethod === "per_day" || data.pricingMethod === "per_week" || data.pricingMethod === "per_month") && (
        <div style={{ ...sectionCard, border: "1.5px solid var(--color-primary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <div>
              <div style={{ color: "var(--color-primary)", fontSize: 14, fontWeight: 700 }}>Kaucja w depozycie</div>
              <div style={{ color: "var(--color-muted-foreground)", fontSize: 12, lineHeight: 1.4 }}>Zablokowana przez cały najem — zwracana po zakończeniu umowy</div>
            </div>
          </div>
          <SectionLabel>Kwota kaucji ({data.currency})</SectionLabel>
          <input
            type="number"
            value={data.rentalDeposit || ""}
            onChange={e => update({ rentalDeposit: parseFloat(e.target.value) || 0 })}
            placeholder="np. 2× czynsz"
            style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
          />
          {data.basePrice > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {[1, 2, 3].map(mult => (
                <div
                  key={mult}
                  onClick={() => update({ rentalDeposit: data.basePrice * mult })}
                  style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid var(--color-border)", background: data.rentalDeposit === data.basePrice * mult ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", borderColor: data.rentalDeposit === data.basePrice * mult ? "var(--color-primary)" : "var(--color-border)", cursor: "pointer", fontSize: 13, color: data.rentalDeposit === data.basePrice * mult ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: data.rentalDeposit === data.basePrice * mult ? 700 : 400 }}
                >
                  {mult}× czynsz = {(data.basePrice * mult).toLocaleString("pl-PL")} {data.currency}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ——— STEP 5: Termin
function StepTermin({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const opts: { value: DeadlineType; label: string }[] = [
    { value: "single", label: "Jedna data" },
    { value: "range", label: "Od – do" },
    { value: "stages", label: "Etapy" },
    { value: "cyclic", label: "Cyklicznie" },
    { value: "tbd", label: "Do uzgodnienia" },
  ];
  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Termin</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 16 }}>Kiedy ma być wykonana umowa?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {opts.map(o => {
          const active = data.deadlineType === o.value;
          return (
            <div key={o.value} onClick={() => update({ deadlineType: o.value })} style={{ ...cardStyle(active), display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ color: active ? "var(--color-primary)" : "var(--color-foreground)", fontSize: 14, fontWeight: 600, flex: 1 }}>{o.label}</div>
              <div style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {active && <div style={{ width: 10, height: 10, borderRadius: 5, background: "var(--color-primary)" }} />}
              </div>
            </div>
          );
        })}
      </div>
      {data.deadlineType === "single" && (
        <div style={sectionCard}>
          <SectionLabel>Data realizacji</SectionLabel>
          <input type="date" value={data.deadlineSingle} onChange={e => update({ deadlineSingle: e.target.value })} style={inputStyle} />
        </div>
      )}
      {data.deadlineType === "range" && (
        <div style={sectionCard}>
          <SectionLabel>Od</SectionLabel>
          <input type="date" value={data.deadlineFrom} onChange={e => update({ deadlineFrom: e.target.value })} style={{ ...inputStyle, marginBottom: 10 }} />
          <SectionLabel>Do</SectionLabel>
          <input type="date" value={data.deadlineTo} onChange={e => update({ deadlineTo: e.target.value })} style={inputStyle} />
        </div>
      )}
      {data.deadlineType === "cyclic" && (
        <div style={sectionCard}>
          <SectionLabel>Powtarzaj co</SectionLabel>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["days", "weeks", "months"] as const).map(u => {
              const labels: Record<string, string> = { days: "Dni", weeks: "Tygodnie", months: "Miesiące" };
              const active = data.cyclicUnit === u;
              return (
                <div key={u} onClick={() => update({ cyclicUnit: u })} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 10, border: `1.5px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`, background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", color: active ? "var(--color-primary)" : "var(--color-foreground)", fontWeight: active ? 700 : 400, fontSize: 13 }}>{labels[u]}</div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {(data.cyclicUnit === "months" ? [1, 2, 3, 6] : data.cyclicUnit === "weeks" ? [1, 2, 4] : [7, 14, 30]).map(n => (
              <div key={n} onClick={() => update({ cyclicInterval: n })} style={pillStyle(data.cyclicInterval === n)}>{n}</div>
            ))}
            <input type="number" value={data.cyclicInterval || ""} onChange={e => update({ cyclicInterval: parseInt(e.target.value) || 1 })} placeholder="Inna" style={{ ...inputStyle, width: 70, textAlign: "center", padding: "6px 8px", marginBottom: 0 }} min={1} />
          </div>
          <SectionLabel>Pierwsza realizacja</SectionLabel>
          <input type="date" value={data.deadlineFrom} onChange={e => update({ deadlineFrom: e.target.value })} style={{ ...inputStyle, marginBottom: 10 }} />
          <SectionLabel>Koniec umowy cyklicznej</SectionLabel>
          <input type="date" value={data.deadlineTo} onChange={e => update({ deadlineTo: e.target.value })} style={inputStyle} />
        </div>
      )}
      {data.deadlineType === "stages" && (
        <div style={sectionCard}>
          {data.paymentStages.length === 0 ? (
            <div style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>
              Etapy definiujesz w kroku "Wycena". Wróć tam, żeby dodać etapy, a następnie przypisz tu daty.
            </div>
          ) : (
            <>
              <SectionLabel>Terminy realizacji etapów</SectionLabel>
              {data.paymentStages.map((stage, i) => (
                <div key={stage.id} style={{ marginBottom: 12 }}>
                  <div style={{ color: "var(--color-muted-foreground)", fontSize: 12, marginBottom: 4 }}>
                    Etap {i + 1}{stage.name ? `: ${stage.name}` : ""}
                  </div>
                  <input
                    type="date"
                    value={stage.deadline || ""}
                    onChange={e => {
                      const updated = [...data.paymentStages];
                      updated[i] = { ...updated[i], deadline: e.target.value };
                      update({ paymentStages: updated });
                    }}
                    style={inputStyle}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {data.deadlineType === "tbd" && (
        <div style={{ ...sectionCard, background: "rgba(245,158,11,0.08)", border: "1px solid #f59e0b" }}>
          <div style={{ color: "#f59e0b", fontSize: 13, fontWeight: 600 }}>Termin zostanie ustalony odrębnie przez strony.</div>
        </div>
      )}
    </div>
  );
}

// ——— STEP 6: Zakres i szczegóły
function StepZakres({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const toggleInstallation = (name: string) => {
    const list = data.scopeInstallations.includes(name)
      ? data.scopeInstallations.filter(x => x !== name)
      : [...data.scopeInstallations, name];
    update({ scopeInstallations: list });
  };

  if (data.category === "usluga") return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Zakres usługi</h2>
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Co ma być wykonane?</SectionLabel>
        <textarea value={data.scopeDescription} onChange={e => update({ scopeDescription: e.target.value })} placeholder="Opisz zakres prac..." style={textareaStyle} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Gdzie?</SectionLabel>
        <input value={data.scopeLocation} onChange={e => update({ scopeLocation: e.target.value })} placeholder="Adres lub lokalizacja" style={inputStyle} />
      </div>
      <div style={sectionCard}>
        <Toggle on={data.scopeMaterials} onChange={v => update({ scopeMaterials: v })} label="Potrzebne materiały" />
        <Toggle on={data.scopeWarranty} onChange={v => update({ scopeWarranty: v })} label="Gwarancja na wykonanie" />
        <Toggle on={data.scopeAcceptance} onChange={v => update({ scopeAcceptance: v })} label="Wymagany odbiór" />
      </div>
    </div>
  );

  if (data.category === "remont") return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Zakres remontu</h2>
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Zakres prac</SectionLabel>
        <textarea value={data.scopeDescription} onChange={e => update({ scopeDescription: e.target.value })} placeholder="Opisz prace remontowe..." style={textareaStyle} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Instalacje</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["Elektryka", "Hydraulika", "Wentylacja", "Ogrzewanie"].map(inst => {
            const active = data.scopeInstallations.includes(inst);
            return (
              <div key={inst} onClick={() => toggleInstallation(inst)} style={{ padding: "6px 14px", borderRadius: 20, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 13, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>
                {inst}
              </div>
            );
          })}
        </div>
      </div>
      <div style={sectionCard}>
        <Toggle on={data.scopeMaterials} onChange={v => update({ scopeMaterials: v })} label="Materiały wliczone" />
        <Toggle on={data.scopeDemolition} onChange={v => update({ scopeDemolition: v })} label="Demontaż" />
        <Toggle on={data.scopeCleaning} onChange={v => update({ scopeCleaning: v })} label="Sprzątanie po pracach" />
        <Toggle on={data.scopeBeforePhotos} onChange={v => update({ scopeBeforePhotos: v })} label="Zdjęcia przed pracą" />
      </div>
    </div>
  );

  if (data.category === "sprzedaz") return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Opis przedmiotu</h2>
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Opis przedmiotu</SectionLabel>
        <textarea value={data.itemDescription} onChange={e => update({ itemDescription: e.target.value })} placeholder="Opisz przedmiot sprzedaży..." style={textareaStyle} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Stan przedmiotu</SectionLabel>
        <input value={data.itemCondition} onChange={e => update({ itemCondition: e.target.value })} placeholder="np. Nowy, Używany, Uszkodzony" style={inputStyle} />
      </div>
      <div>
        <SectionLabel>Numer seryjny / VIN / IMEI</SectionLabel>
        <input value={data.itemSerial} onChange={e => update({ itemSerial: e.target.value })} placeholder="Opcjonalnie" style={inputStyle} />
      </div>
    </div>
  );

  if (data.category === "wynajem") return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Opis przedmiotu/lokalu</h2>
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Opis</SectionLabel>
        <textarea value={data.rentalDescription} onChange={e => update({ rentalDescription: e.target.value })} placeholder="Opis lokalu lub przedmiotu wynajmu..." style={textareaStyle} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Stan przed wydaniem</SectionLabel>
        <input value={data.rentalConditionBefore} onChange={e => update({ rentalConditionBefore: e.target.value })} placeholder="np. Dobry, po remoncie" style={inputStyle} />
      </div>
      <div style={sectionCard}>
        <Toggle on={data.rentalProtocol} onChange={v => update({ rentalProtocol: v })} label="Protokół wydania i zwrotu" />
      </div>
    </div>
  );

  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Własna umowa</h2>
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Nazwa umowy</SectionLabel>
        <input value={data.customTitle} onChange={e => update({ customTitle: e.target.value })} placeholder="np. Umowa o świadczenie usług" style={inputStyle} />
      </div>
      <div>
        <SectionLabel>Opis ustaleń</SectionLabel>
        <textarea value={data.customDesc} onChange={e => update({ customDesc: e.target.value })} placeholder="Opisz wszystkie ustalenia..." style={{ ...textareaStyle, minHeight: 120 }} />
      </div>
    </div>
  );
}

// ——— STEP 7a: Pomieszczenia (remont)
function StepPomieszczenia({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const presets = ["Salon", "Sypialnia", "Łazienka", "Kuchnia", "Przedpokój", "Gabinet", "Taras", "Garaż", "Biuro", "Piwnica"];
  const [customName, setCustomName] = useState("");

  const addRoom = (name: string) => {
    if (!name.trim()) return;
    update({ rooms: [...data.rooms, { id: Date.now().toString(), name: name.trim(), floorArea: 0, wallArea: 0, ceiling: false, floor: false, notes: "" }] });
    setCustomName("");
  };
  const updateRoom = (id: string, patch: Partial<Room>) =>
    update({ rooms: data.rooms.map(r => r.id === id ? { ...r, ...patch } : r) });
  const removeRoom = (id: string) =>
    update({ rooms: data.rooms.filter(r => r.id !== id) });

  const totalFloor = data.rooms.reduce((s, r) => s + r.floorArea, 0);
  const totalWall = data.rooms.reduce((s, r) => s + r.wallArea, 0);

  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Pomieszczenia</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 16 }}>Określ zakres prac w każdym pomieszczeniu.</p>
      {data.rooms.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px 16px", borderRadius: 12, border: "1.5px dashed var(--color-border)", marginBottom: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏠</div>
          <div style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Brak pomieszczeń</div>
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>Wybierz pomieszczenie z listy lub wpisz własną nazwę poniżej ↓</div>
        </div>
      )}
      {data.rooms.map(r => (
        <div key={r.id} style={{ ...sectionCard, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <span style={{ flex: 1, color: "var(--color-foreground)", fontSize: 15, fontWeight: 700 }}>{r.name}</span>
            <span onClick={() => removeRoom(r.id)} style={{ color: "var(--color-muted-foreground)", cursor: "pointer", fontSize: 18 }}>✕</span>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <SectionLabel>Podłoga (m²)</SectionLabel>
              <input type="number" value={r.floorArea || ""} onChange={e => updateRoom(r.id, { floorArea: parseFloat(e.target.value) || 0 })} placeholder="0" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <SectionLabel>Ściany (m²)</SectionLabel>
              <input type="number" value={r.wallArea || ""} onChange={e => updateRoom(r.id, { wallArea: parseFloat(e.target.value) || 0 })} placeholder="0" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <Toggle on={r.ceiling} onChange={v => updateRoom(r.id, { ceiling: v })} label="Sufit" />
            <Toggle on={r.floor} onChange={v => updateRoom(r.id, { floor: v })} label="Podłoga" />
          </div>
          <input value={r.notes} onChange={e => updateRoom(r.id, { notes: e.target.value })} placeholder="Uwagi..." style={inputStyle} />
        </div>
      ))}

      <div style={sectionCard}>
        <SectionLabel>Dodaj pomieszczenie</SectionLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={customName} onChange={e => setCustomName(e.target.value)} onKeyDown={e => e.key === "Enter" && addRoom(customName)} placeholder="Własna nazwa..." style={{ ...inputStyle, flex: 1 }} />
          <button onClick={() => addRoom(customName)} style={{ ...btnPrimary, width: 44, flexShrink: 0 }}>+</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {presets.map(p => (
            <div key={p} onClick={() => addRoom(p)} style={{ padding: "6px 12px", borderRadius: 16, border: "1px solid var(--color-border)", background: "var(--color-card)", cursor: "pointer", fontSize: 12, color: "var(--color-muted-foreground)" }}>{p}</div>
          ))}
        </div>
      </div>

      {data.rooms.length > 0 && (
        <div style={{ background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", borderRadius: 12, border: "1.5px solid var(--color-primary)", padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>Łącznie podłogi</span>
            <span style={{ color: "var(--color-primary)", fontWeight: 700, fontSize: 13 }}>{totalFloor} m²</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>Łącznie ściany</span>
            <span style={{ color: "var(--color-primary)", fontWeight: 700, fontSize: 13 }}>{totalWall} m²</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ——— STEP 7b: Szczegóły sprzedaż/elektronika
const CONDITIONS = ["Nowy", "Bardzo dobry", "Dobry", "Używany", "Uszkodzony"];

function SaleItemsEditor({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const items = data.saleItems;

  const addItem = () => update({
    saleItems: [...items, { id: Date.now().toString(), name: "", condition: "", serial: "" }],
  });
  const updateItem = (id: string, patch: Partial<SaleItem>) =>
    update({ saleItems: items.map(i => i.id === id ? { ...i, ...patch } : i) });
  const removeItem = (id: string) =>
    update({ saleItems: items.filter(i => i.id !== id) });

  return (
    <div>
      {items.length === 0 && (
        <div style={{ padding: 16, borderRadius: 10, border: "1px dashed var(--color-border)", textAlign: "center", color: "var(--color-muted-foreground)", fontSize: 14, marginBottom: 10 }}>
          Dodaj pierwszy przedmiot ↓
        </div>
      )}
      {items.map((item, i) => (
        <div key={item.id} style={{ ...sectionCard, marginBottom: 10, padding: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: "var(--color-primary)", fontSize: 11, fontWeight: 800, background: "color-mix(in srgb, var(--color-primary) 12%, transparent)", borderRadius: 4, padding: "2px 8px", flexShrink: 0 }}>{i + 1}</span>
            <input
              value={item.name}
              onChange={e => updateItem(item.id, { name: e.target.value })}
              placeholder="Nazwa przedmiotu (np. wiertarka, szlifierka…)"
              style={{ ...inputStyle, flex: 1, padding: "8px 12px", fontSize: 15 }}
            />
            <button onClick={() => removeItem(item.id)} style={{ border: "none", background: "transparent", color: "var(--color-muted-foreground)", fontSize: 20, cursor: "pointer", padding: "4px", flexShrink: 0 }}>×</button>
          </div>
          <SectionLabel>Stan</SectionLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {CONDITIONS.map(c => {
              const active = item.condition === c;
              return (
                <div key={c} onClick={() => updateItem(item.id, { condition: c })} style={{ padding: "6px 12px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400, border: `1.5px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`, background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", color: active ? "var(--color-primary)" : "var(--color-muted-foreground)" }}>
                  {c}
                </div>
              );
            })}
          </div>
          <SectionLabel>Nr seryjny (opcjonalnie)</SectionLabel>
          <input
            value={item.serial}
            onChange={e => updateItem(item.id, { serial: e.target.value })}
            placeholder="opcjonalnie"
            style={{ ...inputStyle, fontSize: 14 }}
          />
        </div>
      ))}
      <button onClick={addItem} style={{ ...btnSecondary, width: "100%", padding: 12, fontSize: 15, borderStyle: "dashed" }}>
        + Dodaj przedmiot
      </button>
    </div>
  );
}

function StepSzczegolySprzedaz({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const isElectronics = data.subcategory === "Elektronika";
  const isCar = data.subcategory === "Auto/pojazd";
  const el = data.electronics;
  const updateEl = (patch: Partial<ElectronicsDetails>) => update({ electronics: { ...el, ...patch } });
  const v = data.vehicle;
  const updateV = (patch: Partial<VehicleDetails>) => update({ vehicle: { ...v, ...patch } });
  const deviceTypes = ["Telefon", "Laptop", "Konsola", "Tablet", "TV", "Inne"];
  const accessories = ["Ładowarka", "Pudełko", "Kabel", "Gwarancja"];

  if (isCar) return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Dane pojazdu</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 16, lineHeight: 1.6 }}>Pola wymagane przez polskie prawo przy umowie kupna-sprzedaży.</p>

      <div style={sectionCard}>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}><SectionLabel>Marka</SectionLabel><input value={v.brand ?? ""} onChange={e => updateV({ brand: e.target.value })} placeholder="np. Toyota" style={inputStyle} /></div>
          <div style={{ flex: 1 }}><SectionLabel>Model</SectionLabel><input value={v.model ?? ""} onChange={e => updateV({ model: e.target.value })} placeholder="np. Corolla" style={inputStyle} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}><SectionLabel>Rok produkcji</SectionLabel><input value={v.year ?? ""} onChange={e => updateV({ year: e.target.value })} placeholder="np. 2018" style={inputStyle} /></div>
          <div style={{ flex: 1 }}><SectionLabel>Kolor</SectionLabel><input value={v.color ?? ""} onChange={e => updateV({ color: e.target.value })} placeholder="np. Srebrny" style={inputStyle} /></div>
        </div>
        <div style={{ marginBottom: 10 }}><SectionLabel>Nr rejestracyjny</SectionLabel><input value={v.licensePlate ?? ""} onChange={e => updateV({ licensePlate: e.target.value.toUpperCase() })} placeholder="np. WA 12345" style={inputStyle} /></div>
        <div style={{ marginBottom: 10 }}><SectionLabel>VIN / Nr nadwozia</SectionLabel><input value={v.vin ?? ""} onChange={e => updateV({ vin: e.target.value.toUpperCase() })} placeholder="17 znaków" style={inputStyle} /></div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}><SectionLabel>Nr silnika</SectionLabel><input value={v.engineNumber ?? ""} onChange={e => updateV({ engineNumber: e.target.value })} placeholder="opcjonalnie" style={inputStyle} /></div>
          <div style={{ flex: 1 }}><SectionLabel>Przebieg (km)</SectionLabel><input type="number" value={v.mileage ?? ""} onChange={e => updateV({ mileage: e.target.value })} placeholder="np. 95000" style={inputStyle} /></div>
        </div>
      </div>

      <div style={sectionCard}>
        <SectionLabel>Rodzaj paliwa</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {(["benzyna", "diesel", "lpg", "hybryda", "elektryczny"] as const).map(f => {
            const labels = { benzyna: "Benzyna", diesel: "Diesel", lpg: "LPG", hybryda: "Hybryda", elektryczny: "Elektryczny" };
            const active = v.fuel === f;
            return <div key={f} onClick={() => updateV({ fuel: f })} style={{ padding: "8px 16px", borderRadius: 20, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 14, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>{labels[f]}</div>;
          })}
        </div>
        <SectionLabel>Skrzynia biegów</SectionLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {(["manualna", "automatyczna"] as const).map(g => {
            const active = v.gearbox === g;
            return <div key={g} onClick={() => updateV({ gearbox: g })} style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: 10, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 14, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>{g.charAt(0).toUpperCase() + g.slice(1)}</div>;
          })}
        </div>
        <SectionLabel>Stan techniczny</SectionLabel>
        <div style={{ display: "flex", gap: 6 }}>
          {([["bardzo_dobry", "Bardzo dobry"], ["dobry", "Dobry"], ["sredni", "Średni"], ["do_naprawy", "Do naprawy"]] as const).map(([val, label]) => {
            const active = v.condition === val;
            return <div key={val} onClick={() => updateV({ condition: val })} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 11, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>{label}</div>;
          })}
        </div>
      </div>

      <div style={sectionCard}>
        <SectionLabel>Dokumenty i wyposażenie</SectionLabel>
        <Toggle on={v.hasServiceBook ?? false} onChange={val => updateV({ hasServiceBook: val })} label="Książka serwisowa" />
        <Toggle on={v.hasTwoKeys ?? false} onChange={val => updateV({ hasTwoKeys: val })} label="2 kluczyki" />
        <Toggle on={v.hasOC ?? false} onChange={val => updateV({ hasOC: val })} label="OC ważne przy sprzedaży" />
      </div>

      <div style={{ ...sectionCard, background: "color-mix(in srgb, #16a34a 6%, transparent)", border: "1px solid color-mix(in srgb, #16a34a 30%, transparent)" }}>
        <SectionLabel>Oświadczenia sprzedającego</SectionLabel>
        <Toggle on={v.noPledge ?? false} onChange={val => updateV({ noPledge: val })} label="Pojazd wolny od zastawów i obciążeń" />
        <Toggle on={v.noAccidents ?? false} onChange={val => updateV({ noAccidents: val })} label="Nie uczestniczył w wypadkach" />
        <Toggle on={v.notStolen ?? false} onChange={val => updateV({ notStolen: val })} label="Nie pochodzi z kradzieży" />
      </div>
    </div>
  );

  if (!isElectronics) return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Szczegóły sprzedaży</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 16 }}>Dodaj wszystkie sprzedawane przedmioty.</p>
      <SaleItemsEditor data={data} update={update} />
    </div>
  );

  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Szczegóły urządzenia</h2>
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Typ urządzenia</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {deviceTypes.map(t => {
            const active = el.type === t.toLowerCase();
            return (
              <div key={t} onClick={() => updateEl({ type: t.toLowerCase() as ElectronicsDetails["type"] })} style={{ padding: "8px 16px", borderRadius: 20, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 13, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>
                {t}
              </div>
            );
          })}
        </div>
      </div>

      {(el.type === "telefon" || el.type === "tablet") && (
        <div style={sectionCard}>
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><SectionLabel>Marka</SectionLabel><input value={el.brand ?? ""} onChange={e => updateEl({ brand: e.target.value })} placeholder="np. Apple" style={inputStyle} /></div>
            <div style={{ flex: 1 }}><SectionLabel>Model</SectionLabel><input value={el.model ?? ""} onChange={e => updateEl({ model: e.target.value })} placeholder="np. iPhone 15" style={inputStyle} /></div>
          </div>
          <div style={{ marginBottom: 8 }}><SectionLabel>IMEI</SectionLabel><input value={el.imei ?? ""} onChange={e => updateEl({ imei: e.target.value })} placeholder="15 cyfr" style={inputStyle} /></div>
          <div style={{ marginBottom: 8 }}>
            <SectionLabel>Stan</SectionLabel>
            <div style={{ display: "flex", gap: 6 }}>
              {["nowy", "bardzo_dobry", "uzywany", "uszkodzony"].map(c => {
                const labels: Record<string, string> = { nowy: "Nowy", bardzo_dobry: "B. dobry", uzywany: "Używany", uszkodzony: "Uszkodzony" };
                const active = el.condition === c;
                return <div key={c} onClick={() => updateEl({ condition: c as ElectronicsDetails["condition"] })} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 11, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>{labels[c]}</div>;
              })}
            </div>
          </div>
          <Toggle on={el.icloudLock ?? false} onChange={v => updateEl({ icloudLock: v })} label="Blokada iCloud/Google" />
          <Toggle on={el.screenCrack ?? false} onChange={v => updateEl({ screenCrack: v })} label="Pęknięcia ekranu" />
          <Toggle on={el.loggedOut ?? false} onChange={v => updateEl({ loggedOut: v })} label="Wylogowany z kont" />
          <div style={{ marginTop: 8 }}><SectionLabel>Stan baterii (%)</SectionLabel><input type="number" value={el.batteryPct ?? ""} onChange={e => updateEl({ batteryPct: parseInt(e.target.value) || 0 })} placeholder="np. 85" style={inputStyle} /></div>
          <div style={{ marginTop: 8 }}>
            <SectionLabel>Akcesoria</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {accessories.map(acc => {
                const active = (el.accessories ?? []).includes(acc);
                return <div key={acc} onClick={() => { const list = active ? (el.accessories ?? []).filter(a => a !== acc) : [...(el.accessories ?? []), acc]; updateEl({ accessories: list }); }} style={{ padding: "6px 14px", borderRadius: 20, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 12, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>{acc}</div>;
              })}
            </div>
          </div>
        </div>
      )}

      {el.type === "laptop" && (
        <div style={sectionCard}>
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><SectionLabel>Marka</SectionLabel><input value={el.brand ?? ""} onChange={e => updateEl({ brand: e.target.value })} placeholder="np. Dell" style={inputStyle} /></div>
            <div style={{ flex: 1 }}><SectionLabel>Model</SectionLabel><input value={el.model ?? ""} onChange={e => updateEl({ model: e.target.value })} placeholder="np. XPS 15" style={inputStyle} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><SectionLabel>Procesor</SectionLabel><input value={el.processor ?? ""} onChange={e => updateEl({ processor: e.target.value })} placeholder="np. i7-12700H" style={inputStyle} /></div>
            <div style={{ flex: 1 }}><SectionLabel>RAM</SectionLabel><input value={el.ram ?? ""} onChange={e => updateEl({ ram: e.target.value })} placeholder="np. 16GB" style={inputStyle} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><SectionLabel>Dysk</SectionLabel><input value={el.storage ?? ""} onChange={e => updateEl({ storage: e.target.value })} placeholder="np. 512GB SSD" style={inputStyle} /></div>
            <div style={{ flex: 1 }}><SectionLabel>Bateria (%)</SectionLabel><input type="number" value={el.batteryPct ?? ""} onChange={e => updateEl({ batteryPct: parseInt(e.target.value) || 0 })} placeholder="np. 90" style={inputStyle} /></div>
          </div>
          <div style={{ marginBottom: 8 }}><SectionLabel>System operacyjny</SectionLabel><input value={el.os ?? ""} onChange={e => updateEl({ os: e.target.value })} placeholder="np. Windows 11" style={inputStyle} /></div>
          <Toggle on={el.charger ?? false} onChange={v => updateEl({ charger: v })} label="Ładowarka w zestawie" />
        </div>
      )}

      {el.type === "konsola" && (
        <div style={sectionCard}>
          <div style={{ marginBottom: 8 }}>
            <SectionLabel>Model konsoli</SectionLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["PS5", "Xbox", "Switch", "Inne"].map(m => {
                const active = el.model === m;
                return <div key={m} onClick={() => updateEl({ model: m })} style={{ padding: "8px 16px", borderRadius: 8, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 13, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>{m}</div>;
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><SectionLabel>Pady (szt.)</SectionLabel><input type="number" value={el.consolePads ?? ""} onChange={e => updateEl({ consolePads: parseInt(e.target.value) || 0 })} placeholder="0" style={inputStyle} /></div>
            <div style={{ flex: 1 }}><SectionLabel>Gry (szt.)</SectionLabel><input type="number" value={el.consoleGames ?? ""} onChange={e => updateEl({ consoleGames: parseInt(e.target.value) || 0 })} placeholder="0" style={inputStyle} /></div>
          </div>
          <div style={{ marginBottom: 8 }}><SectionLabel>Stan napędu</SectionLabel><input value={el.consoleDrive ?? ""} onChange={e => updateEl({ consoleDrive: e.target.value })} placeholder="np. Sprawny" style={inputStyle} /></div>
          <Toggle on={el.consoleOnline ?? false} onChange={v => updateEl({ consoleOnline: v })} label="Działa online" />
        </div>
      )}
    </div>
  );
}

// ——— STEP 7c: Szczegóły wynajmu
function StepSzczegolyWynajem({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const noticePeriodPresets = [14, 30, 60, 90];
  const keysPresets = [1, 2, 3];
  const tenantsPresets = [1, 2, 3, 4];
  const petsOpts: { value: WizardData["rentalPets"]; label: string; icon: string }[] = [
    { value: "not_allowed", label: "Niedozwolone", icon: "🚫" },
    { value: "allowed", label: "Dozwolone", icon: "🐾" },
    { value: "allowed_deposit", label: "Za kaucją", icon: "💰" },
  ];
  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Szczegóły wynajmu</h2>

      <div style={sectionCard}>
        <SectionLabel>Data wydania przedmiotu</SectionLabel>
        <input type="date" value={data.rentalFrom} onChange={e => update({ rentalFrom: e.target.value })} style={inputStyle} />
        <SectionLabel style={{ marginTop: 10 }}>Data zwrotu</SectionLabel>
        <input type="date" value={data.rentalTo} onChange={e => update({ rentalTo: e.target.value })} style={inputStyle} />
      </div>

      <div style={sectionCard}>
        <SectionLabel>Stan przedmiotu przy wydaniu</SectionLabel>
        <textarea value={data.rentalConditionBefore} onChange={e => update({ rentalConditionBefore: e.target.value })} placeholder="Opisz stan w chwili przekazania (zarysowania, uszkodzenia)..." style={textareaStyle} />
      </div>

      <div style={sectionCard}>
        <SectionLabel>Warunki zwrotu</SectionLabel>
        <textarea value={data.rentalReturnNotes} onChange={e => update({ rentalReturnNotes: e.target.value })} placeholder="Opisz oczekiwany stan przy zwrocie..." style={textareaStyle} />
      </div>

      {/* Lokatorzy i klucze */}
      <div style={sectionCard}>
        <SectionLabel>Liczba lokatorów</SectionLabel>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {tenantsPresets.map(n => (
            <div key={n} onClick={() => update({ rentalTenants: n })} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 10, border: `1.5px solid ${data.rentalTenants === n ? "var(--color-primary)" : "var(--color-border)"}`, background: data.rentalTenants === n ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", color: data.rentalTenants === n ? "var(--color-primary)" : "var(--color-foreground)", fontWeight: data.rentalTenants === n ? 700 : 400, fontSize: 14 }}>{n}</div>
          ))}
          <input type="number" value={data.rentalTenants > 4 ? data.rentalTenants : ""} onChange={e => update({ rentalTenants: parseInt(e.target.value) || 1 })} placeholder="5+" style={{ ...inputStyle, flex: 1, textAlign: "center", padding: "8px 4px", marginBottom: 0 }} min={1} />
        </div>
        <SectionLabel>Liczba kompletów kluczy</SectionLabel>
        <div style={{ display: "flex", gap: 6 }}>
          {keysPresets.map(n => (
            <div key={n} onClick={() => update({ rentalKeys: n })} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 10, border: `1.5px solid ${data.rentalKeys === n ? "var(--color-primary)" : "var(--color-border)"}`, background: data.rentalKeys === n ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", color: data.rentalKeys === n ? "var(--color-primary)" : "var(--color-foreground)", fontWeight: data.rentalKeys === n ? 700 : 400, fontSize: 14 }}>{n}</div>
          ))}
          <input type="number" value={data.rentalKeys > 3 ? data.rentalKeys : ""} onChange={e => update({ rentalKeys: parseInt(e.target.value) || 1 })} placeholder="4+" style={{ ...inputStyle, flex: 1, textAlign: "center", padding: "8px 4px", marginBottom: 0 }} min={1} />
        </div>
      </div>

      {/* Zwierzęta */}
      <div style={sectionCard}>
        <SectionLabel>Zwierzęta domowe</SectionLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {petsOpts.map(o => {
            const active = data.rentalPets === o.value;
            return (
              <div key={o.value} onClick={() => update({ rentalPets: active ? "" : o.value })} style={{ flex: 1, textAlign: "center", padding: "10px 6px", borderRadius: 10, border: `1.5px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`, background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer" }}>
                <div style={{ fontSize: 18, marginBottom: 3 }}>{o.icon}</div>
                <div style={{ color: active ? "var(--color-primary)" : "var(--color-foreground)", fontSize: 12, fontWeight: active ? 700 : 400 }}>{o.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Wyposażenie */}
      <div style={sectionCard}>
        <Toggle on={data.rentalFurnitured} onChange={v => update({ rentalFurnitured: v })} label="Mieszkanie umeblowane" />
        <div style={{ marginTop: 10 }} />
        <Toggle on={data.rentalParking} onChange={v => update({ rentalParking: v })} label="Miejsce parkingowe wliczone w czynsz" />
        <div style={{ marginTop: 10 }} />
        <Toggle on={data.rentalDamageLiability} onChange={v => update({ rentalDamageLiability: v })} label="Najemca odpowiada za szkody ponad normalne zużycie" />
        <div style={{ marginTop: 10 }} />
        <Toggle on={data.rentalProtocol} onChange={v => update({ rentalProtocol: v })} label="Wymagany protokół zdawczo-odbiorczy" />
      </div>

      {/* Wypowiedzenie */}
      <div style={sectionCard}>
        <SectionLabel>Okres wypowiedzenia (dni)</SectionLabel>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {noticePeriodPresets.map(d => (
            <div key={d} onClick={() => update({ rentalNoticePeriod: d })} style={pillStyle(data.rentalNoticePeriod === d)}>{d} dni</div>
          ))}
        </div>
        <input type="number" value={data.rentalNoticePeriod || ""} onChange={e => update({ rentalNoticePeriod: parseInt(e.target.value) || 0 })} placeholder="np. 30" style={inputStyle} min={0} />
      </div>

      {/* Media i podnajem */}
      <div style={sectionCard}>
        <SectionLabel>Media i koszty eksploatacyjne</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          {([
            { v: "included", l: "Wliczone w czynsz" },
            { v: "tenant", l: "Płaci najemca" },
            { v: "split", l: "Podział 50/50" },
          ] as const).map(o => {
            const active = data.rentalUtilities === o.v;
            return (
              <div key={o.v} onClick={() => update({ rentalUtilities: active ? "" : o.v })}
                style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`, background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 13, color: active ? "var(--color-primary)" : "var(--color-foreground)", fontWeight: active ? 700 : 400 }}>
                {o.l}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14 }}>
          <Toggle on={data.rentalSubletting} onChange={v => update({ rentalSubletting: v })} label="Podnajem dozwolony" />
        </div>
      </div>

      {/* Zwrot kaucji */}
      <div style={sectionCard}>
        <SectionLabel>Termin zwrotu kaucji (dni od zdania lokalu)</SectionLabel>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {[14, 21, 30, 60].map(d => (
            <div key={d} onClick={() => update({ rentalDepositReturnDays: d })} style={pillStyle(data.rentalDepositReturnDays === d)}>{d} dni</div>
          ))}
        </div>
        <input type="number" value={data.rentalDepositReturnDays || ""} onChange={e => update({ rentalDepositReturnDays: parseInt(e.target.value) || 30 })} placeholder="np. 30" style={inputStyle} min={1} />
      </div>
    </div>
  );
}

// ——— STEP 8: Dodatkowe pozycje
function StepDodatki({ data, update, additionalTotal }: { data: WizardData; update: (p: Partial<WizardData>) => void; additionalTotal: number }) {
  const [customName, setCustomName] = useState("");

  const addItem = (name: string) => {
    if (!name.trim()) return;
    update({ additionalItems: [...data.additionalItems, { id: Date.now().toString(), name: name.trim(), qty: 1, price: 0, payer: "client", inDeposit: false }] });
    setCustomName("");
  };
  const updateItem = (id: string, patch: Partial<AdditionalItem>) =>
    update({ additionalItems: data.additionalItems.map(i => i.id === id ? { ...i, ...patch } : i) });
  const removeItem = (id: string) =>
    update({ additionalItems: data.additionalItems.filter(i => i.id !== id) });
  const existingNames = data.additionalItems.map(i => i.name);

  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Dodatkowe pozycje</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 16 }}>Opcjonalne pozycje dodatkowe do umowy.</p>

      {data.additionalItems.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 16px", borderRadius: 12, border: "1.5px dashed var(--color-border)", marginBottom: 14, color: "var(--color-muted-foreground)" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>➕</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Brak dodatkowych pozycji</div>
          <div style={{ fontSize: 12 }}>Opcjonalne — dodaj materiały, dojazd, licencje itp.</div>
        </div>
      )}

      {data.additionalItems.map(item => (
        <div key={item.id} style={sectionCard}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <span style={{ flex: 1, color: "var(--color-foreground)", fontSize: 14, fontWeight: 600 }}>{item.name}</span>
            <span onClick={() => removeItem(item.id)} style={{ color: "var(--color-muted-foreground)", cursor: "pointer", fontSize: 18 }}>✕</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><SectionLabel>Ilość</SectionLabel><input type="number" value={item.qty} onChange={e => updateItem(item.id, { qty: parseInt(e.target.value) || 0 })} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><SectionLabel>Cena ({data.currency})</SectionLabel><input type="number" value={item.price || ""} onChange={e => updateItem(item.id, { price: parseFloat(e.target.value) || 0 })} placeholder="0" style={inputStyle} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <SectionLabel>Kto płaci</SectionLabel>
              <div style={{ display: "flex", gap: 6 }}>
                {[{ v: "client", l: "Zamawiający" }, { v: "contractor", l: "Wykonawca" }].map(o => {
                  const active = item.payer === o.v;
                  return <div key={o.v} onClick={() => updateItem(item.id, { payer: o.v as "client" | "contractor" })} style={{ flex: 1, textAlign: "center", padding: "6px 4px", borderRadius: 8, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 11, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>{o.l}</div>;
                })}
              </div>
            </div>
            <div style={{ flex: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
              <Toggle on={item.inDeposit} onChange={v => updateItem(item.id, { inDeposit: v })} label="W depozycie" />
            </div>
          </div>
        </div>
      ))}

      <div style={sectionCard}>
        <SectionLabel>Szybkie dodanie</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {ADDITIONAL_PRESETS.filter(p => !existingNames.includes(p)).map(p => (
            <div key={p} onClick={() => addItem(p)} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid var(--color-border)", background: "var(--color-card)", cursor: "pointer", fontSize: 12, color: "var(--color-muted-foreground)" }}>{p}</div>
          ))}
        </div>
        <SectionLabel>Dodaj własną</SectionLabel>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={customName} onChange={e => setCustomName(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem(customName)} placeholder="Nazwa pozycji..." style={{ ...inputStyle, flex: 1 }} />
          <button onClick={() => addItem(customName)} style={{ ...btnPrimary, width: 44, flexShrink: 0 }}>+</button>
        </div>
      </div>

      {additionalTotal > 0 && (
        <div style={{ background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", borderRadius: 12, border: "1.5px solid var(--color-primary)", padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>Suma dodatków</span>
          <span style={{ color: "var(--color-primary)", fontSize: 18, fontWeight: 800 }}>{additionalTotal.toLocaleString("pl-PL")} {data.currency}</span>
        </div>
      )}
    </div>
  );
}

// ——— STEP 9: Wycena końcowa
function StepWycenaKoncowa({ data, totalPrice, additionalTotal, goBack }: { data: WizardData; update: (p: Partial<WizardData>) => void; totalPrice: number; additionalTotal: number; goBack: () => void }) {
  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Wycena końcowa</h2>
      <div style={sectionCard}>
        {data.basePrice > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--color-border)", marginBottom: 8 }}>
            <span style={{ color: "var(--color-muted-foreground)", fontSize: 14 }}>Robocizna / cena bazowa</span>
            <span style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 600 }}>{data.basePrice.toLocaleString("pl-PL")} {data.currency}</span>
          </div>
        )}
        {data.scopeMaterials && (
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--color-border)", marginBottom: 8 }}>
            <span style={{ color: "var(--color-muted-foreground)", fontSize: 14 }}>Materiały</span>
            <span style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 600 }}>wliczone</span>
          </div>
        )}
        {data.additionalItems.map(item => (
          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6, marginBottom: 6 }}>
            <span style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>{item.name} (×{item.qty})</span>
            <span style={{ color: "var(--color-foreground)", fontSize: 13, fontWeight: 500 }}>{(item.qty * item.price).toLocaleString("pl-PL")} {data.currency}</span>
          </div>
        ))}
        {data.rentalDeposit > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--color-border)", marginBottom: 8 }}>
            <span style={{ color: "var(--color-muted-foreground)", fontSize: 14 }}>Kaucja/depozyt</span>
            <span style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 600 }}>{data.rentalDeposit.toLocaleString("pl-PL")} {data.currency}</span>
          </div>
        )}
        <div style={{ height: 1, background: "var(--color-border)", margin: "12px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--color-foreground)", fontSize: 16, fontWeight: 800 }}>RAZEM</span>
          <span style={{ color: "var(--color-primary)", fontSize: 28, fontWeight: 800 }}>{totalPrice.toLocaleString("pl-PL")} {data.currency}</span>
        </div>
      </div>
      <button onClick={goBack} style={{ ...btnSecondary, width: "100%", marginTop: 8 }}>
        ← Edytuj wycenę
      </button>
    </div>
  );
}

// ——— STEP 10: Płatność i depozyt
function formatIBAN(raw: string): string {
  const clean = raw.replace(/\s/g, "").toUpperCase();
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

function StepPlatnosc({ data, update, totalPrice }: { data: WizardData; update: (p: Partial<WizardData>) => void; totalPrice: number }) {
  const paymentMethods: { value: PaymentMethodType; label: string; icon: string; desc: string }[] = [
    { value: "upfront", label: "Płatność z góry", icon: "💵", desc: "Cała kwota przed realizacją" },
    { value: "after", label: "Po wykonaniu", icon: "✅", desc: "Płatność po odbiorze prac" },
    { value: "stages", label: "Etapami", icon: "📋", desc: "Kolejne płatności za etapy" },
    { value: "deposit", label: "Depozyt escrow", icon: "🔒", desc: "Środki zablokowane do odbioru" },
    { value: "partial_deposit", label: "Zaliczka + depozyt", icon: "📦", desc: "Część z góry, reszta w depozycie" },
  ];

  const toggleDepositCover = (v: string) => {
    const list = data.depositCovers.includes(v)
      ? data.depositCovers.filter(x => x !== v)
      : [...data.depositCovers, v];
    update({ depositCovers: list });
  };

  const depositAmount = data.paymentMethod === "deposit" ? totalPrice
    : data.paymentMethod === "partial_deposit" ? Math.round(totalPrice * 0.7)
    : 0;

  // Auto-generate payment title from contract data
  const autoTitle = [
    data.category === "sprzedaz" ? "Sprzedaż" : data.category === "wynajem" ? "Wynajem" : "Umowa",
    data.subcategory || "",
    data.contractor.name || data.client.name || "",
  ].filter(Boolean).join(" — ").slice(0, 60);

  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Płatność</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 16 }}>Jak zostanie podzielona kwota {totalPrice > 0 ? `${totalPrice.toLocaleString("pl-PL")} ${data.currency}` : ""}?</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {paymentMethods.map(pm => {
          const active = data.paymentMethod === pm.value;
          return (
            <div key={pm.value} onClick={() => update({ paymentMethod: pm.value })} style={{ ...cardStyle(active), display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>{pm.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: active ? "var(--color-primary)" : "var(--color-foreground)", fontSize: 14, fontWeight: 600 }}>{pm.label}</div>
                <div style={{ color: "var(--color-muted-foreground)", fontSize: 12, marginTop: 2 }}>{pm.desc}</div>
              </div>
              <div style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {active && <div style={{ width: 10, height: 10, borderRadius: 5, background: "var(--color-primary)" }} />}
              </div>
            </div>
          );
        })}
      </div>

      {(data.paymentMethod === "deposit" || data.paymentMethod === "partial_deposit") && (
        <div style={sectionCard}>
          <SectionLabel>Co ma być objęte depozytem?</SectionLabel>
          {DEPOSIT_COVERS_OPTIONS.map(opt => (
            <div key={opt} onClick={() => toggleDepositCover(opt)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}>
              <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${data.depositCovers.includes(opt) ? "var(--color-primary)" : "var(--color-border)"}`, background: data.depositCovers.includes(opt) ? "var(--color-primary)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {data.depositCovers.includes(opt) && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
              </div>
              <span style={{ color: "var(--color-foreground)", fontSize: 14 }}>{opt}</span>
            </div>
          ))}
          {depositAmount > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>Kwota depozytu</span>
              <span style={{ color: "var(--color-primary)", fontWeight: 700, fontSize: 14 }}>{depositAmount.toLocaleString("pl-PL")} {data.currency}</span>
            </div>
          )}
        </div>
      )}

      {/* Bank account section */}
      <div style={{ ...sectionCard, marginTop: 4 }}>
        <div style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>💳 Dane do przelewu (opcjonalne)</div>

        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Numer konta (IBAN)</SectionLabel>
          <input
            value={data.bankAccount}
            onChange={e => update({ bankAccount: formatIBAN(e.target.value) })}
            placeholder="PL61 1090 1014 0000 0712 1981 2874"
            style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: "0.04em" }}
            maxLength={34}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <SectionLabel>BLIK / Telefon (alternatywnie)</SectionLabel>
          <input
            value={data.bankBlik}
            onChange={e => update({ bankBlik: e.target.value })}
            placeholder="+48 600 000 000"
            style={inputStyle}
            type="tel"
          />
        </div>

        <div>
          <SectionLabel>Tytuł przelewu</SectionLabel>
          <input
            value={data.paymentTitle || autoTitle}
            onChange={e => update({ paymentTitle: e.target.value })}
            placeholder={autoTitle || "Tytuł przelewu..."}
            style={inputStyle}
          />
          {!data.paymentTitle && autoTitle && (
            <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, marginTop: 4 }}>Auto-wygenerowany — możesz zmienić</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ——— STEP 11: Warunki wykonania
function StepWarunki({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const isSale = data.category === "sprzedaz";
  const isRental = data.category === "wynajem";
  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Warunki</h2>

      {!isSale && !isRental && (
        <div style={sectionCard}>
          <SectionLabel>Kto kupuje materiały?</SectionLabel>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ v: "client", l: "Zamawiający" }, { v: "contractor", l: "Wykonawca" }, { v: "split", l: "Podział" }].map(o => {
              const active = data.materialsBy === o.v;
              return <div key={o.v} onClick={() => update({ materialsBy: o.v as "client" | "contractor" | "split" })} style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 10, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 12, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>{o.l}</div>;
            })}
          </div>
        </div>
      )}

      {isSale && (
        <div style={sectionCard}>
          <SectionLabel>Kto organizuje transport?</SectionLabel>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ v: "client", l: "Kupujący" }, { v: "contractor", l: "Sprzedający" }].map(o => {
              const active = data.transportBy === o.v;
              return <div key={o.v} onClick={() => update({ transportBy: o.v as "client" | "contractor" })} style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 10, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 12, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>{o.l}</div>;
            })}
          </div>
        </div>
      )}

      {!isSale && !isRental && (
        <div style={sectionCard}>
          <SectionLabel>Kto odpowiada za transport?</SectionLabel>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ v: "client", l: "Zamawiający" }, { v: "contractor", l: "Wykonawca" }].map(o => {
              const active = data.transportBy === o.v;
              return <div key={o.v} onClick={() => update({ transportBy: o.v as "client" | "contractor" })} style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 10, border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)", background: active ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", cursor: "pointer", fontSize: 12, color: active ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: active ? 700 : 400 }}>{o.l}</div>;
            })}
          </div>
        </div>
      )}

      <div style={sectionCard}>
        <SectionLabel>Zasady współpracy</SectionLabel>
        {!isSale && !isRental && <Toggle on={data.weekendWork} onChange={v => update({ weekendWork: v })} label="Praca w weekend" />}
        {!isSale && <Toggle on={data.requireApproval} onChange={v => update({ requireApproval: v })} label="Dodatkowe prace wymagają akceptacji" />}
        <Toggle on={data.priceChangeApproval} onChange={v => update({ priceChangeApproval: v })} label="Zmiany ceny wymagają akceptacji obu stron" />
      </div>
      <div style={sectionCard}>
        <SectionLabel>Gwarancja i kary</SectionLabel>
        <Toggle on={data.warranty} onChange={v => update({ warranty: v })} label={isSale ? "Gwarancja na przedmiot" : "Gwarancja na wykonanie"} />
        {data.warranty && (
          <div style={{ paddingTop: 8 }}>
            <SectionLabel>Okres gwarancji (dni)</SectionLabel>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              {WARRANTY_PRESETS.map(s => (
                <div key={s.d} onClick={() => update({ warrantyDays: s.d })} style={pillStyle(data.warrantyDays === s.d)}>{s.l}</div>
              ))}
            </div>
            <input type="number" value={data.warrantyDays} onChange={e => update({ warrantyDays: parseInt(e.target.value) || 0 })} placeholder="lub wpisz liczbę dni" style={{ ...inputStyle, fontSize: 15 }} />
          </div>
        )}
        <Toggle on={data.latePenalty} onChange={v => update({ latePenalty: v })} label={isSale ? "Kara za nieterminową dostawę" : "Kara za opóźnienie"} />
        {data.latePenalty && (
          <div style={{ paddingTop: 8 }}>
            <SectionLabel>Kara ({data.currency}/dzień)</SectionLabel>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              {PENALTY_PRESETS.map(amt => (
                <div key={amt} onClick={() => update({ latePenaltyAmount: amt })} style={pillStyle(data.latePenaltyAmount === amt)}>{amt} {data.currency}</div>
              ))}
            </div>
            <input type="number" value={data.latePenaltyAmount} onChange={e => update({ latePenaltyAmount: parseFloat(e.target.value) || 0 })} placeholder="lub wpisz kwotę" style={{ ...inputStyle, fontSize: 15 }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ——— STEP 12: Protokół odbioru
function StepProtokol({ data, update }: { data: WizardData; update: (p: Partial<WizardData>) => void }) {
  const isSale = data.category === "sprzedaz";
  const isCar = isSale && data.subcategory === "Auto/pojazd";

  if (isSale) {
    const statuses = [
      { value: "accepted" as ProtocolStatus, label: "Przekazano bez zastrzeżeń", color: "#22c55e" },
      { value: "with_notes" as ProtocolStatus, label: "Przekazano z uwagami", color: "#f59e0b" },
    ];
    return (
      <div>
        <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
          {isCar ? "Protokół przekazania pojazdu" : "Potwierdzenie przekazania"}
        </h2>
        <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 16, lineHeight: 1.6 }}>
          Kupujący potwierdza odbiór {isCar ? "pojazdu" : "przedmiotu"}.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {statuses.map(s => {
            const active = data.protocolStatus === s.value;
            return (
              <div key={s.value} onClick={() => update({ protocolStatus: s.value })} style={{ ...cardStyle(active), display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: s.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: active ? "var(--color-primary)" : "var(--color-foreground)", fontSize: 15, fontWeight: active ? 700 : 400 }}>{s.label}</span>
                <div style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {active && <div style={{ width: 10, height: 10, borderRadius: 5, background: "var(--color-primary)" }} />}
                </div>
              </div>
            );
          })}
        </div>

        {isCar && (
          <div style={sectionCard}>
            <SectionLabel>Przekazano przy odbiorze</SectionLabel>
            <Toggle on={data.beforePhotos} onChange={v => update({ beforePhotos: v })} label="Kluczyki do pojazdu" />
            <Toggle on={data.afterPhotos} onChange={v => update({ afterPhotos: v })} label="Dowód rejestracyjny" />
            <Toggle on={data.releaseDeposit} onChange={v => update({ releaseDeposit: v })} label="Karta pojazdu (jeśli dotyczy)" />
          </div>
        )}

        {data.protocolStatus === "with_notes" && (
          <div style={{ marginBottom: 12 }}>
            <SectionLabel>Uwagi przy przekazaniu</SectionLabel>
            <textarea value={data.protocolDesc} onChange={e => update({ protocolDesc: e.target.value })} placeholder="Opisz uwagi..." style={textareaStyle} />
          </div>
        )}
      </div>
    );
  }

  // Remont / Usługa / Wynajem — pełny protokół
  const statuses: { value: ProtocolStatus; label: string; color: string }[] = [
    { value: "accepted", label: "Odebrane bez uwag", color: "#22c55e" },
    { value: "with_notes", label: "Odebrane z uwagami", color: "#f59e0b" },
    { value: "needs_fixes", label: "Wymaga poprawek", color: "#ef4444" },
    { value: "rejected", label: "Odrzucone", color: "#6b7280" },
  ];
  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 16 }}>
        {data.category === "wynajem" ? "Protokół wydania i zwrotu" : "Protokół odbioru"}
      </h2>
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Status odbioru</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {statuses.map(s => {
            const active = data.protocolStatus === s.value;
            return (
              <div key={s.value} onClick={() => update({ protocolStatus: s.value })} style={{ ...cardStyle(active), display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: s.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: active ? "var(--color-primary)" : "var(--color-foreground)", fontSize: 14, fontWeight: active ? 700 : 400 }}>{s.label}</span>
                <div style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {active && <div style={{ width: 10, height: 10, borderRadius: 5, background: "var(--color-primary)" }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {data.protocolStatus === "rejected" && (
        <div style={{ marginTop: 4, marginBottom: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(107,114,128,0.08)", border: "1px solid #9ca3af" }}>
          <div style={{ color: "var(--color-foreground)", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Co dalej?</div>
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 13, lineHeight: 1.7 }}>
            <div>• Opisz powód odrzucenia w polu poniżej</div>
            <div>• Otwórz spór w panelu umowy (opcja po powrocie)</div>
            <div>• Skontaktuj się z drugą stroną bezpośrednio</div>
          </div>
        </div>
      )}
      <div style={sectionCard}>
        <Toggle on={data.beforePhotos} onChange={v => update({ beforePhotos: v })} label="Zdjęcia przed" />
        <Toggle on={data.afterPhotos} onChange={v => update({ afterPhotos: v })} label="Zdjęcia po" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <SectionLabel>Opis wykonania</SectionLabel>
        <textarea value={data.protocolDesc} onChange={e => update({ protocolDesc: e.target.value })} placeholder="Opisz wykonane prace..." style={textareaStyle} />
      </div>
      {(data.protocolStatus === "with_notes" || data.protocolStatus === "needs_fixes") && (
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Lista usterek</SectionLabel>
          <textarea value={data.protocolIssues} onChange={e => update({ protocolIssues: e.target.value })} placeholder="Wypisz usterki..." style={textareaStyle} />
          <SectionLabel>Termin poprawek</SectionLabel>
          <input type="date" value={data.protocolFixDeadline} onChange={e => update({ protocolFixDeadline: e.target.value })} style={inputStyle} />
        </div>
      )}
      <div style={sectionCard}>
        <Toggle on={data.releaseDeposit} onChange={v => update({ releaseDeposit: v })} label="Wypłata depozytu" />
      </div>
    </div>
  );
}

// ——— STEP 13: Przegląd
function StepPrzeglad({ data, steps, goToStep, warnings, totalPrice }: { data: WizardData; steps: { id: string; label: string }[]; goToStep: (i: number) => void; warnings: string[]; totalPrice: number }) {
  const [expanded, setExpanded] = useState<string[]>(["podstawy"]);
  const toggle = (id: string) => setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const allSectionIds = ["podstawy", "wycena", "szczegoly", "szczegoly_wynajmu", "termin", "warunki", "platnosc"];
  const allExpanded = allSectionIds.every(id => expanded.includes(id));
  const toggleAll = () => setExpanded(allExpanded ? [] : [...allSectionIds]);

  const Section = ({ id, title, stepId, children }: { id: string; title: string; stepId: string; children: React.ReactNode }) => {
    const stepIdx = steps.findIndex(s => s.id === stepId);
    const open = expanded.includes(id);
    return (
      <div style={sectionCard}>
        <div style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => toggle(id)}>
          <span style={{ flex: 1, color: "var(--color-foreground)", fontSize: 14, fontWeight: 700 }}>{title}</span>
          {stepIdx >= 0 && <span onClick={e => { e.stopPropagation(); goToStep(stepIdx); }} style={{ color: "var(--color-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", marginRight: 12 }}>Edytuj →</span>}
          <span style={{ color: "var(--color-muted-foreground)", fontSize: 16 }}>{open ? "▲" : "▼"}</span>
        </div>
        {open && <div style={{ marginTop: 12 }}>{children}</div>}
      </div>
    );
  };

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6 }}>
      <span style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>{label}</span>
      <span style={{ color: "var(--color-foreground)", fontSize: 13, fontWeight: 500, textAlign: "right", marginLeft: 8, maxWidth: "60%" }}>{value || "—"}</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, margin: 0 }}>Podsumowanie</h2>
        <button onClick={toggleAll} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-muted-foreground)", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
          {allExpanded ? "Zwiń ▲" : "Rozwiń ▼"}
        </button>
      </div>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 16 }}>Sprawdź wszystkie dane przed podpisaniem.</p>

      {warnings.length > 0 && (
        <div style={{ background: "rgba(245,158,11,0.1)", borderRadius: 10, border: "1px solid #f59e0b", padding: 12, marginBottom: 14 }}>
          <div style={{ color: "#f59e0b", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>⚠️ Uwagi ({warnings.length})</div>
          {warnings.map(w => <div key={w} style={{ color: "#f59e0b", fontSize: 12, lineHeight: 1.8 }}>• {w}</div>)}
        </div>
      )}

      <Section id="podstawy" title="Kategoria i strony" stepId="kategoria">
        <Row label="Kategoria" value={data.category} />
        <Row label="Podkategoria" value={data.subcategory} />
        <Row label="Zleceniodawca" value={data.client.name} />
        <Row label="Wykonawca" value={data.contractor.name} />
      </Section>
      <Section id="wycena" title="Wycena" stepId="wycena">
        <Row label="Model rozliczenia" value={{
          fixed: "Cena za całość", hourly: "Za godzinę", unit: "Za sztukę",
          stages: "Etapami", per_day: "Za dzień", per_week: "Za tydzień", per_month: "Za miesiąc",
          m2: "Za m²", materials_labor: "Materiały + robocizna",
        }[data.pricingMethod] ?? data.pricingMethod} />
        {data.pricingMethod === "stages" && data.paymentStages.length > 0 && data.paymentStages.map((s, i) => (
          <Row key={s.id} label={`Etap ${i + 1}: ${s.name}`} value={`${s.amount.toLocaleString("pl-PL")} ${data.currency}`} />
        ))}
        {data.pricingMethod === "unit" && data.unitItems.length > 0 && data.unitItems.map(i => (
          <Row key={i.id} label={`${i.name || "Pozycja"} × ${i.quantity}`} value={`${(i.unitPrice * i.quantity).toLocaleString("pl-PL")} ${data.currency}`} />
        ))}
        {data.pricingMethod === "hourly" && data.estimatedHours > 0 && (
          <Row label={`${data.estimatedHours} godz. × ${data.basePrice.toLocaleString("pl-PL")} ${data.currency}`} value={`${(data.basePrice * data.estimatedHours).toLocaleString("pl-PL")} ${data.currency}`} />
        )}
        {data.pricingMethod === "per_day" && data.rentalDays > 0 && (
          <Row label={`${data.rentalDays} dni × ${data.basePrice.toLocaleString("pl-PL")} ${data.currency}`} value={`${(data.basePrice * data.rentalDays).toLocaleString("pl-PL")} ${data.currency}`} />
        )}
        {data.pricingMethod === "per_week" && data.rentalWeeks > 0 && (
          <Row label={`${data.rentalWeeks} tydz. × ${data.basePrice.toLocaleString("pl-PL")} ${data.currency}`} value={`${(data.basePrice * data.rentalWeeks).toLocaleString("pl-PL")} ${data.currency}`} />
        )}
        {data.pricingMethod === "per_month" && data.rentalMonths > 0 && (
          <Row label={`${data.rentalMonths} mies. × ${data.basePrice.toLocaleString("pl-PL")} ${data.currency}`} value={`${(data.basePrice * data.rentalMonths).toLocaleString("pl-PL")} ${data.currency}`} />
        )}
        {["fixed", "m2", "materials_labor"].includes(data.pricingMethod) && (
          <Row label="Kwota" value={`${data.basePrice.toLocaleString("pl-PL")} ${data.currency}`} />
        )}
        {data.rentalDeposit > 0 && <Row label="Kaucja" value={`${data.rentalDeposit.toLocaleString("pl-PL")} ${data.currency}`} />}
        {data.additionalItems.length > 0 && <Row label="Pozycje dodatkowe" value={`${data.additionalItems.length} pozycji`} />}
      </Section>
      {data.category === "sprzedaz" && data.saleItems.length > 0 && (
        <Section id="szczegoly" title="Przedmioty sprzedaży" stepId="szczegoly">
          {data.saleItems.map((i, idx) => (
            <Row key={i.id} label={`${idx + 1}. ${i.name || "Przedmiot"}`} value={i.condition} />
          ))}
        </Section>
      )}
      {data.category === "sprzedaz" && data.subcategory === "Auto/pojazd" && (data.vehicle?.brand || data.vehicle?.vin) && (
        <Section id="szczegoly" title="Pojazd" stepId="szczegoly">
          <Row label="Marka / model" value={`${data.vehicle?.brand ?? ""} ${data.vehicle?.model ?? ""}`.trim()} />
          <Row label="Rok" value={data.vehicle?.year ?? ""} />
          <Row label="VIN" value={data.vehicle?.vin ?? ""} />
          <Row label="Przebieg" value={data.vehicle?.mileage ? `${data.vehicle.mileage} km` : ""} />
          <Row label="Nr rej." value={data.vehicle?.licensePlate ?? ""} />
        </Section>
      )}
      {data.category === "wynajem" && (
        <Section id="szczegoly_wynajmu" title="Szczegóły najmu" stepId="szczegoly_wynajmu">
          {data.rentalTenants > 0 && <Row label="Lokatorzy" value={`${data.rentalTenants} osoba/y`} />}
          {data.rentalKeys > 0 && <Row label="Klucze" value={`${data.rentalKeys} kpl.`} />}
          <Row label="Umeblowanie" value={data.rentalFurnitured ? "Tak" : "Nie"} />
          <Row label="Parking" value={data.rentalParking ? "Tak" : "Nie"} />
          {data.rentalPets && <Row label="Zwierzęta" value={({ allowed: "Dozwolone", not_allowed: "Niedozwolone", allowed_deposit: "Za kaucją" } as Record<string,string>)[data.rentalPets] ?? "—"} />}
          {data.rentalNoticePeriod > 0 && <Row label="Okres wypowiedzenia" value={`${data.rentalNoticePeriod} dni`} />}
          <Row label="Szkody" value={data.rentalDamageLiability ? "Najemca odpowiada" : "Normalne zużycie"} />
          <Row label="Protokół" value={data.rentalProtocol ? "Wymagany" : "Brak"} />
        </Section>
      )}
      <Section id="termin" title="Termin" stepId="termin">
        <Row label="Typ terminu" value={{ single: "Jedna data", range: "Od–do", stages: "Etapy", cyclic: "Cyklicznie", tbd: "Do uzgodnienia" }[data.deadlineType] ?? data.deadlineType} />
        {data.deadlineType === "cyclic" && data.cyclicInterval > 0 && <Row label="Cykl" value={`co ${data.cyclicInterval} ${({ days: "dni", weeks: "tygodnie", months: "miesiące" } as Record<string,string>)[data.cyclicUnit]}`} />}
        {data.deadlineSingle && <Row label="Data" value={data.deadlineSingle} />}
        {data.deadlineFrom && <Row label="Od" value={data.deadlineFrom} />}
        {data.deadlineTo && <Row label="Do" value={data.deadlineTo} />}
        {data.rentalFrom && <Row label="Wydanie" value={data.rentalFrom} />}
        {data.rentalTo && <Row label="Zwrot" value={data.rentalTo} />}
      </Section>
      <Section id="warunki" title="Warunki" stepId="warunki">
        {data.category !== "sprzedaz" && data.category !== "wynajem" && <Row label="Materiały" value={data.materialsBy === "client" ? "Zamawiający" : data.materialsBy === "contractor" ? "Wykonawca" : "Podział"} />}
        <Row label="Transport" value={data.transportBy === "client" ? (data.category === "sprzedaz" ? "Kupujący" : "Zamawiający") : (data.category === "sprzedaz" ? "Sprzedający" : "Wykonawca")} />
        <Row label="Gwarancja" value={data.warranty ? `${data.warrantyDays} dni` : "Brak"} />
        <Row label="Kara za opóźnienie" value={data.latePenalty ? `${data.latePenaltyAmount} ${data.currency}/dzień` : "Brak"} />
        {data.requireApproval && <Row label="Zatwierdzanie zmian" value="Wymagana zgoda obu stron" />}
        {data.weekendWork && <Row label="Praca w weekendy" value="Tak" />}
        {data.scopeDescription ? <Row label="Opis zakresu" value={data.scopeDescription.slice(0, 80) + (data.scopeDescription.length > 80 ? "…" : "")} /> : null}
      </Section>
      <Section id="platnosc" title="Płatność" stepId="platnosc">
        <Row label="Model płatności" value={({ upfront: "Z góry", after: "Po wykonaniu", stages: "Etapami", deposit: "Depozyt", partial_deposit: "Częściowy depozyt" } as Record<string,string>)[data.paymentMethod] ?? data.paymentMethod} />
        {data.depositCovers.length > 0 && <Row label="Depozyt obejmuje" value={data.depositCovers.join(", ")} />}
      </Section>

      {/* Completeness check */}
      {(() => {
        const missing: string[] = [];
        if (!data.inviteContact) missing.push("Kontakt drugiej strony");
        if (!data.pricingMethod || totalPrice === 0) missing.push("Kwota umowy");
        if (!data.paymentMethod) missing.push("Metoda płatności");
        if (data.category === "wynajem" && !data.rentalDeposit) missing.push("Kaucja");
        return missing.length > 0 ? (
          <div style={{ background: "rgba(220,38,38,0.07)", borderRadius: 10, border: "1px solid rgba(220,38,38,0.3)", padding: 12, marginBottom: 12 }}>
            <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>❗ Uzupełnij przed podpisaniem:</div>
            {missing.map(m => <div key={m} style={{ color: "#dc2626", fontSize: 12, lineHeight: 1.8 }}>• {m}</div>)}
          </div>
        ) : (
          <div style={{ background: "rgba(22,163,74,0.07)", borderRadius: 10, border: "1px solid rgba(22,163,74,0.3)", padding: "10px 14px", marginBottom: 12 }}>
            <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 700 }}>✓ Umowa kompletna — gotowa do podpisania</span>
          </div>
        );
      })()}

      <div style={{ background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", borderRadius: 12, border: "1.5px solid var(--color-primary)", padding: "14px 20px", textAlign: "center", margin: "0 0 8px" }}>
        <div style={{ color: "var(--color-primary)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Łączna kwota umowy</div>
        <div style={{ color: "var(--color-foreground)", fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }}>{totalPrice.toLocaleString("pl-PL")} {data.currency}</div>
      </div>
    </div>
  );
}

// ——— STEP 14: Podpis
function StepPodpis({ data, update, onSign }: { data: WizardData; update: (p: Partial<WizardData>) => void; onSign: () => void }) {
  const [accepted, setAccepted] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const myParty = data.myRole === "contractor" ? data.contractor : data.client;
  const otherParty = data.myRole === "contractor" ? data.client : data.contractor;
  const myLabel = data.myRole === "contractor"
    ? (data.category === "wynajem" ? "Wynajmujący" : data.category === "sprzedaz" ? "Sprzedający" : "Wykonawca")
    : (data.category === "wynajem" ? "Najemca" : data.category === "sprzedaz" ? "Kupujący" : "Zleceniodawca");
  const otherLabel = data.myRole === "contractor"
    ? (data.category === "wynajem" ? "Najemca" : data.category === "sprzedaz" ? "Kupujący" : "Zleceniodawca")
    : (data.category === "wynajem" ? "Wynajmujący" : data.category === "sprzedaz" ? "Sprzedający" : "Wykonawca");
  const hasOtherContact = !!(otherParty.email || otherParty.phone || data.inviteContact);

  return (
    <div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Podpis i zaproszenie</h2>
      <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, marginBottom: 20, lineHeight: 1.5 }}>
        Podpisz jako {myLabel.toLowerCase()} i zaproś drugą stronę.
      </p>

      {/* Mój podpis */}
      <div style={{ ...sectionCard, border: "1.5px solid var(--color-primary)", marginBottom: 16 }}>
        <SectionLabel>Twój podpis ({myLabel})</SectionLabel>
        <div style={{ color: "var(--color-foreground)", fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          {myParty.name || "—"}
        </div>
        <div
          onClick={() => setAccepted(v => !v)}
          style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
            border: `2px solid ${accepted ? "var(--color-primary)" : "var(--color-border)"}`,
            background: accepted ? "var(--color-primary)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {accepted && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>}
          </div>
          <span style={{ color: "var(--color-foreground)", fontSize: 15, lineHeight: 1.6 }}>
            Akceptuję warunki umowy i potwierdzam podpisanie jako {myLabel.toLowerCase()}.
          </span>
        </div>
      </div>

      {/* Zaproszenie drugiej strony */}
      <div style={sectionCard}>
        <SectionLabel>Zaproś {otherLabel.toLowerCase()}</SectionLabel>
        {otherParty.name && (
          <div style={{ color: "var(--color-foreground)", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            {otherParty.name}
          </div>
        )}
        <input
          value={data.inviteContact}
          onChange={e => update({ inviteContact: e.target.value })}
          placeholder="Email, telefon lub @nick"
          style={{ ...inputStyle, marginBottom: 0 }}
        />
        {!hasOtherContact && (
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, marginTop: 6 }}>
            Możesz też skopiować link i wysłać ręcznie po podpisaniu.
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        <button
          onClick={() => { if (accepted) onSign(); }}
          disabled={!accepted}
          style={{ ...btnPrimary, width: "100%", padding: "16px 0", fontSize: 15, opacity: accepted ? 1 : 0.45, cursor: accepted ? "pointer" : "not-allowed" }}
        >
          ✍️ Podpisz{hasOtherContact ? " i wyślij zaproszenie" : " umowę"}
        </button>
        <button
          onClick={() => {
            try { saveDraft(data, 0, `UMW-${new Date().getFullYear()}-draft`); } catch {}
            setDraftSaved(true);
            setTimeout(() => setDraftSaved(false), 2500);
          }}
          style={{ ...btnSecondary, width: "100%", padding: "14px 0", fontSize: 14, color: draftSaved ? "#16a34a" : undefined, borderColor: draftSaved ? "#16a34a" : undefined }}
        >
          {draftSaved ? "✓ Zapisano szkic!" : "💾 Zapisz jako szkic"}
        </button>
      </div>

      <div style={{ marginTop: 20, padding: 14, borderRadius: 12, background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.25)" }}>
        <div style={{ color: "#7c3aed", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Po podpisaniu:</div>
        <div style={{ color: "var(--color-muted-foreground)", fontSize: 12, lineHeight: 1.8 }}>
          🔒 Umowa zostaje zablokowana do edycji<br />
          📤 Druga strona otrzymuje link do przeglądu i akceptacji<br />
          💳 Depozyt aktywuje się po akceptacji obu stron<br />
          📄 Możesz pobrać PDF
        </div>
      </div>
    </div>
  );
}

// ——— SHARE HELPER
async function shareContract(contractId: string, data: WizardData, totalPrice: number) {
  const category = (CATEGORY_LABELS as Record<string, string>)[data.category] ?? data.category;
  const sub = data.subcategory ? ` › ${data.subcategory}` : "";
  const invited = data.inviteContact || "uczestnik";
  const amount = totalPrice > 0 ? `${totalPrice.toLocaleString("pl-PL")} ${data.currency}` : "do ustalenia";
  const url = `${window.location.origin}/kontrakt/${contractId}`;
  const text = `Zaproszenie do umowy #${contractId}\n\n📋 ${category}${sub}\n💰 Kwota: ${amount}\n👤 Wysłał/a: ${invited}\n\nKliknij, żeby przejrzeć i podpisać umowę:`;
  if (navigator.share) {
    try { await navigator.share({ title: `Umowa #${contractId}`, text, url }); } catch {}
  } else {
    await navigator.clipboard.writeText(`${text}\n${url}`);
  }
}

// ——— INVITATION SCREEN (shown right after signing)
function InvitationScreen({ data, contractId, totalPrice, onContinue }: {
  data: WizardData; contractId: string; totalPrice: number; onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const category = (CATEGORY_LABELS as Record<string, string>)[data.category] ?? data.category;
  const invited = data.inviteContact || "—";
  const url = `${window.location.origin}/kontrakt/${contractId}`;

  const handleShare = async () => {
    await shareContract(contractId, data, totalPrice);
  };
  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", maxWidth: "min(560px, 100vw)", margin: "0 auto", padding: "32px 16px 100px", boxSizing: "border-box" }}>
      {/* Sukces */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 56, marginBottom: 10 }}>✅</div>
        <h2 style={{ color: "var(--color-foreground)", fontSize: 26, fontWeight: 800, marginBottom: 6 }}>Umowa podpisana!</h2>
        <div style={{ color: "var(--color-muted-foreground)", fontSize: 14 }}>Nr umowy: <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>#{contractId}</span></div>
      </div>

      {/* Mini karta umowy */}
      <div style={{ ...sectionCard, border: "1.5px solid var(--color-primary)", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ color: "var(--color-primary)", fontSize: 13, fontWeight: 700 }}>{category}{data.subcategory ? ` › ${data.subcategory}` : ""}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>Kwota</span>
          <span style={{ color: "var(--color-foreground)", fontSize: 17, fontWeight: 800 }}>{totalPrice > 0 ? `${totalPrice.toLocaleString("pl-PL")} ${data.currency}` : "Do ustalenia"}</span>
        </div>
        {data.deadlineSingle && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>Termin</span>
            <span style={{ color: "var(--color-foreground)", fontSize: 13, fontWeight: 600 }}>{data.deadlineSingle}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--color-muted-foreground)", fontSize: 13 }}>Zaproszono</span>
          <span style={{ color: "var(--color-foreground)", fontSize: 13, fontWeight: 600 }}>{invited}</span>
        </div>
      </div>

      {/* Share buttons */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={handleShare}
          style={{ ...btnPrimary, width: "100%", padding: "15px", fontSize: 16, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          📤 Udostępnij umowę
        </button>
        <button
          onClick={handleCopy}
          style={{ ...btnSecondary, width: "100%", padding: "12px", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          {copied ? "✅ Skopiowano!" : "📋 Kopiuj link do umowy"}
        </button>
      </div>

      {/* Jak to działa */}
      <div style={{ ...sectionCard, marginBottom: 20 }}>
        <div style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Jak to działa?</div>
        {(data.category === "wynajem" ? [
          { n: "1", t: "Wyślij zaproszenie najemcy" },
          { n: "2", t: "Najemca przegląda i podpisuje umowę" },
          { n: "3", t: "Najemca wpłaca kaucję i pierwszy czynsz" },
          { n: "4", t: "Najem aktywny — śledzisz przebieg na żywo" },
          { n: "5", t: "Protokół wyjściowy i rozliczenie kaucji" },
        ] : data.category === "sprzedaz" ? [
          { n: "1", t: "Wyślij zaproszenie kupującemu" },
          { n: "2", t: "Kupujący przegląda i akceptuje warunki" },
          { n: "3", t: "Kupujący wpłaca uzgodnioną kwotę na escrow" },
          { n: "4", t: "Przekazujesz przedmiot kupującemu" },
          { n: "5", t: "Transakcja zakończona — środki zwolnione" },
        ] : [
          { n: "1", t: "Wyślij zaproszenie drugiej stronie" },
          { n: "2", t: "Druga strona przegląda i podpisuje umowę" },
          { n: "3", t: "Wpłata środków na zabezpieczony escrow" },
          { n: "4", t: "Po wykonaniu pracy zatwierdzasz odbiór" },
          { n: "5", t: "Środki trafiają do wykonawcy" },
        ]).map(s => (
          <div key={s.n} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: 12, background: "var(--color-primary)", color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.n}</div>
            <span style={{ color: "var(--color-muted-foreground)", fontSize: 14, lineHeight: 1.5, paddingTop: 2 }}>{s.t}</span>
          </div>
        ))}
      </div>

      <button onClick={onContinue} style={{ ...btnSecondary, width: "100%", padding: "13px", fontSize: 15 }}>
        → Śledź umowę na żywo
      </button>
    </div>
  );
}

// ——— CONTRACT DOCUMENT OVERLAY
function ContractDocument({ data, contractId, onClose }: { data: WizardData; contractId: string; onClose: () => void }) {
  const [copiedDoc, setCopiedDoc] = useState(false);
  const totalPrice = calcTotal(data);
  const category = (CATEGORY_LABELS as Record<string, string>)[data.category] ?? data.category;
  const clientLabel = data.category === "wynajem" ? "Najemca" : data.category === "sprzedaz" ? "Kupujący" : "Zleceniodawca";
  const contractorLabel = data.category === "wynajem" ? "Wynajmujący" : data.category === "sprzedaz" ? "Sprzedający" : "Wykonawca";
  const today = new Date().toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });

  const pricingLabel = ({
    fixed: "Cena ryczałtowa", hourly: "Stawka godzinowa", unit: "Za sztukę",
    stages: "Płatność etapami", per_day: "Za dzień", per_week: "Za tydzień", per_month: "Za miesiąc",
    m2: "Za m²", materials_labor: "Materiały + robocizna",
  } as Record<string, string>)[data.pricingMethod] ?? data.pricingMethod;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, overflowY: "auto", padding: "16px" }}>
      <div style={{ background: "var(--color-background)", borderRadius: 16, maxWidth: "min(540px, 100%)", margin: "0 auto", padding: "24px 20px 32px", boxSizing: "border-box", position: "relative" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ color: "var(--color-primary)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Podgląd umowy</div>
            <div style={{ color: "var(--color-foreground)", fontSize: 18, fontWeight: 800 }}>#{contractId}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: "var(--color-muted-foreground)", fontSize: 24, cursor: "pointer", padding: 4 }}>×</button>
        </div>

        {/* Document content */}
        <div style={{ fontFamily: "'Georgia', serif", color: "var(--color-foreground)", lineHeight: 1.7 }}>
          <div style={{ textAlign: "center", marginBottom: 20, borderBottom: "1px solid var(--color-border)", paddingBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>UMOWA NR #{contractId}</div>
            <div style={{ fontSize: 13, color: "var(--color-muted-foreground)" }}>z dnia {today}</div>
          </div>

          {[
            { par: "§1. STRONY UMOWY", content: (
              <div style={{ fontSize: 13 }}>
                <p><b>{clientLabel}:</b> {data.client.name || data.inviteContact || "—"}</p>
                <p><b>{contractorLabel}:</b> {data.contractor.name || "—"}</p>
              </div>
            )},
            { par: "§2. PRZEDMIOT UMOWY", content: (
              <div style={{ fontSize: 13 }}>
                <p><b>Kategoria:</b> {category}{data.subcategory ? ` › ${data.subcategory}` : ""}{data.customTitle ? ` — ${data.customTitle}` : ""}</p>
                {data.scopeDescription && <p><b>Opis:</b> {data.scopeDescription}</p>}
                {data.customDesc && <p>{data.customDesc}</p>}
                {data.saleItems.length > 0 && data.saleItems.map((i, idx) => (
                  <p key={i.id}>{idx + 1}. {i.name}{i.condition ? ` — ${i.condition}` : ""}{i.serial ? ` (nr: ${i.serial})` : ""}</p>
                ))}
                {data.category === "wynajem" && data.rentalTenants > 1 && <p><b>Liczba najemców:</b> {data.rentalTenants}</p>}
                {data.category === "wynajem" && data.rentalFurnitured && <p><b>Umeblowanie:</b> Wliczone w najem</p>}
                {data.category === "wynajem" && data.rentalParking && <p><b>Parking:</b> Wliczony w czynsz</p>}
                {data.category === "wynajem" && data.rentalPets && <p><b>Zwierzęta:</b> {({ allowed: "Dozwolone", not_allowed: "Niedozwolone", allowed_deposit: "Dozwolone za dodatkową kaucją" } as Record<string,string>)[data.rentalPets]}</p>}
                {data.category === "wynajem" && data.rentalKeys > 0 && <p><b>Liczba kluczy:</b> {data.rentalKeys} kpl.</p>}
                {data.category === "wynajem" && data.rentalNoticePeriod > 0 && <p><b>Okres wypowiedzenia:</b> {data.rentalNoticePeriod} dni</p>}
                {data.category === "wynajem" && data.rentalConditionBefore && <p><b>Stan przy wydaniu:</b> {data.rentalConditionBefore.slice(0, 120)}{data.rentalConditionBefore.length > 120 ? "…" : ""}</p>}
                {data.category === "wynajem" && data.rentalUtilities && <p><b>Media:</b> {({ included: "Wliczone w czynsz", tenant: "Płaci najemca", split: "Podział 50/50" } as Record<string,string>)[data.rentalUtilities]}</p>}
                {data.category === "wynajem" && <p><b>Podnajem:</b> {data.rentalSubletting ? "Dozwolony" : "Niedozwolony"}</p>}
                {data.category === "wynajem" && data.rentalDepositReturnDays > 0 && <p><b>Zwrot kaucji:</b> do {data.rentalDepositReturnDays} dni od zdania lokalu</p>}
                {data.category === "sprzedaz" && data.subcategory === "Auto/pojazd" && data.vehicle && (data.vehicle.fuel || data.vehicle.gearbox || data.vehicle.hasServiceBook !== undefined) && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--color-border)" }}>
                    {data.vehicle.fuel && <p><b>Paliwo:</b> {data.vehicle.fuel}</p>}
                    {data.vehicle.gearbox && <p><b>Skrzynia biegów:</b> {data.vehicle.gearbox}</p>}
                    {data.vehicle.mileage && <p><b>Przebieg:</b> {data.vehicle.mileage} km</p>}
                    <p><b>Dwa kluczyki:</b> {data.vehicle.hasTwoKeys ? "Tak" : "Nie"}</p>
                    <p><b>Książka serwisowa:</b> {data.vehicle.hasServiceBook ? "Tak" : "Nie"}</p>
                    <p><b>OC opłacone:</b> {data.vehicle.hasOC ? "Tak" : "Nie"}</p>
                    <p><b>Brak wypadków:</b> {data.vehicle.noAccidents ? "Tak" : "Nie"}</p>
                    <p><b>Brak zastawów:</b> {data.vehicle.noPledge ? "Tak" : "Nie"}</p>
                  </div>
                )}
                {data.category === "sprzedaz" && data.electronics?.imei && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--color-border)" }}>
                    <p><b>IMEI:</b> {data.electronics.imei}</p>
                    {(data.electronics.batteryPct || 0) > 0 && <p><b>Stan baterii:</b> {data.electronics.batteryPct}%</p>}
                    <p><b>Blokada konta (iCloud/Google):</b> {data.electronics.icloudLock ? "Tak — wymaga odblokowania" : "Nie"}</p>
                  </div>
                )}
              </div>
            )},
            { par: "§3. WYNAGRODZENIE", content: (
              <div style={{ fontSize: 13 }}>
                <p><b>Model rozliczenia:</b> {pricingLabel}</p>
                <p><b>Kwota łączna:</b> {totalPrice.toLocaleString("pl-PL")} {data.currency}</p>
                {data.paymentMethod && <p><b>Metoda płatności:</b> {({ upfront: "Z góry", after: "Po wykonaniu", stages: "Etapami", deposit: "Depozyt escrow", partial_deposit: "Częściowy depozyt" } as Record<string,string>)[data.paymentMethod] ?? data.paymentMethod}</p>}
                {data.rentalDeposit > 0 && <p><b>Kaucja:</b> {data.rentalDeposit.toLocaleString("pl-PL")} {data.currency}</p>}
              </div>
            )},
            { par: "§4. TERMIN", content: (
              <div style={{ fontSize: 13 }}>
                {data.deadlineSingle && <p><b>Data realizacji:</b> {data.deadlineSingle}</p>}
                {data.deadlineFrom && <p><b>Od:</b> {data.deadlineFrom}</p>}
                {data.deadlineTo && <p><b>Do:</b> {data.deadlineTo}</p>}
                {data.deadlineType === "cyclic" && data.cyclicInterval > 0 && (
                  <p><b>Cykl:</b> co {data.cyclicInterval} {({ days: "dni", weeks: "tygodnie", months: "miesiące" } as Record<string,string>)[data.cyclicUnit]}</p>
                )}
                {data.rentalFrom && <p><b>Data wydania:</b> {data.rentalFrom}</p>}
                {data.rentalTo && <p><b>Data zwrotu:</b> {data.rentalTo}</p>}
                {data.deadlineType === "tbd" && <p>Termin do uzgodnienia przez strony.</p>}
                {data.deadlineType === "stages" && data.paymentStages.some(s => s.deadline) && data.paymentStages.map((s, i) => s.deadline ? (
                  <p key={s.id}><b>Etap {i + 1}{s.name ? ` (${s.name})` : ""}:</b> do {s.deadline}</p>
                ) : null)}
              </div>
            )},
            { par: "§5. WARUNKI", content: (
              <div style={{ fontSize: 13 }}>
                {data.warranty && <p><b>Gwarancja:</b> {data.warrantyDays} dni</p>}
                {data.latePenalty && <p><b>Kara za opóźnienie:</b> {data.latePenaltyAmount} {data.currency}/dzień</p>}
                {!data.warranty && !data.latePenalty && <p>Bez dodatkowych warunków.</p>}
              </div>
            )},
            { par: "§6. PROTOKÓŁ ODBIORU", content: (
              <div style={{ fontSize: 13 }}>
                <p>Wymagany protokół odbioru przed zwolnieniem środków z depozytu.</p>
                {data.protocolDesc && <p><b>Uwagi:</b> {data.protocolDesc}</p>}
              </div>
            )},
          ].map(s => (
            <div key={s.par} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: "var(--color-primary)" }}>{s.par}</div>
              {s.content}
            </div>
          ))}

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-muted-foreground)" }}>
            <div>Podpis {clientLabel}: ___________</div>
            <div>Podpis {contractorLabel}: ___________</div>
          </div>
        </div>

        {/* Share from document */}
        <button
          onClick={() => shareContract(contractId, data, totalPrice)}
          style={{ ...btnPrimary, width: "100%", padding: "13px", fontSize: 15, marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          📤 Udostępnij dokument
        </button>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={() => window.print()}
            style={{ ...btnSecondary, flex: 1, padding: "11px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            🖨 Drukuj
          </button>
          <button
            onClick={async () => {
              const pricingLabelMap: Record<string,string> = { fixed:"Ryczałt", hourly:"Stawka godzinowa", unit:"Za sztukę", stages:"Etapami", per_day:"Za dzień", per_week:"Za tydzień", per_month:"Za miesiąc", m2:"Za m²", materials_labor:"Materiały + robocizna" };
              const lines = [
                `UMOWA NR #${contractId}`,
                `z dnia ${today}`,
                "",
                `§1. STRONY UMOWY`,
                `${clientLabel}: ${data.client.name || data.inviteContact || "—"}`,
                `${contractorLabel}: ${data.contractor.name || "—"}`,
                "",
                `§2. PRZEDMIOT UMOWY`,
                `Kategoria: ${category}${data.subcategory ? ` › ${data.subcategory}` : ""}`,
                data.scopeDescription ? `Opis: ${data.scopeDescription}` : "",
                "",
                `§3. WYNAGRODZENIE`,
                `Model rozliczenia: ${pricingLabelMap[data.pricingMethod] ?? data.pricingMethod}`,
                `Kwota łączna: ${totalPrice.toLocaleString("pl-PL")} ${data.currency}`,
                data.rentalDeposit > 0 ? `Kaucja: ${data.rentalDeposit.toLocaleString("pl-PL")} ${data.currency}` : "",
                "",
                `§4. TERMIN`,
                data.deadlineSingle ? `Data realizacji: ${data.deadlineSingle}` : "",
                data.deadlineFrom ? `Od: ${data.deadlineFrom}` : "",
                data.deadlineTo ? `Do: ${data.deadlineTo}` : "",
                data.deadlineType === "tbd" ? "Termin do uzgodnienia przez strony." : "",
                "",
                `§5. WARUNKI`,
                data.warranty ? `Gwarancja: ${data.warrantyDays} dni` : "",
                data.latePenalty ? `Kara za opóźnienie: ${data.latePenaltyAmount} ${data.currency}/dzień` : "",
                "",
                `§6. PROTOKÓŁ ODBIORU`,
                "Wymagany protokół odbioru przed zwolnieniem środków z depozytu.",
                data.protocolDesc ? `Uwagi: ${data.protocolDesc}` : "",
                "",
                `Podpis ${clientLabel}: ___________`,
                `Podpis ${contractorLabel}: ___________`,
              ].filter(l => l !== "").join("\n");
              await navigator.clipboard.writeText(lines);
              setCopiedDoc(true);
              setTimeout(() => setCopiedDoc(false), 2000);
            }}
            style={{ ...btnSecondary, flex: 1, padding: "11px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: copiedDoc ? "color-mix(in srgb, #16a34a 10%, transparent)" : undefined, borderColor: copiedDoc ? "#16a34a" : undefined, color: copiedDoc ? "#16a34a" : undefined }}
          >
            {copiedDoc ? "✓ Skopiowano!" : "📋 Kopiuj tekst"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ——— CONTRACT LIFECYCLE (post-wizard escrow flow)
type ContractPhase = "" | "awaiting_counterparty" | "awaiting_deposit" | "in_progress" | "awaiting_release" | "completed";

// ——— RATING SCREEN
function RatingScreen({ contractId, data, onDone }: { contractId: string; data: WizardData; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const save = () => {
    try {
      const existing = loadContracts();
      const idx = existing.findIndex(c => c.contractId === contractId);
      if (idx >= 0) {
        existing[idx].rating = stars;
        existing[idx].ratingNote = note;
        localStorage.setItem(LS_CONTRACTS_KEY, JSON.stringify(existing));
      }
    } catch {}
    setSaved(true);
    setTimeout(onDone, 800);
  };

  const category = CAT_LABELS[data.category] || "Umowa";
  const sub = data.subcategory ? ` › ${data.subcategory}` : "";

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", maxWidth: "min(560px, 100vw)", margin: "0 auto", padding: "40px 20px 100px", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>{saved ? "🎊" : "🎉"}</div>
      <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 900, textAlign: "center", marginBottom: 4 }}>
        {saved ? "Ocena zapisana!" : "Umowa zakończona!"}
      </h2>
      <div style={{ color: "var(--color-muted-foreground)", fontSize: 14, textAlign: "center", marginBottom: 32 }}>
        {category}{sub} · #{contractId}
      </div>
      {!saved && (
        <div style={{ width: "100%", maxWidth: 360 }}>
          <div style={{ color: "var(--color-foreground)", fontSize: 15, fontWeight: 700, textAlign: "center", marginBottom: 16 }}>
            Jak oceniasz tę współpracę?
          </div>
          {/* Stars */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <span
                key={n}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setStars(n)}
                style={{ fontSize: 40, cursor: "pointer", color: n <= (hover || stars) ? "#f59e0b" : "var(--color-border)", transition: "color 0.1s" }}
              >
                ★
              </span>
            ))}
          </div>
          <div style={{ textAlign: "center", marginBottom: 20, minHeight: 22, color: "#f59e0b", fontSize: 14, fontWeight: 700 }}>
            {(["", "Słabo", "Przeciętnie", "Dobrze", "Bardzo dobrze", "Świetnie!"])[hover || stars] || ""}
          </div>
          {stars > 0 && (
            <div style={{ marginBottom: 20 }}>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Opcjonalny komentarz..."
                style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-foreground)", fontSize: 14, resize: "vertical", minHeight: 80, fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>
          )}
          <button
            onClick={save}
            disabled={stars === 0}
            style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: stars > 0 ? "var(--color-primary)" : "var(--color-border)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: stars > 0 ? "pointer" : "not-allowed", marginBottom: 10 }}
          >
            Zapisz ocenę
          </button>
          <button
            onClick={onDone}
            style={{ width: "100%", padding: "14px", borderRadius: 12, border: "1.5px solid var(--color-border)", background: "transparent", color: "var(--color-muted-foreground)", fontSize: 15, cursor: "pointer" }}
          >
            Pomiń
          </button>
        </div>
      )}
    </div>
  );
}

function ContractLifecycle({
  data, phase, setPhase, totalPrice, contractId, showDocument, setShowDocument, onNewContract, events,
}: {
  data: WizardData;
  phase: ContractPhase;
  setPhase: (p: ContractPhase) => void;
  totalPrice: number;
  contractId: string;
  showDocument: boolean;
  setShowDocument: (v: boolean) => void;
  onNewContract: () => void;
  events: ActivityEvent[];
}) {
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeConfirm, setDisputeConfirm] = useState<"fixes" | "mediation" | "cancel" | null>(null);
  const [disputeNote, setDisputeNote] = useState("");
  const [showProtocol, setShowProtocol] = useState(false);
  const [protocolStatus, setProtocolStatus] = useState<"" | "accepted" | "with_notes" | "needs_fixes" | "rejected">("");
  const [protocolDesc, setProtocolDesc] = useState("");
  const [protocolPhotos, setProtocolPhotos] = useState(false);
  const [paymentSentAt, setPaymentSentAt] = useState<string | null>(() => {
    try { return loadContracts().find(c => c.contractId === contractId)?.paymentSentAt || null; } catch { return null; }
  });

  const savePaymentSent = () => {
    const ts = new Date().toISOString();
    try {
      const existing = loadContracts();
      const idx = existing.findIndex(c => c.contractId === contractId);
      if (idx >= 0) { existing[idx].paymentSentAt = ts; localStorage.setItem(LS_CONTRACTS_KEY, JSON.stringify(existing)); }
    } catch {}
    setPaymentSentAt(ts);
    addContractEvent(contractId, { type: "phase_change", icon: "💸", label: "Klient potwierdził wysłanie przelewu" });
  };

  const confirmPaymentReceived = () => {
    const ts = new Date().toISOString();
    try {
      const existing = loadContracts();
      const idx = existing.findIndex(c => c.contractId === contractId);
      if (idx >= 0) { existing[idx].paymentConfirmedAt = ts; localStorage.setItem(LS_CONTRACTS_KEY, JSON.stringify(existing)); }
    } catch {}
    addContractEvent(contractId, { type: "phase_change", icon: "✅", label: "Wykonawca potwierdził odbiór przelewu — realizacja rozpoczęta" });
    setPhase("in_progress");
  };

  const sharePaymentRequest = () => {
    const title = data.paymentTitle || [
      data.category === "sprzedaz" ? "Sprzedaż" : data.category === "wynajem" ? "Wynajem" : "Umowa",
      data.subcategory || "",
    ].filter(Boolean).join(" ");
    const lines = [
      "Cześć! Proszę o przelew:",
      data.bankAccount ? `Konto: ${data.bankAccount}` : null,
      data.bankBlik ? `BLIK / Tel: ${data.bankBlik}` : null,
      `Tytuł: ${title}`,
      `Kwota: ${totalPrice.toLocaleString("pl-PL")} ${data.currency}`,
      "Po potwierdzeniu odbioru od razu ruszamy z realizacją.",
    ].filter(Boolean).join("\n");
    if (navigator.share) navigator.share({ text: lines });
    else navigator.clipboard.writeText(lines);
    addContractEvent(contractId, { type: "share", icon: "📤", label: "Prośba o przelew wysłana" });
  };

  const sendPaymentReminder = () => {
    const msg = `Cześć! Przypominam o płatności: ${totalPrice.toLocaleString("pl-PL")} ${data.currency}. ${data.bankAccount ? `Konto: ${data.bankAccount}. ` : ""}Gdy przelew dotrze, od razu zaczynam realizację.`;
    if (navigator.share) navigator.share({ text: msg });
    else navigator.clipboard.writeText(msg);
    addContractEvent(contractId, { type: "note", icon: "🔔", label: "Przypomnienie o płatności wysłane" });
  };

  const handleDispute = (type: "fixes" | "mediation" | "cancel") => {
    if (type === "fixes") {
      setPhase("in_progress");
      addContractEvent(contractId, { type: "dispute", icon: "🔁", label: "Poprawki zgłoszone przez klienta" });
    } else if (type === "mediation") {
      addContractEvent(contractId, { type: "dispute", icon: "⚖️", label: "Mediacja zgłoszona — oczekuje na arbitra" });
    } else if (type === "cancel") {
      setPhase("completed");
      addContractEvent(contractId, { type: "dispute", icon: "❌", label: "Umowa anulowana — środki zwrócone" });
    }
    setDisputeOpen(false);
    setDisputeConfirm(null);
  };

  const isClient = data.myRole === "client";
  const myParty = isClient ? data.client : data.contractor;
  const otherParty = isClient ? data.contractor : data.client;
  const clientLabel = data.category === "wynajem" ? "Najemca" : data.category === "sprzedaz" ? "Kupujący" : "Zleceniodawca";
  const contractorLabel = data.category === "wynajem" ? "Wynajmujący" : data.category === "sprzedaz" ? "Sprzedający" : "Wykonawca";
  const otherLabel = isClient ? contractorLabel : clientLabel;
  const invited = data.inviteContact || otherParty.email || otherParty.phone || otherLabel;

  const PHASES: { id: ContractPhase; icon: string; label: string; who: string; desc: string }[] =
    data.category === "wynajem" ? [
      { id: "awaiting_counterparty", icon: "✍️", label: "Podpisanie umowy najmu",            who: contractorLabel, desc: `${contractorLabel} przegląda i podpisuje umowę najmu` },
      { id: "awaiting_deposit",      icon: "💳", label: "Wpłata kaucji i pierwszego czynszu", who: clientLabel,     desc: `${clientLabel} wpłaca kaucję — zabezpieczona do końca najmu` },
      { id: "in_progress",           icon: "🏠", label: "Najem aktywny",                      who: clientLabel,     desc: `Najem trwa zgodnie z warunkami umowy` },
      { id: "awaiting_release",      icon: "📋", label: "Zgłoszenie zakończenia najmu",        who: clientLabel,     desc: `${clientLabel} zgłasza zakończenie i zdaje lokal` },
      { id: "completed",             icon: "🔑", label: "Protokół wyjściowy i zwrot kaucji",   who: contractorLabel, desc: `${contractorLabel} zatwierdza stan lokalu → kaucja zwrócona lub zatrzymana` },
    ] : data.category === "sprzedaz" ? [
      { id: "awaiting_counterparty", icon: "✍️", label: "Podpisanie umowy",         who: contractorLabel, desc: `${contractorLabel} przegląda i akceptuje warunki` },
      { id: "awaiting_deposit",      icon: "💳", label: "Wpłata ceny sprzedaży",    who: clientLabel,     desc: `${clientLabel} wpłaca uzgodnioną kwotę` },
      { id: "in_progress",           icon: "📦", label: "Przekazanie przedmiotu",   who: contractorLabel, desc: `${contractorLabel} przygotowuje i przekazuje przedmiot kupującemu` },
      { id: "awaiting_release",      icon: "📋", label: "Odbiór przez kupującego",  who: clientLabel,     desc: `${clientLabel} odbiera i sprawdza przedmiot` },
      { id: "completed",             icon: "🔓", label: "Transakcja zakończona",    who: contractorLabel, desc: `Środki przekazane — własność przeszła na ${clientLabel.toLowerCase()}` },
    ] : [
      { id: "awaiting_counterparty", icon: "✍️", label: "Akceptacja umowy",        who: contractorLabel, desc: `${contractorLabel} przegląda i podpisuje umowę` },
      { id: "awaiting_deposit",      icon: "💳", label: "Wpłata na escrow",         who: clientLabel,     desc: `${clientLabel} wpłaca środki — zablokowane do odbioru` },
      { id: "in_progress",           icon: "🔨", label: "Realizacja",               who: contractorLabel, desc: `${contractorLabel} realizuje zlecenie` },
      { id: "awaiting_release",      icon: "📋", label: "Zgłoszenie wykonania",     who: contractorLabel, desc: `${contractorLabel} wysyła potwierdzenie wykonania` },
      { id: "completed",             icon: "🔓", label: "Odblokowanie środków",     who: clientLabel,     desc: `${clientLabel} zatwierdza odbiór → środki trafiają do ${contractorLabel.toLowerCase()}a` },
    ];

  const phaseOrder = ["awaiting_counterparty", "awaiting_deposit", "in_progress", "awaiting_release", "completed"];
  const currentIdx = phaseOrder.indexOf(phase);

  type CTA = { label: string; action: () => void; color?: string } | null;
  const getCTA = (): CTA => {
    if (phase === "awaiting_counterparty" && !isClient)
      return { label: `✍️ Podpisz jako ${contractorLabel.toLowerCase()} i zaakceptuj`, action: () => setPhase("awaiting_deposit") };
    if (phase === "awaiting_deposit" && isClient && !paymentSentAt) {
      const payLabel = data.category === "wynajem"
        ? `💸 Wysłałem kaucję i pierwszy czynsz${totalPrice > 0 ? ` — ${totalPrice.toLocaleString("pl-PL")} ${data.currency}` : ""}`
        : `💸 Wysłałem przelew${totalPrice > 0 ? ` — ${totalPrice.toLocaleString("pl-PL")} ${data.currency}` : ""}`;
      return { label: payLabel, action: savePaymentSent };
    }
    if (phase === "awaiting_deposit" && !isClient && paymentSentAt) {
      const confirmLabel = data.category === "wynajem"
        ? "✅ Potwierdzam wpłatę kaucji → najem aktywny"
        : "✅ Potwierdzam odbiór przelewu → start realizacji";
      return { label: confirmLabel, action: confirmPaymentReceived, color: "#16a34a" };
    }
    if (phase === "in_progress" && !isClient) {
      const submitLabel = data.category === "wynajem"
        ? "📋 Zgłoś zakończenie najmu"
        : data.category === "sprzedaz"
        ? "📦 Zgłoś przekazanie przedmiotu"
        : "📤 Zgłoś wykonanie zlecenia";
      return { label: submitLabel, action: () => setPhase("awaiting_release") };
    }
    if (phase === "awaiting_release" && isClient) {
      const releaseLabel = data.category === "wynajem"
        ? "🔑 Zatwierdź odbiór lokalu i rozlicz kaucję"
        : data.category === "sprzedaz"
        ? "🔓 Potwierdź odbiór przedmiotu"
        : "🔓 Potwierdź odbiór i odblokuj środki";
      return { label: showProtocol ? "↑ Zwiń protokół" : releaseLabel, action: () => setShowProtocol(v => !v), color: showProtocol ? undefined : "#16a34a" };
    }
    return null;
  };

  const cta = getCTA();
  const isFinished = phase === "completed";
  const phaseTip: Record<string, string> = data.category === "wynajem" ? {
    awaiting_deposit: "Kaucja jest zabezpieczona i zostanie zwrócona po zakończeniu najmu, jeżeli lokal będzie bez uszkodzeń.",
    in_progress: "Najem aktywny. Po zakończeniu umowy zgłoś zdanie lokalu.",
    awaiting_release: "Sprawdź stan lokalu przed zatwierdzeniem odbioru. Masz zastrzeżenia? Możesz zgłosić problem.",
  } : data.category === "sprzedaz" ? {
    awaiting_deposit: "Środki są zabezpieczone. Sprzedający je otrzyma po przekazaniu i zatwierdzeniu odbioru przedmiotu.",
    in_progress: "Sprzedający przygotowuje i przekazuje przedmiot. Otrzymasz powiadomienie gdy zgłosi gotowość.",
    awaiting_release: "Odbierz i sprawdź przedmiot. Masz zastrzeżenia? Możesz poprosić o wyjaśnienie lub zgłosić problem.",
  } : {
    awaiting_deposit: "Środki trafiają na zabezpieczony rachunek escrow. Wykonawca nie otrzyma ich dopóki nie zatwierdzisz odbioru.",
    in_progress: "Prace w toku. Otrzymasz powiadomienie gdy wykonawca zgłosi ukończenie.",
    awaiting_release: "Sprawdź wykonaną pracę przed zatwierdzeniem. Masz zastrzeżenia? Możesz poprosić o poprawki.",
  };
  const currentTip = phaseTip[phase];
  const finishedTitle = data.category === "wynajem" ? "Najem zakończony!" : data.category === "sprzedaz" ? "Transakcja zakończona!" : "Zlecenie zakończone!";
  const finishedDesc = data.category === "wynajem" ? `Najem dobiegł końca. Kaucja rozliczona przez ${contractorLabel.toLowerCase()}.` : data.category === "sprzedaz" ? `Transakcja sfinalizowana. Środki przekazane ${contractorLabel.toLowerCase()}cy.` : `Środki zostały odblokowane i przekazane ${contractorLabel.toLowerCase()}cy.`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", maxWidth: "min(560px, 100vw)", margin: "0 auto", padding: "20px 16px 100px", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        {isFinished ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 10, textAlign: "center" }}>{data.category === "wynajem" ? "🏠" : data.category === "sprzedaz" ? "🤝" : "🎉"}</div>
            <h2 style={{ color: "var(--color-foreground)", fontSize: 24, fontWeight: 800, marginBottom: 6, textAlign: "center" }}>{finishedTitle}</h2>
            <p style={{ color: "var(--color-muted-foreground)", fontSize: 15, textAlign: "center", lineHeight: 1.6 }}>
              {finishedDesc}
            </p>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div>
                <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>📄 Umowa #{contractId}</div>
                <h2 style={{ color: "var(--color-foreground)", fontSize: 22, fontWeight: 800, margin: 0 }}>Umowa w toku</h2>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => shareContract(contractId, data, totalPrice)} title="Udostępnij" style={{ width: 38, height: 38, borderRadius: 19, border: "1.5px solid var(--color-border)", background: "var(--color-card)", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>📤</button>
                <button onClick={() => setShowDocument(true)} title="Podgląd umowy" style={{ width: 38, height: 38, borderRadius: 19, border: "1.5px solid var(--color-border)", background: "var(--color-card)", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>📋</button>
              </div>
            </div>
            <p style={{ color: "var(--color-muted-foreground)", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
              Ty: <b>{myParty.name || "—"}</b> · Druga strona: <b>{otherParty.name || invited}</b>
            </p>
          </>
        )}
      </div>

      {/* Amount badge */}
      {totalPrice > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "color-mix(in srgb, var(--color-primary) 10%, transparent)", borderRadius: 12, border: "1.5px solid var(--color-primary)", padding: "12px 16px", marginBottom: 20 }}>
          <div>
            <div style={{ color: "var(--color-muted-foreground)", fontSize: 12, marginBottom: 2 }}>Kwota umowy</div>
            <div style={{ color: "var(--color-primary)", fontSize: 22, fontWeight: 800 }}>{totalPrice.toLocaleString("pl-PL")} {data.currency}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "var(--color-muted-foreground)", fontSize: 12, marginBottom: 2 }}>Escrow</div>
            <div style={{ color: phase === "in_progress" || phase === "awaiting_release" ? "#f59e0b" : phase === "completed" ? "#16a34a" : "var(--color-muted-foreground)", fontSize: 14, fontWeight: 700 }}>
              {phase === "awaiting_counterparty" || phase === "awaiting_deposit" ? "Oczekuje na wpłatę"
                : phase === "in_progress" || phase === "awaiting_release" ? "🔒 Zablokowane"
                : "✅ Wypłacone"}
            </div>
          </div>
        </div>
      )}

      {/* Phase timeline */}
      <div style={{ marginBottom: 24 }}>
        {PHASES.map((p, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const pending = i > currentIdx;
          return (
            <div key={p.id} style={{ display: "flex", gap: 14, marginBottom: i < PHASES.length - 1 ? 0 : 0 }}>
              {/* Line + dot */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16,
                  background: done ? "#16a34a" : active ? "var(--color-primary)" : "var(--color-card)",
                  border: done ? "2px solid #16a34a" : active ? "2px solid var(--color-primary)" : "2px solid var(--color-border)",
                }}>
                  {done ? <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>✓</span> : <span style={{ filter: pending ? "grayscale(1) opacity(0.4)" : "none" }}>{p.icon}</span>}
                </div>
                {i < PHASES.length - 1 && (
                  <div style={{ width: 2, flex: 1, minHeight: 20, background: done ? "#16a34a" : "var(--color-border)", margin: "3px 0" }} />
                )}
              </div>
              {/* Content */}
              <div style={{ paddingBottom: 18, flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ color: done ? "#16a34a" : active ? "var(--color-foreground)" : "var(--color-muted-foreground)", fontSize: 15, fontWeight: active || done ? 700 : 500 }}>
                    {p.label}
                  </span>
                  {active && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-primary)", background: "color-mix(in srgb, var(--color-primary) 15%, transparent)", borderRadius: 20, padding: "2px 8px" }}>TERAZ</span>}
                </div>
                <div style={{ color: "var(--color-muted-foreground)", fontSize: 13, lineHeight: 1.5 }}>{p.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Context tip */}
      {currentTip && (
        <div style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, var(--color-primary) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)", marginBottom: 16 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
          <span style={{ color: "var(--color-muted-foreground)", fontSize: 13, lineHeight: 1.6 }}>{currentTip}</span>
        </div>
      )}

      {/* Awaiting counterparty: re-share option */}
      {phase === "awaiting_counterparty" && (
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={{ color: "var(--color-foreground)", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Zaproszono: <span style={{ color: "var(--color-primary)" }}>{invited}</span>
          </div>
          <button
            onClick={() => shareContract(contractId, data, totalPrice)}
            style={{ ...btnSecondary, width: "100%", padding: "10px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            📤 Wyślij zaproszenie ponownie
          </button>
        </div>
      )}

      {/* Transfer details card — shown for client when awaiting deposit */}
      {phase === "awaiting_deposit" && isClient && (() => {
        const account = data.bankAccount;
        const blik = data.bankBlik;
        const title = data.paymentTitle || [
          data.category === "sprzedaz" ? "Sprzedaż" : data.category === "wynajem" ? "Wynajem" : "Umowa",
          data.subcategory || "",
          (isClient ? data.contractor.name : data.client.name) || "",
        ].filter(Boolean).join(" — ").slice(0, 60);
        const recipientName = data.contractor.name || data.inviteContact || "Wykonawca";
        const [copied, setCopied] = useState(false);

        if (!account && !blik) {
          return (
            <div style={{ ...sectionCard, marginBottom: 16 }}>
              <div style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>💳 Dane do przelewu</div>
              <div style={{ color: "var(--color-muted-foreground)", fontSize: 13, lineHeight: 1.6 }}>
                Wykonawca nie podał danych bankowych. Skontaktuj się z nim bezpośrednio: <strong>{invited}</strong>
              </div>
            </div>
          );
        }

        const copyAll = async () => {
          const lines = [
            account ? `Konto: ${account}` : null,
            blik ? `BLIK/Tel: ${blik}` : null,
            `Tytuł: ${title}`,
            `Kwota: ${totalPrice.toLocaleString("pl-PL")} ${data.currency}`,
            `Odbiorca: ${recipientName}`,
          ].filter(Boolean).join("\n");
          await navigator.clipboard.writeText(lines);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        };

        return (
          <div style={{ ...sectionCard, marginBottom: 16, border: "1.5px solid color-mix(in srgb, var(--color-primary) 40%, transparent)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 700 }}>💳 Dane do przelewu</div>
              <button
                onClick={copyAll}
                style={{ background: copied ? "color-mix(in srgb, #16a34a 12%, transparent)" : "color-mix(in srgb, var(--color-primary) 10%, transparent)", border: `1px solid ${copied ? "#16a34a" : "color-mix(in srgb, var(--color-primary) 30%, transparent)"}`, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: copied ? "#16a34a" : "var(--color-primary)" }}
              >
                {copied ? "✓ Skopiowano!" : "📋 Kopiuj"}
              </button>
            </div>
            {[
              { label: "Odbiorca", value: recipientName },
              account ? { label: "Numer konta", value: account, mono: true } : null,
              blik ? { label: "BLIK / Telefon", value: blik } : null,
              { label: "Tytuł przelewu", value: title },
              { label: "Kwota", value: `${totalPrice.toLocaleString("pl-PL")} ${data.currency}`, highlight: true },
            ].filter(Boolean).map((row: any) => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: "1px solid var(--color-border)" }}>
                <span style={{ color: "var(--color-muted-foreground)", fontSize: 12, flexShrink: 0, marginRight: 8 }}>{row.label}</span>
                <span style={{ color: row.highlight ? "var(--color-primary)" : "var(--color-foreground)", fontSize: row.highlight ? 15 : 13, fontWeight: row.highlight ? 800 : 500, fontFamily: row.mono ? "monospace" : undefined, textAlign: "right", wordBreak: "break-all" }}>{row.value}</span>
              </div>
            ))}
            <button
              onClick={() => shareContract(contractId, data, totalPrice)}
              style={{ ...btnSecondary, width: "100%", padding: "10px", fontSize: 13, marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              📤 Udostępnij dane do przelewu
            </button>
          </div>
        );
      })()}

      {/* Payment sent status badge */}
      {phase === "awaiting_deposit" && paymentSentAt && (
        <div style={{ ...sectionCard, marginBottom: 16, border: `1.5px solid ${isClient ? "#16a34a" : "var(--color-primary)"}` }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>💸</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Przelew wysłany</div>
              <div style={{ color: "var(--color-muted-foreground)", fontSize: 13, lineHeight: 1.5 }}>
                {isClient
                  ? "Czekasz na potwierdzenie odbioru przez wykonawcę"
                  : `${otherParty.name || invited} potwierdził/a wysłanie — sprawdź swoje konto`}
              </div>
              <div style={{ color: "#16a34a", fontSize: 11, marginTop: 3 }}>
                {new Date(paymentSentAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} {new Date(paymentSentAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contractor payment tools — awaiting_deposit */}
      {phase === "awaiting_deposit" && !isClient && (
        <div style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, marginBottom: paymentSentAt ? 6 : 10 }}>
            {paymentSentAt ? "⏳ Oczekujesz na przelew" : "💬 Przypomnij o płatności"}
          </div>
          {paymentSentAt ? (
            <div style={{ color: "var(--color-muted-foreground)", fontSize: 13, lineHeight: 1.6 }}>
              Klient potwierdził wysłanie przelewu. Gdy środki dotrą na konto — kliknij przycisk poniżej, żeby potwierdzić odbiór i rozpocząć realizację.
            </div>
          ) : (
            <>
              <button
                onClick={sharePaymentRequest}
                style={{ ...btnSecondary, width: "100%", padding: "10px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}
              >
                📤 Wyślij dane do przelewu
              </button>
              <button
                onClick={sendPaymentReminder}
                style={{ ...btnSecondary, width: "100%", padding: "10px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                🔔 Wyślij przypomnienie
              </button>
            </>
          )}
        </div>
      )}

      {/* Stage payment tracker */}
      {data.pricingMethod === "stages" && data.paymentStages.length > 0 && (phase === "awaiting_deposit" || phase === "in_progress" || phase === "awaiting_release" || phase === "completed") && (() => {
        const paidStages = (() => { try { const c = loadContracts().find(c => c.contractId === contractId); return c?.paidStages || []; } catch { return []; } })();
        const totalPaid = data.paymentStages.filter(s => paidStages.includes(s.id)).reduce((sum, s) => sum + s.amount, 0);
        const totalAll = data.paymentStages.reduce((sum, s) => sum + s.amount, 0);
        const pct = totalAll > 0 ? Math.round((totalPaid / totalAll) * 100) : 0;

        const markPaid = (id: string) => {
          try {
            const existing = loadContracts();
            const idx = existing.findIndex(c => c.contractId === contractId);
            if (idx >= 0) {
              const current = existing[idx].paidStages || [];
              existing[idx].paidStages = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
              localStorage.setItem(LS_CONTRACTS_KEY, JSON.stringify(existing));
              addContractEvent(contractId, { type: "phase_change", icon: "💰", label: `Etap zapłacony: ${data.paymentStages.find(s => s.id === id)?.name || id}` });
            }
          } catch {}
        };

        return (
          <div style={{ ...sectionCard, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ color: "var(--color-foreground)", fontSize: 14, fontWeight: 700 }}>📋 Etapy płatności</div>
              <div style={{ color: "var(--color-primary)", fontSize: 13, fontWeight: 700 }}>{pct}% zapłacone</div>
            </div>
            {/* Progress bar */}
            <div style={{ height: 6, borderRadius: 3, background: "var(--color-border)", marginBottom: 12, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-primary)", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
            {data.paymentStages.map((s, i) => {
              const paid = paidStages.includes(s.id);
              const isCurrent = !paid && paidStages.length === i;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < data.paymentStages.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: paid ? "color-mix(in srgb, #16a34a 12%, transparent)" : isCurrent ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "var(--color-card)", border: `1.5px solid ${paid ? "#16a34a" : isCurrent ? "var(--color-primary)" : "var(--color-border)"}` }}>
                    <span style={{ fontSize: 12 }}>{paid ? "✓" : isCurrent ? "⏳" : "🔒"}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: paid ? "#16a34a" : isCurrent ? "var(--color-foreground)" : "var(--color-muted-foreground)", fontSize: 13, fontWeight: paid || isCurrent ? 700 : 400 }}>{s.name || `Etap ${i + 1}`}</div>
                    <div style={{ color: "var(--color-muted-foreground)", fontSize: 12 }}>{s.amount.toLocaleString("pl-PL")} {data.currency}</div>
                  </div>
                  {isClient && (isCurrent || paid) && (
                    <button
                      onClick={() => markPaid(s.id)}
                      style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${paid ? "#16a34a" : "var(--color-border)"}`, background: paid ? "color-mix(in srgb, #16a34a 10%, transparent)" : "var(--color-card)", color: paid ? "#16a34a" : "var(--color-muted-foreground)", fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
                    >
                      {paid ? "✓ Zapłacone" : "Oznacz"}
                    </button>
                  )}
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, marginTop: 4 }}>
              <span style={{ color: "var(--color-muted-foreground)", fontSize: 12 }}>Zapłacono</span>
              <span style={{ color: "var(--color-primary)", fontSize: 13, fontWeight: 800 }}>{totalPaid.toLocaleString("pl-PL")} / {totalAll.toLocaleString("pl-PL")} {data.currency}</span>
            </div>
          </div>
        );
      })()}

      {/* CTA */}
      {cta && (
        <button
          onClick={cta.action}
          style={{ ...btnPrimary, width: "100%", padding: "16px", fontSize: 16, marginBottom: 12, background: cta.color || "var(--color-primary)" }}
        >
          {cta.label}
        </button>
      )}

      {/* Inline protocol panel — shown when client clicks CTA in awaiting_release */}
      {showProtocol && phase === "awaiting_release" && isClient && (
        <div style={{ ...sectionCard, border: "1.5px solid var(--color-primary)", marginBottom: 12 }}>
          <div style={{ color: "var(--color-foreground)", fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            {data.category === "wynajem" ? "📋 Protokół wyjściowy" : "📋 Protokół odbioru"}
          </div>
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 12, marginBottom: 10 }}>
            {data.category === "wynajem" ? "STAN LOKALU PRZY ZWROCIE" : "STATUS ODBIORU"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {(data.category === "wynajem" ? [
              { v: "accepted" as const, l: "Lokal oddany bez zastrzeżeń", c: "#22c55e" },
              { v: "with_notes" as const, l: "Drobne uwagi — do uzgodnienia", c: "#f59e0b" },
              { v: "needs_fixes" as const, l: "Usterki do rozliczenia", c: "#ef4444" },
              { v: "rejected" as const, l: "Poważne zastrzeżenia — spór", c: "#6b7280" },
            ] : data.category === "sprzedaz" ? [
              { v: "accepted" as const, l: "Odebrano bez zastrzeżeń", c: "#22c55e" },
              { v: "with_notes" as const, l: "Odebrano z uwagami", c: "#f59e0b" },
              { v: "rejected" as const, l: "Odmowa przyjęcia — spór", c: "#6b7280" },
            ] : [
              { v: "accepted" as const, l: "Odebrane bez uwag", c: "#22c55e" },
              { v: "with_notes" as const, l: "Odebrane z uwagami", c: "#f59e0b" },
              { v: "needs_fixes" as const, l: "Wymaga poprawek", c: "#ef4444" },
              { v: "rejected" as const, l: "Odrzucone", c: "#6b7280" },
            ]).map(opt => {
              const active = protocolStatus === opt.v;
              return (
                <div key={opt.v} onClick={() => setProtocolStatus(opt.v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${active ? opt.c : "var(--color-border)"}`, background: active ? `color-mix(in srgb, ${opt.c} 10%, transparent)` : "var(--color-card)", cursor: "pointer" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: opt.c, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: active ? "var(--color-foreground)" : "var(--color-muted-foreground)", fontSize: 14, fontWeight: active ? 700 : 400 }}>{opt.l}</span>
                  <div style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${active ? opt.c : "var(--color-border)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {active && <div style={{ width: 8, height: 8, borderRadius: 4, background: opt.c }} />}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "var(--color-muted-foreground)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              {data.category === "wynajem" ? "Uwagi do stanu lokalu" : "Opis odbioru"}
            </div>
            <textarea
              value={protocolDesc}
              onChange={e => setProtocolDesc(e.target.value)}
              placeholder={data.category === "wynajem" ? "Opisz stan lokalu przy zwrocie..." : "Opisz odbiór (opcjonalnie)..."}
              style={{ ...textareaStyle, minHeight: 72 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Toggle on={protocolPhotos} onChange={setProtocolPhotos} label="Zdjęcia dokumentacyjne wykonane" />
          </div>
          <button
            disabled={!protocolStatus}
            onClick={() => {
              if (!protocolStatus) return;
              addContractEvent(contractId, {
                type: "phase_change",
                icon: protocolStatus === "accepted" ? "✅" : protocolStatus === "rejected" ? "❌" : "📋",
                label: `Protokół odbioru: ${({ accepted: "bez zastrzeżeń", with_notes: "z uwagami", needs_fixes: "wymaga poprawek", rejected: "odrzucony" } as Record<string,string>)[protocolStatus]}${protocolDesc ? ` — ${protocolDesc.slice(0, 60)}` : ""}`,
              });
              setShowProtocol(false);
              if (protocolStatus === "rejected" || protocolStatus === "needs_fixes") {
                setDisputeOpen(true);
              } else {
                setPhase("completed");
              }
            }}
            style={{ ...btnPrimary, width: "100%", padding: "13px", fontSize: 15, background: !protocolStatus ? "var(--color-border)" : protocolStatus === "accepted" ? "#16a34a" : "var(--color-primary)", cursor: protocolStatus ? "pointer" : "not-allowed" }}
          >
            {!protocolStatus ? "Wybierz status odbioru" : protocolStatus === "accepted" || protocolStatus === "with_notes" ? "✓ Zatwierdź i zakończ umowę" : "Zgłoś problem i otwórz spór"}
          </button>
        </div>
      )}

      {/* Waiting message when it's not your turn */}
      {!cta && !isFinished && !(phase === "awaiting_deposit") && (
        <div style={{ padding: 16, borderRadius: 12, border: "1px solid var(--color-border)", background: "var(--color-card)", marginBottom: 12, textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 14, lineHeight: 1.6 }}>
            Oczekujesz na akcję drugiej strony.<br />
            <span style={{ fontWeight: 600 }}>{otherParty.name || invited}</span> zostanie powiadomiony/a.
          </div>
        </div>
      )}
      {/* Waiting for client to confirm sending */}
      {phase === "awaiting_deposit" && isClient && paymentSentAt && !cta && (
        <div style={{ padding: 16, borderRadius: 12, border: "1px solid #16a34a", background: "color-mix(in srgb, #16a34a 6%, transparent)", marginBottom: 12, textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 14, lineHeight: 1.6 }}>
            Przelew potwierdzony z Twojej strony.<br />
            Czekasz na weryfikację przez <span style={{ fontWeight: 600 }}>{otherParty.name || invited}</span>.
          </div>
        </div>
      )}

      {/* Dispute button — for client in active phases */}
      {isClient && (phase === "in_progress" || phase === "awaiting_release") && (
        <button
          onClick={() => setDisputeOpen(true)}
          style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1.5px solid #f59e0b", background: "color-mix(in srgb, #f59e0b 8%, transparent)", color: "#d97706", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          ⚠ Zgłoś problem
        </button>
      )}

      {/* Activity log */}
      {events && events.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Historia aktywności</div>
          {events.map(e => (
            <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ fontSize: 16, flexShrink: 0, width: 24, textAlign: "center" }}>{e.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--color-foreground)", fontSize: 13, lineHeight: 1.4 }}>{e.label}</div>
                <div style={{ color: "var(--color-muted-foreground)", fontSize: 11, marginTop: 2 }}>
                  {new Date(e.timestamp).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} {new Date(e.timestamp).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isFinished && (
        <button onClick={onNewContract} style={{ ...btnSecondary, width: "100%", padding: "14px", marginTop: 16 }}>
          + Nowa umowa
        </button>
      )}

      {/* Dispute sheet overlay */}
      {disputeOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => { setDisputeOpen(false); setDisputeConfirm(null); }}>
          <div style={{ background: "var(--color-card)", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: "min(560px, 100vw)", boxSizing: "border-box" }} onClick={e => e.stopPropagation()}>
            <div style={{ color: "var(--color-foreground)", fontSize: 18, fontWeight: 800, marginBottom: 6 }}>⚠ Zgłoś problem</div>
            <div style={{ color: "var(--color-muted-foreground)", fontSize: 13, marginBottom: 20 }}>Wybierz jak chcesz rozwiązać sytuację:</div>
            {disputeConfirm === null ? (
              <>
                {[
                  { key: "fixes" as const, icon: "🔁", label: "Poproś o poprawki", desc: "Odesłij wykonawcy do poprawy" },
                  { key: "mediation" as const, icon: "⚖️", label: "Eskaluj do mediacji", desc: "Poproś o arbitra" },
                  { key: "cancel" as const, icon: "❌", label: "Anuluj umowę", desc: "Zwróć środki z escrow" },
                ].map(opt => (
                  <div
                    key={opt.key}
                    onClick={() => setDisputeConfirm(opt.key)}
                    style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{opt.icon}</span>
                    <div>
                      <div style={{ color: "var(--color-foreground)", fontSize: 15, fontWeight: 700 }}>{opt.label}</div>
                      <div style={{ color: "var(--color-muted-foreground)", fontSize: 12 }}>{opt.desc}</div>
                    </div>
                  </div>
                ))}
                <button onClick={() => setDisputeOpen(false)} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-muted-foreground)", fontSize: 14, cursor: "pointer", marginTop: 16 }}>Anuluj</button>
              </>
            ) : (
              <div>
                <div style={{ color: "var(--color-foreground)", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                  {disputeConfirm === "fixes" ? "Opisz co wymaga poprawki:" : disputeConfirm === "mediation" ? "Opisz problem do mediatora:" : "Potwierdź anulowanie umowy:"}
                </div>
                <textarea
                  value={disputeNote}
                  onChange={e => setDisputeNote(e.target.value)}
                  placeholder="Opcjonalny opis..."
                  style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-foreground)", fontSize: 14, resize: "none", minHeight: 80, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12 }}
                />
                <button onClick={() => handleDispute(disputeConfirm)} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: disputeConfirm === "cancel" ? "#dc2626" : "var(--color-primary)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                  {disputeConfirm === "fixes" ? "Wyślij prośbę o poprawki" : disputeConfirm === "mediation" ? "Zgłoś do mediacji" : "Potwierdź anulowanie"}
                </button>
                <button onClick={() => setDisputeConfirm(null)} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-muted-foreground)", fontSize: 14, cursor: "pointer" }}>Wstecz</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
