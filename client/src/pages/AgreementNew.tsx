import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Loader2, Sparkles, Shield, AlertTriangle, AlertCircle,
  ChevronRight, Plus, Trash2, Lock, Zap, Droplets, Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type CurrencyCode } from "@/lib/store";
import { useLang } from "@/context/LanguageContext";

// ─── Types ───────────────────────────────────────────────────────────────────

type PaymentMode = "deposit" | "upfront" | "after_completion" | "split";
type ItemType = "material" | "labor" | "extra";
type PricingUnit = "m2" | "mb" | "pcs" | "hours" | "set";
type RoomTab = "walls" | "floor" | "ceiling";
type PaymentStrategy = "all_deposit" | "selected_deposit" | "materials_upfront_rest_deposit" | "custom_split";
type ContractType = "service" | "renovation" | "transport" | "sale" | "loan" | "other";
type PricingType = "m2" | "fixed" | "hourly" | "piece" | "mixed";
type MaterialsBy = "client" | "worker" | "separate" | "included";
type DeadlineOpt = "today" | "tomorrow" | "7d" | "14d" | "custom";

type PricingLineItem = {
  id: string;
  section: string;
  name: string;
  itemType: ItemType;
  quantity: number;
  unit: PricingUnit;
  unitPrice: number;
  totalPrice: number;
  paymentMode: PaymentMode;
  upfrontAmount?: number;
  depositAmount?: number;
  afterCompletionAmount?: number;
};

type ContractRoom = {
  id: string;
  name: string;
  floorAreaM2: number;
  wallAreaM2: number;
  ceilingAreaM2: number;
  notes: string;
  items: PricingLineItem[];
};

type Stage = { name: string; desc: string; amount: string };

type CategoryDef = { key: string; icon: string; labelKey?: string; label?: string };

// ─── Constants ───────────────────────────────────────────────────────────────

const NEW_CATEGORIES: CategoryDef[] = [
  { key: "renovation",  icon: "🏠", labelKey: "agreeCatRenovation" },
  { key: "carpenter",   icon: "🪚", labelKey: "agreeCatCarpenter"  },
  { key: "joiner",      icon: "🪵", labelKey: "agreeCatJoiner"     },
  { key: "electrical",  icon: "⚡", label: "Elektryka"              },
  { key: "plumbing",    icon: "💧", label: "Hydraulika"             },
  { key: "cleaning",    icon: "🧹", labelKey: "agreeCatCleaning"   },
  { key: "transport",   icon: "🚚", labelKey: "agreeCatTransport"  },
  { key: "repair",      icon: "🔧", labelKey: "agreeCatRepair"     },
  { key: "dog",         icon: "🐶", labelKey: "agreeCatDog"        },
  { key: "moving",      icon: "📦", labelKey: "agreeTmplMoving"    },
  { key: "shopping",    icon: "🛒", labelKey: "agreeCatShopping"   },
  { key: "other",       icon: "✨", labelKey: "agreeCatOther"      },
];

const SUBCATEGORY_MAP: Record<string, string[]> = {
  renovation:  ["Malowanie", "Szpachlowanie", "Gładź", "Ściany", "Podłoga", "Płytki", "Łazienka", "Kuchnia", "Montaż drzwi", "Sufit", "Inne remontowe"],
  carpenter:   ["Taras", "Dach / konstrukcja", "Altana", "Schody", "Pergola", "Zabudowa drewniana", "Naprawa konstrukcji", "Inne ciesielskie"],
  joiner:      ["Meble na wymiar", "Szafa", "Kuchnia", "Półki", "Blat", "Drzwi / listwy", "Naprawa mebli", "Inne stolarskie"],
  electrical:  ["Punkty elektryczne", "Gniazdka", "Oświetlenie", "Montaż", "Rozdzielnia", "Przewody", "Inne elektryczne"],
  plumbing:    ["Punkty wod-kan", "Biały montaż", "Kabina / umywalka", "Odpływ", "Rury", "Montaż", "Inne hydrauliczne"],
};

const WALL_PRESETS  = ["Malowanie", "Szpachlowanie", "Gładź", "Tapeta", "Płytki ścienne", "Inne"];
const FLOOR_PRESETS = ["Panele", "Parkiet", "Płytki", "Listwy", "Wylewka", "Inne"];
const CEIL_PRESETS  = ["Malowanie", "Szpachlowanie", "Sufit podwieszany", "Oświetlenie", "Inne"];

const ELEC_PRESETS  = ["Punkty elektryczne", "Gniazdka", "Oświetlenie", "Montaż", "Rozdzielnia", "Przewody"];
const PLUMB_PRESETS = ["Punkty wod-kan", "Biały montaż", "Kabina / umywalka", "Odpływ", "Rury", "Montaż"];

const CAT_TERMS_MAP: Record<string, string> = {
  renovation: "agreeTmplRepairTerms",
  carpenter:  "agreeTmplRepairTerms",
  joiner:     "agreeTmplRepairTerms",
  electrical: "agreeTmplRepairTerms",
  plumbing:   "agreeTmplRepairTerms",
  cleaning:   "agreeTmplCleaningTerms",
  transport:  "agreeTmplTransportTerms",
  repair:     "agreeTmplRepairTerms",
  shopping:   "agreeTmplShoppingTerms",
  dog:        "agreeTmplDogTerms",
  moving:     "agreeTmplMovingTerms",
  other:      "agreeTmplOtherTerms",
};

const CONTRACT_TYPES: { key: ContractType; label: string }[] = [
  { key: "service",     label: "Usługa" },
  { key: "renovation",  label: "Remont" },
  { key: "transport",   label: "Transport" },
  { key: "sale",        label: "Sprzedaż" },
  { key: "loan",        label: "Pożyczka rzeczy" },
  { key: "other",       label: "Inne" },
];

