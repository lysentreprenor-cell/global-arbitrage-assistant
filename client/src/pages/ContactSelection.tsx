import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, User, FileText, Phone, ArrowUpRight, Calendar, FilePlus, Building2, QrCode, Share2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { motion } from "framer-motion";
import { useUserSearch } from "@/hooks/useUserSearch";
import UserHandleText from "@/components/UserHandleText";
import { useLang } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";

export default function ContactSelection() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get("mode") || "send";
  const { contacts, user, openConversation } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [requestAmount, setRequestAmount] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const userSearch = useUserSearch();
  const { lang } = useLang();
  const { toast } = useToast();
  const pl = lang === "pl";

  useEffect(() => {
    userSearch.search(searchTerm);
  }, [searchTerm, userSearch.search]);

  const filteredContacts = userSearch.mergeWithLocalContacts(
    contacts.filter(c => c.handle.toLowerCase() !== user?.handle?.toLowerCase()),
    searchTerm
  );

  const handleShareLink = async () => {
    const amount = requestAmount ? `&amount=${requestAmount}` : "";
    const note = requestNote ? `&note=${encodeURIComponent(requestNote)}` : "";
    const link = `${window.location.origin}/pay/${user?.handle}${amount || note ? `?${amount.slice(1)}${note}` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: pl ? "Prośba o płatność" : "Payment Request",
          text: pl
            ? `${user?.name} prosi o przelew${requestAmount ? ` ${requestAmount} PLN` : ""}${requestNote ? ` — ${requestNote}` : ""}`
            : `${user?.name} is requesting a payment${requestAmount ? ` of ${requestAmount} PLN` : ""}`,
          url: link,
        });
      } else {
        await navigator.clipboard.writeText(link);
        toast({ title: pl ? "Link skopiowany" : "Link copied", description: link });
      }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-background pb-24 relative overflow-hidden flex flex-col">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      {/* ── Header ── */}
      <header className="px-6 pt-14 pb-4 sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-white/5">
        <div className="flex items-center mb-5">
          <Button
            variant="ghost" size="icon"
            className="rounded-full bg-secondary border border-white/5 mr-4 hover:bg-secondary/80"
            onClick={() => setLocation(mode === "message" ? "/messages" : "/")}
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Button>
          <div>
            <h1 className="text-2xl font-heading text-foreground leading-tight">
              {mode === "message"
                ? (pl ? "Nowa wiadomość" : "New Message")
                : mode === "request"
                ? (pl ? "Poproś o przelew" : "Request Payment")
                : (pl ? "Wyślij do" : "Send to")}
            </h1>
            {mode === "request" && (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 1, fontWeight: 500 }}>
                {pl ? "Podaj kwotę i wybierz osobę lub udostępnij link" : "Set amount, pick a person or share a link"}
              </p>
            )}
          </div>
        </div>

        {/* Search field — only show for message mode or when contacts make sense */}
        {mode !== "request" || searchTerm !== "" || filteredContacts.length > 0 ? (
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder={pl ? "Imię, @nick, email lub telefon" : "Name, @username, email or phone"}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-12 pl-11 pr-4 bg-card border border-white/10 rounded-xl text-[15px] focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none"
              autoFocus={mode !== "request"}
              data-testid="input-contact-search"
            />
          </div>
        ) : null}
      </header>

      <main className="px-6 py-5 relative z-10 flex-1 space-y-4">

        {/* ═══════════════════════════════════
            REQUEST MODE — nowy, kompletny flow
            ═══════════════════════════════════ */}
        {mode === "request" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

            {/* Kwota */}
            <div style={{
              borderRadius: 22,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.09)",
              padding: "20px 20px 16px",
            }}>
              <div style={{ fontSize: 10, letterSpacing: 4, fontWeight: 800, color: "rgba(255,255,255,0.30)", marginBottom: 14 }}>
                {pl ? "KWOTA" : "AMOUNT"}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={requestAmount}
                  onChange={e => setRequestAmount(e.target.value)}
                  style={{
                    flex: 1, background: "none", border: "none", outline: "none",
                    fontSize: 48, fontWeight: 800, lineHeight: 1,
                    color: requestAmount ? "white" : "rgba(255,255,255,0.18)",
                    width: "100%",
                  }}
                />
                <span style={{
                  fontSize: 20, fontWeight: 700, paddingBottom: 6,
                  color: requestAmount ? "var(--primary, #D4A020)" : "rgba(255,255,255,0.25)",
                  transition: "color 0.2s",
                }}>PLN</span>
              </div>
              <div style={{ marginTop: 14, height: 1, background: "rgba(255,255,255,0.06)" }} />
              <input
                type="text"
                placeholder={pl ? "Powód (opcjonalnie)…" : "Reason (optional)…"}
                value={requestNote}
                onChange={e => setRequestNote(e.target.value)}
                style={{
                  marginTop: 12, width: "100%", background: "none", border: "none",
                  outline: "none", fontSize: 14, color: "rgba(255,255,255,0.70)",
                  fontWeight: 500,
                }}
              />
            </div>

            {/* QR + Udostępnij link */}
            <div style={{ display: "flex", gap: 10 }}>
              {[
                {
                  icon: <QrCode size={20} />,
                  label: pl ? "Kod QR" : "QR Code",
                  sub: pl ? "Pokaż do zeskanowania" : "Show to scan",
                  onClick: () => setLocation(`/transfer/new?to=qr&mode=request${requestAmount ? `&amount=${requestAmount}` : ""}`),
                  testId: "tile-request-qr",
                },
                {
                  icon: <Share2 size={20} />,
                  label: pl ? "Udostępnij" : "Share Link",
                  sub: pl ? "Link, SMS, WhatsApp…" : "Link, SMS, WhatsApp…",
                  onClick: handleShareLink,
                  testId: "tile-request-share",
                },
              ].map(btn => (
                <button
                  key={btn.testId}
                  data-testid={btn.testId}
                  onClick={btn.onClick}
                  style={{
                    flex: 1, borderRadius: 18, padding: "16px 12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    cursor: "pointer", transition: "all 0.15s ease",
                  }}
                  onMouseDown={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "scale(0.96)"; }}
                  onMouseUp={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
                  onTouchStart={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "scale(0.96)"; }}
                  onTouchEnd={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
                >
                  <div style={{ color: "var(--primary, #D4A020)", opacity: 0.9 }}>{btn.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.85)", letterSpacing: 0.2 }}>{btn.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.35)", textAlign: "center", lineHeight: 1.3 }}>{btn.sub}</div>
                </button>
              ))}
            </div>

            {/* Utwórz umowę — ciemny styl */}
            <div
              data-testid="tile-create-contract"
              onClick={() => setLocation("/agreements/new")}
              style={{
                height: 62, borderRadius: 16,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.09)",
                display: "flex", alignItems: "center", gap: 12, padding: "0 16px",
                cursor: "pointer", transition: "all 0.15s ease",
              }}
              onMouseDown={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "scale(0.97)"; }}
              onMouseUp={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
              onTouchStart={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "scale(0.97)"; }}
              onTouchEnd={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <FilePlus style={{ width: 16, height: 16, color: "var(--primary, #D4A020)" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>{pl ? "Utwórz umowę" : "Create contract"}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{pl ? "Usługa, wynajem, sprzedaż…" : "Service, rental, sale…"}</div>
              </div>
              <ArrowUpRight style={{ width: 14, height: 14, color: "rgba(255,255,255,0.30)", flexShrink: 0 }} />
            </div>

            {/* Separator przed kontaktami */}
            {filteredContacts.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.28)" }}>
                  {pl ? "LUB WYBIERZ OSOBĘ" : "OR PICK A PERSON"}
                </span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              </div>
            )}

            {/* Search field for request mode — below amount */}
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder={pl ? "Szukaj osoby…" : "Search person…"}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-12 pl-11 pr-4 bg-card border border-white/10 rounded-xl text-[15px] focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none"
                data-testid="input-contact-search"
              />
            </div>

          </motion.div>
        )}

        {/* ═══════════════════════════════
            SEND MODE — kwota + metody + umowa
            ═══════════════════════════════ */}
        {mode === "send" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

            {/* Kwota (opcjonalnie) — pre-fill przed wyborem osoby */}
            <div style={{
              borderRadius: 22,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.09)",
              padding: "20px 20px 16px",
            }}>
              <div style={{ fontSize: 10, letterSpacing: 4, fontWeight: 800, color: "rgba(255,255,255,0.30)", marginBottom: 14 }}>
                {pl ? "KWOTA" : "AMOUNT"}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={requestAmount}
                  onChange={e => setRequestAmount(e.target.value)}
                  style={{
                    flex: 1, background: "none", border: "none", outline: "none",
                    fontSize: 48, fontWeight: 800, lineHeight: 1,
                    color: requestAmount ? "white" : "rgba(255,255,255,0.18)",
                    width: "100%",
                  }}
                />
                <span style={{
                  fontSize: 20, fontWeight: 700, paddingBottom: 6,
                  color: requestAmount ? "var(--primary, #D4A020)" : "rgba(255,255,255,0.25)",
                  transition: "color 0.2s",
                }}>PLN</span>
              </div>
              {/* Quick amount chips */}
              <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
                {["20", "50", "100", "200", "500"].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setRequestAmount(requestAmount === amt ? "" : amt)}
                    style={{
                      padding: "5px 12px", borderRadius: 999,
                      fontSize: 12, fontWeight: 700,
                      background: requestAmount === amt
                        ? "rgba(var(--color-primary-rgb, 201,168,76), 0.18)"
                        : "rgba(255,255,255,0.06)",
                      border: `1px solid ${requestAmount === amt
                        ? "rgba(var(--color-primary-rgb, 201,168,76), 0.35)"
                        : "rgba(255,255,255,0.09)"}`,
                      color: requestAmount === amt ? "var(--primary, #D4A020)" : "rgba(255,255,255,0.50)",
                      cursor: "pointer", transition: "all 0.15s ease",
                    }}
                  >
                    {amt} zł
                  </button>
                ))}
              </div>
            </div>

            {/* 4 metody — siatka 2×2: Konto | Karta / Telefon | Poproś */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: pl ? "Konto bankowe" : "Bank",  sub: pl ? "IBAN / numer" : "IBAN",        icon: <Building2 size={20} />,    onClick: () => setLocation(`/transfer/new?to=bank&mode=${mode}${requestAmount ? `&amount=${requestAmount}` : ""}`),          testId: "tile-bank-account" },
                { label: pl ? "Na kartę" : "Card",       sub: pl ? "Numer karty" : "Card number",  icon: <FileText size={20} />,      onClick: () => setLocation(`/transfer/new?to=card&mode=${mode}${requestAmount ? `&amount=${requestAmount}` : ""}`),          testId: "tile-card-payout" },
                { label: pl ? "Telefon" : "Phone",       sub: pl ? "Numer tel." : "Phone",         icon: <Phone size={20} />,         onClick: () => setLocation(`/transfer/new?to=phone&mode=${mode}${requestAmount ? `&amount=${requestAmount}` : ""}`),         testId: "tile-phone-transfer" },
                { label: pl ? "Poproś" : "Request",      sub: pl ? "Poproś o przelew" : "Request", icon: <ArrowUpRight size={20} />,  onClick: () => setLocation(`/transfer?mode=request`),                                                                         testId: "tile-request-from-send" },
              ].map(tile => (
                <button
                  key={tile.testId}
                  data-testid={tile.testId}
                  onClick={tile.onClick}
                  style={{
                    borderRadius: 18, padding: "16px 8px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
                    cursor: "pointer", transition: "all 0.15s ease",
                  }}
                  onMouseDown={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "scale(0.96)"; }}
                  onMouseUp={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
                  onTouchStart={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "scale(0.96)"; }}
                  onTouchEnd={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
                >
                  <div style={{ color: "var(--primary, #D4A020)", opacity: 0.85 }}>{tile.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.80)", letterSpacing: 0.1 }}>{tile.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.32)", textAlign: "center" }}>{tile.sub}</div>
                </button>
              ))}
            </div>

            {/* Utwórz umowę — ciemny styl (nie fioletowy) */}
            <div
              data-testid="tile-create-contract"
              onClick={() => setLocation("/agreements/new")}
              style={{
                height: 62, borderRadius: 16,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.09)",
                display: "flex", alignItems: "center", gap: 12, padding: "0 16px",
                cursor: "pointer", transition: "all 0.15s ease",
              }}
              onMouseDown={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "scale(0.97)"; }}
              onMouseUp={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
              onTouchStart={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "scale(0.97)"; }}
              onTouchEnd={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "scale(1)"; }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <FilePlus style={{ width: 16, height: 16, color: "var(--primary, #D4A020)" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>{pl ? "Utwórz umowę" : "Create contract"}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{pl ? "Usługa, wynajem, sprzedaż, IT…" : "Service, rental, sale, IT…"}</div>
              </div>
              <ArrowUpRight style={{ width: 14, height: 14, color: "rgba(255,255,255,0.30)", flexShrink: 0 }} />
            </div>

          </motion.div>
        )}

        {/* ═══════════════════════════
            Lista kontaktów (wszystkie tryby)
            ═══════════════════════════ */}
        {filteredContacts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="space-y-3"
          >
            {searchTerm === "" && mode !== "request" && (
              <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>{pl ? "Ostatnie" : "Recent"}</span>
              </div>
            )}

            <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
              {filteredContacts.map((contact, i) => (
                <div
                  key={contact.id}
                  onClick={() => {
                    if (mode === "message") {
                      const convoId = openConversation(contact.handle, contact.name);
                      setLocation(`/messages/${convoId}`);
                    } else {
                      const amountParam = requestAmount ? `&amount=${requestAmount}` : "";
                      const noteParam = mode === "request" && requestNote ? `&note=${encodeURIComponent(requestNote)}` : "";
                      setLocation(`/transfer/new?to=${contact.handle}&mode=${mode}${amountParam}${noteParam}`);
                    }
                  }}
                  className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/50 transition-colors ${i !== filteredContacts.length - 1 ? "border-b border-white/5" : ""}`}
                >
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold shadow-inner-glow border border-white/5 ${contact.color}`}>
                    {contact.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-[15px] text-foreground truncate">{contact.name}</h4>
                    <UserHandleText handle={contact.handle} compact />
                  </div>
                  {(mode === "request" || (mode === "send" && requestAmount)) ? (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "5px 12px", borderRadius: 999,
                      fontSize: 12, fontWeight: 700,
                      background: "rgba(var(--color-primary-rgb, 201,168,76), 0.12)",
                      color: "var(--primary, #D4A020)",
                      border: "1px solid rgba(var(--color-primary-rgb, 201,168,76), 0.22)",
                      flexShrink: 0,
                    }}>
                      {mode === "request"
                        ? (requestAmount ? `${requestAmount} PLN` : (pl ? "Poproś" : "Ask"))
                        : `${requestAmount} PLN`}
                      <ChevronRight size={12} />
                    </div>
                  ) : (
                    <ChevronRight size={16} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
