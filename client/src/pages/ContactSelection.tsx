import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, User, FileText, Phone, ArrowUpRight, Calendar, UserPlus, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { motion } from "framer-motion";
import { useUserSearch } from "@/hooks/useUserSearch";
import UserHandleText from "@/components/UserHandleText";
import { useLang } from "@/context/LanguageContext";

export default function ContactSelection() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get("mode") || "send";
  const { contacts, user, openConversation } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const userSearch = useUserSearch();
  const { lang } = useLang();
  const pl = lang === "pl";

  useEffect(() => {
    userSearch.search(searchTerm);
  }, [searchTerm, userSearch.search]);

  const filteredContacts = userSearch.mergeWithLocalContacts(
    contacts.filter(c => c.handle.toLowerCase() !== user?.handle?.toLowerCase()),
    searchTerm
  );

  return (
    <div className="min-h-screen bg-background pb-24 relative overflow-hidden flex flex-col">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

      <header className="px-6 pt-14 pb-4 sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-white/5">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 mr-4 hover:bg-secondary/80" onClick={() => setLocation(mode === "message" ? "/messages" : "/")}>
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Button>
          <h1 className="text-2xl font-heading text-foreground">
            {mode === "message"
              ? (pl ? "Nowa Wiadomość" : "New Message")
              : mode === "request"
              ? (pl ? "Żądaj od" : "Request from")
              : (pl ? "Wyślij do" : "Send to")}
          </h1>
        </div>

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
            autoFocus
            data-testid="input-contact-search"
          />
        </div>
      </header>

      <main className="px-6 py-6 relative z-10 flex-1 space-y-8">
        {/* Quick Actions — only for send/request, not message */}
        {mode !== "message" && <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-3"
        >
          {[
            {
              label: pl ? "KONTO\nBANKOWE" : "BANK\nACCOUNT",
              icon: <ArrowUpRight className="w-6 h-6" />,
              onClick: () => setLocation(`/transfer/new?to=bank&mode=${mode}`),
              testId: "tile-bank-account",
            },
            {
              label: pl ? "NA KARTĘ" : "TO CARD",
              icon: <FileText className="w-6 h-6" />,
              onClick: () => setLocation(`/transfer/new?to=card&mode=${mode}`),
              testId: "tile-card-payout",
            },
            {
              label: pl ? "NUMER\nTELEFONU" : "PHONE\nNUMBER",
              icon: <Phone className="w-6 h-6" />,
              onClick: () => setLocation(`/transfer/new?to=phone&mode=${mode}`),
              testId: "tile-phone-transfer",
            },
            {
              label: pl ? "ZAPROŚ\nDO UMOWY" : "CONTRACT\nINVITE",
              icon: <UserPlus className="w-6 h-6" />,
              onClick: () => setLocation("/transfer/invite"),
              testId: "tile-contract-invite",
            },
          ].map((tile) => (
            <div
              key={tile.testId}
              data-testid={tile.testId}
              onClick={tile.onClick}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 20,
                background: "rgba(255,255,255,0.03)",
                border: "1.5px solid rgba(255,255,255,0.08)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
                transition: "all 0.18s ease",
              }}
              onMouseDown={e => { e.currentTarget.style.transform = "scale(0.94)"; }}
              onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
              onTouchStart={e => { e.currentTarget.style.transform = "scale(0.94)"; }}
              onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1, background: "rgba(255,255,255,0.14)", pointerEvents: "none" }} />
              <span style={{ color: "var(--primary, #D4A020)", filter: "drop-shadow(0 0 6px rgba(212,160,32,0.5))" }}>
                {tile.icon}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: 1.4,
                color: "rgba(255,255,255,0.70)", textAlign: "center",
                lineHeight: 1.3, whiteSpace: "pre-line",
              }}>
                {tile.label}
              </span>
            </div>
          ))}

          {/* Featured tile — create contract, full width */}
          <div
            data-testid="tile-create-contract"
            onClick={() => setLocation("/agreements/new")}
            style={{
              gridColumn: "1 / -1",
              height: 80,
              borderRadius: 20,
              background: "linear-gradient(135deg, #6d28d9 0%, #4338ca 100%)",
              border: "2px solid #9333ea",
              boxShadow: "0 4px 32px rgba(147,51,234,0.55), 0 1px 0 rgba(255,255,255,0.15) inset",
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "0 22px",
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
              transition: "all 0.18s ease",
            }}
            onMouseDown={e => { e.currentTarget.style.transform = "scale(0.97)"; }}
            onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            onTouchStart={e => { e.currentTarget.style.transform = "scale(0.97)"; }}
            onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {/* glow blob */}
            <div style={{ position: "absolute", right: -20, top: "50%", transform: "translateY(-50%)", width: 120, height: 120, borderRadius: "50%", background: "rgba(147,51,234,0.40)", filter: "blur(28px)", pointerEvents: "none" }} />
            {/* top shimmer line */}
            <div style={{ position: "absolute", top: 0, left: "8%", right: "8%", height: 1, background: "rgba(180,140,255,0.22)", pointerEvents: "none" }} />

            <div style={{
              width: 42, height: 42, borderRadius: 13, flexShrink: 0,
              background: "rgba(147,51,234,0.55)",
              border: "1.5px solid #a855f7",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FilePlus style={{ width: 20, height: 20, color: "#c084fc", filter: "drop-shadow(0 0 6px rgba(192,132,252,0.7))" }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: "rgba(255,255,255,0.90)", marginBottom: 3 }}>
                {pl ? "UTWÓRZ UMOWĘ" : "CREATE CONTRACT"}
              </div>
              <div style={{ fontSize: 11, color: "rgba(192,132,252,0.75)", fontWeight: 500, letterSpacing: 0.2 }}>
                {pl ? "Usługa, wynajem, sprzedaż, IT…" : "Service, rental, sale, IT…"}
              </div>
            </div>

            <ArrowUpRight style={{ width: 16, height: 16, color: "rgba(192,132,252,0.60)", flexShrink: 0 }} />
          </div>
        </motion.div>}

        {/* Contacts List */}
        {filteredContacts.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            {searchTerm === "" && (
              <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                <Calendar className="w-3.5 h-3.5" />
                <span>{pl ? "Ostatnie" : "Recent"}</span>
              </div>
            )}
            
            <div className="bg-card border border-white/5 rounded-3xl shadow-premium overflow-hidden">
              {filteredContacts.map((contact, i) => (
                <div 
                  key={contact.id}
                  onClick={() => {
                    if (mode === "message") {
                      const convoId = openConversation(contact.handle, contact.name);
                      setLocation(`/messages/${convoId}`);
                    } else {
                      setLocation(`/transfer/new?to=${contact.handle}&mode=${mode}`);
                    }
                  }}
                  className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/50 transition-colors ${i !== filteredContacts.length - 1 ? 'border-b border-white/5' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold shadow-inner-glow border border-white/5 ${contact.color}`}>
                    {contact.initials}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-[15px] text-foreground">{contact.name}</h4>
                    <UserHandleText handle={contact.handle} compact />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
