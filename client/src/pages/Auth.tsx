import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { Sparkles, ArrowRight, ArrowLeft, ShieldCheck, Eye, EyeOff, User, Mail, Lock, Globe, KeyRound, MailCheck } from "lucide-react";
import { humanizeAuthError } from "@/lib/humanizeAuthError";
import { usePWAInstall, PWAInstallGuide } from "@/components/PWAInstallBanner";

type Step = "email" | "login" | "register" | "forgot" | "reset" | "verify" | "success";

export default function Auth() {
  const { login } = useAppStore();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyDevCode, setVerifyDevCode] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { canInstall, isInstalled, install, showGuide, setShowGuide, guidePlatform, showAndroidGuide, showIOSGuide } = usePWAInstall();

  // On mount: if startup flow detected unverified session, go straight to verify step
  useEffect(() => {
    try {
      const pendingEmail = sessionStorage.getItem("finlys_pending_verify_email");
      if (pendingEmail) {
        sessionStorage.removeItem("finlys_pending_verify_email");
        setEmail(pendingEmail);
        setStep("verify");
        // Request a fresh OTP and start the cooldown
        fetch("/api/auth/resend-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: pendingEmail }),
        })
          .then(r => r.json())
          .then(d => {
            if (d.devCode) { setVerifyDevCode(d.devCode); setVerifyCode(d.devCode); }
            startCooldown();
          })
          .catch(() => startCooldown());
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.blocked) {
        setError("Ten adres e-mail nie może być użyty do rejestracji.");
        return;
      }
      setStep(data.exists ? "login" : "register");
    } catch (error) {
      setError(humanizeAuthError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoRegister = () => {
    setError("");
    setStep("register");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.message || "Błędny e-mail lub hasło.");
        return;
      }
      if (data.needsVerification) {
        if (data.devCode) { setVerifyDevCode(data.devCode); setVerifyCode(data.devCode); } else { setVerifyCode(""); }
        setStep("verify");
        startCooldown();
        return;
      }
      const userData = data.user || data;
      setStep("success");
      setTimeout(() => login(userData), 1200);
    } catch (error) {
      setError(humanizeAuthError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !password) return;
    if (password.length < 8) { setError("Hasło musi mieć minimum 8 znaków."); return; }
    if (password !== confirmPassword) { setError("Hasła nie są takie same."); return; }
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, displayName: name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.message || "Nie udało się zarejestrować.");
        return;
      }
      if (data.needsVerification) {
        if (data.devCode) { setVerifyDevCode(data.devCode); setVerifyCode(data.devCode); } else { setVerifyCode(""); }
        setStep("verify");
        startCooldown();
        return;
      }
      const userData = data.user || data;
      setStep("success");
      setTimeout(() => login(userData), 1200);
    } catch (error) {
      setError(humanizeAuthError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode || verifyCode.length !== 6) return;
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Nieprawidłowy kod weryfikacyjny.");
        return;
      }
      const userData = data.user || data;
      setStep("success");
      setTimeout(() => login(userData), 1200);
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const startCooldown = () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); cooldownRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const handleResendVerify = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setVerifyDevCode(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.devCode) { setVerifyDevCode(data.devCode); setVerifyCode(data.devCode); }
      startCooldown();
    } catch {}
    setIsLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Nie udało się wysłać kodu.");
        return;
      }
      if (data.devCode) {
        setDevCode(data.devCode);
        setResetCode(data.devCode);
      } else {
        setDevCode(null);
      }
      setStep("reset");
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError("");
    setResetCode("");
    setDevCode(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.devCode) {
        setDevCode(data.devCode);
        setResetCode(data.devCode);
      }
    } catch {}
    setIsLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode || !password) return;
    if (password.length < 8) { setError("Hasło musi mieć minimum 8 znaków."); return; }
    if (password !== confirmPassword) { setError("Hasła nie są takie same."); return; }
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: resetCode, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Nie udało się zresetować hasła.");
        return;
      }
      setResetSuccess(true);
      setPassword("");
      setConfirmPassword("");
      setResetCode("");
      setTimeout(() => {
        setResetSuccess(false);
        setStep("login");
      }, 2000);
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center px-6 relative overflow-x-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-secondary/80 rounded-full blur-[100px] pointer-events-none" />

      {(step === "login" || step === "register" || step === "forgot" || step === "reset" || step === "verify") && (
        <button
          className="absolute top-14 left-6 z-20 w-10 h-10 rounded-full bg-secondary border border-white/5 flex items-center justify-center hover:bg-secondary/80 transition-colors"
          onClick={() => {
            setError("");
            setPassword("");
            setConfirmPassword("");
            setResetCode("");
            setVerifyCode("");
            setVerifyDevCode(null);
            if (step === "reset") { setStep("forgot"); return; }
            if (step === "verify") { setStep("email"); return; }
            setStep("email");
          }}
          disabled={isLoading}
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm mx-auto relative z-10"
      >
        <div className="text-center space-y-4 mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-card to-background border border-white/10 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-premium relative">
            <div className="absolute inset-0 bg-primary/10 rounded-3xl blur-md" />
            <Sparkles className="w-8 h-8 text-primary relative z-10" />
          </div>
          <h1 className="text-4xl font-bold font-heading text-white tracking-tight">Private Banking</h1>
          <p className="text-muted-foreground font-medium">
            {step === "email" && "Zarządzaj finansami z klasą."}
            {step === "login" && "Witaj z powrotem. Zaloguj się."}
            {step === "register" && "Utwórz prywatne konto."}
            {step === "forgot" && "Zresetuj dostęp do konta."}
            {step === "reset" && "Wprowadź kod z e-maila."}
            {step === "verify" && "Sprawdź swoją skrzynkę e-mail."}
            {step === "success" && "Uwierzytelnianie powiodło się."}
          </p>
        </div>

        <div className={`relative ${step === "reset" ? "min-h-[360px]" : step === "verify" ? "min-h-[320px]" : "min-h-[240px]"}`}>
          <AnimatePresence mode="wait">

            {/* ── EMAIL STEP ── */}
            {step === "email" && (
              <motion.div
                key="email"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35 }}
                className="space-y-4 absolute inset-0"
              >
                <form onSubmit={handleEmail} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="Adres e-mail"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="h-16 rounded-2xl pl-12 pr-5 bg-card/50 backdrop-blur-md border-white/10 focus:bg-card focus:border-primary transition-colors text-base shadow-inner-glow placeholder:text-muted-foreground/50"
                      required
                      autoFocus
                      data-testid="input-email"
                    />
                  </div>
                  {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                  <button
                    type="submit"
                    disabled={isLoading}
                    data-testid="button-continue-email"
                    className="w-full h-16 rounded-2xl text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isLoading ? "Sprawdzam..." : <><span>Zaloguj się</span><ArrowRight className="w-5 h-5" /></>}
                  </button>
                </form>

                {/* Register shortcut */}
                <div className="relative flex items-center gap-3 pt-1">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-xs text-muted-foreground/60 uppercase tracking-widest font-semibold">lub</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>

                <button
                  type="button"
                  onClick={handleGoRegister}
                  data-testid="button-go-register"
                  className="w-full h-14 rounded-2xl text-base font-semibold border border-white/10 bg-card/30 text-white hover:bg-card/60 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <User className="w-5 h-5 text-primary" />
                  Zarejestruj się
                </button>

              </motion.div>
            )}

            {/* ── LOGIN STEP ── */}
            {step === "login" && (
              <motion.form
                key="login"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35 }}
                onSubmit={handleLogin}
                className="space-y-4 absolute inset-0"
              >
                <div className="px-4 py-3 rounded-2xl bg-card/30 border border-white/5 text-sm text-muted-foreground truncate">
                  {email}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Twoje hasło"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="h-16 rounded-2xl pl-12 pr-12 bg-card/50 backdrop-blur-md border-white/10 focus:bg-card focus:border-primary transition-colors text-base shadow-inner-glow placeholder:text-muted-foreground/50"
                    required
                    autoFocus
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button
                  type="submit"
                  disabled={isLoading}
                  data-testid="button-login"
                  className="w-full h-16 rounded-2xl text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? "Loguję..." : <><span>Zaloguj się</span><ArrowRight className="w-5 h-5" /></>}
                </button>
                <button
                  type="button"
                  onClick={() => { setError(""); setStep("forgot"); }}
                  data-testid="button-forgot-password"
                  className="w-full text-sm text-muted-foreground/70 hover:text-primary transition-colors py-1"
                >
                  Zapomniałem hasła
                </button>
              </motion.form>
            )}

            {/* ── REGISTER STEP ── */}
            {step === "register" && (
              <motion.form
                key="register"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35 }}
                onSubmit={handleRegister}
                className="space-y-3 absolute inset-0"
              >
                {email ? (
                  <div className="px-4 py-3 rounded-2xl bg-card/30 border border-white/5 text-sm text-muted-foreground truncate">
                    {email}
                  </div>
                ) : (
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="Adres e-mail"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="h-14 rounded-2xl pl-12 pr-5 bg-card/50 backdrop-blur-md border-white/10 focus:bg-card focus:border-primary transition-colors text-base shadow-inner-glow placeholder:text-muted-foreground/50"
                      required
                      autoFocus
                      data-testid="input-email-register"
                    />
                  </div>
                )}
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Imię i nazwisko"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-14 rounded-2xl pl-12 pr-5 bg-card/50 backdrop-blur-md border-white/10 focus:bg-card focus:border-primary transition-colors text-base shadow-inner-glow placeholder:text-muted-foreground/50"
                    required
                    autoFocus={!!email}
                    minLength={2}
                    data-testid="input-name"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Hasło (min. 8 znaków)"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="h-14 rounded-2xl pl-12 pr-12 bg-card/50 backdrop-blur-md border-white/10 focus:bg-card focus:border-primary transition-colors text-base shadow-inner-glow placeholder:text-muted-foreground/50"
                    required
                    data-testid="input-password-new"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Potwierdź hasło"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="h-14 rounded-2xl pl-12 pr-5 bg-card/50 backdrop-blur-md border-white/10 focus:bg-card focus:border-primary transition-colors text-base shadow-inner-glow placeholder:text-muted-foreground/50"
                    required
                    data-testid="input-confirm-password"
                  />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button
                  type="submit"
                  disabled={isLoading}
                  data-testid="button-register"
                  className="w-full h-14 rounded-2xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? "Tworzę konto..." : <><span>Utwórz konto</span><ArrowRight className="w-5 h-5" /></>}
                </button>

              </motion.form>
            )}

            {/* ── FORGOT PASSWORD ── */}
            {step === "forgot" && (
              <motion.form
                key="forgot"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35 }}
                onSubmit={handleForgot}
                className="space-y-4 absolute inset-0"
              >
                <div className="px-4 py-3 rounded-2xl bg-card/30 border border-white/5 text-sm text-muted-foreground">
                  Podaj swój adres e-mail, a wyślemy Ci 6-cyfrowy kod do resetowania hasła.
                </div>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Adres e-mail"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="h-16 rounded-2xl pl-12 pr-5 bg-card/50 backdrop-blur-md border-white/10 focus:bg-card focus:border-primary transition-colors text-base shadow-inner-glow placeholder:text-muted-foreground/50"
                    required
                    autoFocus
                    data-testid="input-forgot-email"
                  />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button
                  type="submit"
                  disabled={isLoading}
                  data-testid="button-send-reset"
                  className="w-full h-16 rounded-2xl text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? "Wysyłam..." : <><span>Wyślij kod</span><ArrowRight className="w-5 h-5" /></>}
                </button>
              </motion.form>
            )}

            {/* ── RESET PASSWORD ── */}
            {step === "reset" && (
              <motion.form
                key="reset"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35 }}
                onSubmit={handleReset}
                className="space-y-3 absolute inset-0"
              >
                {resetSuccess ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <div className="w-16 h-16 bg-card border border-primary/30 rounded-full flex items-center justify-center">
                      <ShieldCheck className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-white font-semibold">Hasło zostało zmienione!</p>
                    <p className="text-sm text-muted-foreground">Możesz się teraz zalogować.</p>
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-3 rounded-2xl bg-card/30 border border-white/5 text-sm text-muted-foreground truncate">
                      {email}
                    </div>
                    {devCode ? (
                      <div className="px-4 py-3 rounded-2xl bg-amber-900/30 border border-amber-500/40 text-sm text-amber-200 flex flex-col gap-1">
                        <span className="font-semibold text-amber-300 text-xs uppercase tracking-wider">⚗ Tryb testowy</span>
                        <span className="text-amber-200/80">Stały kod testowy:</span>
                        <span className="text-2xl font-bold tracking-[0.3em] text-amber-300 text-center py-1">123456</span>
                        <span className="text-xs text-amber-300/70">Pole uzupełnione automatycznie · na produkcji kod losowy via email</span>
                      </div>
                    ) : (
                      <div className="px-4 py-3 rounded-2xl bg-card/30 border border-white/5 text-sm text-muted-foreground">
                        Sprawdź skrzynkę e-mail i wpisz 6-cyfrowy kod.
                      </div>
                    )}
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        placeholder="Kod z e-maila (6 cyfr)"
                        value={resetCode}
                        onChange={e => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="h-14 rounded-2xl pl-12 pr-5 bg-card/50 backdrop-blur-md border-white/10 focus:bg-card focus:border-primary transition-colors text-base shadow-inner-glow placeholder:text-muted-foreground/50 tracking-widest text-center font-bold text-lg"
                        required
                        autoFocus
                        data-testid="input-reset-code"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Nowe hasło (min. 8 znaków)"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="h-14 rounded-2xl pl-12 pr-12 bg-card/50 backdrop-blur-md border-white/10 focus:bg-card focus:border-primary transition-colors text-base shadow-inner-glow placeholder:text-muted-foreground/50"
                        required
                        data-testid="input-new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Potwierdź nowe hasło"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="h-14 rounded-2xl pl-12 pr-5 bg-card/50 backdrop-blur-md border-white/10 focus:bg-card focus:border-primary transition-colors text-base shadow-inner-glow placeholder:text-muted-foreground/50"
                        required
                        data-testid="input-confirm-new-password"
                      />
                    </div>
                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                    <button
                      type="submit"
                      disabled={isLoading || resetCode.length !== 6}
                      data-testid="button-reset-password"
                      className="w-full h-14 rounded-2xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {isLoading ? "Resetuję..." : <><span>Ustaw nowe hasło</span><ArrowRight className="w-5 h-5" /></>}
                    </button>
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={isLoading}
                      className="w-full text-sm text-muted-foreground/60 hover:text-primary transition-colors py-1 disabled:opacity-40"
                      data-testid="button-resend-code"
                    >
                      {isLoading ? "Wysyłam..." : "Wyślij kod ponownie"}
                    </button>
                  </>
                )}
              </motion.form>
            )}

            {/* ── VERIFY EMAIL ── */}
            {step === "verify" && (
              <motion.form
                key="verify"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35 }}
                onSubmit={handleVerify}
                className="space-y-4 absolute inset-0"
              >
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-card/30 border border-white/5">
                  <MailCheck className="w-5 h-5 text-primary shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Wysłaliśmy 6-cyfrowy kod na <span className="text-white font-medium">{email}</span>. Wpisz go poniżej, aby aktywować konto.
                  </p>
                </div>
                {verifyDevCode ? (
                  <div className="px-4 py-3 rounded-2xl bg-amber-900/30 border border-amber-500/40 text-sm text-amber-200 flex flex-col gap-1">
                    <span className="font-semibold text-amber-300 text-xs uppercase tracking-wider">⚗ Tryb testowy</span>
                    <span className="text-amber-200/80">Stały kod testowy:</span>
                    <span className="text-2xl font-bold tracking-[0.3em] text-amber-300 text-center py-1">123456</span>
                    <span className="text-xs text-amber-300/70">Pole uzupełnione automatycznie · na produkcji kod losowy via email</span>
                  </div>
                ) : null}
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="Kod weryfikacyjny (6 cyfr)"
                    value={verifyCode}
                    onChange={e => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="h-16 rounded-2xl pl-12 pr-5 bg-card/50 backdrop-blur-md border-white/10 focus:bg-card focus:border-primary transition-colors text-base shadow-inner-glow placeholder:text-muted-foreground/50 tracking-widest text-center font-bold text-lg"
                    required
                    autoFocus
                    data-testid="input-verify-code"
                  />
                </div>
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button
                  type="submit"
                  disabled={isLoading || verifyCode.length !== 6}
                  data-testid="button-verify-email"
                  className="w-full h-16 rounded-2xl text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? "Weryfikuję..." : <><span>Zweryfikuj konto</span><ShieldCheck className="w-5 h-5" /></>}
                </button>
                <button
                  type="button"
                  onClick={handleResendVerify}
                  disabled={resendCooldown > 0 || isLoading}
                  data-testid="button-resend-verification"
                  className="w-full text-sm text-muted-foreground/60 hover:text-primary transition-colors py-1 disabled:opacity-40"
                >
                  {resendCooldown > 0 ? `Wyślij ponownie (${resendCooldown}s)` : "Wyślij kod ponownie"}
                </button>
              </motion.form>
            )}

            {/* ── SUCCESS ── */}
            {step === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center space-y-6"
              >
                <div className="relative">
                  <div className="w-24 h-24 bg-card border border-primary/30 rounded-full flex items-center justify-center shadow-inner-glow">
                    <ShieldCheck className="w-10 h-10 text-primary" />
                  </div>
                  <motion.div
                    className="absolute inset-0 border-2 border-primary rounded-full"
                    initial={{ scale: 1, opacity: 1 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-white/90 text-lg mb-1">Uwierzytelniono</p>
                  <p className="text-sm text-muted-foreground">Ładowanie konta...</p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* ── Download App Section ── shown only on email/register steps */}
        {(step === "email" || step === "register") && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-8 space-y-3"
          >
            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-[12px] text-muted-foreground/50 uppercase tracking-widest font-bold">Pobierz aplikację</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Android — triggers native PWA install prompt, or shows guide */}
              <button
                type="button"
                onClick={canInstall ? install : showAndroidGuide}
                data-testid="button-download-android"
                className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-card/40 border border-white/8 hover:bg-card/70 hover:border-primary/30 active:scale-[0.97] transition-all"
              >
                <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 16.5C4 17.88 5.12 19 6.5 19H7v2.5a1.5 1.5 0 0 0 3 0V19h4v2.5a1.5 1.5 0 0 0 3 0V19h.5c1.38 0 2.5-1.12 2.5-2.5V9H4v7.5z" fill="#34a853"/>
                    <path d="M14.84 3.18 16.27 .73a.3.3 0 0 0-.52-.3l-1.45 2.48A9.0 9.0 0 0 0 12 2.5c-1.23 0-2.4.25-3.45.7L7.1.43a.3.3 0 0 0-.52.3L8 3.18A8.99 8.99 0 0 0 3 11h18a9 9 0 0 0-6.16-7.82zM9 8.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm6 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" fill="#34a853"/>
                    <path d="M1.5 9A1.5 1.5 0 0 0 0 10.5v5a1.5 1.5 0 0 0 3 0v-5A1.5 1.5 0 0 0 1.5 9zm21 0A1.5 1.5 0 0 0 21 10.5v5a1.5 1.5 0 0 0 3 0v-5A1.5 1.5 0 0 0 22.5 9z" fill="#34a853"/>
                  </svg>
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[12px] text-muted-foreground/60 uppercase tracking-wider">Pobierz na</p>
                  <p className="text-sm font-bold text-white/90 leading-tight">Android</p>
                </div>
              </button>

              {/* iPhone — shows step-by-step Safari guide */}
              <button
                type="button"
                onClick={showIOSGuide}
                data-testid="button-download-ios"
                className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-card/40 border border-white/8 hover:bg-card/70 hover:border-primary/30 active:scale-[0.97] transition-all"
              >
                <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white/85" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[12px] text-muted-foreground/60 uppercase tracking-wider">Pobierz na</p>
                  <p className="text-sm font-bold text-white/90 leading-tight">iPhone</p>
                </div>
              </button>
            </div>

            {/* Already installed indicator */}
            {isInstalled && (
              <div className="flex items-center justify-center gap-2 py-2">
                <Globe className="w-4 h-4 text-primary/60" />
                <span className="text-xs text-primary/60 font-semibold">Aplikacja jest już zainstalowana</span>
              </div>
            )}
          </motion.div>
        )}

        <p className="text-center text-xs text-muted-foreground/60 uppercase tracking-widest font-semibold mt-8">
          Bezpieczne szyfrowane połączenie
        </p>
      </motion.div>

      {/* PWA Install Guide modal */}
      <AnimatePresence>
        {showGuide && <PWAInstallGuide onClose={() => setShowGuide(false)} platform={guidePlatform} />}
      </AnimatePresence>
    </div>
  );
}
