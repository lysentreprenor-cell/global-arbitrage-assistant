import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Users, Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface SplitRecord {
  id: string;
  description: string;
  amount: number;
  people: number;
  date: string;
}

const STORAGE_KEY = "finlys_split_bills";

function loadHistory(): SplitRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(records: SplitRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export default function SplitBill() {
  const [, setLocation] = useLocation();
  const { contacts, addNotification } = useAppStore();
  const { th } = useTheme();
  const { lang } = useLang();
  const pl = lang === "pl";
  const { toast } = useToast();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("PLN");
  const [people, setPeople] = useState(2);
  const [customPeople, setCustomPeople] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [checkedContacts, setCheckedContacts] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<SplitRecord[]>(loadHistory);

  const numericAmount = parseFloat(amount) || 0;
  const numPeople = useCustom ? (parseInt(customPeople) || 2) : people;
  const perPerson = numPeople > 0 ? numericAmount / numPeople : 0;

  const visibleContacts = contacts.slice(0, 6);

  const toggleContact = (id: string) => {
    setCheckedContacts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = () => {
    if (!numericAmount || numPeople < 2) {
      toast({ title: pl ? "Błąd" : "Error", description: pl ? "Podaj kwotę i liczbę osób" : "Enter amount and number of people" });
      return;
    }

    checkedContacts.forEach(contactId => {
      const contact = contacts.find(c => c.id === contactId);
      if (!contact) return;
      addNotification({
        type: "transfer",
        title: pl ? "Prośba o płatność" : "Payment Request",
        message: pl
          ? `Prosimy o zapłatę ${perPerson.toFixed(2)} ${currency} za: ${description || "rachunek grupowy"}`
          : `Please pay ${perPerson.toFixed(2)} ${currency} for: ${description || "group bill"}`,
      });
    });

    // Save to history
    const record: SplitRecord = {
      id: Date.now().toString(),
      description: description || (pl ? "Rachunek" : "Bill"),
      amount: numericAmount,
      people: numPeople,
      date: new Date().toISOString(),
    };
    const updated = [record, ...history].slice(0, 20);
    setHistory(updated);
    saveHistory(updated);

    toast({
      title: pl ? "Wysłano żądania" : "Requests Sent",
      description: pl
        ? `Wysłano do ${checkedContacts.size} kontaktów`
        : `Sent to ${checkedContacts.size} contacts`,
    });
    setCheckedContacts(new Set());
  };

  const PILL_OPTIONS = [2, 3, 4, 5, 6];

  return (
    <div className="min-h-screen bg-background pb-28 relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-full h-[300px] bg-primary/5 blur-[100px] pointer-events-none" />

      <header className="px-6 pt-14 pb-6 flex items-center sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-border/40">
        <Button
          variant="ghost" size="icon"
          className="rounded-full bg-secondary border border-border/30 mr-4 hover:bg-secondary/80"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <div>
          <h1 className="text-2xl font-heading text-foreground/90">
            {pl ? "Podziel rachunek" : "Split Bill"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pl ? "Podziel koszt między znajomych" : "Split the cost among friends"}
          </p>
        </div>
      </header>

      <main className="px-5 py-6 space-y-6 relative z-10">
        {/* Amount + Currency */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-white/5 rounded-3xl p-5 space-y-4"
        >
          <h2 className="text-[13px] font-black uppercase tracking-[0.20em] text-primary/80">
            {pl ? "Szczegóły rachunku" : "Bill Details"}
          </h2>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1.5 block">
                {pl ? "Kwota całkowita" : "Total Amount"}
              </label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="bg-secondary border-border/30 text-foreground text-lg font-bold"
              />
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground mb-1.5 block">
                {pl ? "Waluta" : "Currency"}
              </label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full h-10 bg-secondary border border-border/30 rounded-md px-3 text-foreground text-sm"
              >
                {["PLN", "EUR", "USD", "GBP", "NOK"].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              {pl ? "Opis rachunku" : "Bill Description"}
            </label>
            <Input
              type="text"
              placeholder={pl ? "np. Kolacja, Urodziny..." : "e.g. Dinner, Birthday..."}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="bg-secondary border-border/30 text-foreground"
            />
          </div>
        </motion.div>

        {/* People selector */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-card border border-white/5 rounded-3xl p-5 space-y-4"
        >
          <h2 className="text-[13px] font-black uppercase tracking-[0.20em] text-primary/80">
            {pl ? "Liczba osób" : "Number of People"}
          </h2>

          <div className="flex flex-wrap gap-2">
            {PILL_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => { setPeople(n); setUseCustom(false); }}
                className="px-4 py-2 rounded-full text-sm font-bold transition-all"
                style={{
                  background: !useCustom && people === n ? "var(--color-primary)" : "rgba(255,255,255,0.06)",
                  color: !useCustom && people === n ? "#000" : "rgba(255,255,255,0.6)",
                  border: `1px solid ${!useCustom && people === n ? "var(--color-primary)" : "rgba(255,255,255,0.1)"}`,
                }}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setUseCustom(true)}
              className="px-4 py-2 rounded-full text-sm font-bold transition-all"
              style={{
                background: useCustom ? "var(--color-primary)" : "rgba(255,255,255,0.06)",
                color: useCustom ? "#000" : "rgba(255,255,255,0.6)",
                border: `1px solid ${useCustom ? "var(--color-primary)" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              {pl ? "Inne" : "Custom"}
            </button>
          </div>

          {useCustom && (
            <Input
              type="number"
              placeholder={pl ? "Wpisz liczbę osób" : "Enter number of people"}
              value={customPeople}
              onChange={e => setCustomPeople(e.target.value)}
              className="bg-secondary border-border/30 text-foreground"
              min="2"
            />
          )}

          {/* Per-person amount display */}
          {numericAmount > 0 && (
            <div className="text-center py-4 border-t border-border/20">
              <p className="text-xs text-muted-foreground mb-1">
                {pl ? "Na osobę" : "Per person"}
              </p>
              <p className="text-4xl font-heading font-bold" style={{ color: "var(--color-primary)" }}>
                {perPerson.toFixed(2)} <span className="text-xl">{currency}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {numericAmount.toFixed(2)} {currency} ÷ {numPeople} {pl ? "osób" : "people"}
              </p>
            </div>
          )}
        </motion.div>

        {/* Contacts */}
        {visibleContacts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="bg-card border border-white/5 rounded-3xl p-5 space-y-4"
          >
            <h2 className="text-[13px] font-black uppercase tracking-[0.20em] text-primary/80">
              {pl ? "Kontakty" : "Contacts"}
            </h2>
            <div className="space-y-2">
              {visibleContacts.map(contact => {
                const checked = checkedContacts.has(contact.id);
                return (
                  <div
                    key={contact.id}
                    onClick={() => toggleContact(contact.id)}
                    className="flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-colors hover:bg-secondary/50"
                    style={{ background: checked ? "rgba(var(--color-primary-rgb), 0.08)" : "transparent" }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ background: contact.color || "#333" }}
                    >
                      {contact.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{contact.name}</p>
                      <p className="text-xs text-muted-foreground">@{contact.handle}</p>
                    </div>
                    {checked && numericAmount > 0 && (
                      <span className="text-sm font-bold" style={{ color: "var(--color-primary)" }}>
                        {perPerson.toFixed(2)} {currency}
                      </span>
                    )}
                    <div
                      className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
                      style={{
                        borderColor: checked ? "var(--color-primary)" : "rgba(255,255,255,0.2)",
                        background: checked ? "var(--color-primary)" : "transparent",
                      }}
                    >
                      {checked && <span className="text-black text-xs font-bold">✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {checkedContacts.size > 0 && (
              <Button
                onClick={handleSend}
                className="w-full rounded-xl bg-primary text-primary-foreground font-semibold h-12 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {pl ? `Wyślij żądania (${checkedContacts.size})` : `Send Requests (${checkedContacts.size})`}
              </Button>
            )}
          </motion.div>
        )}

        {/* History */}
        {history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="bg-card border border-white/5 rounded-3xl p-5 space-y-4"
          >
            <h2 className="text-[13px] font-black uppercase tracking-[0.20em] text-primary/80">
              {pl ? "Historia podziałów" : "Split History"}
            </h2>
            <div className="space-y-3">
              {history.slice(0, 3).map(record => (
                <div key={record.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-2xl">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{record.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.people} {pl ? "osób" : "people"} · {new Date(record.date).toLocaleDateString(pl ? "pl-PL" : "en-US")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{record.amount.toFixed(2)} PLN</p>
                    <p className="text-xs text-muted-foreground" style={{ color: "var(--color-primary)" }}>
                      {(record.amount / record.people).toFixed(2)}/{pl ? "os." : "p."}
                    </p>
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
