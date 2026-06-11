import { useState, useEffect, useRef } from "react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { Truck, MapPin, Phone, Mail, Clock, Shield, Package, Star, ChevronRight,
  CheckCircle, ArrowRight, Warehouse, Award, Users, TrendingUp, Zap, Lock,
  Globe, AlertCircle, ChevronDown } from "lucide-react";

// ── Design tokens ──────────────────────────────────────────────────────────────
const OR = "#f97316";   // primary orange — action, energy
const NV = "#0a0f1e";   // navy — authority, trust
const NV2 = "#0d1528";
const NV3 = "#111e35";
const NV4 = "#1a2b47";
const SL = "#94a3b8";   // slate — secondary text
const GR = "#22c55e";   // green — trust, success
const W = "#f8fafc";

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ to, suffix = "", duration = 1400 }: { to: number; suffix?: string; duration?: number }) {
  const [v, setV] = useState(0);
  const started = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - start) / duration, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          setV(Math.round(ease * to));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to, duration]);
  return <span ref={ref}>{v}{suffix}</span>;
}

// ── Data ──────────────────────────────────────────────────────────────────────
const SERVICES = [
  { icon: Truck, color: OR, title: "FTL / LTL Norwegia", sub: "Transport krajowy",
    points: ["Dostawy door-to-door w całej Norwegii", "Odbiór tego samego dnia (do 14:00)", "Śledzenie GPS w czasie rzeczywistym", "Ubezpieczenie do 500 000 NOK"] },
  { icon: Globe, color: "#3b82f6", title: "Transport EU / Skandynawia", sub: "Zasięg międzynarodowy",
    points: ["30 krajów EOG bez ograniczeń", "Obsługa celna Norwegia–UE", "Przeprawy promowe w cenie", "Dedykowany opiekun trasy"] },
  { icon: Warehouse, color: "#8b5cf6", title: "Magazynowanie 3PL", sub: "Drammen Warehouse",
    points: ["3 000 m² nowoczesnej powierzchni", "System WMS z dostępem online", "Cross-docking — przesyłki tego samego dnia", "Zarządzanie stanami i kompletacja"] },
  { icon: Shield, color: GR, title: "Ładunki specjalne", sub: "ADR / Ponadgabaryt",
    points: ["Certyfikat ADR klasy 1–9", "Ładunki ponadgabarytowe do 120t", "Transport leków i żywności (chłodnie)", "Asekuracja i ochrona dostępna"] },
];

const FEARS = [
  { icon: Clock, title: "Obawiasz się spóźnień?", ans: "99.2% dostaw na czas przez 3 lata z rzędu. Płacimy karę umowną za każdą godzinę opóźnienia powyżej 2h." },
  { icon: Lock, title: "Czy Twój towar jest bezpieczny?", ans: "OCP do 2 000 000 EUR, GPS 24/7, zabezpieczone naczepy. Każdy ładunek fotografowany przy załadunku." },
  { icon: AlertCircle, title: "A co jeśli coś się wydarzy?", ans: "Dyspozytornia 24/7, dedykowany opiekun, zastępczy pojazd w 45 minut. Nigdy nie zostawiamy klienta bez wsparcia." },
  { icon: TrendingUp, title: "Czy ceny są przewidywalne?", ans: "Kontrakt z gwarantowaną stawką na 12 miesięcy. Zero dopłat paliwowych z dnia na dzień. Jedna faktura miesięcznie." },
];

const CLIENTS = ["Hydro ASA", "Nortura", "PolNor Logistics", "Elkjøp Nordic", "Kongsberg Gruppen", "Coop Norge"];

const REVIEWS = [
  { name: "Lars Eriksen", role: "Dyrektor logistyki", company: "Hydro ASA", stars: 5,
    text: "Współpracujemy od 8 lat. Przy każdym przeglądzie dostawców Drammen Transport wygrywa jakością i terminowością. Polecam bez zastrzeżeń." },
  { name: "Anna Wiśniewska", role: "Supply Chain Manager", company: "PolNor Logistics", stars: 5,
    text: "Trasa Polska–Norwegia co tydzień, nigdy żadnego problemu. Kierowcy profesjonalni, dokumentacja zawsze kompletna. To jest standard." },
  { name: "Thomas Berg", role: "CEO", company: "Kongsberg Industri AS", stars: 5,
    text: "Obsługują nasze najcięższe ładunki ponadgabarytowe. Planowanie tras, pozwolenia, eskorta — wszystko w pakiecie. Oszczędność czasu ogromna." },
];

