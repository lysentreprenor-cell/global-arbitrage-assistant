import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppStore } from "@/lib/store";
import { BottomNav } from "@/components/BottomNav";
import { ThemeProvider, useTheme, ThemeName } from "@/context/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { MessageBadgeProvider } from "@/context/MessageBadgeContext";
import { WsProvider } from "@/context/WsContext";
import { NotificationBadgeProvider } from "@/context/NotificationBadgeContext";
import { useFeatures } from "@/hooks/useFeatures";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { MessageSquare } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { AnimatePresence, motion } from "framer-motion";

import Dashboard from "@/pages/Dashboard";
import Auth from "@/pages/Auth";
import Cards from "@/pages/Cards";
import CardLimits from "@/pages/CardLimits";
import PhysicalCard from "@/pages/PhysicalCard";
import Transfer from "@/pages/Transfer";
import ContactSelection from "@/pages/ContactSelection";
import TransferFlow from "@/pages/TransferFlow";
import ContractInviteFlow from "@/pages/ContractInviteFlow";
import InvitePersonFlow from "@/pages/InvitePersonFlow";
import MessagesPage from "@/pages/Messages";
import NewMessage from "@/pages/Messages/NewMessage";
import ChatThread from "@/pages/Messages/ChatThread";
import Profile from "@/pages/Profile";
import AccountDetails from "@/pages/AccountDetails";
import Notifications from "@/pages/Notifications";
import NotificationCenter from "@/pages/NotificationCenter";
import Support from "@/pages/Support";
import Security from "@/pages/Security";
import Preferences from "@/pages/Preferences";
import History from "@/pages/History";
import TransactionDetails from "@/pages/TransactionDetails";
import Invest from "@/pages/Invest";
import BudgetForecast from "@/pages/BudgetForecast";
import NotFound from "@/pages/not-found";
import AdminDashboard from "@/pages/AdminDashboard";
import UserDirectory from "@/pages/UserDirectory";
import VerifyEmail from "@/pages/VerifyEmail";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import WalletTopUp from "@/pages/WalletTopUp";
import Agreements from "@/pages/Agreements";
import AgreementNew from "@/pages/AgreementNew";
import AgreementDetail from "@/pages/AgreementDetail";
import SplitBill from "@/pages/SplitBill";
import RecurringPayments from "@/pages/RecurringPayments";
import SavingsGoals from "@/pages/SavingsGoals";
import KYCVerification from "@/pages/KYCVerification";
import ReferralProgram from "@/pages/ReferralProgram";
import LoanFlow from "@/pages/LoanFlow";
import ResellDashboard from "@/pages/resell/Dashboard";
import ResellAddProduct from "@/pages/resell/AddProduct";
import ResellProducts from "@/pages/resell/Products";
import ResellProductDetail from "@/pages/resell/ProductDetail";
import ResellProfitPage from "@/pages/resell/ProfitPage";
import ResellCompliancePage from "@/pages/resell/CompliancePage";
import ResellOfferPage from "@/pages/resell/OfferPage";
import ResellSearch from "@/pages/resell/Search";

function ResellRouter() {
  return (
    <Switch>
      <Route path="/resell" component={ResellDashboard} />
      <Route path="/resell/search" component={ResellSearch} />
      <Route path="/resell/add" component={ResellAddProduct} />
      <Route path="/resell/products" component={ResellProducts} />
      <Route path="/resell/product/:id" component={ResellProductDetail} />
      <Route path="/resell/profit/:id" component={ResellProfitPage} />
      <Route path="/resell/compliance/:id" component={ResellCompliancePage} />
      <Route path="/resell/offer/:id" component={ResellOfferPage} />
    </Switch>
  );
}

function AuthSplash() {
  return (
    <motion.div
      key="auth-splash"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "var(--background, #0d0d0f)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 24,
      }}
    >
      <div style={{
        width: 64, height: 64, borderRadius: 20,
        background: "linear-gradient(180deg, #fff4b8 0%, #f9d95e 22%, #d4a020 62%, #b8880a 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 24px rgba(212,160,32,0.40)",
      }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="10" stroke="#1a1400" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="44" strokeDashoffset="11"
            style={{ transformOrigin: "center", animation: "spin 1s linear infinite" }} />
        </svg>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}

