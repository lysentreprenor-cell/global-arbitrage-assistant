import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Copy, Share2, MessageCircle, Users, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { motion } from "framer-motion";

interface ReferralData {
  invited: number;
  active: number;
  earned: number;
  referrals: { handle: string; status: "active" | "pending"; bonus: number; date: string }[];
}

const STORAGE_KEY = "finlys_referrals";

const MOCK_REFERRALS = [
  { handle: "@jan_kowalski", status: "active" as const, bonus: 25, date: "2026-04-10" },
  { handle: "@marta_w", status: "active" as const, bonus: 25, date: "2026-05-01" },
  { handle: "@p.nowak", status: "pending" as const, bonus: 0, date: "2026-05-20" },
];

function loadData(): ReferralData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {
    invited: MOCK_REFERRALS.length,
    active: MOCK_REFERRALS.filter(r => r.status === "active").length,
    earned: MOCK_REFERRALS.filter(r => r.status === "active").reduce((s, r) => s + r.bonus, 0),
    referrals: MOCK_REFERRALS,
  };
}

export default function ReferralProgram() {
  const [, setLocation] = useLocation();
  const { user } = useAppStore();
  const { toast } = useToast();
  const { th } = useTheme();
  const { lang } = useLang();
  const pl = lang === "pl";

  const [copied, setCopied] = useState(false);
  const [data] = useState<ReferralData>(loadData);

  const handle = user?.handle?.replace("@", "").toUpperCase() || "FINLYS";
  const referralCode = `${handle}25`;
  const referralUrl = `https://finlys.app/join?ref=${referralCode}`;
  const shareText = pl
    ? `Dołącz do Finlys — nowoczesna bankowość premium. Użyj mojego kodu ${referralCode} i zgarnij 25 PLN bonusu! ${referralUrl}`
    : `Join Finlys — premium modern banking. Use my code ${referralCode} and get a 25 PLN bonus! ${referralUrl}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: pl ? "Kod skopiowany!" : "Code copied!", description: referralCode });
    } catch {}
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: pl ? "Finlys — zaproszenie" : "Finlys — invitation",
          text: shareText,
          url: referralUrl,
        });
      } catch {}
    } else {
      await navigator.clipboard.writeText(shareText);
      toast({ title: pl ? "Link skopiowany" : "Link copied", description: pl ? "Udostępnij go znajomym" : "Share it with friends" });
    }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="min-h-screen bg-background pb-28 relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-full h-[300px] bg-primary/5 blur-[100px] pointer-events-none" />

      <header className="px-6 pt-14 pb-6 flex items-center sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-border/40">
        <Button
          variant="ghost" size="icon"
          className="rounded-full bg-secondary border border-border/30 mr-4 hover:bg-secondary/80"
          onClick={() => setLocation("/profile")}
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <div>
          <h1 className="text-2xl font-heading text-foreground/90">
            {pl ? "Zaproś znajomych" : "Referral Program"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pl ? "Zapraszaj i zarabiaj bonusy" : "Invite friends and earn bonuses"}
          </p>
        </div>
      </header>

      <main className="px-5 py-6 space-y-5 relative z-10">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 rounded-3xl p-6 text-center space-y-2"
        >
          <p className="text-4xl">🎁</p>
          <h2 className="text-xl font-heading font-bold" style={{ color: th.textPrimary }}>
            {pl ? "Zaproś znajomych, zgarnij bonus!" : "Invite friends, earn bonus!"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {pl ? "Ty i Twój znajomy dostajecie po 25 PLN" : "You and your friend each get 25 PLN"}
          </p>
        </motion.div>

        {/* Referral code */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
          className="bg-card border border-white/5 rounded-3xl p-5 space-y-3"
        >
          <p className="text-[13px] font-black uppercase tracking-widest text-primary/80">
            {pl ? "Twój kod polecający" : "Your referral code"}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-secondary/60 rounded-2xl px-4 py-3">
              <p className="font-mono text-2xl font-bold tracking-widest" style={{ color: "var(--color-primary)" }}>
                {referralCode}
              </p>
            </div>
            <button
              onClick={handleCopy}
              className="w-12 h-12 rounded-xl flex items-center justify-center transition-all"
              style={{ background: copied ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 text-muted-foreground" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground break-all">{referralUrl}</p>
        </motion.div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="bg-card border border-white/5 rounded-3xl p-5 space-y-4"
        >
          <p className="text-[13px] font-black uppercase tracking-widest text-primary/80">
            {pl ? "Jak to działa" : "How it works"}
          </p>
          {[
            { icon: "🔗", step: 1, title: pl ? "Udostępnij swój kod znajomemu" : "Share your code with a friend" },
            { icon: "✅", step: 2, title: pl ? "Znajomy rejestruje się przez Twój link" : "Friend signs up via your link" },
            { icon: "💰", step: 3, title: pl ? "Oboje dostajecie 25 PLN bonusu" : "You both get 25 PLN bonus" },
          ].map(item => (
            <div key={item.step} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center text-xl flex-shrink-0">
                {item.icon}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
              </div>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                style={{ background: "var(--color-primary)", color: "#000" }}
              >
                {item.step}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Share buttons */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.17 }}
          className="space-y-3"
        >
          <Button
            onClick={handleShare}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            {pl ? "Udostępnij kod" : "Share code"}
          </Button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-colors"
            style={{ background: "rgba(37,211,102,0.12)", color: "#25d366", border: "1px solid rgba(37,211,102,0.25)" }}
          >
            <MessageCircle className="w-4 h-4" />
            {pl ? "Wyślij przez WhatsApp" : "Send via WhatsApp"}
          </a>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
          className="bg-card border border-white/5 rounded-3xl p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <p className="text-[13px] font-black uppercase tracking-widest text-primary/80">
              {pl ? "Twoje statystyki" : "Your stats"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: pl ? "Zaproszeni" : "Invited", value: data.invited },
              { label: pl ? "Aktywni" : "Active", value: data.active },
              { label: pl ? "Zarobiono" : "Earned", value: `${data.earned} PLN` },
            ].map((stat, i) => (
              <div key={i} className="bg-secondary/40 rounded-2xl p-3 text-center">
                <p className="text-xl font-heading font-bold" style={{ color: "var(--color-primary)" }}>{stat.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent referrals */}
        {data.referrals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }}
            className="bg-card border border-white/5 rounded-3xl p-5 space-y-3"
          >
            <p className="text-[13px] font-black uppercase tracking-widest text-primary/80">
              {pl ? "Ostatnie polecenia" : "Recent referrals"}
            </p>
            {data.referrals.map((ref, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                <div>
                  <p className="font-semibold text-sm">{ref.handle}</p>
                  <p className="text-xs text-muted-foreground">{new Date(ref.date).toLocaleDateString(pl ? "pl-PL" : "en-US")}</p>
                </div>
                <div className="text-right">
                  <span
                    className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{
                      background: ref.status === "active" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
                      color: ref.status === "active" ? "#22c55e" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {ref.status === "active" ? (pl ? "Aktywny" : "Active") : (pl ? "Oczekuje" : "Pending")}
                  </span>
                  {ref.bonus > 0 && (
                    <p className="text-xs font-bold mt-1" style={{ color: "var(--color-primary)" }}>+{ref.bonus} PLN</p>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
}
