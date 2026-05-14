import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Smartphone, MoreVertical, Share2, Plus, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let globalInstallEvent: BeforeInstallPromptEvent | null = null;
export function getInstallEvent() { return globalInstallEvent; }

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guidePlatform, setGuidePlatform] = useState<"android" | "ios">("android");

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }
    if (globalInstallEvent) setCanInstall(true);

    const handler = (e: Event) => {
      e.preventDefault();
      globalInstallEvent = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (globalInstallEvent) {
      await globalInstallEvent.prompt();
      const { outcome } = await globalInstallEvent.userChoice;
      if (outcome === "accepted") {
        globalInstallEvent = null;
        setCanInstall(false);
        setIsInstalled(true);
      }
    } else {
      setGuidePlatform("android");
      setShowGuide(true);
    }
  };

  const showAndroidGuide = () => { setGuidePlatform("android"); setShowGuide(true); };
  const showIOSGuide = () => { setGuidePlatform("ios"); setShowGuide(true); };

  return { canInstall, isInstalled, install, showGuide, setShowGuide, guidePlatform, showAndroidGuide, showIOSGuide };
}

function isChromeOnIOS() {
  return /CriOS/.test(navigator.userAgent);
}

export function PWAInstallGuide({ onClose, platform }: { onClose: () => void; platform?: "android" | "ios" }) {
  const detectedIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const resolvedPlatform = platform ?? (detectedIOS ? "ios" : "android");
  const chromeOnIOS = resolvedPlatform === "ios" && isChromeOnIOS();

  const androidSteps = [
    {
      icon: <MoreVertical className="w-5 h-5" />,
      title: "Otwórz menu Chrome",
      text: 'Naciśnij ⋮ (trzy kropki) w prawym górnym rogu przeglądarki',
    },
    {
      icon: <Download className="w-5 h-5" />,
      title: "Zainstaluj aplikację",
      text: 'Wybierz "Zainstaluj aplikację" lub "Dodaj do ekranu głównego"',
    },
    {
      icon: <Check className="w-5 h-5" />,
      title: "Gotowe!",
      text: 'Naciśnij "Zainstaluj" — ikona Finlys pojawi się na pulpicie',
    },
  ];

  const iosSteps = [
    {
      icon: <Share2 className="w-5 h-5" />,
      title: "Naciśnij Udostępnij",
      text: 'Otwórz w Safari i naciśnij ikonę "Udostępnij" (kwadrat ze strzałką) na dole ekranu',
    },
    {
      icon: <Plus className="w-5 h-5" />,
      title: "Dodaj do ekranu",
      text: 'Przewiń w dół i wybierz "Dodaj do ekranu głównego"',
    },
    {
      icon: <Check className="w-5 h-5" />,
      title: "Potwierdź",
      text: 'Naciśnij "Dodaj" w prawym górnym rogu — aplikacja pojawi się na pulpicie',
    },
  ];

  const steps = resolvedPlatform === "ios" ? iosSteps : androidSteps;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-end justify-center pb-6 px-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 220 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card border border-white/10 rounded-3xl p-6 shadow-[0_-20px_60px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-white">Zainstaluj Finlys</p>
              <p className="text-[13px] text-muted-foreground">
                {resolvedPlatform === "ios" ? "iPhone / iPad — Safari" : "Android — Chrome"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chrome on iOS warning */}
        {chromeOnIOS && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Wymagany Safari</p>
              <p className="text-[13px] text-amber-300/70 mt-0.5 leading-relaxed">
                Chrome na iOS nie obsługuje instalacji. Otwórz tę stronę w <strong>Safari</strong> i postępuj zgodnie z poniższymi krokami.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3 mb-5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-4 bg-secondary/50 rounded-2xl p-4 border border-white/5">
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary mt-0.5">
                {step.icon}
              </div>
              <div className="flex-1">
                <span className="text-[12px] font-bold uppercase tracking-widest text-primary">Krok {i + 1} — {step.title}</span>
                <p className="text-sm text-white/75 leading-snug mt-1">{step.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-primary/5 border border-primary/10 rounded-2xl p-3 text-center mb-4">
          <p className="text-[13px] text-primary font-medium">
            Po instalacji Finlys działa jak natywna aplikacja — pełny ekran, bez paska przeglądarki
          </p>
        </div>

        <Button
          onClick={onClose}
          variant="outline"
          className="w-full rounded-xl border-white/10 text-muted-foreground h-11"
        >
          Zamknij
        </Button>
      </motion.div>
    </motion.div>
  );
}

export default function PWAInstallBanner() {
  const { canInstall, isInstalled, install, showGuide, setShowGuide, guidePlatform } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isInstalled) return;
    if (sessionStorage.getItem("pwa_banner_dismissed")) return;
    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, [isInstalled]);

  const handleInstall = async () => {
    if (canInstall) {
      await install();
      setVisible(false);
    } else {
      setShowGuide(true);
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    sessionStorage.setItem("pwa_banner_dismissed", "1");
  };

  if (isInstalled || dismissed) return null;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 200 }}
            className="fixed bottom-24 left-4 right-4 z-[100] sm:left-auto sm:right-4 sm:w-80"
          >
            <div className="bg-card border border-primary/30 rounded-3xl p-5 shadow-[0_20px_60px_rgba(201,168,76,0.2)] backdrop-blur-xl">
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 text-muted-foreground hover:text-white"
                data-testid="button-dismiss-pwa-banner"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-white text-[15px]">Zainstaluj Finlys</p>
                  <p className="text-[13px] text-muted-foreground">Pełny ekran, jak natywna app</p>
                </div>
              </div>

              <Button
                onClick={handleInstall}
                className="w-full rounded-xl bg-primary text-primary-foreground font-semibold h-10 flex items-center gap-2"
                data-testid="button-install-pwa"
              >
                <Download className="w-4 h-4" />
                Zainstaluj aplikację
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGuide && <PWAInstallGuide onClose={() => setShowGuide(false)} platform={guidePlatform} />}
      </AnimatePresence>
    </>
  );
}