const UNIT_LABELS: Record<PricingUnit, string> = { m2: "m²", mb: "mb", pcs: "szt.", hours: "godz.", set: "kpl." };
const ITEM_TYPE_LABELS: Record<ItemType, string> = { material: "Materiał", labor: "Robocizna", extra: "Dodatkowe" };
const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  deposit:          "W depozycie",
  upfront:          "Z góry",
  after_completion: "Po wykonaniu",
  split:            "Podziel",
};
const PAYMENT_STRATEGY_INFO: { key: PaymentStrategy; title: string; desc: string }[] = [
  { key: "all_deposit",                    title: "Całość w depozycie",             desc: "Cała kwota zostaje zablokowana do momentu potwierdzenia wykonania." },
  { key: "selected_deposit",               title: "Tylko wybrane pozycje",          desc: "Wybierz, które elementy mają być objęte depozytem." },
  { key: "materials_upfront_rest_deposit", title: "Materiały z góry, reszta w depozycie", desc: "Materiały opłacane od razu, robocizna trafia do depozytu." },
  { key: "custom_split",                   title: "Własny podział płatności",       desc: "Sam określ, które pozycje są z góry, w depozycie lub po wykonaniu." },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string { return Math.random().toString(36).slice(2, 10); }

function newLineItem(name: string, section: string): PricingLineItem {
  return { id: uid(), section, name, itemType: "labor", quantity: 1, unit: "m2", unitPrice: 0, totalPrice: 0, paymentMode: "deposit" };
}

function newRoom(): ContractRoom {
  return { id: uid(), name: "", floorAreaM2: 0, wallAreaM2: 0, ceilingAreaM2: 0, notes: "", items: [] };
}

function useQueryParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

const fmt = (n: number, cur: string) =>
  `${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} ${cur}`;

// ─── Calculation functions ────────────────────────────────────────────────────

function calcLineItemTotal(item: PricingLineItem): number {
  return item.quantity * item.unitPrice;
}

function calcRoomTotal(room: ContractRoom): number {
  return room.items.reduce((s, it) => s + it.totalPrice, 0);
}

function calcAllRoomsTotal(rooms: ContractRoom[]): number {
  return rooms.reduce((s, r) => s + calcRoomTotal(r), 0);
}

function calcSectionTotal(items: PricingLineItem[]): number {
  return items.reduce((s, it) => s + it.totalPrice, 0);
}

function calcElectricalTotal(items: PricingLineItem[]): number {
  return calcSectionTotal(items);
}

function calcPlumbingTotal(items: PricingLineItem[]): number {
  return calcSectionTotal(items);
}

function calcPaymentSummary(
  rooms: ContractRoom[],
  electricalItems: PricingLineItem[],
  plumbingItems: PricingLineItem[],
  baseTotal: number,
  strategy: PaymentStrategy,
): { upfrontTotal: number; depositTotal: number; afterCompletionTotal: number; grandTotal: number } {
  const allItems: PricingLineItem[] = [
    ...rooms.flatMap(r => r.items),
    ...electricalItems,
    ...plumbingItems,
  ];
  const roomsTotal = calcAllRoomsTotal(rooms);
  const elecTotal  = calcSectionTotal(electricalItems);
  const plumbTotal = calcSectionTotal(plumbingItems);
  const grandTotal = roomsTotal + elecTotal + plumbTotal + baseTotal;

  if (strategy === "all_deposit") {
    return { upfrontTotal: 0, depositTotal: grandTotal, afterCompletionTotal: 0, grandTotal };
  }

  if (strategy === "materials_upfront_rest_deposit") {
    let upfront = 0, deposit = 0, afterCompletion = 0;
    for (const it of allItems) {
      const t = it.totalPrice;
      if (it.itemType === "material") upfront += t;
      else deposit += t;
    }
    deposit += baseTotal;
    return { upfrontTotal: upfront, depositTotal: deposit, afterCompletionTotal: afterCompletion, grandTotal };
  }

  if (strategy === "selected_deposit" || strategy === "custom_split") {
    let upfront = 0, deposit = 0, afterCompletion = 0;
    for (const it of allItems) {
      const t = it.totalPrice;
      if (it.paymentMode === "deposit")          deposit += t;
      else if (it.paymentMode === "upfront")     upfront += t;
      else if (it.paymentMode === "after_completion") afterCompletion += t;
      else if (it.paymentMode === "split") {
        upfront        += it.upfrontAmount        ?? 0;
        deposit        += it.depositAmount        ?? 0;
        afterCompletion+= it.afterCompletionAmount?? 0;
      }
    }
    deposit += baseTotal;
    return { upfrontTotal: upfront, depositTotal: deposit, afterCompletionTotal: afterCompletion, grandTotal };
  }

  return { upfrontTotal: 0, depositTotal: grandTotal, afterCompletionTotal: 0, grandTotal };
}

// ─── LineItem Row Component ───────────────────────────────────────────────────

function LineItemRow({
  item, currency, onUpdate, onRemove,
}: {
  item: PricingLineItem;
  currency: string;
  onUpdate: (updated: PricingLineItem) => void;
  onRemove: () => void;
}) {
  const fi: React.CSSProperties = {
    background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 8, color: "var(--color-foreground)", padding: "6px 8px",
    fontSize: 13, outline: "none", width: "100%",
  };
  const upd = (patch: Partial<PricingLineItem>) => {
    const next = { ...item, ...patch };
    next.totalPrice = next.quantity * next.unitPrice;
    onUpdate(next);
  };
  return (
    <div style={{ background: "rgba(0,0,0,0.18)", borderRadius: 12, padding: "10px 12px", marginBottom: 8 }} data-testid={`item-row-${item.id}`}>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text" value={item.name}
          onChange={e => upd({ name: e.target.value })}
          placeholder="Nazwa pozycji"
          style={{ ...fi, flex: 1, fontWeight: 600 }}
          data-testid={`input-item-name-${item.id}`}
        />
        <button type="button" onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: 2 }}>
          <Trash2 className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5 mb-1.5">
        <div>
          <p style={{ fontSize: 10, color: "var(--color-muted-foreground)", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Ilość</p>
          <input
            type="number" min="0" step="0.1" value={item.quantity}
            onChange={e => upd({ quantity: parseFloat(e.target.value) || 0 })}
            style={fi} data-testid={`input-item-qty-${item.id}`}
          />
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--color-muted-foreground)", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Jedn.</p>
          <select value={item.unit} onChange={e => upd({ unit: e.target.value as PricingUnit })} style={{ ...fi, appearance: "none" as const, cursor: "pointer" }} data-testid={`select-item-unit-${item.id}`}>
            {(Object.entries(UNIT_LABELS) as [PricingUnit, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--color-muted-foreground)", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Cena jedn.</p>
          <input
            type="number" min="0" step="1" value={item.unitPrice}
            onChange={e => upd({ unitPrice: parseFloat(e.target.value) || 0 })}
            style={fi} data-testid={`input-item-price-${item.id}`}
          />
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--color-muted-foreground)", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Suma</p>
          <div style={{ ...fi, background: "rgba(147,51,234,0.08)", color: "#b06cff", fontWeight: 700 }}>
            {fmt(item.totalPrice, currency)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <p style={{ fontSize: 10, color: "var(--color-muted-foreground)", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Typ</p>
          <select value={item.itemType} onChange={e => upd({ itemType: e.target.value as ItemType })} style={{ ...fi, appearance: "none" as const, cursor: "pointer" }} data-testid={`select-item-type-${item.id}`}>
            {(Object.entries(ITEM_TYPE_LABELS) as [ItemType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <p style={{ fontSize: 10, color: "var(--color-muted-foreground)", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Płatność</p>
          <select value={item.paymentMode} onChange={e => upd({ paymentMode: e.target.value as PaymentMode })} style={{ ...fi, appearance: "none" as const, cursor: "pointer" }} data-testid={`select-item-paymode-${item.id}`}>
            {(Object.entries(PAYMENT_MODE_LABELS) as [PaymentMode, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {item.paymentMode === "split" && (
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          {[
            { label: "Z góry", field: "upfrontAmount" as const },
            { label: "Depozyt", field: "depositAmount" as const },
            { label: "Po wyk.", field: "afterCompletionAmount" as const },
          ].map(({ label, field }) => (
            <div key={field}>
              <p style={{ fontSize: 10, color: "var(--color-muted-foreground)", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{label}</p>
              <input
                type="number" min="0" step="1"
                value={item[field] ?? 0}
                onChange={e => upd({ [field]: parseFloat(e.target.value) || 0 })}
                style={fi} data-testid={`input-item-split-${field}-${item.id}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgreementNew() {
  const [, setLocation] = useLocation();
  const { user, enabledCurrencies } = useAppStore();
  const { t } = useLang();

  const conversationId    = useQueryParam("conversationId");
  const workerUidParam    = useQueryParam("workerUid");
  const workerNameParam   = useQueryParam("workerName");
  const workerHandleParam = useQueryParam("workerHandle");

  const defaultCurrency: CurrencyCode = enabledCurrencies[0] ?? "NOK";

  // ── Existing state ──────────────────────────────────────────────────────────
  const [title,        setTitle]        = useState("");
  const [desc,         setDesc]         = useState("");
  const [workerName,   setWorkerName]   = useState(workerNameParam ?? "");
  const [workerUid,    setWorkerUid]    = useState(workerUidParam ?? "");
  const [workerHandle, setWorkerHandle] = useState(workerHandleParam ?? "");
  const [currency,     setCurrency]     = useState<CurrencyCode>(defaultCurrency);
  const [error,        setError]        = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  const [depositEnabled,    setDepositEnabled]    = useState(false);
  const [depositAmount,     setDepositAmount]     = useState("");
  const [depositCurrency,   setDepositCurrency]   = useState<CurrencyCode>(defaultCurrency);
  const [depositReturnRule, setDepositReturnRule] = useState("");

  type WorkerResult = { id: string; displayName: string; host: string | null; email: string };
  const [workerSearch,    setWorkerSearch]    = useState("");
  const [workerResults,   setWorkerResults]   = useState<WorkerResult[]>([]);
  const [workerSearching, setWorkerSearching] = useState(false);
  const isPreFilled = !!(workerUidParam && workerNameParam);

  const [category,     setCategory]     = useState("renovation");
  const [pricingType,  setPricingType]  = useState<PricingType>("m2");

  const [areaM2,        setAreaM2]        = useState("42");
  const [pricePerM2,    setPricePerM2]    = useState("220");
  const [materialsCost, setMaterialsCost] = useState("3000");
  const [extraCosts,    setExtraCosts]    = useState("500");

  const [fixedPrice,   setFixedPrice]   = useState("");
  const [hourlyRate,   setHourlyRate]   = useState("");
  const [hoursCount,   setHoursCount]   = useState("");
  const [hoursMax,     setHoursMax]     = useState("");
  const [pieceCount,   setPieceCount]   = useState("");
  const [piecePrice,   setPiecePrice]   = useState("");
  const [pieceDesc,    setPieceDesc]    = useState("");

  const [mixedFixed,   setMixedFixed]   = useState("");
  const [mixedArea,    setMixedArea]    = useState("");
  const [mixedM2Price, setMixedM2Price] = useState("");
  const [mixedHours,   setMixedHours]  = useState("");
  const [mixedHRate,   setMixedHRate]   = useState("");
  const [mixedPieces,  setMixedPieces]  = useState("");
  const [mixedPPrice,  setMixedPPrice]  = useState("");
  const [mixedMat,     setMixedMat]     = useState("");
  const [mixedExtra,   setMixedExtra]   = useState("");

  const [workScope,     setWorkScope]     = useState("");
  const [excludedScope, setExcludedScope] = useState("");
  const [materialsBy,   setMaterialsBy]   = useState<MaterialsBy>("client");

  const [acceptanceConditions, setAcceptanceConditions] = useState(
    "Po zakończeniu prac wykonawca dostarczy zdjęcia potwierdzające efekt. Płatność zostanie wypłacana dopiero po akceptacji wykonania."
  );

  const [stages, setStages] = useState<Stage[]>([
    { name: "Przygotowanie",      desc: "Zakres przygotowawczy i zabezpieczenie", amount: "2000" },
    { name: "Wykonanie i odbiór", desc: "Realizacja prac oraz odbiór końcowy",    amount: "" },
  ]);

  const [proofAfter,    setProofAfter]    = useState(true);
  const [proofBefore,   setProofBefore]   = useState(false);
  const [proofMessage,  setProofMessage]  = useState(false);
  const [proofBothSides,setProofBothSides]= useState(false);
  const [proofLocation, setProofLocation] = useState(false);

  const [deadlineOpt,    setDeadlineOpt]    = useState<DeadlineOpt>("14d");
  const [customDeadline, setCustomDeadline] = useState("");

  // ── New state ───────────────────────────────────────────────────────────────
  const [contractType,    setContractType]    = useState<ContractType>("service");
  const [subcategories,   setSubcategories]   = useState<string[]>([]);
  const [rooms,           setRooms]           = useState<ContractRoom[]>([]);
  const [electricalItems, setElectricalItems] = useState<PricingLineItem[]>([]);
  const [plumbingItems,   setPlumbingItems]   = useState<PricingLineItem[]>([]);
  const [paymentStrategy, setPaymentStrategy] = useState<PaymentStrategy>("all_deposit");
  const [roomActiveTabs,  setRoomActiveTabs]  = useState<Record<string, RoomTab>>({});

  // ── New sections state ───────────────────────────────────────────────────────
  const [materialsAmount,      setMaterialsAmount]      = useState("");
  const [materialsNote,        setMaterialsNote]        = useState("");
  const [contractChangeTerms,  setContractChangeTerms]  = useState("Wszelkie zmiany zakresu wymagają pisemnego aneksu uzgodnionego przez obie strony.");
  const [acceptancePaper,      setAcceptancePaper]      = useState(false);
  const [acceptanceElectronic, setAcceptanceElectronic] = useState(true);
  const [acceptancePhoto,      setAcceptancePhoto]      = useState(false);
  const [correctionDays,       setCorrectionDays]       = useState("7");
  const [correctionTerms,      setCorrectionTerms]      = useState("");

  // ── Wizard step ─────────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);
  const WIZARD_STEPS = ["Podstawy", "Kategoria", "Zakres", "Wycena", "Warunki", "Gotowe"];

  // ── Computed totals ─────────────────────────────────────────────────────────
  const computeBasePricingAmount = (): number => {
    const p = (s: string) => parseFloat(s.replace(",", ".") || "0") || 0;
    switch (pricingType) {
      case "m2":    return p(areaM2) * p(pricePerM2) + p(materialsCost) + p(extraCosts);
      case "fixed": return p(fixedPrice);
      case "hourly":return p(hourlyRate) * p(hoursCount);
      case "piece": return p(pieceCount) * p(piecePrice);
      case "mixed": {
        const labor = p(mixedArea) * p(mixedM2Price) + p(mixedHours) * p(mixedHRate)
                    + p(mixedPieces) * p(mixedPPrice) + p(mixedFixed);
        return labor + p(mixedMat) + p(mixedExtra);
      }
      default: return 0;
    }
  };

  const baseAmount   = computeBasePricingAmount();
  const laborCostM2  = (parseFloat(areaM2 || "0") || 0) * (parseFloat(pricePerM2 || "0") || 0);
  const roomsTotal   = calcAllRoomsTotal(rooms);
  const elecTotal    = calcSectionTotal(electricalItems);
  const plumbTotal   = calcSectionTotal(plumbingItems);
  const grandTotal   = roomsTotal + elecTotal + plumbTotal + baseAmount;

  // Split labor/materials from line items for summary
  const allLineItems = [...rooms.flatMap(r => r.items), ...electricalItems, ...plumbingItems];
  const laborFromItems    = allLineItems.filter(i => i.itemType === "labor").reduce((s, i) => s + i.totalPrice, 0);
  const materialFromItems = allLineItems.filter(i => i.itemType === "material").reduce((s, i) => s + i.totalPrice, 0);
  const extraFromItems    = allLineItems.filter(i => i.itemType === "extra").reduce((s, i) => s + i.totalPrice, 0);

  const paymentSummary = calcPaymentSummary(rooms, electricalItems, plumbingItems, baseAmount, paymentStrategy);

  // Keep depositEnabled in sync with strategy
  useEffect(() => {
    if (paymentStrategy !== "all_deposit") {
      setDepositEnabled(true);
    }
  }, [paymentStrategy]);

  // ── Deadline helpers ────────────────────────────────────────────────────────
  const getDeadlineISO = (): string => {
    const now = new Date();
    switch (deadlineOpt) {
      case "today":    { const d = new Date(now); d.setHours(23,59,0,0); return d.toISOString(); }
      case "tomorrow": { const d = new Date(now); d.setDate(d.getDate()+1); d.setHours(23,59,0,0); return d.toISOString(); }
      case "7d":       { const d = new Date(now); d.setDate(d.getDate()+7); return d.toISOString(); }
      case "14d":      { const d = new Date(now); d.setDate(d.getDate()+14); return d.toISOString(); }
      case "custom": {
        if (!customDeadline) return "";
        const d = new Date(customDeadline);
        return isNaN(d.getTime()) ? "" : d.toISOString();
      }
      default: return "";
    }
  };

  const deadlineLabel = (): string => {
    const map: Record<DeadlineOpt, string> = {
      today:    t.agreeDeadlineToday,
      tomorrow: t.agreeDeadlineTomorrow,
      "7d":     t.agreeDeadline7d,
      "14d":    t.agreeDeadline14d,
      custom:   customDeadline ? new Date(customDeadline).toLocaleDateString() : t.agreeDeadlineCustom,
    };
    return map[deadlineOpt];
  };

  const proofLabels = (): string => {
    const items: string[] = [];
    if (proofAfter)     items.push(t.agreeProofAfter);
    if (proofBefore)    items.push(t.agreeProofBefore);
    if (proofMessage)   items.push(t.agreeProofMessage);
    if (proofBothSides) items.push(t.agreeProofBothSides);
    if (proofLocation)  items.push(t.agreeProofLocation);
    return items.length ? items[0] + (items.length > 1 ? ` +${items.length - 1}` : "") : "—";
  };

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workerUidParam) return;
    fetch(`/api/users/${encodeURIComponent(workerUidParam)}`)
      .then(r => r.ok ? r.json() : null)
      .then((u: { id: string; name: string; handle: string } | null) => {
        if (u?.handle) setWorkerHandle(u.handle);
        else if (workerHandleParam) setWorkerHandle(workerHandleParam);
      })
      .catch(() => { if (workerHandleParam) setWorkerHandle(workerHandleParam); });
  }, [workerUidParam, workerHandleParam]);

  useEffect(() => {
    if (isPreFilled) return;
    if (!workerSearch.trim() || workerSearch.length < 2) { setWorkerResults([]); return; }
    const timer = setTimeout(async () => {
      setWorkerSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(workerSearch)}&limit=6`);
        if (res.ok) {
          const data = await res.json();
          const items: WorkerResult[] = Array.isArray(data) ? data : (data?.items ?? []);
          setWorkerResults(items.filter(u => u.id !== user?.id));
        }
      } catch {}
      setWorkerSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [workerSearch, isPreFilled]);

  const selectWorker = (u: WorkerResult) => {
    setWorkerUid(u.id);
    setWorkerName(u.displayName || u.host || u.id);
    setWorkerHandle(u.host ? `@${u.host}` : "");
    setWorkerResults([]);
    setWorkerSearch("");
  };

  // ── Room helpers ─────────────────────────────────────────────────────────────
  const updateRoom = (id: string, patch: Partial<ContractRoom>) => {
    setRooms(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const updateRoomItem = (roomId: string, itemId: string, updated: PricingLineItem) => {
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, items: r.items.map(it => it.id === itemId ? updated : it) } : r
    ));
  };

  const removeRoomItem = (roomId: string, itemId: string) => {
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, items: r.items.filter(it => it.id !== itemId) } : r
    ));
  };

  const togglePreset = (roomId: string, tab: RoomTab, presetName: string) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      const section = tab;
      const exists = r.items.find(it => it.section === section && it.name === presetName);
      if (exists) {
        return { ...r, items: r.items.filter(it => !(it.section === section && it.name === presetName)) };
      } else {
        return { ...r, items: [...r.items, newLineItem(presetName, section)] };
      }
    }));
  };

  const addCustomRoomItem = (roomId: string, tab: RoomTab) => {
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, items: [...r.items, newLineItem("Pozycja własna", tab)] } : r
    ));
  };

  const getRoomTab = (roomId: string): RoomTab => roomActiveTabs[roomId] ?? "walls";
  const setRoomTab = (roomId: string, tab: RoomTab) => setRoomActiveTabs(prev => ({ ...prev, [roomId]: tab }));

  // ── Electrical / plumbing helpers ────────────────────────────────────────────
  const updateElecItem = (id: string, updated: PricingLineItem) =>
    setElectricalItems(prev => prev.map(it => it.id === id ? updated : it));
  const removeElecItem = (id: string) =>
    setElectricalItems(prev => prev.filter(it => it.id !== id));
  const addElecItem = (name = "") =>
    setElectricalItems(prev => [...prev, newLineItem(name || "Nowa pozycja", "electrical")]);

  const updatePlumbItem = (id: string, updated: PricingLineItem) =>
    setPlumbingItems(prev => prev.map(it => it.id === id ? updated : it));
  const removePlumbItem = (id: string) =>
    setPlumbingItems(prev => prev.filter(it => it.id !== id));
  const addPlumbItem = (name = "") =>
    setPlumbingItems(prev => [...prev, newLineItem(name || "Nowa pozycja", "plumbing")]);

  // ── AI conditions ────────────────────────────────────────────────────────────
  const generateConditions = () => {
    setAiGenerating(true);
    setTimeout(() => {
      const termsKey = CAT_TERMS_MAP[category] ?? "agreeTmplOtherTerms";
      const base = (t[termsKey as keyof typeof t] as string) || "";
      const pricingNote = grandTotal > 0 ? ` Łączna wycena: ${fmt(grandTotal, currency)}.` : "";
      const proofNote = proofAfter ? " Wykonawca dostarczy zdjęcia potwierdzające efekt prac." : "";
      const materialsNote = materialsBy === "client"
        ? " Materiały zapewnia zleceniodawca."
        : materialsBy === "worker" ? " Materiały zapewnia wykonawca."
          : materialsBy === "separate" ? " Materiały rozliczane oddzielnie."
            : " Materiały wliczone w cenę.";
      const roomNote = rooms.length ? ` Zakres obejmuje ${rooms.length} pomieszcze${rooms.length === 1 ? "nie" : "ń"}.` : "";
      setAcceptanceConditions(`${base}${pricingNote}${roomNote}${proofNote}${materialsNote}`);
      setAiGenerating(false);
    }, 700);
  };

  // ── Validation ───────────────────────────────────────────────────────────────
  const validate = () => {
    if (!title.trim())          return t.agreeFieldTitle + " jest wymagany";
    if (!workerUid)             return t.agreeFieldWorker + " jest wymagany";
    if (workerUid === user?.id) return t.agreeSelfError;
    if (grandTotal <= 0)        return t.agreeFieldAmount + " jest wymagany";
    const dl = getDeadlineISO();
    if (!dl)                    return t.agreeFieldDeadline + " jest wymagany";
    if (!acceptanceConditions.trim()) return t.agreeFieldTerms + " jest wymagany";
    return null;
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    if (!user) { setError(t.agreeErrNotLoggedIn); return; }

    setSaving(true);
    setError(null);

    try {
      const id  = `ag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const deadline = getDeadlineISO();

      const deadlineDays = (() => {
        const dl = new Date(deadline);
        const diffMs = dl.getTime() - Date.now();
        return Math.max(1, Math.round(diffMs / 86400000));
      })();

      const deposit = paymentStrategy === "all_deposit"
        ? { enabled: true, amount: parseFloat(grandTotal.toFixed(2)), currency: depositCurrency, returnRule: "Po potwierdzeniu wykonania.", status: "pending" }
        : paymentSummary.depositTotal > 0
          ? { enabled: true, amount: parseFloat(paymentSummary.depositTotal.toFixed(2)), currency: depositCurrency, returnRule: depositReturnRule.trim() || "Po potwierdzeniu wykonania.", status: "pending" }
          : { enabled: false, amount: null, currency: null, returnRule: null, status: null };

      const requiredProofs = [
        proofAfter    && "photo_after",
        proofBefore   && "photo_before",
        proofMessage  && "message",
        proofBothSides&& "both_sides",
        proofLocation && "location",
      ].filter(Boolean);

      const agreement = {
        id,
        title:        title.trim(),
        description:  desc.trim(),
        category,
        creatorUid:   user.id,
        creatorName:  user.name,
        workerUid,
        workerName,
        amount:       parseFloat(grandTotal.toFixed(2)),
        currency,
        deadline,
        terms:        acceptanceConditions.trim(),
        completionCriteria: workScope.trim() || null,
        proofPhoto:   proofAfter,
        proofNote:    proofMessage,
        deposit,
        acceptance: {
          creatorAccepted:   true,
          creatorAcceptedAt: now,
          workerAccepted:    false,
          workerAcceptedAt:  null,
        },
        status:         "pending_acceptance",
        conversationId: conversationId ?? null,
        createdAt:      now,
        updatedAt:      now,
        pricingType,
        areaM2:          parseFloat(areaM2 || "0"),
        pricePerM2:      parseFloat(pricePerM2 || "0"),
        laborCost:       pricingType === "m2" ? laborCostM2 : 0,
        materialsCost:   parseFloat(materialsCost || "0"),
        extraCosts:      parseFloat(extraCosts || "0"),
        totalAmount:     parseFloat(grandTotal.toFixed(2)),
        workScope:       workScope.trim() || null,
        excludedScope:   excludedScope.trim() || null,
        materialsProvidedBy: materialsBy,
        deadlineDays,
        stages: (() => {
          let accounted = 0;
          return stages.map((s, idx) => {
            const isLast = idx === stages.length - 1;
            const parsed = parseFloat(s.amount || "0");
            if (!isLast) { accounted += parsed; return { name: s.name, desc: s.desc, amount: parsed }; }
            const remaining = Math.max(0, parseFloat(grandTotal.toFixed(2)) - accounted);
            const amount = s.amount.trim() === "" ? remaining : parsed;
            return { name: s.name, desc: s.desc, amount };
          });
        })(),
        requiredProofs,
        acceptanceConditions: acceptanceConditions.trim(),
        contractType,
        subcategories,
        rooms,
        electricalItems,
        plumbingItems,
        paymentStrategy,
        paymentSummary,
        materialsAmount:      parseFloat(materialsAmount || "0") || 0,
        materialsNote:        materialsNote.trim() || null,
        contractChangeTerms:  contractChangeTerms.trim() || null,
        acceptancePaper,
        acceptanceElectronic,
        acceptancePhoto,
        correctionDays:       parseInt(correctionDays || "7", 10) || 7,
        correctionTerms:      correctionTerms.trim() || null,
      };

      const saveRes = await fetch("/api/agreements/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agreement),
      });
      if (!saveRes.ok) {
        const body = await saveRes.json().catch(() => ({})) as { message?: string };
        const rawMsg = body.message ?? "";
        if (saveRes.status === 400 && rawMsg.toLowerCase().includes("same user")) {
          throw new Error(t.agreeErrSelfContract);
        }
        throw new Error(rawMsg || `${t.agreeErrSaveFailed} (${saveRes.status})`);
      }

      if (conversationId && workerHandle) {
        const msgHandle = workerHandle.startsWith("@") ? workerHandle : `@${workerHandle}`;
        await fetch("/api/message/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId:          user.id,
            recipientHandle:   msgHandle,
            text:              title.trim(),
            isAgreement:       true,
            agreementId:       id,
            agreementTitle:    title.trim(),
            agreementAmount:   parseFloat(grandTotal.toFixed(2)),
            agreementCurrency: currency,
          }),
        }).catch(err => console.warn("[AgreementNew] chat card injection error:", err));
      }

      setLocation(`/agreements/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.agreeErrSaveFailed);
      setSaving(false);
    }
  };

  // ── Style helpers ────────────────────────────────────────────────────────────
  const fs: React.CSSProperties = {
    background:   "var(--color-secondary)",
    border:       "1px solid var(--color-border)",
    borderRadius: 14,
    color:        "var(--color-foreground)",
    padding:      "11px 14px",
    width:        "100%",
    fontSize:     14,
    outline:      "none",
  };
  const ls: React.CSSProperties = {
    fontSize:      11,
    fontWeight:    800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color:         "var(--color-muted-foreground)",
    marginBottom:  6,
    display:       "block",
  };
  const card: React.CSSProperties = {
    background:   "var(--color-secondary)",
    border:       "1px solid var(--color-border)",
    borderRadius: 20,
    padding:      "16px",
  };
  const chipBtn = (active: boolean): React.CSSProperties => ({
    padding:      "8px 14px",
    borderRadius: 20,
    fontSize:     14,
    fontWeight:   700,
    border:       active ? "2px solid rgba(147,51,234,0.7)" : "1px solid var(--color-border)",
    background:   active ? "rgba(147,51,234,0.14)" : "var(--color-secondary)",
    color:        active ? "#b06cff" : "var(--color-muted-foreground)",
    cursor:       "pointer",
    transition:   "all 0.15s",
    whiteSpace:   "nowrap" as const,
  });
  const sectionHeader = (label: string, icon?: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {icon}
      <span style={{ ...ls, marginBottom: 0 }}>{label}</span>
    </div>
  );
  const numInput = (val: string, setter: (v: string) => void, ph: string, testId: string) => (
    <input
      type="number"
      data-testid={testId}
      value={val}
      onChange={e => setter(e.target.value)}
      placeholder={ph}
      step="1"
      style={{ ...fs, background: "rgba(0,0,0,0.2)" }}
    />
  );

  const stage2Amount = Math.max(0, grandTotal - (parseFloat(stages[0]?.amount || "0") || 0));

  // ── Auto-apply materials_upfront strategy ─────────────────────────────────
  const applyMaterialsStrategy = () => {
    const applyToItems = (items: PricingLineItem[]): PricingLineItem[] =>
      items.map(it => ({
        ...it,
        paymentMode: it.itemType === "material" ? "upfront" : "deposit" as PaymentMode,
      }));
    setElectricalItems(prev => applyToItems(prev));
    setPlumbingItems(prev => applyToItems(prev));
    setRooms(prev => prev.map(r => ({ ...r, items: applyToItems(r.items) })));
  };

  const applyAllDepositStrategy = () => {
    const applyToItems = (items: PricingLineItem[]): PricingLineItem[] =>
      items.map(it => ({ ...it, paymentMode: "deposit" as PaymentMode }));
    setElectricalItems(prev => applyToItems(prev));
    setPlumbingItems(prev => applyToItems(prev));
    setRooms(prev => prev.map(r => ({ ...r, items: applyToItems(r.items) })));
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[320px] h-[320px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* ── HEADER ── */}
      <header className="px-5 pt-14 pb-4 sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-border flex items-center gap-3">
        <Button
          variant="ghost" size="icon"
          className="rounded-full bg-secondary border border-border hover:bg-secondary/80 shrink-0"
          onClick={() => window.history.back()}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <h1 className="text-3xl font-heading text-foreground">{t.agreeNewTitle}</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pt-5 space-y-5" style={{ paddingBottom: 220 }}>


        {/* ── PROGRESS STEPPER ── */}
        <div className="flex items-center gap-0" data-testid="progress-stepper">
          {WIZARD_STEPS.map((label, i) => {
            const stepNum = i + 1;
            const isActive = stepNum === currentStep;
            const isDone = stepNum < currentStep;
            return (
              <div key={i} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: isActive ? "linear-gradient(135deg,#9333ea,#7c3aed)" : isDone ? "rgba(147,51,234,0.35)" : "var(--color-secondary)",
                    border: isActive ? "none" : isDone ? "none" : "1.5px solid var(--color-border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800,
                    color: isActive ? "#fff" : isDone ? "#c084fc" : "var(--color-muted-foreground)",
                    boxShadow: isActive ? "0 2px 12px rgba(147,51,234,0.45)" : "none",
                    cursor: isDone ? "pointer" : "default",
                  }} onClick={() => isDone && setCurrentStep(stepNum)}>
                    {isDone ? "✓" : stepNum}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? "#b06cff" : isDone ? "#9333ea" : "var(--color-muted-foreground)", marginTop: 3, textAlign: "center" }}>
                    {label}
                  </span>
                </div>
                {i < 5 && (
                  <div style={{ height: 1.5, flex: 1, background: isDone ? "rgba(147,51,234,0.4)" : "var(--color-border)", marginBottom: 18, maxWidth: 20 }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ══ STEP 1: PODSTAWY ══ */}
        {currentStep === 1 && (<>

        {/* ── SECURE PAYMENT CARD ── */}
        <div style={{
          background: "linear-gradient(135deg, rgba(147,51,234,0.22), rgba(109,40,217,0.30))",
          border: "1px solid rgba(147,51,234,0.35)",
          borderRadius: 20, padding: "16px 18px",
          display: "flex", alignItems: "center", gap: 14,
        }} data-testid="card-secure-payment">
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: "rgba(147,51,234,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Lock className="w-5 h-5" style={{ color: "#c084fc" }} />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 3 }}>{t.agreeSecurePayTitle}</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.45 }}>
              Jedna umowa do usługi, remontu, transportu, sprzedaży, pożyczki i innych zleceń.
            </p>
          </div>
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            <Shield className="w-8 h-8" style={{ color: "rgba(192,132,252,0.5)" }} />
          </div>
        </div>

        {/* ── "Jaką umowę chcesz stworzyć?" ── */}
        <div>
          <p style={{ fontSize: 13, color: "var(--color-muted-foreground)", fontWeight: 600, marginBottom: 4 }}>Jaką umowę chcesz stworzyć?</p>
        </div>

        {/* ── 1. PODSTAWY UMOWY ── */}
        <div style={card} data-testid="section-basics">
          <label style={ls}>1. Podstawy umowy</label>
          <div className="space-y-5">
            {/* Contract type */}
            <div>
              <p style={{ fontSize: 13, color: "var(--color-muted-foreground)", marginBottom: 10 }}>Typ umowy</p>
              <div className="flex flex-wrap gap-2" data-testid="contract-type-selector">
                {CONTRACT_TYPES.map(ct => (
                  <button
                    key={ct.key}
                    type="button"
                    data-testid={`button-ctype-${ct.key}`}
                    onClick={() => {
                      setContractType(ct.key);
                      const catMap: Partial<Record<ContractType, string>> = {
                        renovation: "renovation",
                        transport:  "transport",
                        sale:       "other",
                        loan:       "other",
                        other:      "other",
                      };
                      const mapped = catMap[ct.key];
                      if (mapped) {
                        setCategory(mapped);
                        setSubcategories([]);
                        if (!["renovation", "electrical"].includes(mapped)) setElectricalItems([]);
                        if (!["renovation", "plumbing"].includes(mapped))   setPlumbingItems([]);
                      }
                    }}
                    style={chipBtn(contractType === ct.key)}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Worker */}
            <div>
              <label style={ls}>{t.agreeFieldWorker}</label>
              {isPreFilled ? (
                <div style={{ ...fs, background: "rgba(0,0,0,0.2)" }}>{workerName}</div>
              ) : (
                <div className="relative">
                  <Input
                    data-testid="input-worker-search"
                    value={workerUid ? workerName : workerSearch}
                    onChange={e => {
                      if (workerUid) { setWorkerUid(""); setWorkerName(""); }
                      setWorkerSearch(e.target.value);
                    }}
                    placeholder={t.agreePlaceholderWorker}
                    style={{ ...fs, background: "rgba(0,0,0,0.2)" }}
                    className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-auto p-0"
                  />
                  {workerSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
                  <AnimatePresence>
                    {workerResults.length > 0 && !workerUid && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-2xl z-50 overflow-hidden shadow-lg"
                      >
                        {workerResults.map((u, i) => (
                          <button key={u.id} type="button" onClick={() => selectWorker(u)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left border-b border-border last:border-0"
                            data-testid={`option-worker-${i}`}
                          >
                            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-bold" style={{ color: "#b48dff" }}>
                              {(u.displayName || u.host || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-[15px] font-medium text-foreground">{u.displayName}</p>
                              <p className="text-[13px] text-muted-foreground">{u.host ? `@${u.host}` : u.email}</p>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
            {/* Title */}
            <div>
              <label style={ls}>{t.agreeFieldTitle}</label>
              <Input
                data-testid="input-agreement-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t.agreePlaceholderTitle}
                style={{ ...fs, background: "rgba(0,0,0,0.2)" }}
                className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-auto p-0"
              />
            </div>
            {/* Description */}
            <div>
              <label style={ls}>{t.agreeFieldDesc}</label>
              <textarea
                data-testid="input-agreement-desc"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder={t.agreePlaceholderDesc}
                rows={2}
                style={{ ...fs, background: "rgba(0,0,0,0.2)", resize: "vertical" }}
              />
            </div>
          </div>
        </div>

        <button type="button" onClick={() => setCurrentStep(2)} style={{ width: "100%", padding: "16px 24px", borderRadius: 20, background: "linear-gradient(135deg,#9333ea,#7c3aed)", border: "none", color: "white", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 24px rgba(139,92,246,0.45)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <span>Dalej</span><ChevronRight className="w-5 h-5" />
        </button>
        </>)}

        {/* ══ STEP 2: KATEGORIA ══ */}
        {currentStep === 2 && (<>

        {/* ── 2. WYBIERZ KATEGORIĘ ── */}
        <div data-testid="section-category">
          <label style={ls}>2. Wybierz kategorię</label>
          <div className="grid grid-cols-3 gap-2" data-testid="category-grid">
            {NEW_CATEGORIES.map(cat => {
              const active = category === cat.key;
              const catLabel = cat.label ?? (cat.labelKey ? (t[cat.labelKey as keyof typeof t] as string) : cat.key);
              return (
                <button
                  key={cat.key}
                  type="button"
                  data-testid={`button-cat-${cat.key}`}
                  onClick={() => {
                    setCategory(cat.key);
                    setSubcategories([]);
                    if (!["renovation", "electrical"].includes(cat.key)) setElectricalItems([]);
                    if (!["renovation", "plumbing"].includes(cat.key))   setPlumbingItems([]);
                  }}
                  style={{
                    padding: "10px 6px", borderRadius: 14, fontSize: 13, fontWeight: 700,
                    border: active ? "2px solid rgba(147,51,234,0.65)" : "1px solid var(--color-border)",
                    background: active ? "rgba(147,51,234,0.14)" : "var(--color-secondary)",
                    color: active ? "#b06cff" : "var(--color-muted-foreground)",
                    cursor: "pointer", transition: "all 0.15s",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                  }}
                >
                  <span style={{ fontSize: 22 }}>{cat.icon}</span>
                  <span style={{ lineHeight: 1.2, textAlign: "center" }}>{catLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 3. PODKATEGORIE ── */}
        <AnimatePresence>
          {SUBCATEGORY_MAP[category] && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              data-testid="subcategory-chips"
            >
              <label style={ls}>3. Podkategorie</label>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" as any }}>
                {SUBCATEGORY_MAP[category].map(sub => {
                  const active = subcategories.includes(sub);
                  return (
                    <button
                      key={sub}
                      type="button"
                      data-testid={`button-sub-${sub}`}
                      onClick={() => setSubcategories(prev => active ? prev.filter(s => s !== sub) : [...prev, sub])}
                      style={chipBtn(active)}
                    >
                      {sub}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={() => setCurrentStep(1)} style={{ flex: 1, padding: "14px", borderRadius: 20, background: "var(--color-secondary)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← Wstecz</button>
          <button type="button" onClick={() => setCurrentStep(3)} style={{ flex: 2, padding: "14px", borderRadius: 20, background: "linear-gradient(135deg,#9333ea,#7c3aed)", border: "none", color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span>Dalej</span><ChevronRight className="w-4 h-4" /></button>
        </div>
        </>)}

        {/* ══ STEP 3: ZAKRES ══ */}
        {currentStep === 3 && (<>

        {/* ── 4. POMIESZCZENIA I ZAKRES ── */}
        <div style={card} data-testid="section-rooms">
          {sectionHeader("4. Pomieszczenia i zakres", <Home className="w-4 h-4" style={{ color: "#b06cff" }} />)}

          {/* Work scope */}
          <div className="space-y-3 mb-5">
            <div>
              <label style={ls}>{t.agreeWorkScopeWhat}</label>
              <textarea data-testid="input-work-scope" value={workScope} onChange={e => setWorkScope(e.target.value)} placeholder={t.agreePlaceholderDesc} rows={2} style={{ ...fs, background: "rgba(0,0,0,0.2)", resize: "vertical" }} />
            </div>
            <div>
              <label style={ls}>{t.agreeWorkScopeExcluded}</label>
              <textarea data-testid="input-excluded-scope" value={excludedScope} onChange={e => setExcludedScope(e.target.value)} placeholder="…" rows={2} style={{ ...fs, background: "rgba(0,0,0,0.2)", resize: "vertical" }} />
            </div>
          </div>

          <div style={{ height: 1, background: "var(--color-border)", marginBottom: 16 }} />

          {rooms.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--color-muted-foreground)", marginBottom: 12 }}>
              Dodaj pomieszczenia, żeby szczegółowo zaplanować zakres i koszty.
            </p>
          )}

          {rooms.map((room) => {
            const activeTab = getRoomTab(room.id);
            const presets = activeTab === "walls" ? WALL_PRESETS : activeTab === "floor" ? FLOOR_PRESETS : CEIL_PRESETS;
            const tabItems = room.items.filter(it => it.section === activeTab);
            const activePresetNames = new Set(tabItems.map(it => it.name));

            return (
              <div key={room.id} style={{
                background: "rgba(0,0,0,0.18)", border: "1px solid var(--color-border)",
                borderRadius: 16, padding: "14px", marginBottom: 12,
              }} data-testid={`room-card-${room.id}`}>
                {/* Room header */}
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text" value={room.name}
                    onChange={e => updateRoom(room.id, { name: e.target.value })}
                    placeholder="Nazwa pomieszczenia (np. Salon)"
                    style={{ ...fs, flex: 1, fontWeight: 700, fontSize: 15, background: "rgba(0,0,0,0.2)" }}
                    data-testid={`input-room-name-${room.id}`}
                  />
                  <button
                    type="button"
                    onClick={() => setRooms(prev => prev.filter(r => r.id !== room.id))}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}
                  >
                    <Trash2 className="w-4 h-4" style={{ color: "rgba(255,255,255,0.3)" }} />
                  </button>
                </div>

                {/* m² grid */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: "Podłoga m²", field: "floorAreaM2" as const, testId: `input-room-floor-${room.id}` },
                    { label: "Ściany m²",  field: "wallAreaM2" as const,  testId: `input-room-wall-${room.id}` },
                    { label: "Sufit m²",   field: "ceilingAreaM2" as const, testId: `input-room-ceil-${room.id}` },
                  ].map(({ label, field, testId }) => (
                    <div key={field}>
                      <p style={{ fontSize: 10, color: "var(--color-muted-foreground)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</p>
                      <input
                        type="number" min="0" step="0.1"
                        value={room[field] || ""}
                        onChange={e => updateRoom(room.id, { [field]: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        style={{ ...fs, background: "rgba(0,0,0,0.25)", fontSize: 13, padding: "8px 10px" }}
                        data-testid={testId}
                      />
                    </div>
                  ))}
                </div>

                {/* Notes */}
                <textarea
                  value={room.notes}
                  onChange={e => updateRoom(room.id, { notes: e.target.value })}
                  placeholder="Notatka dotycząca pomieszczenia…"
                  rows={1}
                  style={{ ...fs, background: "rgba(0,0,0,0.2)", resize: "none", marginBottom: 12, fontSize: 13 }}
                  data-testid={`input-room-notes-${room.id}`}
                />

                {/* Tabs */}
                <div className="flex gap-1 mb-3">
                  {(["walls", "floor", "ceiling"] as RoomTab[]).map(tab => {
                    const labels: Record<RoomTab, string> = { walls: "Ściany", floor: "Podłoga", ceiling: "Sufit" };
                    const cnt = room.items.filter(i => i.section === tab).length;
                    return (
                      <button
                        key={tab} type="button"
                        onClick={() => setRoomTab(room.id, tab)}
                        data-testid={`tab-${room.id}-${tab}`}
                        style={{
                          flex: 1, padding: "7px 4px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                          border: activeTab === tab ? "2px solid rgba(147,51,234,0.7)" : "1px solid var(--color-border)",
                          background: activeTab === tab ? "rgba(147,51,234,0.14)" : "transparent",
                          color: activeTab === tab ? "#b06cff" : "var(--color-muted-foreground)",
                          cursor: "pointer", transition: "all 0.12s",
                        }}
                      >
                        {labels[tab]}{cnt > 0 && ` (${cnt})`}
                      </button>
                    );
                  })}
                </div>

                {/* Preset chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {presets.map(preset => {
                    const on = activePresetNames.has(preset);
                    return (
                      <button
                        key={preset} type="button"
                        onClick={() => togglePreset(room.id, activeTab, preset)}
                        data-testid={`preset-${room.id}-${activeTab}-${preset}`}
                        style={{
                          padding: "5px 11px", borderRadius: 16, fontSize: 12, fontWeight: 700,
                          border: on ? "2px solid rgba(147,51,234,0.7)" : "1px solid var(--color-border)",
                          background: on ? "rgba(147,51,234,0.18)" : "rgba(0,0,0,0.2)",
                          color: on ? "#b06cff" : "var(--color-muted-foreground)",
                          cursor: "pointer", transition: "all 0.12s",
                        }}
                      >
                        {on ? "✓ " : ""}{preset}
                      </button>
                    );
                  })}
                </div>

                {/* Items for this tab */}
                {tabItems.map(item => (
                  <LineItemRow
                    key={item.id} item={item} currency={currency}
                    onUpdate={updated => updateRoomItem(room.id, item.id, updated)}
                    onRemove={() => removeRoomItem(room.id, item.id)}
                  />
                ))}

                {/* Add custom item */}
                <button
                  type="button"
                  onClick={() => addCustomRoomItem(room.id, activeTab)}
                  data-testid={`button-add-item-${room.id}-${activeTab}`}
                  style={{
                    width: "100%", padding: "8px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                    border: "1.5px dashed var(--color-border)", background: "transparent",
                    color: "var(--color-muted-foreground)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 6,
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Dodaj pozycję własną
                </button>

                {/* Room total */}
                {calcRoomTotal(room) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-border)" }}>
                    <span style={{ fontSize: 13, color: "var(--color-muted-foreground)", fontWeight: 700 }}>Suma pomieszczenia</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#b06cff" }}>{fmt(calcRoomTotal(room), currency)}</span>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            data-testid="button-add-room"
            onClick={() => {
              const room = newRoom();
              setRooms(prev => [...prev, room]);
              setRoomActiveTabs(prev => ({ ...prev, [room.id]: "walls" }));
            }}
            style={{
              width: "100%", padding: "12px", borderRadius: 14, fontSize: 14, fontWeight: 700,
              border: "1.5px dashed rgba(147,51,234,0.4)", background: "rgba(147,51,234,0.05)",
              color: "#9333ea", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Plus className="w-4 h-4" /> Dodaj pomieszczenie
          </button>
        </div>

        {/* ── 5. ELEKTRYKA ── */}
        <AnimatePresence>
          {(category === "renovation" || category === "electrical") && (
            <motion.div
              key="section-electrical"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div style={card} data-testid="section-electrical">
                {sectionHeader("5. Elektryka", <Zap className="w-4 h-4" style={{ color: "#f59e0b" }} />)}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {ELEC_PRESETS.map(preset => (
                    <button
                      key={preset} type="button"
                      onClick={() => addElecItem(preset)}
                      data-testid={`elec-preset-${preset}`}
                      style={{
                        padding: "5px 11px", borderRadius: 16, fontSize: 12, fontWeight: 700,
                        border: "1px solid var(--color-border)", background: "rgba(0,0,0,0.2)",
                        color: "var(--color-muted-foreground)", cursor: "pointer",
                      }}
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
                {electricalItems.map(item => (
                  <LineItemRow
                    key={item.id} item={item} currency={currency}
                    onUpdate={updated => updateElecItem(item.id, updated)}
                    onRemove={() => removeElecItem(item.id)}
                  />
                ))}
                <button
                  type="button"
                  data-testid="button-add-electrical"
                  onClick={() => addElecItem()}
                  style={{
                    width: "100%", padding: "10px", borderRadius: 12, fontSize: 13, fontWeight: 700,
                    border: "1.5px dashed var(--color-border)", background: "transparent",
                    color: "var(--color-muted-foreground)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Dodaj pozycję elektryczną
                </button>
                {elecTotal > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-border)" }}>
                    <span style={{ fontSize: 13, color: "var(--color-muted-foreground)", fontWeight: 700 }}>Suma elektryka</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#f59e0b" }}>{fmt(elecTotal, currency)}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 6. HYDRAULIKA ── */}
        <AnimatePresence>
          {(category === "renovation" || category === "plumbing") && (
            <motion.div
              key="section-plumbing"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div style={card} data-testid="section-plumbing">
                {sectionHeader("6. Hydraulika", <Droplets className="w-4 h-4" style={{ color: "#3b82f6" }} />)}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {PLUMB_PRESETS.map(preset => (
                    <button
                      key={preset} type="button"
                      onClick={() => addPlumbItem(preset)}
                      data-testid={`plumb-preset-${preset}`}
                      style={{
                        padding: "5px 11px", borderRadius: 16, fontSize: 12, fontWeight: 700,
                        border: "1px solid var(--color-border)", background: "rgba(0,0,0,0.2)",
                        color: "var(--color-muted-foreground)", cursor: "pointer",
                      }}
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
                {plumbingItems.map(item => (
                  <LineItemRow
                    key={item.id} item={item} currency={currency}
                    onUpdate={updated => updatePlumbItem(item.id, updated)}
                    onRemove={() => removePlumbItem(item.id)}
                  />
                ))}
                <button
                  type="button"
                  data-testid="button-add-plumbing"
                  onClick={() => addPlumbItem()}
                  style={{
                    width: "100%", padding: "10px", borderRadius: 12, fontSize: 13, fontWeight: 700,
                    border: "1.5px dashed var(--color-border)", background: "transparent",
                    color: "var(--color-muted-foreground)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Dodaj pozycję hydrauliczną
                </button>
                {plumbTotal > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-border)" }}>
                    <span style={{ fontSize: 13, color: "var(--color-muted-foreground)", fontWeight: 700 }}>Suma hydraulika</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#3b82f6" }}>{fmt(plumbTotal, currency)}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={() => setCurrentStep(2)} style={{ flex: 1, padding: "14px", borderRadius: 20, background: "var(--color-secondary)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← Wstecz</button>
          <button type="button" onClick={() => setCurrentStep(4)} style={{ flex: 2, padding: "14px", borderRadius: 20, background: "linear-gradient(135deg,#9333ea,#7c3aed)", border: "none", color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span>Dalej</span><ChevronRight className="w-4 h-4" /></button>
        </div>
        </>)}

        {/* ══ STEP 4: WYCENA ══ */}
        {currentStep === 4 && (<>

        {/* ── 7. MATERIAŁY ── */}
        <div style={card} data-testid="section-materials">
          {sectionHeader("7. Materiały", <span style={{ fontSize: 16 }}>📦</span>)}
          <div className="space-y-4">
            <div>
              <label style={ls}>{t.agreeMaterialsBy}</label>
              <div className="flex gap-2 flex-wrap" data-testid="materials-by-selector">
                {([
                  ["client",   t.agreeMaterialsClient],
                  ["worker",   t.agreeMaterialsWorker],
                  ["separate", t.agreeMaterialsSeparate],
                  ["included", t.agreeMaterialsIncluded],
                ] as [MaterialsBy, string][]).map(([key, label]) => (
                  <button key={key} type="button" data-testid={`button-mat-${key}`} onClick={() => setMaterialsBy(key)} style={chipBtn(materialsBy === key)}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={ls}>{t.agreePricingMaterials} — kwota ({currency})</label>
              <input
                type="number"
                min="0"
                step="1"
                data-testid="input-materials-amount"
                value={materialsAmount}
                onChange={e => setMaterialsAmount(e.target.value)}
                placeholder="0"
                style={{ ...fs, background: "rgba(0,0,0,0.2)" }}
              />
            </div>
            <div>
              <label style={ls}>Notatka o materiałach</label>
              <textarea
                data-testid="input-materials-note"
                value={materialsNote}
                onChange={e => setMaterialsNote(e.target.value)}
                placeholder="Szczegóły dotyczące materiałów, standardów, marek…"
                rows={2}
                style={{ ...fs, background: "rgba(0,0,0,0.2)", resize: "vertical" }}
              />
            </div>
          </div>
        </div>

        {/* ── 8. SPOSÓB WYCENY ── */}
        <div style={card} data-testid="section-pricing">
          <label style={ls}>8. Sposób wyceny</label>
          <div className="flex gap-2 flex-wrap mb-4" data-testid="pricing-type-selector">
            {([
              ["fixed",  t.agreePricingFixed],
              ["m2",     t.agreePricingM2],
              ["hourly", t.agreePricingHourly],
              ["piece",  t.agreePricingPiece],
              ["mixed",  t.agreePricingMixed],
            ] as [PricingType, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                data-testid={`button-pricing-${key}`}
                onClick={() => setPricingType(key)}
                style={chipBtn(pricingType === key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ height: 1, background: "var(--color-border)", marginBottom: 16 }} />
          <label style={ls}>{t.agreePricingDetails}</label>
          <AnimatePresence mode="wait">
            {pricingType === "m2" && (
              <motion.div key="m2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-3">
                <div><label style={{ ...ls, marginTop: 4 }}>{t.agreePricingArea}</label>{numInput(areaM2, setAreaM2, "0", "input-area-m2")}</div>
                <div><label style={{ ...ls, marginTop: 4 }}>{t.agreePricingPriceM2} ({currency})</label>{numInput(pricePerM2, setPricePerM2, "0", "input-price-m2")}</div>
                <div><label style={{ ...ls, marginTop: 4 }}>{t.agreePricingMaterials} ({currency})</label>{numInput(materialsCost, setMaterialsCost, "0", "input-materials-cost")}</div>
                <div><label style={{ ...ls, marginTop: 4 }}>{t.agreePricingExtra} ({currency})</label>{numInput(extraCosts, setExtraCosts, "0", "input-extra-costs")}</div>
              </motion.div>
            )}
            {pricingType === "fixed" && (
              <motion.div key="fixed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <label style={{ ...ls, marginTop: 4 }}>{t.agreeFixedFinalPrice} ({currency})</label>
                {numInput(fixedPrice, setFixedPrice, "0", "input-fixed-price")}
              </motion.div>
            )}
            {pricingType === "hourly" && (
              <motion.div key="hourly" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <div><label style={{ ...ls, marginTop: 4 }}>{t.agreeHourlyRate} ({currency})</label>{numInput(hourlyRate, setHourlyRate, "0", "input-hourly-rate")}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label style={{ ...ls, marginTop: 4 }}>{t.agreeHoursCount}</label>{numInput(hoursCount, setHoursCount, "0", "input-hours-count")}</div>
                  <div><label style={{ ...ls, marginTop: 4 }}>{t.agreeHoursMax}</label>{numInput(hoursMax, setHoursMax, "—", "input-hours-max")}</div>
                </div>
              </motion.div>
            )}
            {pricingType === "piece" && (
              <motion.div key="piece" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label style={{ ...ls, marginTop: 4 }}>{t.agreePieceCount}</label>{numInput(pieceCount, setPieceCount, "0", "input-piece-count")}</div>
                  <div><label style={{ ...ls, marginTop: 4 }}>{t.agreePiecePrice} ({currency})</label>{numInput(piecePrice, setPiecePrice, "0", "input-piece-price")}</div>
                </div>
                <div>
                  <label style={{ ...ls, marginTop: 4 }}>{t.agreePieceDesc}</label>
                  <textarea data-testid="input-piece-desc" value={pieceDesc} onChange={e => setPieceDesc(e.target.value)} rows={2} style={{ ...fs, background: "rgba(0,0,0,0.2)", resize: "vertical" }} />
                </div>
              </motion.div>
            )}
            {pricingType === "mixed" && (
              <motion.div key="mixed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-3">
                {([
                  [mixedFixed,   setMixedFixed,   t.agreePricingFixed + " ("+currency+")",     "input-mix-fixed"],
                  [mixedArea,    setMixedArea,     t.agreePricingArea,                          "input-mix-area"],
                  [mixedM2Price, setMixedM2Price,  t.agreePricingPriceM2+" ("+currency+")",     "input-mix-m2"],
                  [mixedHours,   setMixedHours,    t.agreeHoursCount,                           "input-mix-hours"],
                  [mixedHRate,   setMixedHRate,    t.agreeHourlyRate+" ("+currency+")",         "input-mix-hrate"],
                  [mixedPieces,  setMixedPieces,   t.agreePieceCount,                           "input-mix-pieces"],
                  [mixedPPrice,  setMixedPPrice,   t.agreePiecePrice+" ("+currency+")",         "input-mix-pprice"],
                  [mixedMat,     setMixedMat,      t.agreePricingMaterials+" ("+currency+")",   "input-mix-mat"],
                  [mixedExtra,   setMixedExtra,    t.agreePricingExtra+" ("+currency+")",       "input-mix-extra"],
                ] as [string, (v:string)=>void, string, string][]).map(([v, sv, lbl, tid]) => (
                  <div key={tid}>
                    <label style={{ ...ls, marginTop: 4 }}>{lbl}</label>
                    {numInput(v, sv, "0", tid)}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── 9. PROFESJONALNA WYCENA ── */}
        <div style={{ ...card, borderColor: grandTotal > 0 ? "rgba(147,51,234,0.35)" : "var(--color-border)" }} data-testid="card-professional-pricing">
          <label style={ls}>9. Profesjonalna wycena</label>
          <div className="space-y-2 mt-2">
            {[
              { label: "Pokoje / pomieszczenia", value: roomsTotal, show: roomsTotal > 0 },
              { label: "Elektryka",              value: elecTotal,  show: elecTotal > 0 },
              { label: "Hydraulika",             value: plumbTotal, show: plumbTotal > 0 },
              { label: "Materiały",              value: materialFromItems, show: materialFromItems > 0 },
              { label: "Robocizna",              value: laborFromItems,    show: laborFromItems > 0 },
              { label: "Dodatkowe koszty",       value: extraFromItems,    show: extraFromItems > 0 },
              { label: "Wycena szczegółowa",     value: baseAmount,        show: baseAmount > 0 },
            ].filter(r => r.show).map((row, i) => (
              <div key={i} className="flex justify-between text-[14px]">
                <span style={{ color: "var(--color-muted-foreground)" }}>{row.label}</span>
                <span style={{ color: "var(--color-foreground)", fontWeight: 600 }}>{fmt(row.value, currency)}</span>
              </div>
            ))}
            {grandTotal > 0 && <div style={{ height: 1, background: "var(--color-border)", margin: "8px 0" }} />}
            <div className="flex justify-between items-center">
              <span style={{ fontSize: 16, fontWeight: 800, color: "#b06cff" }}>Razem</span>
              <span style={{ fontSize: 26, fontWeight: 900, color: "#b06cff" }} data-testid="text-grand-total">{fmt(grandTotal, currency)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label style={ls}>{t.agreeFieldCurrency}</label>
            <select
              data-testid="select-agreement-currency"
              value={currency}
              onChange={e => setCurrency(e.target.value as CurrencyCode)}
              style={{ ...fs, background: "rgba(0,0,0,0.2)", appearance: "none", cursor: "pointer", width: "auto", padding: "6px 12px" }}
            >
              {enabledCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* ── 10. PŁATNOŚĆ I DEPOZYT ── */}
        <div style={card} data-testid="payment-strategy-section">
          <label style={ls}>10. Płatność i depozyt</label>
          <div className="space-y-3 mt-2">
            {PAYMENT_STRATEGY_INFO.map(s => {
              const active = paymentStrategy === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  data-testid={`button-strategy-${s.key}`}
                  onClick={() => {
                    setPaymentStrategy(s.key);
                    if (s.key === "all_deposit") applyAllDepositStrategy();
                    if (s.key === "materials_upfront_rest_deposit") applyMaterialsStrategy();
                  }}
                  style={{
                    width: "100%", textAlign: "left", padding: "14px 16px", borderRadius: 16,
                    border: active ? "2px solid rgba(147,51,234,0.7)" : "1px solid var(--color-border)",
                    background: active ? "rgba(147,51,234,0.10)" : "rgba(0,0,0,0.12)",
                    cursor: "pointer", transition: "all 0.15s",
                    display: "flex", alignItems: "flex-start", gap: 12,
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    border: active ? "2px solid #9333ea" : "1.5px solid var(--color-border)",
                    background: active ? "#9333ea" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: active ? "#c084fc" : "var(--color-foreground)", marginBottom: 3 }}>{s.title}</p>
                    <p style={{ fontSize: 12, color: "var(--color-muted-foreground)", lineHeight: 1.45 }}>{s.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 11. PODZIAŁ PŁATNOŚCI ── */}
        <div style={{ ...card, borderColor: "rgba(147,51,234,0.25)" }} data-testid="card-payment-breakdown">
          <label style={ls}>11. Podział płatności</label>
          <div className="space-y-2 mt-2">
            {[
              { label: "Płatne z góry",      value: paymentSummary.upfrontTotal,         color: "#22c55e" },
              { label: "W depozycie",         value: paymentSummary.depositTotal,          color: "#b06cff" },
              { label: "Płatne po wykonaniu", value: paymentSummary.afterCompletionTotal,  color: "#f59e0b" },
            ].map(row => (
              <div key={row.label} className="flex justify-between text-[14px]">
                <span style={{ color: "var(--color-muted-foreground)" }}>{row.label}</span>
                <span style={{ fontWeight: 700, color: row.value > 0 ? row.color : "var(--color-muted-foreground)" }}>
                  {fmt(row.value, currency)}
                </span>
              </div>
            ))}
            <div style={{ height: 1, background: "var(--color-border)", margin: "8px 0" }} />
            <div className="flex justify-between items-center">
              <span style={{ fontSize: 14, fontWeight: 800, color: "#b06cff" }}>Łączna kwota</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: "#b06cff" }}>{fmt(paymentSummary.grandTotal, currency)}</span>
            </div>
          </div>
          <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(0,0,0,0.18)", borderRadius: 10 }}>
            <p style={{ fontSize: 12, color: "var(--color-muted-foreground)", lineHeight: 1.55 }}>
              {paymentStrategy === "all_deposit" && "Cała kwota zostaje zablokowana do momentu potwierdzenia wykonania prac."}
              {paymentStrategy === "selected_deposit" && "Wybrane pozycje wyceny są objęte depozytem i wypłacane po potwierdzeniu."}
              {paymentStrategy === "materials_upfront_rest_deposit" && "Materiały wskazane w wycenie są płatne z góry. Pozostała część kwoty obejmująca robociznę zostaje zablokowana i wypłacona po potwierdzeniu wykonania."}
              {paymentStrategy === "custom_split" && "Podział płatności określony indywidualnie dla każdej pozycji wyceny."}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={() => setCurrentStep(3)} style={{ flex: 1, padding: "14px", borderRadius: 20, background: "var(--color-secondary)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← Wstecz</button>
          <button type="button" onClick={() => setCurrentStep(5)} style={{ flex: 2, padding: "14px", borderRadius: 20, background: "linear-gradient(135deg,#9333ea,#7c3aed)", border: "none", color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span>Dalej</span><ChevronRight className="w-4 h-4" /></button>
        </div>
        </>)}

        {/* ══ STEP 5: WARUNKI ══ */}
        {currentStep === 5 && (<>

        {/* ── 12. ZMIANY W UMOWIE ── */}
        <div style={card} data-testid="section-contract-changes">
          {sectionHeader("12. Zmiany w umowie", <span style={{ fontSize: 16 }}>✏️</span>)}
          <p style={{ fontSize: 13, color: "var(--color-muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
            Określ zasady wprowadzania aneksów i zmian zakresu.
          </p>
          <textarea
            data-testid="input-contract-change-terms"
            value={contractChangeTerms}
            onChange={e => setContractChangeTerms(e.target.value.slice(0, 500))}
            rows={3}
            style={{ ...fs, background: "rgba(0,0,0,0.2)", resize: "vertical" }}
          />
          <p style={{ fontSize: 12, color: "var(--color-muted-foreground)", marginTop: 6, textAlign: "right" }}>
            {contractChangeTerms.length}/500
          </p>
        </div>

        {/* ── 13. ETAPY PRACY ── */}
        <div style={card} data-testid="section-stages">
          <label style={ls}>13. Etapy pracy</label>
          <div className="space-y-3 mt-1">
            {stages.map((stage, idx) => (
              <div key={idx} style={{
                background: "rgba(0,0,0,0.18)", border: "1px solid var(--color-border)",
                borderRadius: 14, padding: "12px 14px",
                display: "flex", alignItems: "flex-start", gap: 12,
              }} data-testid={`card-stage-${idx}`}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: "rgba(147,51,234,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, fontSize: 13, fontWeight: 900, color: "#b06cff",
                }}>
                  {idx + 1}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    type="text" data-testid={`input-stage-name-${idx}`} value={stage.name}
                    onChange={e => { const next = [...stages]; next[idx] = { ...next[idx], name: e.target.value }; setStages(next); }}
                    style={{ ...fs, background: "transparent", border: "none", padding: "2px 0", fontSize: 13, fontWeight: 700 }}
                    placeholder="Nazwa etapu"
                  />
                  <input
                    type="text" data-testid={`input-stage-desc-${idx}`} value={stage.desc}
                    onChange={e => { const next = [...stages]; next[idx] = { ...next[idx], desc: e.target.value }; setStages(next); }}
                    style={{ ...fs, background: "transparent", border: "none", padding: "2px 0", fontSize: 13, color: "var(--color-muted-foreground)" }}
                    placeholder="Opis"
                  />
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {idx === 1 && !stage.amount ? (
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#b06cff" }}>{fmt(stage2Amount, currency)}</span>
                  ) : (
                    <input
                      type="number" data-testid={`input-stage-amount-${idx}`} value={stage.amount}
                      onChange={e => { const next = [...stages]; next[idx] = { ...next[idx], amount: e.target.value }; setStages(next); }}
                      style={{ ...fs, background: "transparent", border: "none", padding: "2px 0", fontSize: 13, fontWeight: 700, color: "#b06cff", width: 90, textAlign: "right" }}
                      placeholder={currency}
                    />
                  )}
                  {idx !== 0 && (
                    <button type="button" onClick={() => setStages(s => s.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, marginTop: 4 }}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            ))}
            <button
              type="button" data-testid="button-add-stage"
              onClick={() => setStages(s => [...s, { name: "", desc: "", amount: "" }])}
              style={{
                width: "100%", padding: "10px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                border: "1.5px dashed var(--color-border)", background: "transparent",
                color: "var(--color-muted-foreground)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Plus className="w-3.5 h-3.5" />{t.agreeAddStage}
            </button>
          </div>
        </div>

        {/* ── 14. WYMAGANE DOWODY ── */}
        <div style={card} data-testid="section-proofs">
          <label style={ls}>14. Wymagane dowody</label>
          <div className="space-y-3 mt-2">
            {([
              [proofAfter,    setProofAfter,    "Zdjęcie wykonanej pracy",       "check-proof-after"],
              [proofBefore,   setProofBefore,   "Zdjęcie przed rozpoczęciem",    "check-proof-before"],
              [proofMessage,  setProofMessage,  "Wiadomość z opisem wykonania",   "check-proof-message"],
              [proofBothSides,setProofBothSides,"Protokół odbioru",              "check-proof-both"],
              [proofLocation, setProofLocation, "Lokalizacja / czas wykonania",  "check-proof-location"],
            ] as [boolean, (v:boolean)=>void, string, string][]).map(([val, setter, label, tid]) => (
              <label key={tid} data-testid={tid} className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setter(!val)}
                  style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: val ? "1.5px solid #b48dff" : "1.5px solid var(--color-border)",
                    background: val ? "rgba(180,141,255,0.22)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {val && <span style={{ color: "#b48dff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                </div>
                <span className="text-[15px]" style={{ color: val ? "var(--color-foreground)" : "var(--color-muted-foreground)" }}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ── 15. WARUNKI WYKONANIA ── */}
        <div style={card} data-testid="section-conditions">
          <div className="flex items-center justify-between mb-3">
            <label style={{ ...ls, marginBottom: 0 }}>15. Warunki wykonania</label>
            <button
              type="button" data-testid="button-ai-helper"
              onClick={generateConditions} disabled={aiGenerating}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 13, fontWeight: 700, color: "#9333ea",
                background: "rgba(147,51,234,0.10)", border: "1px solid rgba(147,51,234,0.25)",
                borderRadius: 10, padding: "5px 10px",
                cursor: aiGenerating ? "not-allowed" : "pointer",
                opacity: aiGenerating ? 0.6 : 1, transition: "opacity 0.15s",
              }}
            >
              {aiGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {t.agreeAiHelperBtnShort}
            </button>
          </div>
          <div className="relative">
            <textarea
              data-testid="input-acceptance-conditions"
              value={acceptanceConditions}
              onChange={e => setAcceptanceConditions(e.target.value)}
              placeholder={t.agreePlaceholderTerms}
              rows={4}
              style={{ ...fs, background: "rgba(0,0,0,0.2)", resize: "vertical", paddingBottom: 28 }}
            />
            <span style={{ position: "absolute", bottom: 10, right: 12, fontSize: 12, color: "var(--color-muted-foreground)" }}>
              {acceptanceConditions.length}/1000
            </span>
          </div>
        </div>

        {/* ── 16. PROTOKÓŁ ODBIORU ── */}
        <div style={card} data-testid="section-acceptance-protocol">
          {sectionHeader("16. Protokół odbioru", <span style={{ fontSize: 16 }}>📋</span>)}
          <p style={{ fontSize: 13, color: "var(--color-muted-foreground)", marginBottom: 12, lineHeight: 1.5 }}>
            Wybierz formę formalnego odbioru prac.
          </p>
          <div className="space-y-3">
            {([
              [acceptancePaper,      setAcceptancePaper,      "Protokół papierowy (podpis obu stron)", "check-acceptance-paper"],
              [acceptanceElectronic, setAcceptanceElectronic, "Protokół elektroniczny (e-mail/app)",   "check-acceptance-electronic"],
              [acceptancePhoto,      setAcceptancePhoto,      "Protokół zdjęciowy (foto z datą)",      "check-acceptance-photo"],
            ] as [boolean, (v:boolean)=>void, string, string][]).map(([val, setter, label, tid]) => (
              <label key={tid} data-testid={tid} className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setter(!val)}
                  style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: val ? "1.5px solid #b48dff" : "1.5px solid var(--color-border)",
                    background: val ? "rgba(180,141,255,0.22)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {val && <span style={{ color: "#b48dff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                </div>
                <span className="text-[15px]" style={{ color: val ? "var(--color-foreground)" : "var(--color-muted-foreground)" }}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ── 17. POPRAWKI ── */}
        <div style={card} data-testid="section-corrections">
          {sectionHeader("17. Poprawki", <span style={{ fontSize: 16 }}>🔄</span>)}
          <div className="space-y-4">
            <div>
              <label style={ls}>Liczba dni na zgłoszenie poprawek</label>
              <input
                type="number"
                min="1"
                max="90"
                step="1"
                data-testid="input-correction-days"
                value={correctionDays}
                onChange={e => setCorrectionDays(e.target.value)}
                style={{ ...fs, background: "rgba(0,0,0,0.2)" }}
              />
            </div>
            <div>
              <label style={ls}>Zasady dotyczące poprawek</label>
              <textarea
                data-testid="input-correction-terms"
                value={correctionTerms}
                onChange={e => setCorrectionTerms(e.target.value)}
                placeholder="Np. Wykonawca zobowiązuje się do bezpłatnego usunięcia usterek zgłoszonych w ciągu określonego terminu…"
                rows={3}
                style={{ ...fs, background: "rgba(0,0,0,0.2)", resize: "vertical" }}
              />
            </div>
          </div>
        </div>

        {/* ── 18. TERMIN I WYPŁATA ── */}
        <div data-testid="section-deadline">
          <label style={ls}>18. Termin i wypłata</label>
          <div className="flex gap-2 flex-wrap" data-testid="deadline-selector">
            {([
              ["today",    t.agreeDeadlineToday],
              ["tomorrow", t.agreeDeadlineTomorrow],
              ["7d",       t.agreeDeadline7d],
              ["14d",      t.agreeDeadline14d],
              ["custom",   t.agreeDeadlineCustom],
            ] as [DeadlineOpt, string][]).map(([key, label]) => (
              <button key={key} type="button" data-testid={`button-deadline-${key}`} onClick={() => setDeadlineOpt(key)} style={chipBtn(deadlineOpt === key)}>{label}</button>
            ))}
          </div>
          <AnimatePresence>
            {deadlineOpt === "custom" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3">
                <input type="date" data-testid="input-custom-deadline" value={customDeadline} onChange={e => setCustomDeadline(e.target.value)} style={{ ...fs, background: "var(--color-secondary)" }} />
              </motion.div>
            )}
          </AnimatePresence>
          <p style={{ fontSize: 12, color: "var(--color-muted-foreground)", marginTop: 8 }}>
            Wypłata następuje zgodnie z ustalonym modelem płatności i po potwierdzeniu wykonania.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={() => setCurrentStep(4)} style={{ flex: 1, padding: "14px", borderRadius: 20, background: "var(--color-secondary)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← Wstecz</button>
          <button type="button" onClick={() => setCurrentStep(6)} style={{ flex: 2, padding: "14px", borderRadius: 20, background: "linear-gradient(135deg,#9333ea,#7c3aed)", border: "none", color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span>Podsumowanie</span><ChevronRight className="w-4 h-4" /></button>
        </div>
        </>)}

        {/* ══ STEP 6: PODSUMOWANIE ══ */}
        {currentStep === 6 && (<>

        {/* ── PODSUMOWANIE UMOWY ── */}
        <div style={{ ...card, borderColor: "rgba(147,51,234,0.25)" }} data-testid="card-agreement-summary">
          <label style={ls}>{t.agreeSummaryTitle}</label>
          <div className="grid grid-cols-2 gap-3 mt-1">
            {[
              { icon: "📋", label: "Typ umowy",         value: CONTRACT_TYPES.find(c => c.key === contractType)?.label ?? contractType },
              { icon: "🏠", label: t.agreeCategory,      value: (NEW_CATEGORIES.find(c => c.key === category)?.label ?? (t[NEW_CATEGORIES.find(c => c.key === category)?.labelKey as keyof typeof t] as string)) ?? category },
              { icon: "⚖️", label: t.agreePricingType,  value: ({ m2: t.agreePricingM2, fixed: t.agreePricingFixed, hourly: t.agreePricingHourly, piece: t.agreePricingPiece, mixed: t.agreePricingMixed } as Record<string, string>)[pricingType] },
              { icon: "📅", label: t.agreeDeadlineTitle,value: deadlineLabel() },
              { icon: "📷", label: t.agreeProofsTitle,   value: proofLabels() },
              { icon: "🏗️", label: "Pomieszczenia",     value: rooms.length > 0 ? `${rooms.length} pomieszczeń` : "Brak" },
            ].map((item, i) => (
              <div key={i} style={{ background: "rgba(0,0,0,0.18)", borderRadius: 12, padding: "10px 12px" }} data-testid={`summary-item-${i}`}>
                <p style={{ fontSize: 10, color: "var(--color-muted-foreground)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{item.label}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--color-foreground)" }}>{item.value}</p>
              </div>
            ))}
          </div>
          {/* Ready indicator */}
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 12,
            background: grandTotal > 0 && title && workerUid ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.08)",
            border: grandTotal > 0 && title && workerUid ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(245,158,11,0.2)",
          }}>
            <p style={{
              fontSize: 13, fontWeight: 700,
              color: grandTotal > 0 && title && workerUid ? "#22c55e" : "#f59e0b",
            }}>
              {grandTotal > 0 && title && workerUid
                ? "✓ Gotowa do utworzenia"
                : "Brakuje kilku informacji, żeby umowa była bezpieczna."}
            </p>
          </div>
        </div>

        {/* ── WARNINGS ── */}
        <AnimatePresence>
          {grandTotal > 500 && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-start gap-2 bg-orange-500/8 border border-orange-500/20 rounded-2xl p-3"
            >
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed text-orange-300/80">{t.agreeWarnHighAmount}</p>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!proofAfter && workerUid && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-start gap-2 bg-blue-500/8 border border-blue-500/15 rounded-2xl p-3"
            >
              <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed text-blue-300/80">{t.agreeWarnNoPhoto}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── ERROR ── */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-destructive/10 border border-destructive/30 rounded-2xl p-3 text-sm text-destructive"
              data-testid="text-form-error"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── BACK BUTTON ── */}
        <button type="button" onClick={() => setCurrentStep(5)} style={{ width: "100%", padding: "14px", borderRadius: 20, background: "var(--color-secondary)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← Wstecz do warunków</button>

        {/* ── CTA BUTTON ── */}
        <button
          type="submit"
          data-testid="button-submit-agreement"
          disabled={saving}
          aria-busy={saving}
          style={{
            width: "100%", padding: "18px 24px", borderRadius: 20,
            background: saving ? "rgba(147,51,234,0.4)" : "linear-gradient(135deg,#9333ea,#7c3aed)",
            border: "none", color: "white", fontSize: 15, fontWeight: 800, letterSpacing: "0.04em",
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow: saving ? "none" : "0 4px 24px rgba(139,92,246,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all 0.2s",
          }}
        >
          {saving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <span>Utwórz profesjonalną umowę</span>
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </button>
        </>)}

      </form>
    </div>
  );
}
