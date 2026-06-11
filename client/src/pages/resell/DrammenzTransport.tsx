import { useState } from "react";
import { ResellLayout } from "@/components/resell/ResellLayout";
import {
  Truck, MapPin, Phone, Mail, Clock, Shield, Package,
  Star, ChevronRight, CheckCircle, ArrowRight, Warehouse,
} from "lucide-react";

const A = "#f97316"; // orange accent
const D = "#0f172a"; // dark bg
const C = "#1e293b"; // card bg
const B = "#0ea5e9"; // blue accent
const M = "#94a3b8"; // muted
const W = "#f8fafc"; // white

const services = [
  { icon: Truck, title: "Transport Krajowy", desc: "Dostawy door-to-door na terenie całej Norwegii. FTL i LTL.", tag: "od 1h" },
  { icon: Package, title: "Transport Międzynarodowy", desc: "Europa, Skandynawia, Wielka Brytania. Obsługa celna w zestawie.", tag: "EOG" },
  { icon: Warehouse, title: "Magazynowanie", desc: "Nowoczesny magazyn 3 000 m² w Drammen z systemem WMS.", tag: "24/7" },
  { icon: Shield, title: "Transport Specjalistyczny", desc: "Ładunki ponadgabarytowe, ADR, chłodnie, wartościowe towary.", tag: "ADR" },
];

const stats = [
  { value: "23", label: "lata doświadczenia" },
  { value: "180+", label: "pojazdów w flocie" },
  { value: "12 000+", label: "dostaw miesięcznie" },
  { value: "99.2%", label: "terminowość" },
];

const fleet = [
  { name: "Solówki", count: 48, cap: "do 24t" },
  { name: "Zestawy 13,6m", count: 72, cap: "do 24t" },
  { name: "Busy dostawcze", count: 38, cap: "do 3,5t" },
  { name: "Chłodnie", count: 14, cap: "do 18t" },
  { name: "Naczepy ADR", count: 8, cap: "klasy 1–9" },
];

const reviews = [
  { name: "Lars Eriksen", company: "Nordic Seafood AS", stars: 5, text: "Współpracujemy od 8 lat. Terminowość i komunikacja na najwyższym poziomie." },
  { name: "Anna Wiśniewska", company: "PolNor Logistics", stars: 5, text: "Przejazdy Polska–Norwegia bez problemów. Polecam każdemu." },
  { name: "Thomas Berg", company: "Kongsberg Industri", stars: 5, text: "Dostawy ciężarowe zawsze na czas. Profesjonalna obsługa." },
];

