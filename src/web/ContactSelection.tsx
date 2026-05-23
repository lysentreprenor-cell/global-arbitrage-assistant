import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, User, FileText, Phone, ArrowUpRight, Calendar, FilePlus, Building2 } from "lucide-react";
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

      <main className="px-6 py-5 relative z-10 flex-1 space-y-6">

        {/* Quick method chips — only for send/request, not message */}
        {mode !== "message" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

            {/* 3 compact method pills */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[
                { label: pl ? "Konto bankowe" : "Bank account", icon: <Building2 size={14} />, onClick: () => setLocation(`/transfer/new?to=bank&mode=${mode}`), testId: "tile-bank-account" },
                { label: pl ? "Na kartę" : "To card",           icon: <FileText size={14} />,   onClick: () => setLocation(`/transfer/new?to=card&mode=${mode}`), testId: "tile-card-payout" },
                { label: pl ? "Telefon" : "Phone",              icon: <Phone size={14} />,      onClick: () => setLocation(`/transfer/new?to=phone&mode=${mode}`), testId: "tile-phone-transfer" },
              ].map(pill => (
                <button
                  key={pill.testId}
                  data-testid={pill.testId}
                  onClick={pill.onClick}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 22,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    cursor: "pointer",
                    color: "rgba(255,255,255,0.65)",
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                    transition: "all 0.15s ease",
                    whiteSpace: "nowrap",
                  }}
                  onMouseDown={e => { e.currentTarget.style.transform = "scale(0.95)"; e.currentTarget.style.background = "rgba(255,255,255,0.09)"; }}
                  onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                  onTouchStart={e => { e.currentTarget.style.transform = "scale(0.95)"; e.currentTarget.style.background = "rgba(255,255,255,0.09)"; }}
                  onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                >
                  <span style={{ color: "var(--primary, #D4A020)", opacity: 0.9 }}>{pill.icon}</span>
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Create contract — full width featured tile */}
            <div
              data-testid="tile-create-contract"
              onClick={() => setLocation("/agreements/new")}
              style={{
                height: 72,
                borderRadius: 18,
                background: "linear-gradient(135deg, #6d28d9 0%, #4338ca 100%)",
                border: "1.5px solid #9333ea",
                boxShadow: "0 4px 24px rgba(147,51,234,0.45), 0 1px 0 rgba(255,255,255,0.12) inset",
                display: "flex", alignItems: "center", gap: 14, padding: "0 18px",
                cursor: "pointer", position: "relative", overflow: "hidden",
                transition: "all 0.15s ease",
              }}
              onMouseDown={e => { e.currentTarget.style.transform = "scale(0.97)"; }}
              onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
              onTouchStart={e => { e.currentTarget.style.transform = "scale(0.97)"; }}
              onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              <div style={{ position: "absolute", right: -16, top: "50%", transform: "translateY(-50%)", width: 100, height: 100, borderRadius: "50%", background: "rgba(147,51,234,0.35)", filter: "blur(24px)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: 0, left: "8%", right: "8%", height: 1, background: "rgba(180,140,255,0.20)", pointerEvents: "none" }} />
              <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.20)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FilePlus style={{ width: 18, height: 18, color: "#e9d5ff" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.8, color: "#fff", marginBottom: 2 }}>
                  {pl ? "Utwórz umowę" : "Create contract"}
                </div>
                <div style={{ fontSize: 11, color: "rgba(233,213,255,0.70)", fontWeight: 500 }}>
                  {pl ? "Usługa, wynajem, sprzedaż, IT…" : "Service, rental, sale, IT…"}
                </div>
              </div>
              <ArrowUpRight style={{ width: 15, height: 15, color: "rgba(233,213,255,0.55)", flexShrink: 0 }} />
            </div>

          </motion.div>
        )}

        {/* Contacts List */}
        {filteredContacts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="space-y-3"
          >
            {searchTerm === "" && (
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
                      setLocation(`/transfer/new?to=${contact.handle}&mode=${mode}`);
                    }
                  }}
                  className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/50 transition-colors ${i !== filteredContacts.length - 1 ? 'border-b border-white/5' : ''}`}
                >
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold shadow-inner-glow border border-white/5 ${contact.color}`}>
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