const STEPS = ["Wypełnij formularz (2 min)", "Wycena w ciągu 2h roboczych", "Potwierdzasz i gotowe"];

// ── Component ─────────────────────────────────────────────────────────────────
export default function DrammenzTransport() {
  const [form, setForm] = useState({ from: "", to: "", weight: "", cargo: "", date: "", name: "", company: "", email: "", phone: "" });
  const [step, setStep] = useState(0); // 0=route, 1=cargo, 2=contact
  const [sent, setSent] = useState(false);
  const [openFear, setOpenFear] = useState<number | null>(null);
  const [spotsLeft] = useState(() => Math.floor(Math.random() * 5) + 3); // 3–7

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const inp = {
    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10, padding: "12px 14px", color: W, fontSize: 14, outline: "none",
    transition: "border-color .2s",
  } as const;
  const lbl = { fontSize: 11, color: SL, letterSpacing: 1, fontWeight: 600, display: "block", marginBottom: 6 } as const;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    setTimeout(() => { setSent(false); setStep(0); setForm({ from:"",to:"",weight:"",cargo:"",date:"",name:"",company:"",email:"",phone:"" }); }, 5000);
  };

  return (
    <ResellLayout>
      <div style={{ background: NV, minHeight: "100dvh", color: W, fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* ── URGENCY BAR ─────────────────────────────────────────────────────── */}
        <div style={{ background: `linear-gradient(90deg, ${OR}, #ea580c)`, padding: "9px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 13, fontWeight: 600 }}>
          <Zap size={14} fill="#fff" color="#fff" />
          <span>Tylko <strong>{spotsLeft} wolne terminy</strong> na ten tydzień — Zadzwoń teraz: <a href="tel:+4732123456" style={{ color: "#fff", textDecoration: "underline" }}>+47 32 12 34 56</a></span>
          <Zap size={14} fill="#fff" color="#fff" />
        </div>

        {/* ── HERO ────────────────────────────────────────────────────────────── */}
        <div style={{ background: `radial-gradient(ellipse 120% 80% at 60% 0%, #0d2050 0%, ${NV} 65%)`, padding: "52px 20px 56px", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
          <div style={{ maxWidth: 860, margin: "0 auto" }}>

            {/* Logo row */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
              <div style={{ background: `linear-gradient(135deg, ${OR}, #ea580c)`, borderRadius: 16, padding: 14, boxShadow: `0 8px 32px ${OR}50` }}>
                <Truck size={30} color="#fff" strokeWidth={2.2} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>DRAMMEN <span style={{ color: OR }}>TRANSPORT</span></div>
                <div style={{ fontSize: 11, color: SL, letterSpacing: 3, marginTop: 4 }}>AS · NORGE · EST. 2002</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                {["ISO 9001", "ADR", "MiCA EU"].map(badge => (
                  <div key={badge} style={{ fontSize: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "4px 9px", color: SL, fontWeight: 600 }}>{badge}</div>
                ))}
              </div>
            </div>

            {/* Headline */}
            <div style={{ fontSize: 11, color: OR, letterSpacing: 3, fontWeight: 700, marginBottom: 14 }}>LIDER TRANSPORTU W SKANDYNAWII</div>
            <h1 style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.12, marginBottom: 20, maxWidth: 640 }}>
              Twój towar dotrze na czas —<br /><span style={{ color: OR }}>albo płacimy karę.</span>
            </h1>
            <p style={{ fontSize: 16, color: SL, maxWidth: 560, lineHeight: 1.75, marginBottom: 36 }}>
              Gwarantujemy terminowość lub zwracamy koszty. 23 lata na rynku, 180+ pojazdów, ubezpieczenie OCP 2M€. Ponad 500 aktywnych firm nam ufa.
            </p>

            {/* Social proof pill */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 100, padding: "8px 16px", marginBottom: 32 }}>
              <div style={{ display: "flex" }}>
                {["#f97316","#3b82f6","#8b5cf6","#22c55e"].map((c, i) => (
                  <div key={i} style={{ width: 24, height: 24, borderRadius: "50%", background: c, border: "2px solid "+NV, marginLeft: i ? -8 : 0 }} />
                ))}
              </div>
              <span style={{ fontSize: 13, color: W }}>Zaufało nam <strong>500+</strong> firm w Europie · <span style={{ color: GR }}>★ 4.9/5.0</span></span>
            </div>

            {/* CTAs */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
              <a href="#wycena" style={{ background: `linear-gradient(135deg, ${OR}, #ea580c)`, color: "#fff", padding: "15px 30px", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none", display: "flex", alignItems: "center", gap: 9, boxShadow: `0 4px 20px ${OR}40` }}>
                Bezpłatna wycena w 2h <ArrowRight size={17} />
              </a>
              <a href="tel:+4732123456" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: W, padding: "15px 26px", borderRadius: 12, fontWeight: 600, fontSize: 15, textDecoration: "none", display: "flex", alignItems: "center", gap: 9 }}>
                <Phone size={16} color={OR} /> +47 32 12 34 56
              </a>
            </div>

            {/* Trust badges */}
            <div style={{ display: "flex", gap: 20, marginTop: 28, flexWrap: "wrap" as const }}>
              {[
                { icon: MapPin, text: "Drammen, Norwegia" },
                { icon: Clock, text: "Dyspozytornia 24/7/365" },
                { icon: Shield, text: "OCP do 2 000 000 €" },
                { icon: CheckCircle, text: "99.2% dostaw na czas" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: SL }}>
                  <Icon size={13} color={OR} /> {text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── ANIMATED STATS ──────────────────────────────────────────────────── */}
        <div style={{ background: NV3, borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "32px 20px" }}>
          <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0 }}>
            {[
              { to: 23, suffix: " lat", label: "na rynku", color: OR },
              { to: 180, suffix: "+", label: "pojazdów w flocie", color: "#3b82f6" },
              { to: 12000, suffix: "+", label: "dostaw miesięcznie", color: "#8b5cf6" },
              { to: 99, suffix: ".2%", label: "terminowość", color: GR },
            ].map(({ to, suffix, label, color }, i) => (
              <div key={label} style={{ textAlign: "center" as const, padding: "16px 12px", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div style={{ fontSize: 36, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>
                  <Counter to={to} suffix={suffix} />
                </div>
                <div style={{ fontSize: 12, color: SL, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CLIENT LOGOS (social proof) ──────────────────────────────────────── */}
        <div style={{ background: NV2, borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "20px 20px" }}>
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <div style={{ fontSize: 11, color: SL, textAlign: "center" as const, letterSpacing: 2, marginBottom: 16 }}>ZAUFALI NAM M.IN.</div>
            <div style={{ display: "flex", gap: 0, justifyContent: "space-between", flexWrap: "wrap" as const }}>
              {CLIENTS.map(c => (
                <div key={c} style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, padding: "6px 12px" }}>{c}</div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 20px 60px" }}>

          {/* ── SERVICES ──────────────────────────────────────────────────────── */}
          <section style={{ marginBottom: 60 }}>
            <div style={{ fontSize: 11, color: OR, letterSpacing: 3, fontWeight: 700, marginBottom: 10 }}>USŁUGI</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Kompleksowa logistyka pod jednym dachem</h2>
            <p style={{ color: SL, fontSize: 15, marginBottom: 28, maxWidth: 520 }}>Nie musisz koordynować 5 firm. Robimy wszystko — od odbioru do dostawy.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
              {SERVICES.map(({ icon: Icon, color, title, sub, points }) => (
                <div key={title} style={{ background: NV3, borderRadius: 16, padding: "24px", border: `1px solid rgba(255,255,255,0.07)`, transition: "border-color .2s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                    <div style={{ background: `${color}18`, borderRadius: 12, padding: 11 }}>
                      <Icon size={22} color={color} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
                      <div style={{ fontSize: 11, color: SL, marginTop: 2 }}>{sub}</div>
                    </div>
                  </div>
                  {points.map(p => (
                    <div key={p} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 9 }}>
                      <CheckCircle size={13} color={GR} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 13, color: SL, lineHeight: 1.5 }}>{p}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {/* ── FEAR ELIMINATION ──────────────────────────────────────────────── */}
          <section style={{ marginBottom: 60 }}>
            <div style={{ fontSize: 11, color: OR, letterSpacing: 3, fontWeight: 700, marginBottom: 10 }}>GWARANCJE</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Twoje obawy — nasze odpowiedzi</h2>
            <p style={{ color: SL, fontSize: 15, marginBottom: 24, maxWidth: 480 }}>Każda firma transportowa obiecuje. My dajemy gwarancje pisemne.</p>
            <div style={{ background: NV3, borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" as const }}>
              {FEARS.map(({ icon: Icon, title, ans }, i) => (
                <div key={title}>
                  <button onClick={() => setOpenFear(openFear === i ? null : i)}
                    style={{ width: "100%", background: "none", border: "none", padding: "18px 22px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", textAlign: "left" as const, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <Icon size={18} color={OR} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: W }}>{title}</span>
                    <ChevronDown size={16} color={SL} style={{ transform: openFear === i ? "rotate(180deg)" : "none", transition: ".2s" }} />
                  </button>
                  {openFear === i && (
                    <div style={{ padding: "16px 22px 18px 54px", background: "rgba(249,115,22,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <p style={{ fontSize: 14, color: SL, lineHeight: 1.75, margin: 0 }}>{ans}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── QUOTE FORM ────────────────────────────────────────────────────── */}
          <section id="wycena" style={{ marginBottom: 60 }}>
            <div style={{ fontSize: 11, color: OR, letterSpacing: 3, fontWeight: 700, marginBottom: 10 }}>WYCENA</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap" as const, gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>Bezpłatna wycena w 2h</h2>
                <p style={{ color: SL, fontSize: 14 }}>Bez zobowiązań. Odpowiadamy w godzinach roboczych lub dzwonimy.</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {STEPS.map((s, i) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: i <= step ? OR : "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, flexShrink: 0, color: i <= step ? "#fff" : SL }}>{i + 1}</div>
                    <span style={{ color: i <= step ? W : SL, display: step < 2 ? "block" : "none" }}>{s}</span>
                    {i < 2 && <ChevronRight size={12} color={SL} />}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: NV3, borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", padding: "32px 28px" }}>
              {sent ? (
                <div style={{ textAlign: "center" as const, padding: "32px 0" }}>
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                    <CheckCircle size={36} color={GR} />
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Zapytanie wysłane!</div>
                  <div style={{ color: SL, fontSize: 14, maxWidth: 320, margin: "0 auto" }}>Skontaktujemy się e-mailem lub telefonicznie w ciągu <strong style={{ color: W }}>2 godzin roboczych</strong>.</div>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {step === 0 && (
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Skąd i dokąd? 📍</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                        <div><label style={lbl}>MIEJSCE ZAŁADUNKU</label><input style={inp} placeholder="np. Oslo, NO" value={form.from} onChange={e => set("from", e.target.value)} required /></div>
                        <div><label style={lbl}>MIEJSCE DOSTAWY</label><input style={inp} placeholder="np. Warszawa, PL" value={form.to} onChange={e => set("to", e.target.value)} required /></div>
                      </div>
                      <div style={{ marginBottom: 24 }}>
                        <label style={lbl}>PLANOWANA DATA ODBIORU</label>
                        <input type="date" style={{ ...inp, width: "calc(50% - 8px)" }} value={form.date} onChange={e => set("date", e.target.value)} />
                      </div>
                      <button type="button" onClick={() => { if (form.from && form.to) setStep(1); }}
                        style={{ background: `linear-gradient(135deg, ${OR}, #ea580c)`, color: "#fff", border: "none", borderRadius: 12, padding: "14px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: `0 4px 16px ${OR}40` }}>
                        Dalej <ChevronRight size={18} />
                      </button>
                    </div>
                  )}
                  {step === 1 && (
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Co przewozimy? 📦</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                        <div><label style={lbl}>WAGA / ŁADUNEK</label><input style={inp} placeholder="np. 5000 kg, 12 palet" value={form.weight} onChange={e => set("weight", e.target.value)} required /></div>
                        <div><label style={lbl}>RODZAJ TOWARU</label><input style={inp} placeholder="np. meble, sprzęt ADR, żywność" value={form.cargo} onChange={e => set("cargo", e.target.value)} /></div>
                      </div>
                      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                        <button type="button" onClick={() => setStep(0)} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: W, borderRadius: 10, padding: "13px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>← Wróć</button>
                        <button type="button" onClick={() => { if (form.weight) setStep(2); }}
                          style={{ background: `linear-gradient(135deg, ${OR}, #ea580c)`, color: "#fff", border: "none", borderRadius: 12, padding: "13px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: `0 4px 16px ${OR}40` }}>
                          Dalej <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                  {step === 2 && (
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Dane kontaktowe 👤</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                        <div><label style={lbl}>IMIĘ I NAZWISKO</label><input style={inp} placeholder="Jan Kowalski" value={form.name} onChange={e => set("name", e.target.value)} required /></div>
                        <div><label style={lbl}>FIRMA (opcjonalnie)</label><input style={inp} placeholder="Nazwa sp. z o.o." value={form.company} onChange={e => set("company", e.target.value)} /></div>
                        <div><label style={lbl}>E-MAIL</label><input type="email" style={inp} placeholder="jan@firma.pl" value={form.email} onChange={e => set("email", e.target.value)} required /></div>
                        <div><label style={lbl}>TELEFON</label><input style={inp} placeholder="+47 / +48..." value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
                      </div>
                      {/* Summary */}
                      <div style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: SL, display: "flex", gap: 20, flexWrap: "wrap" as const }}>
                        <span>📍 <strong style={{ color: W }}>{form.from}</strong> → <strong style={{ color: W }}>{form.to}</strong></span>
                        <span>📦 <strong style={{ color: W }}>{form.weight}</strong></span>
                        {form.date && <span>📅 <strong style={{ color: W }}>{new Date(form.date).toLocaleDateString("pl")}</strong></span>}
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button type="button" onClick={() => setStep(1)} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: W, borderRadius: 10, padding: "13px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>← Wróć</button>
                        <button type="submit" style={{ background: `linear-gradient(135deg, ${OR}, #ea580c)`, color: "#fff", border: "none", borderRadius: 12, padding: "13px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: `0 4px 16px ${OR}40` }}>
                          Wyślij zapytanie ✓
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>
          </section>

          {/* ── REVIEWS ───────────────────────────────────────────────────────── */}
          <section style={{ marginBottom: 60 }}>
            <div style={{ fontSize: 11, color: OR, letterSpacing: 3, fontWeight: 700, marginBottom: 10 }}>OPINIE</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: 28, fontWeight: 900 }}>Co mówią klienci</h2>
              <div style={{ fontSize: 24, fontWeight: 900, color: OR }}>★ 4.9 <span style={{ fontSize: 13, color: SL, fontWeight: 400 }}>/ 5.0 · 347 opinii</span></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
              {REVIEWS.map(r => (
                <div key={r.name} style={{ background: NV3, borderRadius: 16, padding: "22px", border: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column" as const }}>
                  <div style={{ display: "flex", gap: 2, marginBottom: 14 }}>
                    {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} fill={OR} color={OR} />)}
                  </div>
                  <p style={{ fontSize: 13, color: SL, lineHeight: 1.75, flex: 1, marginBottom: 18 }}>„{r.text}"</p>
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: SL, marginTop: 2 }}>{r.role} · <span style={{ color: OR }}>{r.company}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── CONTACT ───────────────────────────────────────────────────────── */}
          <section>
            <div style={{ background: `radial-gradient(ellipse 100% 100% at 50% 0%, #0d2050, ${NV3})`, borderRadius: 20, padding: "40px 32px", border: `1px solid rgba(249,115,22,0.2)`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
              <div>
                <div style={{ fontSize: 11, color: OR, letterSpacing: 3, fontWeight: 700, marginBottom: 12 }}>KONTAKT BEZPOŚREDNI</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Drammen Transport AS</div>
                {[
                  { icon: MapPin, text: "Grønland 58, 3045 Drammen, Norwegia", href: null },
                  { icon: Phone, text: "+47 32 12 34 56 — dyspozytornia 24/7", href: "tel:+4732123456" },
                  { icon: Mail, text: "transport@drammen-as.no", href: "mailto:transport@drammen-as.no" },
                  { icon: Clock, text: "Biuro: Pon–Pt 07:00–17:00 | Dyspozytornia: non-stop", href: null },
                ].map(({ icon: Icon, text, href }) => (
                  <div key={text} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
                    <Icon size={16} color={OR} style={{ flexShrink: 0, marginTop: 2 }} />
                    {href ? <a href={href} style={{ fontSize: 14, color: SL, lineHeight: 1.6, textDecoration: "none" }}>{text}</a>
                      : <span style={{ fontSize: 14, color: SL, lineHeight: 1.6 }}>{text}</span>}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, color: OR, letterSpacing: 3, fontWeight: 700, marginBottom: 16 }}>CERTYFIKATY & GWARANCJE</div>
                {[
                  { icon: Award, text: "ISO 9001:2015 — Certyfikat Zarządzania Jakością" },
                  { icon: Shield, text: "OCP do 2 000 000 EUR na każdy transport" },
                  { icon: CheckCircle, text: "ADR — transport materiałów niebezpiecznych kl. 1–9" },
                  { icon: TrendingUp, text: "99.2% terminowość potwierdzana audytem rocznym" },
                  { icon: Users, text: "500+ aktywnych klientów korporacyjnych w EOG" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 13 }}>
                    <Icon size={15} color={GR} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: SL, lineHeight: 1.5 }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

        </div>

        {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
        <div style={{ background: "#050b15", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "22px 24px", textAlign: "center" as const }}>
          <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)" }}>
            © 2025 Drammen Transport AS · Org.nr: 123 456 789 · Grønland 58, 3045 Drammen, Norway · All rights reserved
          </div>
        </div>

      </div>
    </ResellLayout>
  );
}
