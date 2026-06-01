import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Bot, Zap, TrendingUp, DollarSign, Target,
  ChevronRight, AlertCircle, CheckCircle, Loader2,
  Star, BookmarkPlus, ExternalLink, BarChart2, ShoppingBag, ListTodo,
} from "lucide-react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey } from "@/lib/apiKeys";
import { addToPipeline } from "@/lib/pipeline";

type Report = {
  top3: { rank: number; product: string; buy: number; sell: number; netProfit: number; roi: number; category: string; market: string; reason: string }[];
  champion: {
    product: string; category: string; listAt: string; sourceAt: string;
    searchTerms?: string[]; season?: string;
    netProfit: number; roi: number;
    steps: string[]; platforms: string[]; buySource: string; timeToSell: string;
  };
  goalPlan?: { monthlyTarget: number; unitsNeeded: number; daysPerUnit: number; feasibility: string; note: string };
  listingDrafts?: { rank: number; product: string; platform: string; price: number; title: string; description: string; tags: string[] }[];
  monthlyEstimate: { low: number; target: number; high: number };
  quickWins: string[];
  warnings: string[];
  summary: string;
};

const SCAN_DATA_KEY = "resell_scan_data";

function loadOpportunities(): any[] {
  try { return JSON.parse(localStorage.getItem(SCAN_DATA_KEY) || "[]"); } catch { return []; }
}

