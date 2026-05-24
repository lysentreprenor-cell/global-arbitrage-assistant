import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, ShieldCheck, ShieldAlert, ShieldOff, Fingerprint, Smartphone,
  EyeOff, Bell, ArrowRightLeft, AlertTriangle, Monitor, History,
  Trash2, LogOut, RefreshCw, Loader2, KeyRound, UserX,
} from "lucide-react";
import PinEntryModal from "@/components/PinEntryModal";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useAppStore } from "@/lib/store";
import { useSecurityCenter, SecuritySettings } from "@/hooks/useSecurityCenter";

function formatUA(ua: string): string {
  if (!ua) return "Nieznane urządzenie";
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("iPad")) return "iPad";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Mac OS X")) return "macOS";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Linux")) return "Linux";
  return ua.slice(0, 40) + (ua.length > 40 ? "…" : "");
}

const EVENT_ICONS: Record<string, string> = {
  settings_update: "⚙️", two_factor_send: "📨", two_factor_verified: "✅",
  two_factor_disabled: "🔓", device_trusted: "📱", device_removed: "🗑️",
  session_revoked: "🚪", sessions_revoked_others: "🚪", security_review: "📋",
  transfer_confirmation_sent: "💸", transfer_confirmation_verified: "✔️",
};

export default function Security() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { lang } = useLang();
  const { theme } = useTheme();
  const { updateSettings: storeUpdateSettings, logout } = useAppStore();
  const pl = lang === "pl";
  const isLight = (theme as string) === "arctic-platinum";
  const textPrimary = isLight ? "text-gray-900" : "text-white/90";

  const {
    loading, saving, error, summary, settings, devices, sessions, events, deviceSessions, devCode,
    reload, updateSettings, send2FA, verify2FA, disable2FA,
    trustCurrentDevice, removeDevice, registerDevice, removeDeviceSession,
    revokeSession, revokeOtherSessions, markReviewed,
  } = useSecurityCenter();

  // Per-action saving indicators
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // 2FA UI state
  const [twoFaStep, setTwoFaStep] = useState<"idle" | "pending">("idle");
  const [twoFaCode, setTwoFaCode] = useState("");
  // Delete account modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  // PIN setup — pinEnabled comes from backend security settings
  const [pinModalOpen, setPinModalOpen] = useState(false);

  async function toggle(key: keyof SecuritySettings, value: boolean) {
    if (!settings) return;
    // Enabling PIN requires a PIN to be configured first — open setup modal
    if (key === "pinEnabled" && value === true && !settings.pinConfigured) {
      setPinModalOpen(true);
      return;
    }
    setSavingKey(key);
    try {
      const next = { ...settings, [key]: value };
      await updateSettings(next);
      if (key === "hideBalance") storeUpdateSettings({ hideBalances: value });
      if (key === "biometricEnabled") storeUpdateSettings({ biometricLogin: value });
      toast({ title: pl ? "Zapisano" : "Saved" });
    } catch (e: any) {
      toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" });
    } finally { setSavingKey(null); }
  }

  async function handle2FAToggle(on: boolean) {
    if (!on) {
      setSavingKey("2fa-off");
      try { await disable2FA(); toast({ title: pl ? "2FA wyłączone" : "2FA disabled" }); }
      catch (e: any) { toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" }); }
      finally { setSavingKey(null); }
      return;
    }
    setSavingKey("2fa-send");
    try { await send2FA(); setTwoFaStep("pending"); }
    catch (e: any) { toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingKey(null); }
  }

  async function confirm2FA() {
    setSavingKey("2fa-verify");
    try {
      await verify2FA(twoFaCode);
      setTwoFaStep("idle"); setTwoFaCode("");
      toast({ title: pl ? "2FA włączone" : "2FA enabled" });
    } catch (e: any) { toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingKey(null); }
  }

  async function doRegisterDevice() {
    setSavingKey("register-device");
    try {
      await registerDevice();
      toast({ title: pl ? "Urządzenie zarejestrowane" : "Device registered" });
    } catch (e: any) {
      toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" });
    } finally { setSavingKey(null); }
  }

  async function doRemoveDeviceSession(id: string) {
    setSavingKey(`ds-${id}`);
    try { await removeDeviceSession(id); toast({ title: pl ? "Usunięto" : "Removed" }); }
    catch (e: any) { toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingKey(null); }
  }

  async function doTrustDevice() {
    setSavingKey("trust");
    try { await trustCurrentDevice(); toast({ title: pl ? "Urządzenie dodane" : "Device trusted" }); }
    catch (e: any) { toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingKey(null); }
  }
  async function doRemoveDevice(id: string) {
    setSavingKey(`dev-${id}`);
    try { await removeDevice(id); toast({ title: pl ? "Usunięto" : "Removed" }); }
    catch (e: any) { toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingKey(null); }
  }
  async function doRevokeSession(id: string) {
    setSavingKey(`sess-${id}`);
    try { await revokeSession(id); toast({ title: pl ? "Sesja zakończona" : "Session revoked" }); }
    catch (e: any) { toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingKey(null); }
  }
  async function doRevokeOthers() {
    setSavingKey("revoke-others");
    try { await revokeOtherSessions(); toast({ title: pl ? "Inne sesje wylogowane" : "Other sessions revoked" }); }
    catch (e: any) { toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingKey(null); }
  }
  async function doMarkReviewed() {
    setSavingKey("review");
    try { await markReviewed(); toast({ title: pl ? "Przegląd zapisany" : "Review saved" }); }
    catch (e: any) { toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" }); }
    finally { setSavingKey(null); }
  }

  async function doDeleteAccount() {
    setDeletingAccount(true);
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (pl ? "Nie udało się usunąć konta." : "Failed to delete account."));
      }
      toast({ title: pl ? "Konto usunięte" : "Account deleted", description: pl ? "Twoje dane zostały trwale usunięte." : "Your data has been permanently deleted." });
      setDeleteModalOpen(false);
      setTimeout(() => {
        logout();
        setLocation("/auth");
      }, 800);
    } catch (e: any) {
      toast({ title: pl ? "Błąd" : "Error", description: e.message, variant: "destructive" });
    } finally {
      setDeletingAccount(false);
    }
  }

  const levelConfig = {
    high: { icon: ShieldCheck, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", bar: "bg-primary" },
    medium: { icon: ShieldAlert, color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20", bar: "bg-amber-400" },
    low: { icon: ShieldOff, color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20", bar: "bg-red-400" },
  };
  const cfg = levelConfig[summary?.level ?? "low"];
  const LevelIcon = cfg.icon;

  function ToggleRow({ k, icon: Icon, label, desc }: { k: keyof SecuritySettings; icon: any; label: string; desc: string }) {
    const checked = Boolean(settings?.[k]);
    return (
      <div className="p-5 flex items-center justify-between border-b border-white/5 last:border-0">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-white/5 shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className={`font-semibold text-sm ${textPrimary}`}>{label}</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">{desc}</p>
          </div>
        </div>
        {savingKey === k ? <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" /> : (
          <Switch checked={checked} onCheckedChange={(v) => toggle(k, v)} disabled={loading || savingKey !== null} data-testid={`switch-${k}`} />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28 relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      {pinModalOpen && (
        <PinEntryModal
          mode="setup"
          onSuccess={() => { setPinModalOpen(false); reload(); toast({ title: pl ? "PIN ustawiony" : "PIN set", description: pl ? "Możesz teraz używać PIN do autoryzacji przelewów." : "You can now use your PIN to authorize transfers." }); }}
          onCancel={() => setPinModalOpen(false)}
        />
      )}

      {/* Delete Account Confirmation Modal */}
      <AnimatePresence>
        {deleteModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm px-4 pb-8"
            onClick={(e) => { if (e.target === e.currentTarget) { setDeleteModalOpen(false); setDeleteConfirmText(""); } }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", damping: 24, stiffness: 300 }}
              className="w-full max-w-md bg-card border border-red-500/20 rounded-3xl p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20 shrink-0">
                  <UserX className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h2 className={`font-heading text-lg ${textPrimary}`}>
                    {pl ? "Usuń konto" : "Delete Account"}
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    {pl ? "Ta operacja jest nieodwracalna." : "This action cannot be undone."}
                  </p>
                </div>
              </div>

              <div className="bg-red-500/5 border border-red-500/15 rounded-2xl p-4 space-y-1.5">
                <p className="text-[13px] text-red-400 font-semibold">
                  {pl ? "Co zostanie usunięte:" : "What will be deleted:"}
                </p>
                {[
                  pl ? "Konto i dane osobowe" : "Account & personal data",
                  pl ? "Historia transakcji" : "Transaction history",
                  pl ? "Wiadomości i kontakty" : "Messages & contacts",
                  pl ? "Zgłoszenia do wsparcia" : "Support tickets",
                ].map((item) => (
                  <p key={item} className="text-[12px] text-red-400/80 flex items-center gap-2">
                    <span className="w-1 h-1 bg-red-400/60 rounded-full shrink-0" />
                    {item}
                  </p>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-[13px] text-muted-foreground">
                  {pl
                    ? `Wpisz "USUŃ KONTO" aby potwierdzić:`
                    : `Type "DELETE ACCOUNT" to confirm:`}
                </p>
                <Input
                  data-testid="input-delete-confirm"
                  placeholder={pl ? "USUŃ KONTO" : "DELETE ACCOUNT"}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="rounded-2xl bg-secondary border-white/10 text-center font-mono tracking-wide"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-2xl border-white/10"
                  onClick={() => { setDeleteModalOpen(false); setDeleteConfirmText(""); }}
                  disabled={deletingAccount}
                >
                  {pl ? "Anuluj" : "Cancel"}
                </Button>
                <Button
                  data-testid="button-confirm-delete-account"
                  className="flex-1 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-semibold"
                  disabled={
                    deletingAccount ||
                    deleteConfirmText !== (pl ? "USUŃ KONTO" : "DELETE ACCOUNT")
                  }
                  onClick={doDeleteAccount}
                >
                  {deletingAccount
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : (pl ? "Usuń konto" : "Delete Account")}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-6 pt-14 pb-5 flex items-center sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-border/50">
        <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 mr-4" onClick={() => setLocation("/profile")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className={`text-2xl font-heading ${textPrimary}`}>
          {pl ? "Centrum Bezpieczeństwa" : "Security Center"}
        </h1>
        <button onClick={reload} className="ml-auto text-muted-foreground hover:text-primary transition-colors" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <main className="px-6 py-8 space-y-8 relative z-10">

        {/* Score banner */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className={`flex items-center gap-4 p-5 rounded-3xl ${cfg.bg} border ${cfg.border}`}>
            {loading ? <Loader2 className={`w-8 h-8 animate-spin ${cfg.color} shrink-0`} /> : (
              <div className={`w-12 h-12 rounded-full ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                <LevelIcon className={`w-6 h-6 ${cfg.color}`} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm ${cfg.color}`}>
                {loading ? (pl ? "Ładowanie..." : "Loading...") : (pl ? summary?.labelPl : summary?.label)}
              </p>
              <div className="mt-2 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${summary?.score ?? 0}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full ${cfg.bar} rounded-full`}
                />
              </div>
              <p className="text-[13px] text-muted-foreground mt-1">{summary?.score ?? 0}/100</p>
            </div>
          </div>
        </motion.div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-2xl px-4 py-3">{error}</div>
        )}

        {/* Access Control */}
        <Section label={pl ? "Kontrola dostępu" : "Access Control"}>
          <div className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-premium">
            {/* Biometric */}
            <ToggleRow k="biometricEnabled" icon={Fingerprint}
              label={pl ? "Uwierzytelnianie biometryczne" : "Biometric Auth"}
              desc={pl ? "Face ID lub Touch ID" : "Face ID or Touch ID"} />

            {/* 2FA */}
            <div className="p-5 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-white/5 shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${textPrimary}`}>{pl ? "Uwierzytelnianie dwuskładnikowe" : "Two-Factor Auth"}</p>
                    <p className="text-[13px] text-muted-foreground mt-0.5">{pl ? "SMS / e-mail kod weryfikacyjny" : "SMS / email verification code"}</p>
                  </div>
                </div>
                {(savingKey === "2fa-send" || savingKey === "2fa-off") ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : (
                  <Switch
                    checked={settings?.twoFactorEnabled ?? false}
                    onCheckedChange={handle2FAToggle}
                    disabled={loading || savingKey !== null}
                    data-testid="switch-2fa"
                  />
                )}
              </div>

              <AnimatePresence>
                {twoFaStep === "pending" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 space-y-3 overflow-hidden">
                    <Input
                      placeholder={pl ? "Wpisz 6-cyfrowy kod" : "Enter 6-digit code"}
                      value={twoFaCode}
                      onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="rounded-2xl bg-secondary border-white/10 text-center text-xl font-mono tracking-[0.4em]"
                      data-testid="input-2fa-code"
                    />
                    <div className="flex gap-3">
                      <Button variant="outline" size="sm" className="flex-1 rounded-xl border-white/10" onClick={() => { setTwoFaStep("idle"); setTwoFaCode(""); }}>
                        {pl ? "Anuluj" : "Cancel"}
                      </Button>
                      <Button size="sm" className="flex-1 rounded-xl bg-primary text-primary-foreground font-semibold"
                        onClick={confirm2FA} disabled={twoFaCode.length !== 6 || savingKey === "2fa-verify"}
                        data-testid="button-verify-2fa">
                        {savingKey === "2fa-verify" ? <Loader2 className="w-4 h-4 animate-spin" /> : (pl ? "Potwierdź" : "Confirm")}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Section>

        {/* PIN bezpieczeństwa */}
        <Section label={pl ? "PIN bezpieczeństwa" : "Security PIN"}>
          <div className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-premium">
            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-primary border border-white/5 shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <p className={`font-semibold text-sm ${textPrimary}`}>
                    {pl ? "PIN do autoryzacji operacji" : "Transaction Authorization PIN"}
                  </p>
                  <p className="text-[13px] mt-0.5" data-testid="status-pin">
                    {settings?.pinEnabled
                      ? <span className="text-emerald-400 font-semibold">{pl ? "PIN aktywny" : "PIN active"}</span>
                      : <span className="text-amber-400 font-semibold">{pl ? "PIN nieaktywny" : "PIN inactive"}</span>}
                    <span className="text-muted-foreground"> — {settings?.pinEnabled
                      ? (pl ? "kliknij aby zmienić" : "click to change")
                      : (pl ? "wymagany dla przelewów ≥ 100" : "required for transfers ≥ 100")}</span>
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl border-primary/30 text-primary hover:bg-primary/10 text-[13px] font-semibold shrink-0"
                onClick={() => setPinModalOpen(true)}
                data-testid="button-setup-pin"
              >
                {settings?.pinConfigured ? (pl ? "Zmień" : "Change") : (pl ? "Ustaw" : "Set up")}
              </Button>
            </div>
            {/* Toggle: Wymagaj PIN dla przelewów */}
            <div className="border-t border-white/5">
              <ToggleRow
                k="pinEnabled"
                icon={KeyRound}
                label={pl ? "Wymagaj PIN dla przelewów" : "Require PIN for Transfers"}
                desc={pl ? "Weryfikacja PIN wymagana przy każdym przelewie ≥ 100" : "PIN verification required for each transfer ≥ 100"}
              />
            </div>
          </div>
        </Section>

        {/* Privacy */}
        <Section label={pl ? "Prywatność i ochrona" : "Privacy & Protection"}>
          <div className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-premium">
            <ToggleRow k="hideBalance" icon={EyeOff} label={pl ? "Ukryj saldo" : "Hide Balance"} desc={pl ? "Zamazuj kwoty w widokach" : "Blur amounts throughout the app"} />
            <ToggleRow k="loginAlerts" icon={Bell} label={pl ? "Alerty logowania" : "Login Alerts"} desc={pl ? "Powiadamiaj o nowych logowaniach" : "Notify on new sign-ins"} />
            <ToggleRow k="transferConfirmation" icon={ArrowRightLeft} label={pl ? "Potwierdzenie przelewów" : "Transfer Confirmation"} desc={pl ? "Dodatkowe potwierdzenie przy każdym przelewie" : "Extra confirm for every transfer"} />
            <ToggleRow k="suspiciousLoginProtection" icon={AlertTriangle} label={pl ? "Ochrona przed podejrzanym logowaniem" : "Suspicious Login Protection"} desc={pl ? "Blokuj nieuprawnione próby" : "Block unauthorized login attempts"} />
          </div>
        </Section>

        {/* Trusted Devices */}
        <Section label={pl ? "Zaufane urządzenia" : "Trusted Devices"}
          action={
            <button onClick={doTrustDevice} disabled={savingKey === "trust"} className="text-[13px] text-primary font-semibold flex items-center gap-1 hover:opacity-80" data-testid="button-trust-device">
              {savingKey === "trust" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {pl ? "+ Dodaj to urządzenie" : "+ Add this device"}
            </button>
          }>
          <div className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-premium">
            {loading ? <PlaceholderRow /> : devices.length === 0 ? (
              <EmptyState icon={Monitor} label={pl ? "Brak zaufanych urządzeń." : "No trusted devices."} />
            ) : devices.map((d, i) => (
              <div key={d.id} className={`p-5 flex items-center gap-4 ${i < devices.length - 1 ? "border-b border-white/5" : ""}`}>
                <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center text-primary border border-white/5 shrink-0">
                  <Monitor className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm truncate ${textPrimary}`}>{d.device_name}</p>
                  <p className="text-[13px] text-muted-foreground mt-0.5">{pl ? "Ostatnio" : "Last seen"}: {new Date(d.last_seen_at).toLocaleDateString(pl ? "pl-PL" : "en-US")}</p>
                </div>
                <button onClick={() => doRemoveDevice(d.id)} disabled={savingKey === `dev-${d.id}`} className="text-muted-foreground hover:text-red-400 transition-colors p-1" data-testid={`button-remove-device-${d.id}`}>
                  {savingKey === `dev-${d.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* Active Sessions */}
        <Section label={pl ? "Aktywne sesje" : "Active Sessions"}
          action={
            sessions.length > 1 ? (
              <button onClick={doRevokeOthers} disabled={savingKey === "revoke-others"} className="text-[13px] text-red-400 font-semibold flex items-center gap-1 hover:opacity-80" data-testid="button-revoke-others">
                {savingKey === "revoke-others" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {pl ? "Wyloguj inne" : "Revoke others"}
              </button>
            ) : null
          }>
          <div className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-premium">
            {loading ? <PlaceholderRow /> : sessions.length === 0 ? (
              <EmptyState icon={LogOut} label={pl ? "Brak aktywnych sesji." : "No active sessions."} />
            ) : sessions.map((s, i) => (
              <div key={s.id} className={`p-5 flex items-center gap-4 ${i < sessions.length - 1 ? "border-b border-white/5" : ""}`}>
                <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center text-primary border border-white/5 shrink-0">
                  <LogOut className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${textPrimary}`}>{pl ? "Sesja" : "Session"} #{s.id.slice(0, 8)}</p>
                  <p className="text-[13px] text-muted-foreground mt-0.5">{pl ? "Wygasa" : "Expires"}: {new Date(s.expires_at).toLocaleDateString(pl ? "pl-PL" : "en-US")}</p>
                </div>
                <button onClick={() => doRevokeSession(s.id)} disabled={savingKey === `sess-${s.id}`}
                  className="text-[13px] text-red-400 border border-red-400/20 bg-red-400/5 hover:bg-red-400/10 transition-colors rounded-xl px-3 py-1.5 font-semibold shrink-0"
                  data-testid={`button-revoke-session-${s.id}`}>
                  {savingKey === `sess-${s.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : (pl ? "Wyloguj" : "Revoke")}
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* Security Events */}
        <Section label={pl ? "Historia zdarzeń" : "Security History"}>
          <div className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-premium">
            {loading ? <PlaceholderRow /> : events.length === 0 ? (
              <EmptyState icon={History} label={pl ? "Brak zdarzeń bezpieczeństwa." : "No security events."} />
            ) : events.map((e, i) => (
              <div key={e.id} className={`p-4 flex items-start gap-4 ${i < events.length - 1 ? "border-b border-white/5" : ""}`}>
                <span className="text-lg shrink-0 mt-0.5">{EVENT_ICONS[e.type] ?? "🔒"}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${textPrimary}`}>{e.description}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{new Date(e.created_at).toLocaleString(pl ? "pl-PL" : "en-US")}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Active Device Sessions — after security history per spec */}
        <Section label={pl ? "Aktywne urządzenia" : "Active Devices"}
          action={
            <button onClick={doRegisterDevice} disabled={savingKey === "register-device"} className="text-[13px] text-primary font-semibold flex items-center gap-1 hover:opacity-80" data-testid="button-register-device">
              {savingKey === "register-device" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {pl ? "+ To urządzenie" : "+ This device"}
            </button>
          }>
          <div className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-premium">
            {loading ? <PlaceholderRow /> : deviceSessions.length === 0 ? (
              <EmptyState icon={Smartphone} label={pl ? "Brak zarejestrowanych urządzeń." : "No active devices."} />
            ) : deviceSessions.map((ds, i) => (
              <div key={ds.id} className={`p-5 flex items-center gap-4 ${i < deviceSessions.length - 1 ? "border-b border-white/5" : ""}`} data-testid={`card-device-session-${ds.id}`}>
                <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center text-primary border border-white/5 shrink-0">
                  {ds.platform === "mobile" ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm truncate ${textPrimary}`} data-testid={`text-device-ua-${ds.id}`}>
                    {formatUA(ds.user_agent)}
                  </p>
                  <p className="text-[13px] text-muted-foreground mt-0.5">
                    {pl ? "Ostatnio aktywne" : "Last seen"}: {new Date(ds.last_seen_at).toLocaleDateString(pl ? "pl-PL" : "en-US")}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5 capitalize">{ds.platform}</p>
                </div>
                <button onClick={() => doRemoveDeviceSession(ds.id)} disabled={savingKey === `ds-${ds.id}`}
                  className="text-muted-foreground hover:text-red-400 transition-colors p-1 shrink-0"
                  data-testid={`button-remove-device-session-${ds.id}`}>
                  {savingKey === `ds-${ds.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* Mark Reviewed */}
        {settings?.lastSecurityReviewAt ? (
          <p className="text-[13px] text-center text-muted-foreground">
            {pl ? "Ostatni przegląd" : "Last review"}: {new Date(settings.lastSecurityReviewAt).toLocaleDateString(pl ? "pl-PL" : "en-US")}
          </p>
        ) : null}
        <button onClick={doMarkReviewed} disabled={savingKey === "review"}
          className="w-full text-sm text-muted-foreground border border-white/5 bg-secondary hover:bg-white/5 transition-colors rounded-2xl py-3 font-medium flex items-center justify-center gap-2"
          data-testid="button-mark-reviewed">
          {savingKey === "review" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {pl ? "Przejrzałem ustawienia bezpieczeństwa" : "I've reviewed my security settings"}
        </button>

        {/* Danger Zone — Delete Account */}
        <Section label={pl ? "Strefa niebezpieczna" : "Danger Zone"}>
          <div className="bg-red-500/5 border border-red-500/20 rounded-3xl overflow-hidden">
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20 shrink-0">
                  <UserX className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-red-400">
                    {pl ? "Usuń konto" : "Delete Account"}
                  </p>
                  <p className="text-[13px] text-muted-foreground mt-0.5">
                    {pl ? "Trwale usuwa konto i wszystkie dane" : "Permanently removes account and all data"}
                  </p>
                </div>
              </div>
              <Button
                data-testid="button-open-delete-account"
                size="sm"
                variant="outline"
                className="rounded-xl border-red-500/30 text-red-400 hover:bg-red-500/10 text-[13px] font-semibold shrink-0"
                onClick={() => { setDeleteConfirmText(""); setDeleteModalOpen(true); }}
              >
                {pl ? "Usuń" : "Delete"}
              </Button>
            </div>
          </div>
        </Section>

      </main>
    </div>
  );
}

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.15em] text-primary/80">{label}</h2>
        {action}
      </div>
      {children}
    </motion.div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="p-8 flex flex-col items-center gap-2">
      <Icon className="w-8 h-8 text-muted-foreground/30" />
      <p className="text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}

function PlaceholderRow() {
  return (
    <div className="p-5 flex justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
    </div>
  );
}
