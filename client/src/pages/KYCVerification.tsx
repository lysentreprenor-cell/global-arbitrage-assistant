import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Camera, Shield, TrendingUp, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/context/ThemeContext";
import { useLang } from "@/context/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

const NATIONALITIES = [
  "Polska", "Niemcy", "Francja", "Wielka Brytania", "Stany Zjednoczone",
  "Ukraina", "Czechy", "Słowacja", "Węgry", "Austria", "Holandia", "Inna",
];

const NATIONALITIES_EN = [
  "Poland", "Germany", "France", "United Kingdom", "United States",
  "Ukraine", "Czech Republic", "Slovakia", "Hungary", "Austria", "Netherlands", "Other",
];

export default function KYCVerification() {
  const [, setLocation] = useLocation();
  const { th } = useTheme();
  const { lang } = useLang();
  const pl = lang === "pl";

  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 5;

  // Step 2 state
  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [birthDate, setBirthDate]   = useState("");
  const [nationality, setNationality] = useState("");

  // Step 3 state
  const [docType, setDocType]       = useState<"id" | "passport">("id");
  const [docNumber, setDocNumber]   = useState("");

  // Step 4 state
  const [photoAdded, setPhotoAdded] = useState(false);

  const handleNext = () => {
    if (step < TOTAL_STEPS) setStep(s => s + 1);
  };

  const handleSubmit = () => {
    localStorage.setItem("finlys_kyc", JSON.stringify({
      kycStatus: "pending",
      submittedAt: new Date().toISOString(),
    }));
    setStep(5);
  };

  const progressPct = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  return (
    <div className="min-h-screen bg-background pb-28 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-full h-[300px] bg-primary/5 blur-[100px] pointer-events-none" />

      <header className="px-6 pt-14 pb-4 flex items-center gap-4 sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-border/40">
        <Button
          variant="ghost" size="icon"
          className="rounded-full bg-secondary border border-border/30 hover:bg-secondary/80"
          onClick={() => step > 1 ? setStep(s => s - 1) : setLocation("/profile")}
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-heading text-foreground/90">
            {pl ? "Weryfikacja tożsamości" : "Identity Verification"}
          </h1>
          {step < 5 && (
            <p className="text-xs text-muted-foreground mt-0.5">{pl ? "Krok" : "Step"} {step}/{TOTAL_STEPS - 1}</p>
          )}
        </div>
      </header>

      {/* Progress bar */}
      {step < 5 && (
        <div className="h-1 bg-secondary/50">
          <motion.div
            className="h-full"
            style={{ background: "var(--color-primary)" }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      )}

      <main className="px-5 py-8 relative z-10">
        <AnimatePresence mode="wait">
          {/* Step 1: Intro */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="text-center space-y-3 py-4">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Shield className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-2xl font-heading" style={{ color: th.textPrimary }}>
                  {pl ? "Zweryfikuj tożsamość" : "Verify your identity"}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
                  {pl
                    ? "Weryfikacja KYC odblokowuje wyższe limity przelewów i dodatkowe funkcje konta."
                    : "KYC verification unlocks higher transfer limits and additional account features."}
                </p>
              </div>

              <div className="bg-card border border-white/5 rounded-3xl p-5 space-y-4">
                {[
                  { icon: "🔒", title: pl ? "Bezpieczeństwo" : "Security", desc: pl ? "Twoje dane są szyfrowane end-to-end" : "Your data is encrypted end-to-end" },
                  { icon: "📈", title: pl ? "Wyższe limity" : "Higher limits", desc: pl ? "Przelewy do 50 000 PLN dziennie" : "Transfers up to 50,000 PLN daily" },
                  { icon: "✅", title: pl ? "Zaufanie" : "Trust", desc: pl ? "Zweryfikowana odznaka na profilu" : "Verified badge on your profile" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{item.icon}</span>
                    <div>
                      <p className="font-semibold text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Button onClick={handleNext} className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-base">
                {pl ? "Rozpocznij weryfikację" : "Start Verification"}
              </Button>
            </motion.div>
          )}

          {/* Step 2: Personal data */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              <h2 className="text-xl font-heading" style={{ color: th.textPrimary }}>
                {pl ? "Dane osobowe" : "Personal Data"}
              </h2>

              <div className="bg-card border border-white/5 rounded-3xl p-5 space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">{pl ? "Imię" : "First name"}</label>
                  <Input
                    placeholder={pl ? "Imię" : "First name"}
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className="bg-secondary border-border/30 text-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">{pl ? "Nazwisko" : "Last name"}</label>
                  <Input
                    placeholder={pl ? "Nazwisko" : "Last name"}
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className="bg-secondary border-border/30 text-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">{pl ? "Data urodzenia" : "Date of birth"}</label>
                  <Input
                    type="date"
                    value={birthDate}
                    onChange={e => setBirthDate(e.target.value)}
                    className="bg-secondary border-border/30 text-foreground"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">{pl ? "Narodowość" : "Nationality"}</label>
                  <select
                    value={nationality}
                    onChange={e => setNationality(e.target.value)}
                    className="w-full h-10 bg-secondary border border-border/30 rounded-md px-3 text-foreground text-sm"
                  >
                    <option value="">{pl ? "Wybierz..." : "Select..."}</option>
                    {(pl ? NATIONALITIES : NATIONALITIES_EN).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                onClick={handleNext}
                disabled={!firstName || !lastName || !birthDate || !nationality}
                className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold"
              >
                {pl ? "Dalej" : "Next"}
              </Button>
            </motion.div>
          )}

          {/* Step 3: Document */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              <h2 className="text-xl font-heading" style={{ color: th.textPrimary }}>
                {pl ? "Dokument tożsamości" : "Identity Document"}
              </h2>

              <div className="bg-card border border-white/5 rounded-3xl p-5 space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">{pl ? "Typ dokumentu" : "Document type"}</label>
                  <div className="flex gap-3">
                    {[
                      { value: "id" as const, label: pl ? "Dowód osobisty" : "ID Card" },
                      { value: "passport" as const, label: pl ? "Paszport" : "Passport" },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setDocType(opt.value)}
                        className="flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all"
                        style={{
                          background: docType === opt.value ? "var(--color-primary)" : "rgba(255,255,255,0.06)",
                          color: docType === opt.value ? "#000" : "rgba(255,255,255,0.6)",
                          border: `1px solid ${docType === opt.value ? "var(--color-primary)" : "rgba(255,255,255,0.1)"}`,
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    {pl ? "Numer dokumentu" : "Document number"}
                  </label>
                  <Input
                    placeholder={docType === "id" ? "ABC 123456" : "AA 0000000"}
                    value={docNumber}
                    onChange={e => setDocNumber(e.target.value)}
                    className="bg-secondary border-border/30 text-foreground font-mono"
                  />
                </div>
              </div>

              <Button
                onClick={handleNext}
                disabled={!docNumber}
                className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold"
              >
                {pl ? "Dalej" : "Next"}
              </Button>
            </motion.div>
          )}

          {/* Step 4: Selfie */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              <h2 className="text-xl font-heading" style={{ color: th.textPrimary }}>
                {pl ? "Selfie z dokumentem" : "Selfie with document"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {pl
                  ? "Zrób zdjęcie trzymając dokument przy twarzy, aby potwierdzić tożsamość."
                  : "Take a photo holding your document next to your face to confirm identity."}
              </p>

              <div
                onClick={() => setPhotoAdded(true)}
                className="bg-card border-2 border-dashed border-border/30 rounded-3xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all hover:border-primary/50"
                style={{ borderColor: photoAdded ? "var(--color-primary)" : undefined }}
              >
                {photoAdded ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                      <Check className="w-8 h-8 text-green-400" />
                    </div>
                    <p className="font-bold text-green-400">{pl ? "Zdjęcie dodane ✓" : "Photo added ✓"}</p>
                    <p className="text-xs text-muted-foreground">{pl ? "Kliknij, aby zmienić" : "Click to change"}</p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center">
                      <Camera className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <p className="font-semibold text-muted-foreground">
                      {pl ? "Zrób zdjęcie z dokumentem" : "Take photo with document"}
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      {pl ? "Dotknij, aby aktywować aparat" : "Tap to activate camera"}
                    </p>
                  </>
                )}
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!photoAdded}
                className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold"
              >
                {pl ? "Wyślij do weryfikacji" : "Submit for Verification"}
              </Button>
            </motion.div>
          )}

          {/* Step 5: Success */}
          {step === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="text-center space-y-6 py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                className="w-24 h-24 mx-auto rounded-full bg-green-500/15 border-2 border-green-500/30 flex items-center justify-center"
              >
                <Check className="w-12 h-12 text-green-400" />
              </motion.div>

              <div className="space-y-2">
                <h2 className="text-2xl font-heading" style={{ color: th.textPrimary }}>
                  {pl ? "Weryfikacja w toku" : "Verification in progress"}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
                  {pl
                    ? "Twoje dane zostały wysłane do weryfikacji. Wynik otrzymasz w ciągu 24h."
                    : "Your data has been submitted for verification. You will receive the result within 24h."}
                </p>
              </div>

              <div className="bg-card border border-white/5 rounded-3xl p-4 flex items-center gap-3 text-left">
                <BadgeCheck className="w-8 h-8 text-primary flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">{pl ? "Status: Oczekuje" : "Status: Pending"}</p>
                  <p className="text-xs text-muted-foreground">
                    {pl ? "Sprawdzamy Twoje dokumenty" : "We are reviewing your documents"}
                  </p>
                </div>
              </div>

              <Button
                onClick={() => setLocation("/profile")}
                className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold"
              >
                {pl ? "Wróć do profilu" : "Back to Profile"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