export default function AgentPage() {
  const [, setLocation] = useLocation();
  const [goal, setGoal] = useState<"profit" | "safety" | "volume">("profit");
  const [monthlyGoal, setMonthlyGoal] = useState(500);
  const [running, setRunning] = useState(false);
  const [statusLog, setStatusLog] = useState<{ step: number; message: string }[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oppCount, setOppCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [draftCreated, setDraftCreated] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setOppCount(loadOpportunities().length);
  }, []);

  useEffect(() => {
    if (running) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [statusLog]);

  const runAgent = async () => {
    const key = getAnthropicKey();
    if (!key) { setError("Dodaj klucz Anthropic API w ⚙ API"); return; }

    const opps = loadOpportunities();
    if (!opps.length) { setError("Najpierw zeskanuj rynek na Dashboard — brak danych do analizy."); return; }

    setRunning(true); setError(null); setReport(null);
    setStatusLog([{ step: 0, message: "🤖 ARIA startuje..." }]);

    try {
      const r = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunities: opps, anthropicKey: key, goal, monthlyGoal }),
      });

      if (!r.ok || !r.body) { throw new Error("Błąd połączenia z agentem"); }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const chunk of parts) {
          const eventLine = chunk.split("\n").find(l => l.startsWith("event: "));
          const dataLine = chunk.split("\n").find(l => l.startsWith("data: "));
          if (!dataLine) continue;
          const ev = eventLine?.slice(7) ?? "status";
          const payload = JSON.parse(dataLine.slice(6));
          if (ev === "status") setStatusLog(p => [...p, payload]);
          else if (ev === "done") {
            if (payload.report) {
              setReport(payload.report);
              // Auto-execute: save top3 to Pipeline
              const r = payload.report;
              let saved = 0;
              (r.top3 ?? []).forEach((item: any, idx: number) => {
                try {
                  addToPipeline({
                    id: Date.now() + idx,
                    name: item.product,
                    buy: item.buy ?? 0,
                    sell: item.sell ?? 0,
                    profit: item.netProfit ?? 0,
                    netProfit: item.netProfit ?? 0,
                    margin: item.roi ?? 0,
                    market: item.market ?? "eBay USA",
                    category: item.category ?? "General",
                    score: 80,
                    flag: "🌍→🇺🇸",
                    risk: "medium",
                    tip: item.reason,
                  });
                  saved++;
                } catch {}
              });
              setSavedCount(saved);
              // Auto-create draft listing for all top3 items
              const top3 = r.top3 ?? [];
              const ch = r.champion;
              let draftsCreated = 0;
              const createDrafts = top3.map((item: any, idx: number) =>
                fetch("/api/dropship/listings", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    product: item.product,
                    platform: (idx === 0 && ch?.platforms?.[0]) ? ch.platforms[0] : "eBay USA",
                    category: item.category ?? "General",
                    buyPrice: item.buy ?? 0,
                    buyCurrency: "USD",
                    sellPrice: item.sell ?? 0,
                    buyHint: idx === 0 ? (ch?.sourceAt ?? "") : "",
                    description: idx === 0 ? (r.summary ?? "") : item.reason ?? "",
                    anthropicKey: key,
                  }),
                }).then(() => { draftsCreated++; }).catch(() => {})
              );
              Promise.all(createDrafts).then(() => {
                if (draftsCreated > 0) setDraftCreated(true);
              });
            } else setError("Agent nie zwrócił raportu — spróbuj ponownie.");
          }
          else if (ev === "error") setError(payload.message);
        }
      }
    } catch (e: any) {
      setError(e.message === "Failed to fetch"
        ? "Nie można połączyć się z serwerem — zrestartuj Replit (Stop → Run)."
        : e.message);
    }
    setRunning(false);
  };

  const G = "#22c55e";
  const card = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14, padding: "18px 20px",
  } as const;

  return (
    <ResellLayout>
      <div style={{ padding: "24px 24px 80px", maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: "linear-gradient(135deg,#16a34a,#22c55e)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 20px rgba(34,197,94,0.35)",
          }}>
            <Bot size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>ARIA — Agent AI</h1>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, margin: 0 }}>
              Automated Resell Intelligence Agent · analizuje rynek i tworzy plan zarobku
            </p>
          </div>
        </div>

        {/* Config card */}
        {!report && (
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 14 }}>
              KONFIGURACJA AGENTA
            </div>

            {oppCount === 0 && (
              <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
                <AlertCircle size={14} color="#f59e0b" />
                <span style={{ color: "#fcd34d", fontSize: 12 }}>Brak danych skanowania — wróć na Dashboard i kliknij „Skanuj ponownie" żeby pobrać okazje.</span>
              </div>
            )}
            {oppCount > 0 && (
              <div style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, padding: "8px 14px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
                <CheckCircle size={13} color={G} />
                <span style={{ color: "#86efac", fontSize: 12 }}>{oppCount} okazji gotowych do analizy</span>
              </div>
            )}

            {/* Monthly goal */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, marginBottom: 10 }}>
                CEL MIESIĘCZNY
                <span style={{ marginLeft: 8, color: "#fbbf24", fontWeight: 900, fontSize: 13 }}>${monthlyGoal}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[200, 500, 1000, 2000, 5000].map(v => (
                  <button key={v} onClick={() => setMonthlyGoal(v)} style={{
                    padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12,
                    border: `1px solid ${monthlyGoal === v ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.1)"}`,
                    background: monthlyGoal === v ? "rgba(251,191,36,0.12)" : "transparent",
                    color: monthlyGoal === v ? "#fbbf24" : "rgba(255,255,255,0.4)",
                  }}>${v}</button>
                ))}
              </div>
            </div>

            {/* Strategy */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, marginBottom: 10 }}>STRATEGIA</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { value: "profit",  icon: "💰", label: "Maks. zysk",   desc: "Najwyższa marża per deal" },
                  { value: "safety",  icon: "🛡",  label: "Bezpieczny",  desc: "Niskie ryzyko, stały dochód" },
                  { value: "volume",  icon: "📦",  label: "Duży wolumen", desc: "Dużo sztuk, szybka rotacja" },
                ].map(g => (
                  <button key={g.value} onClick={() => setGoal(g.value as any)} style={{
                    padding: "10px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                    border: `1px solid ${goal === g.value ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.1)"}`,
                    background: goal === g.value ? "rgba(34,197,94,0.12)" : "transparent",
                    color: goal === g.value ? "#4ade80" : "rgba(255,255,255,0.4)",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{g.icon} {g.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{g.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>
              💡 <strong style={{ color: "rgba(255,255,255,0.6)" }}>Model dropship:</strong> wystawiasz → czekasz na kupującego → kupujesz ze źródła i wysyłasz. Brak kapitału. ARIA automatycznie zapisze wyniki do Pipeline i Dropship Managera.
            </div>

            {error && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 9, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 8, alignItems: "center", color: "#fca5a5", fontSize: 12 }}>
                <AlertCircle size={13} /> {error}
              </div>
            )}

            <button onClick={runAgent} disabled={running || oppCount === 0} style={{
              width: "100%", padding: "15px 24px", borderRadius: 12, border: "none",
              background: running || oppCount === 0
                ? "rgba(34,197,94,0.1)"
                : "linear-gradient(135deg,#16a34a,#22c55e,#4ade80)",
              color: running || oppCount === 0 ? "rgba(255,255,255,0.3)" : "#000",
              fontWeight: 900, fontSize: 15, cursor: running || oppCount === 0 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: running || oppCount === 0 ? "none" : "0 4px 20px rgba(34,197,94,0.4)",
            }}>
              {running
                ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> ARIA analizuje rynek... {elapsed > 0 && <span style={{ opacity: 0.6, fontSize: 12, fontWeight: 400 }}>({elapsed}s)</span>}</>
                : <><Bot size={18} /> Uruchom Agenta ARIA <ChevronRight size={16} /></>}
            </button>

            {/* Status log */}
            {statusLog.length > 0 && (
              <div ref={logRef} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                {statusLog.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {i === statusLog.length - 1 && running
                      ? <Loader2 size={12} color={G} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
                      : <CheckCircle size={12} color={G} style={{ flexShrink: 0 }} />}
                    <span style={{ color: i === statusLog.length - 1 ? "#fff" : "rgba(255,255,255,0.35)", fontSize: 12 }}>{s.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Report ── */}
        {report && (
          <div>
            {/* Summary banner */}
            <div style={{ background: "linear-gradient(135deg,rgba(34,197,94,0.12),rgba(74,222,128,0.06))", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 16, padding: "18px 22px", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Bot size={16} color={G} />
                <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 13 }}>ARIA — raport gotowy</span>
              </div>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.7, margin: "0 0 14px" }}>{report.summary}</p>
              {/* Monthly estimate chips */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { label: "Pesymistyczny", val: report.monthlyEstimate?.low, color: "#f87171" },
                  { label: "Cel miesięczny", val: report.monthlyEstimate?.target, color: "#4ade80" },
                  { label: "Optymistyczny", val: report.monthlyEstimate?.high, color: "#fbbf24" },
                ].map(e => (
                  <div key={e.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 16px", textAlign: "center" }}>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700 }}>{e.label.toUpperCase()}</div>
                    <div style={{ color: e.color, fontSize: 20, fontWeight: 900 }}>${(e.val ?? 0).toLocaleString()}</div>
                    <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9 }}>/ miesiąc</div>
                  </div>
                ))}
              </div>
              <button onClick={() => { setReport(null); setStatusLog([]); setSavedCount(0); setDraftCreated(false); }} style={{ marginTop: 14, width: "100%", padding: "10px", borderRadius: 10, border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)", color: "#4ade80", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                ← Uruchom ponownie z innymi ustawieniami
              </button>
            </div>

            {/* ARIA Actions banner */}
            <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 14, padding: "14px 18px", marginBottom: 16 }}>
              <div style={{ color: "#93c5fd", fontWeight: 700, fontSize: 11, marginBottom: 10 }}>⚡ CO TERAZ ZROBIĆ</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {savedCount > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle size={13} color="#4ade80" style={{ flexShrink: 0 }} />
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{savedCount} okazje zapisane do Pipeline automatycznie</span>
                  </div>
                )}
                {draftCreated && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle size={13} color="#4ade80" style={{ flexShrink: 0 }} />
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{savedCount} draft listingi gotowe w Dropship Managerze</span>
                  </div>
                )}
              </div>
              {/* CTA buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => setLocation("/resell/dropship")} style={{
                  flex: 1, minWidth: 140, padding: "11px 16px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg,#2563eb,#3b82f6)",
                  color: "#fff", fontWeight: 700, fontSize: 13,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  boxShadow: "0 4px 14px rgba(59,130,246,0.35)",
                }}>
                  <ShoppingBag size={15} /> Dropship Manager
                </button>
                <button onClick={() => setLocation("/resell/saved")} style={{
                  flex: 1, minWidth: 140, padding: "11px 16px", borderRadius: 10, cursor: "pointer",
                  border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)",
                  color: "#4ade80", fontWeight: 700, fontSize: 13,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                }}>
                  <ListTodo size={15} /> Pipeline
                </button>
              </div>
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                💡 <strong style={{ color: "rgba(255,255,255,0.5)" }}>Dropship Manager</strong> → znajdź draft → skopiuj tytuł i opis → wstaw ręcznie na eBay/Etsy. Nie kupujesz nic dopóki ktoś nie zapłaci.
              </div>
            </div>

            {/* Goal plan */}
            {report.goalPlan && (
              <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 14, padding: "14px 18px", marginBottom: 16 }}>
                <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 11, marginBottom: 10 }}>
                  <BarChart2 size={12} style={{ display: "inline", marginRight: 4 }} />
                  PLAN NA CEL ${report.goalPlan.monthlyTarget}/MIESIĄC
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#fbbf24", fontSize: 22, fontWeight: 900 }}>{report.goalPlan.unitsNeeded}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>SPRZEDAŻY/MIESIĄC</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#fbbf24", fontSize: 22, fontWeight: 900 }}>{report.goalPlan.daysPerUnit}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>DNI/SPRZEDAŻ</div>
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginBottom: 2 }}>{report.goalPlan.note}</div>
                      <div style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                        background: report.goalPlan.feasibility === "easy" ? "rgba(34,197,94,0.2)" : report.goalPlan.feasibility === "realistic" ? "rgba(251,191,36,0.2)" : "rgba(248,113,113,0.2)",
                        color: report.goalPlan.feasibility === "easy" ? "#4ade80" : report.goalPlan.feasibility === "realistic" ? "#fbbf24" : "#f87171",
                      }}>{report.goalPlan.feasibility?.toUpperCase()}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Champion deal */}
            {report.champion && (
              <div style={{ ...card, border: "1px solid rgba(34,197,94,0.3)", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                  <Star size={15} color="#fbbf24" />
                  <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: 12 }}>NAJLEPSZA OKAZJA</span>
                </div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{report.champion.product}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                  <span style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 7, padding: "4px 10px", color: "#4ade80", fontSize: 12, fontWeight: 700 }}>
                    +${report.champion.netProfit} zysku
                  </span>
                  <span style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 7, padding: "4px 10px", color: "#fbbf24", fontSize: 12, fontWeight: 700 }}>
                    ROI {report.champion.roi}%
                  </span>
                  {report.champion.timeToSell && (
                    <span style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 7, padding: "4px 10px", color: "#93c5fd", fontSize: 12 }}>
                      ⏱ {report.champion.timeToSell}
                    </span>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {report.champion.listAt && (
                    <div style={{ background: "rgba(34,197,94,0.05)", borderRadius: 9, padding: "10px 14px", border: "1px solid rgba(34,197,94,0.15)" }}>
                      <div style={{ color: "#4ade80", fontSize: 9, fontWeight: 700, marginBottom: 4 }}>1. WYSTAW (sprzedaj)</div>
                      <div style={{ color: "#fff", fontSize: 12 }}>{report.champion.listAt}</div>
                    </div>
                  )}
                  {report.champion.sourceAt && (
                    <div style={{ background: "rgba(96,165,250,0.05)", borderRadius: 9, padding: "10px 14px", border: "1px solid rgba(96,165,250,0.15)" }}>
                      <div style={{ color: "#93c5fd", fontSize: 9, fontWeight: 700, marginBottom: 4 }}>2. KUP (po sprzedaży)</div>
                      <div style={{ color: "#fff", fontSize: 12 }}>{report.champion.sourceAt}</div>
                    </div>
                  )}
                </div>

                {report.champion.platforms && report.champion.platforms.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>PLATFORMY SPRZEDAŻY</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {report.champion.platforms.map((p: string) => (
                        <span key={p} style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 6, padding: "3px 10px", color: "#c4b5fd", fontSize: 11 }}>{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {report.champion.searchTerms && report.champion.searchTerms.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>🔍 SZUKAJ TEGO (kopiuj i wklej)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {report.champion.searchTerms.map((t: string, i: number) => (
                        <div key={i} style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "5px 10px", fontFamily: "monospace", fontSize: 11, color: "#a3e635", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          {t}
                          <button onClick={() => navigator.clipboard?.writeText(t)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 10, padding: "0 4px" }}>📋</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {report.champion.steps && report.champion.steps.length > 0 && (
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, marginBottom: 8 }}>PLAN DZIAŁANIA</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {report.champion.steps.map((step: string, i: number) => (
                        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: "#4ade80", fontWeight: 700 }}>{i + 1}</div>
                          <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 1.6, marginTop: 2 }}>{step.replace(/^\d+\.\s*/, "")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Top 3 */}
            {report.top3 && report.top3.length > 0 && (
              <div style={{ ...card, marginBottom: 16 }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, marginBottom: 14 }}>TOP 3 OKAZJE</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {report.top3.map((o, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", borderRadius: 10, background: i === 0 ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${i === 0 ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}` }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: i === 0 ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, fontSize: 12, color: i === 0 ? "#4ade80" : "rgba(255,255,255,0.4)" }}>#{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{o.product}</div>
                        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{o.reason}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 14 }}>+${o.netProfit}</div>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>ROI {o.roi}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Listing Drafts — ready to paste on eBay/Etsy */}
            {report.listingDrafts && report.listingDrafts.length > 0 && (
              <div style={{ ...card, marginBottom: 16 }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, marginBottom: 14, letterSpacing: 0.8 }}>
                  📋 GOTOWE OGŁOSZENIA — skopiuj i wstaw na eBay/Etsy
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {report.listingDrafts.map((d, i) => {
                    const key = `${i}`;
                    const copy = (text: string, field: string) => {
                      navigator.clipboard?.writeText(text).then(() => {
                        setCopiedField(field);
                        setTimeout(() => setCopiedField(null), 2000);
                      });
                    };
                    return (
                      <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${i === 0 ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", background: i === 0 ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: i === 0 ? "#4ade80" : "rgba(255,255,255,0.4)" }}>#{i+1}</div>
                            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{d.platform} · ${d.price}</span>
                          </div>
                        </div>

                        {/* Title */}
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, marginBottom: 4 }}>TYTUŁ OGŁOSZENIA</div>
                          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                            <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 7, padding: "8px 10px", fontSize: 12, color: "#e2e8f0", lineHeight: 1.5 }}>{d.title}</div>
                            <button onClick={() => copy(d.title, `title-${key}`)} style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 7, border: "1px solid rgba(34,197,94,0.3)", background: copiedField === `title-${key}` ? "rgba(34,197,94,0.2)" : "rgba(34,197,94,0.07)", color: copiedField === `title-${key}` ? "#4ade80" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                              {copiedField === `title-${key}` ? "✓" : "📋"}
                            </button>
                          </div>
                        </div>

                        {/* Description */}
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, marginBottom: 4 }}>OPIS</div>
                          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                            <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 7, padding: "8px 10px", fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{d.description}</div>
                            <button onClick={() => copy(d.description, `desc-${key}`)} style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 7, border: "1px solid rgba(96,165,250,0.3)", background: copiedField === `desc-${key}` ? "rgba(96,165,250,0.2)" : "rgba(96,165,250,0.07)", color: copiedField === `desc-${key}` ? "#93c5fd" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                              {copiedField === `desc-${key}` ? "✓" : "📋"}
                            </button>
                          </div>
                        </div>

                        {/* Tags */}
                        {d.tags && d.tags.length > 0 && (
                          <div>
                            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, marginBottom: 4 }}>TAGI</div>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                              {d.tags.map((t: string) => (
                                <span key={t} style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 5, padding: "2px 7px", fontSize: 10, color: "#c4b5fd" }}>{t}</span>
                              ))}
                              <button onClick={() => copy(d.tags.join(", "), `tags-${key}`)} style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(168,85,247,0.3)", background: "transparent", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 10 }}>
                                {copiedField === `tags-${key}` ? "✓ skopiowane" : "📋 kopiuj"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick wins */}
            {report.quickWins && report.quickWins.length > 0 && (
              <div style={{ ...card, marginBottom: 16 }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, marginBottom: 12 }}>⚡ QUICK WINS — zacznij od razu</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {report.quickWins.map((w: string, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <Zap size={12} color="#fbbf24" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 1.6 }}>{w}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {report.warnings && report.warnings.length > 0 && report.warnings[0] && (
              <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ color: "#fbbf24", fontSize: 10, fontWeight: 700, marginBottom: 8 }}>⚠ OSTRZEŻENIA AGENTA</div>
                {report.warnings.map((w: string, i: number) => (
                  <div key={i} style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, lineHeight: 1.6 }}>{w}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ResellLayout>
  );
}