export default function DrammenzTransport() {
  const [form, setForm] = useState({ from: "", to: "", weight: "", date: "", name: "", email: "", phone: "" });
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    setTimeout(() => setSent(false), 4000);
    setForm({ from: "", to: "", weight: "", date: "", name: "", email: "", phone: "" });
  };

  const inp = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, padding: "10px 14px", color: W, fontSize: 14, width: "100%",
    outline: "none",
  } as const;

  return (
    <ResellLayout>
      <div style={{ background: D, minHeight: "100dvh", fontFamily: "'Inter', sans-serif", color: W }}>

        {/* ── HERO ──────────────────────────────────────────────────────────────── */}
        <div style={{ background: `linear-gradient(135deg, #0c1220 0%, #0f2040 50%, #0c1220 100%)`, borderBottom: `3px solid ${A}`, padding: "56px 24px 48px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <div style={{ background: A, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center" }}>
                <Truck size={28} color="#fff" strokeWidth={2.5} />
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>DRAMMEN <span style={{ color: A }}>TRANSPORT</span></div>
                <div style={{ fontSize: 12, color: M, letterSpacing: 2 }}>AS · NORGE · EST. 2002</div>
              </div>
            </div>

            <h1 style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.15, marginBottom: 16, maxWidth: 620 }}>
              Niezawodna logistyka<br /><span style={{ color: A }}>Skandynawia i Europa</span>
            </h1>
            <p style={{ fontSize: 16, color: M, maxWidth: 520, lineHeight: 1.7, marginBottom: 32 }}>
              Profesjonalne usługi transportowe od 2002 roku. Siedziba w Drammen, zasięg ogólnopolski i europejski. Flota 180+ pojazdów, dostępność 24/7.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
              <a href="#wycena" style={{ background: A, color: "#fff", padding: "14px 28px", borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                Zamów wycenę <ArrowRight size={16} />
              </a>
              <a href="tel:+4732123456" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: W, padding: "14px 28px", borderRadius: 10, fontWeight: 600, fontSize: 15, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                <Phone size={16} /> +47 32 12 34 56
              </a>
            </div>

            <div style={{ display: "flex", gap: 16, marginTop: 28, flexWrap: "wrap" as const }}>
              {[{ icon: MapPin, text: "Drammen, Viken — Norwegia" }, { icon: Clock, text: "Dyspozytornia 24/7/365" }, { icon: CheckCircle, text: "Ubezpieczenie OCP do 2M€" }].map(({ icon: Icon, text }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: M }}>
                  <Icon size={15} color={A} /> {text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── STATS ─────────────────────────────────────────────────────────────── */}
        <div style={{ background: C, borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "24px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
            {stats.map(s => (
              <div key={s.label} style={{ textAlign: "center" as const }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: A }}>{s.value}</div>
                <div style={{ fontSize: 12, color: M, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>

          {/* ── SERVICES ────────────────────────────────────────────────────────── */}
          <section style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 11, color: A, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>USŁUGI</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>Co oferujemy</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
              {services.map(({ icon: Icon, title, desc, tag }) => (
                <div key={title} style={{ background: C, borderRadius: 12, padding: "20px 22px", border: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ background: `rgba(249,115,22,0.12)`, borderRadius: 10, padding: 10, flexShrink: 0 }}>
                    <Icon size={22} color={A} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
                      <span style={{ fontSize: 10, background: `rgba(14,165,233,0.15)`, color: B, borderRadius: 4, padding: "2px 7px", fontWeight: 600 }}>{tag}</span>
                    </div>
                    <p style={{ fontSize: 13, color: M, lineHeight: 1.6, margin: 0 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── FLEET ───────────────────────────────────────────────────────────── */}
          <section style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 11, color: A, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>FLOTA</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Nasze pojazdy</h2>
            <div style={{ background: C, borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" as const }}>
              {fleet.map((f, i) => (
                <div key={f.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: i < fleet.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Truck size={16} color={A} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{f.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 24, fontSize: 13, color: M }}>
                    <span><span style={{ color: W, fontWeight: 700 }}>{f.count}</span> szt.</span>
                    <span style={{ color: B, fontWeight: 600 }}>{f.cap}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── QUOTE FORM ──────────────────────────────────────────────────────── */}
          <section id="wycena" style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 11, color: A, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>WYCENA</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Zamów bezpłatną wycenę</h2>
            <div style={{ background: C, borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", padding: "28px 24px" }}>
              {sent ? (
                <div style={{ textAlign: "center" as const, padding: "32px 0" }}>
                  <CheckCircle size={48} color="#4ade80" style={{ margin: "0 auto 16px" }} />
                  <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Zapytanie wysłane!</div>
                  <div style={{ color: M, fontSize: 14 }}>Skontaktujemy się w ciągu 2 godzin roboczych.</div>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, color: M, letterSpacing: 1, display: "block", marginBottom: 6 }}>MIEJSCE ZAŁADUNKU</label>
                      <input style={inp} placeholder="np. Oslo, Norwegia" value={form.from} onChange={e => setForm(p => ({ ...p, from: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: M, letterSpacing: 1, display: "block", marginBottom: 6 }}>MIEJSCE DOSTAWY</label>
                      <input style={inp} placeholder="np. Warszawa, Polska" value={form.to} onChange={e => setForm(p => ({ ...p, to: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: M, letterSpacing: 1, display: "block", marginBottom: 6 }}>WAGA / ŁADUNEK (kg)</label>
                      <input style={inp} placeholder="np. 5000 kg, palety, ADR..." value={form.weight} onChange={e => setForm(p => ({ ...p, weight: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: M, letterSpacing: 1, display: "block", marginBottom: 6 }}>PLANOWANA DATA</label>
                      <input type="date" style={inp} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: M, letterSpacing: 1, display: "block", marginBottom: 6 }}>IMIĘ I NAZWISKO</label>
                      <input style={inp} placeholder="Jan Kowalski" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: M, letterSpacing: 1, display: "block", marginBottom: 6 }}>E-MAIL</label>
                      <input type="email" style={inp} placeholder="jan@firma.pl" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 11, color: M, letterSpacing: 1, display: "block", marginBottom: 6 }}>TELEFON (opcjonalnie)</label>
                    <input style={{ ...inp, width: "calc(50% - 7px)" }} placeholder="+47 / +48..." value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <button type="submit" style={{ background: A, color: "#fff", border: "none", borderRadius: 10, padding: "13px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                    Wyślij zapytanie <ChevronRight size={18} />
                  </button>
                </form>
              )}
            </div>
          </section>

          {/* ── REVIEWS ─────────────────────────────────────────────────────────── */}
          <section style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 11, color: A, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>OPINIE</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Co mówią klienci</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
              {reviews.map(r => (
                <div key={r.name} style={{ background: C, borderRadius: 12, padding: "20px", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
                    {Array.from({ length: r.stars }).map((_, i) => <Star key={i} size={14} fill={A} color={A} />)}
                  </div>
                  <p style={{ fontSize: 13, color: M, lineHeight: 1.7, marginBottom: 14 }}>"{r.text}"</p>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: B }}>{r.company}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ── CONTACT ─────────────────────────────────────────────────────────── */}
          <section>
            <div style={{ background: `linear-gradient(135deg, #0f2040, #1a0f30)`, borderRadius: 16, padding: "32px 28px", border: `1px solid ${A}40`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
              <div>
                <div style={{ fontSize: 11, color: A, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>KONTAKT</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Drammen Transport AS</h2>
                {[
                  { icon: MapPin, text: "Grønland 58, 3045 Drammen, Norwegia" },
                  { icon: Phone, text: "+47 32 12 34 56 (dyspozytornia 24/7)" },
                  { icon: Mail, text: "transport@drammen-as.no" },
                  { icon: Clock, text: "Biuro: Pon–Pt 07:00–17:00" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                    <Icon size={16} color={A} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 14, color: M, lineHeight: 1.5 }}>{text}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, color: A, letterSpacing: 2, fontWeight: 700, marginBottom: 16 }}>CERTYFIKATY</div>
                {["ISO 9001:2015 — Zarządzanie jakością", "ISO 14001 — Zarządzanie środowiskowe", "Licencja transportowa UE nr PL/XXX/2002", "ADR — transport materiałów niebezpiecznych", "Ubezpieczenie OCP 2 000 000 EUR"].map(c => (
                  <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13, color: M }}>
                    <CheckCircle size={14} color="#4ade80" />
                    {c}
                  </div>
                ))}
              </div>
            </div>
          </section>

        </div>

        {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
        <div style={{ background: "#060d18", borderTop: "1px solid rgba(255,255,255,0.07)", padding: "20px 24px", textAlign: "center" as const }}>
          <div style={{ fontSize: 12, color: M }}>© 2025 Drammen Transport AS · Org.nr: 123 456 789 · Grønland 58, 3045 Drammen · Norway</div>
        </div>

      </div>
    </ResellLayout>
  );
}