function Router() {
  const { isAuthenticated, authLoading, user } = useAppStore();
  const { isEnabled } = useFeatures();
  const [, setLocation] = useLocation();
  const [location] = useLocation();

  useEffect(() => {
    if (isAuthenticated && location === "/auth") {
      setLocation("/");
    }
  }, [isAuthenticated, location, setLocation]);

  // Resell app — publicly accessible, full-screen layout
  if (location === "/resell" || location.startsWith("/resell/")) {
    return <ResellRouter />;
  }

  // While /api/me is in flight, show a neutral splash so no auth screen flashes.
  // AnimatePresence handles the fade-out when authLoading → false.
  if (authLoading) {
    return (
      <AnimatePresence>
        <AuthSplash />
      </AnimatePresence>
    );
  }

  if (!isAuthenticated) {
    return (
      <div data-scroll-root className="w-full max-w-md mx-auto h-[100dvh] max-h-[100dvh] bg-background relative sm:shadow-2xl sm:border-x border-border/40 overflow-x-hidden overflow-y-auto flex flex-col transition-colors duration-500">
        <Auth />
      </div>
    );
  }

  return (
    <div data-scroll-root className="w-full max-w-md mx-auto h-[100dvh] max-h-[100dvh] bg-background relative sm:shadow-2xl sm:border-x border-border/40 overflow-x-hidden overflow-y-auto flex flex-col transition-colors duration-500">
      <Switch>
        <Route path="/auth" component={() => { useEffect(() => setLocation("/"), []); return null; }} />
        <Route path="/" component={Dashboard} />
        <Route path="/cards" component={Cards} />
        <Route path="/cards/limits" component={CardLimits} />
        <Route path="/cards/physical" component={PhysicalCard} />
        <Route path="/transfer" component={ContactSelection} />
        <Route path="/transfer/send" component={Transfer} />
        <Route path="/transfer/new" component={TransferFlow} />
        <Route path="/transfer/invite" component={ContractInviteFlow} />
        <Route path="/invite-person" component={InvitePersonFlow} />
        <Route path="/messages" component={MessagesPage} />
        <Route path="/messages/new" component={NewMessage} />
        <Route path="/messages/:id" component={ChatThread} />
        <Route path="/invest" component={Invest} />
        <Route path="/budget" component={BudgetForecast} />
        <Route path="/profile" component={Profile} />
        <Route path="/profile/account" component={AccountDetails} />
        <Route path="/profile/notifications" component={Notifications} />
        <Route path="/notifications" component={NotificationCenter} />
        <Route path="/profile/support" component={Support} />
        <Route path="/profile/security" component={Security} />
        <Route path="/profile/preferences" component={Preferences} />
        <Route path="/history" component={History} />
        <Route path="/transaction/:id" component={TransactionDetails} />
        <Route path="/users" component={UserDirectory} />
        {isEnabled("admin") && <Route path="/admin" component={AdminDashboard} />}
        <Route path="/wallet/top-up" component={WalletTopUp} />
        <Route path="/transfer/loan" component={LoanFlow} />
        <Route path="/agreements" component={Agreements} />
        <Route path="/agreements/new" component={AgreementNew} />
        <Route path="/agreements/:id" component={AgreementDetail} />
        <Route path="/contracts" component={() => { useEffect(() => setLocation("/agreements"), []); return null; }} />
        <Route path="/split" component={SplitBill} />
        <Route path="/recurring" component={RecurringPayments} />
        <Route path="/savings" component={SavingsGoals} />
        <Route path="/kyc" component={KYCVerification} />
        <Route path="/referral" component={ReferralProgram} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route component={NotFound} />
      </Switch>
      <BottomNav />
    </div>
  );
}

function ThemeSyncInit() {
  const { user } = useAppStore();
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    const raw = user?.settings?.appearance;
    if (raw && raw !== theme) {
      // setTheme resolves legacy names internally
      setTheme(raw as ThemeName);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  return null;
}

function HeartbeatInit() {
  const { user, isAuthenticated } = useAppStore();
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const ping = () => {
      fetch("/api/users/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      }).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 60_000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user?.id]);
  return null;
}

function MessageNotifier() {
  const { notifications, isAuthenticated } = useAppStore();
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const { toast } = useToast();
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!initialized.current) {
      // Mark all existing notifications as seen on first load
      notifications.forEach(n => seenIds.current.add(n.id));
      initialized.current = true;
      return;
    }
    // Find new message notifications not yet seen
    const newMsgNotifs = notifications.filter(
      n => n.type === "info" && !seenIds.current.has(n.id)
    );
    newMsgNotifs.forEach(n => {
      seenIds.current.add(n.id);
      // Don't show toast if user is already on messages page
      if (location.startsWith("/messages")) return;
      toast({
        title: n.title,
        description: n.message,
        duration: 5000,
        action: (
          <ToastAction altText="Otwórz wiadomości" onClick={() => setLocation("/messages")}>
            <MessageSquare className="w-3.5 h-3.5 mr-1" />
            Otwórz
          </ToastAction>
        ),
      });
    });
  }, [notifications, isAuthenticated]);

  return null;
}

function PushInit() {
  const { isAuthenticated } = useAppStore();
  usePushNotifications(isAuthenticated);
  return null;
}

function AppContentInner() {
  const { isAuthenticated, user } = useAppStore();
  return (
    <WsProvider isAuthenticated={!!isAuthenticated}>
    <NotificationBadgeProvider isAuthenticated={!!isAuthenticated}>
      <MessageBadgeProvider isAuthenticated={!!isAuthenticated} userId={user?.id}>
        <ThemeSyncInit />
        <HeartbeatInit />
        <PushInit />
        <MessageNotifier />
        <Toaster />
        <Router />
        <PWAInstallBanner />
      </MessageBadgeProvider>
    </NotificationBadgeProvider>
    </WsProvider>
  );
}

function AppContent() {
  return (
    <div className="h-[100dvh] max-h-[100dvh] overflow-x-hidden bg-background flex justify-center w-full font-sans text-foreground selection:bg-primary/20 transition-colors duration-500">
      <AppContentInner />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <ThemeProvider>
          <LanguageProvider>
            <TooltipProvider>
              <AppContent />
            </TooltipProvider>
          </LanguageProvider>
        </ThemeProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}

export default App;
