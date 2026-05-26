import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { ref, get, set, onValue, off } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import { StorageKeys } from "./localStore";
import { registerDevice as _registerDevice } from "./deviceFingerprint";

export type Transaction = {
  id: string;
  type: "send" | "receive" | "topup" | "payment";
  status: "pending" | "completed" | "failed";
  amount: number;
  title: string;
  subtitle: string;
  date: string;
  icon?: string;
  category?: string;
};

export type Notification = {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  type: "info" | "alert" | "success" | "transfer";
  category?: "message" | "payment" | "contract" | "system" | "security";
  priority?: "low" | "normal" | "high" | "critical";
  route?: string | null;
  groupKey?: string | null;
};

export type Message = {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  status: "sent" | "delivered" | "read";
  isTransfer?: boolean;
  transferAmount?: number;
  transferStatus?: "pending" | "completed" | "failed";
};

export type Conversation = {
  id: string;
  contactId: string;
  contactName: string;
  contactHandle: string;
  unreadCount: number;
  messages: Message[];
};

export type Contact = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  recent: boolean;
};

export type UserSettings = {
  pushNotifications: boolean;
  emailDigest: boolean;
  biometricLogin: boolean;
  hideBalances: boolean;
  appearance?: "black-gold" | "ice-silver" | "emerald-gold" | "royal-violet" | "obsidian-gold" | "arctic-platinum" | "graphite-emerald";
  cardLimits?: {
    daily: number;
    monthly: number;
    atm: number;
  };
  transferLimits?: {
    daily: number;
    monthly: number;
  };
};

export type User = {
  id: string;
  name: string;
  handle: string;
  email: string;
  avatar?: string;
  phone?: string;
  address?: string;
  balance: number;
  settings: UserSettings;
  emailVerified?: boolean;
  kycVerified?: boolean;
  language?: "en" | "pl" | "no" | "es" | null;
};

export type SupportMessage = {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  attachments?: string[];
};

export type SupportTicket = {
  id: string;
  title: string;
  status: "open" | "pending" | "resolved" | "closed";
  updatedAt: string;
  messages: SupportMessage[];
};

export type Friend = {
  id: string;
  userId: string;
  friendHandle: string;
  friendName: string;
  createdAt: string;
};

export type CurrencyCode = "USD" | "EUR" | "GBP" | "CHF" | "PLN" | "NOK" | "SEK" | "DKK" | "CAD" | "AUD" | "JPY" | "CZK";
export type Wallets = Record<CurrencyCode, number>;

export type SandboxTransfer = {
  id: string;
  senderId: string;
  recipientName: string;
  recipientIdentifier: string;
  destinationType: "BANK_ACCOUNT" | "CARD" | "PHONE" | "HOST";
  amount: number;
  currency: string;
  title: string;
  message?: string | null;
  maskedDestination: string;
  status: "PENDING" | "COMPLETED_SANDBOX" | "FAILED";
  provider: string;
  reference: string;
  createdAt: string;
};

export type ContractInvite = {
  id: string;
  senderId: string;
  recipientIdentifier: string;
  title: string;
  contractType: "SERVICE" | "SALE" | "DEPOSIT" | "RENOVATION" | "CUSTOM";
  amount: number;
  currency: string;
  deadline: string;
  description: string;
  status: "SENT" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  createdAt: string;
};

export const CORE_WALLET_CURRENCIES: CurrencyCode[] = ["NOK", "USD", "EUR", "GBP", "CHF", "PLN"];

export const FX_RATES: Record<CurrencyCode, number> = {
  NOK: 10.7400,
  USD: 1.0000,
  EUR: 0.9230,
  GBP: 0.7930,
  CHF: 0.8940,
  PLN: 4.0600,
  SEK: 10.5200,
  DKK: 6.8900,
  CAD: 1.3600,
  AUD: 1.5500,
  JPY: 149.50,
  CZK: 23.50,
};

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  NOK: "kr", USD: "$", EUR: "€", GBP: "£", CHF: "Fr", PLN: "zł",
  SEK: "kr", DKK: "kr", CAD: "$", AUD: "$", JPY: "¥", CZK: "Kč",
};

export const WALLET_FLAGS: Record<CurrencyCode, string> = {
  NOK: "🇳🇴", USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", CHF: "🇨🇭", PLN: "🇵🇱",
  SEK: "🇸🇪", DKK: "🇩🇰", CAD: "🇨🇦", AUD: "🇦🇺", JPY: "🇯🇵", CZK: "🇨🇿",
};

export const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  NOK: "Norwegian Krone", USD: "US Dollar", EUR: "Euro", GBP: "British Pound",
  CHF: "Swiss Franc", PLN: "Polish Złoty", SEK: "Swedish Krona",
  DKK: "Danish Krone", CAD: "Canadian Dollar", AUD: "Australian Dollar",
  JPY: "Japanese Yen", CZK: "Czech Koruna",
};

const CURRENCY_NAMES_PL: Record<CurrencyCode, string> = {
  NOK: "Korona norweska", USD: "Dolar amerykański", EUR: "Euro", GBP: "Funt szterling",
  CHF: "Frank szwajcarski", PLN: "Złoty polski", SEK: "Korona szwedzka",
  DKK: "Korona duńska", CAD: "Dolar kanadyjski", AUD: "Dolar australijski",
  JPY: "Jen japoński", CZK: "Korona czeska",
};

const CURRENCY_NAMES_NO: Record<CurrencyCode, string> = {
  NOK: "Norsk krone", USD: "Amerikansk dollar", EUR: "Euro", GBP: "Britisk pund",
  CHF: "Sveitsisk franc", PLN: "Polsk zloty", SEK: "Svensk krone",
  DKK: "Dansk krone", CAD: "Kanadisk dollar", AUD: "Australsk dollar",
  JPY: "Japansk yen", CZK: "Tsjekkisk krone",
};

const CURRENCY_NAMES_ES: Record<CurrencyCode, string> = {
  NOK: "Corona noruega", USD: "Dólar estadounidense", EUR: "Euro", GBP: "Libra esterlina",
  CHF: "Franco suizo", PLN: "Esloti polaco", SEK: "Corona sueca",
  DKK: "Corona danesa", CAD: "Dólar canadiense", AUD: "Dólar australiano",
  JPY: "Yen japonés", CZK: "Corona checa",
};

export function getCurrencyName(currency: CurrencyCode, lang: string): string {
  if (lang === "pl") return CURRENCY_NAMES_PL[currency];
  if (lang === "no") return CURRENCY_NAMES_NO[currency];
  if (lang === "es") return CURRENCY_NAMES_ES[currency];
  return CURRENCY_NAMES[currency];
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const sym = CURRENCY_SYMBOLS[currency];
  const formatted = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const prefix = amount < 0 ? "-" : "";
  return `${prefix}${formatted} ${sym}`;
}

export function formatMoneyCompact(amount: number, currency: CurrencyCode): string {
  const sym = CURRENCY_SYMBOLS[currency];
  const abs = Math.abs(amount);
  const prefix = amount < 0 ? "-" : "";
  const rounded = Math.round(abs);
  const formatted = rounded.toLocaleString("pl-PL");
  const prefixCurrencies = ["USD", "CAD", "AUD"];
  if (prefixCurrencies.includes(currency)) {
    return `${prefix}${sym}${formatted}`;
  }
  return `${prefix}${formatted}${sym}`;
}

export const DEFAULT_WALLETS: Wallets = {
  NOK: 0,
  USD: 0,
  EUR: 0,
  GBP: 0,
  CHF: 0,
  PLN: 0,
  SEK: 0,
  DKK: 0,
  CAD: 0,
  AUD: 0,
  JPY: 0,
  CZK: 0,
};

type AppState = {
  user: User | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  sessionConfirmed: boolean;
  transactions: Transaction[];
  notifications: Notification[];
  conversations: Conversation[];
  contacts: Contact[];
  supportTickets: SupportTicket[];
  wallets: Wallets;
  login: (userData: any) => void;
  logout: () => void;
  sendMoney: (amount: number, recipient: string, note?: string, currency?: CurrencyCode, riskAcknowledged?: boolean, pinToken?: string) => Promise<{ success: boolean; error?: string; requiresPin?: boolean; requiresAcknowledgment?: boolean; riskLevel?: string; riskReasons?: string[] }>;
  addMoney: (amount: number) => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  updateUser: (userData: Partial<User>) => void;
  exchangeCurrency: (from: CurrencyCode, to: CurrencyCode, amount: number) => Promise<{ success: boolean; error?: string; received?: number }>;
  depositToWallet: (currency: CurrencyCode, amount: number) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  addNotification: (notif: Omit<Notification, "id" | "date" | "read">) => void;
  sendMessage: (conversationId: string, text: string) => void;
  markConversationRead: (conversationId: string) => void;
  openConversation: (handle: string, name: string) => string;
  createSupportTicket: (title: string, message: string, attachments?: string[]) => string;
  addSupportMessage: (ticketId: string, text: string, attachments?: string[]) => void;
  friends: Friend[];
  addFriend: (handle: string, name: string) => Promise<void>;
  removeFriend: (handle: string) => Promise<void>;
  isFriend: (handle: string) => boolean;
  refreshConversations: () => Promise<void>;
  refreshWallets: () => Promise<void>;
  fxRates: Record<CurrencyCode, number>;
  ratesUpdatedAt: string | null;
  ratesUnavailable: boolean;
  refreshRates: () => Promise<void>;
  enabledCurrencies: CurrencyCode[];
  primaryCurrency: CurrencyCode;
  saveCurrencySettings: (enabled: CurrencyCode[], primary: CurrencyCode) => Promise<void>;
};

const AppContext = createContext<AppState | undefined>(undefined);

const mockContacts: Contact[] = [];

function dbUserToAppUser(dbUser: any): User {
  const name = dbUser.name || dbUser.displayName || "Użytkownik";
  const rawHandle = dbUser.handle || (dbUser.host ? `@${dbUser.host}` : null) || dbUser.email?.split("@")[0] || "user";
  const handle = rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`;
  return {
    id: dbUser.id,
    name,
    handle,
    email: dbUser.email,
    phone: dbUser.phone,
    address: dbUser.address,
    balance: dbUser.balance ?? 0,
    emailVerified: dbUser.emailVerified ?? dbUser.email_verified ?? true,
    language: dbUser.language ?? null,
    settings: {
      pushNotifications: dbUser.pushNotifications ?? true,
      emailDigest: dbUser.emailDigest ?? false,
      biometricLogin: dbUser.biometricLogin ?? true,
      hideBalances: dbUser.hideBalances ?? false,
      appearance: dbUser.appearance ?? "obsidian-gold",
      cardLimits: { daily: 5000, monthly: 25000, atm: 1000 },
      transferLimits: { daily: 10000, monthly: 50000 },
    }
  };
}

function dbTxToAppTx(tx: any): Transaction {
  return {
    id: tx.id,
    type: tx.type,
    status: tx.status,
    amount: tx.amount,
    title: tx.title,
    subtitle: tx.subtitle,
    date: typeof tx.date === "string" ? tx.date : new Date(tx.date).toISOString(),
    category: tx.category,
  };
}

function dbNotifToAppNotif(n: any): Notification {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    date: typeof n.date === "string" ? n.date : new Date(n.date).toISOString(),
    read: n.read,
    type: n.type,
    category: n.category ?? undefined,
    priority: n.priority ?? undefined,
    route: n.route ?? null,
    groupKey: n.group_key ?? n.groupKey ?? null,
  };
}

function dbConvoToAppConvo(c: any): Conversation {
  return {
    id: c.id,
    contactId: c.id,
    contactName: c.contactName,
    contactHandle: c.contactHandle,
    unreadCount: c.unreadCount,
    messages: (c.messages || []).map((m: any): Message => ({
      id: m.id,
      senderId: m.senderId,
      text: m.text,
      timestamp: typeof m.timestamp === "string" ? m.timestamp : new Date(m.timestamp).toISOString(),
      status: "delivered",
      isTransfer: m.isTransfer,
      transferAmount: m.transferAmount,
      transferStatus: m.transferStatus as any,
    })),
  };
}

function dbTicketToAppTicket(t: any): SupportTicket {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : new Date(t.updatedAt).toISOString(),
    messages: (t.messages || []).map((m: any): SupportMessage => ({
      id: m.id,
      senderId: m.senderId,
      text: m.text,
      timestamp: typeof m.timestamp === "string" ? m.timestamp : new Date(m.timestamp).toISOString(),
    })),
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Start as false; we confirm auth via /api/me before marking authenticated.
  // This prevents a stale CURRENT_USER in localStorage from leaving the app
  // in an authenticated-looking state before the server session is verified.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  // sessionConfirmed: true only after /api/me returns 200 — guards sensitive screens
  // from stale-cache rehydration when the server cannot be reached.
  const [sessionConfirmed, setSessionConfirmed] = useState<boolean>(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [contacts] = useState<Contact[]>(mockContacts);
  const [wallets, setWallets] = useState<Wallets>({ ...DEFAULT_WALLETS });
  const [enabledCurrencies, setEnabledCurrencies] = useState<CurrencyCode[]>(["NOK", "USD", "EUR"]);
  const [primaryCurrency, setPrimaryCurrency] = useState<CurrencyCode>("NOK");

  const [fxRates, setFxRates] = useState<Record<CurrencyCode, number>>({ ...FX_RATES });
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);
  const [ratesUnavailable, setRatesUnavailable] = useState(false);

  const refreshRates = async () => {
    try {
      const res = await fetch("/api/exchange-rates?base=USD");
      if (!res.ok) { setRatesUnavailable(true); return; }
      const data = await res.json();
      if (data?.rates) {
        setFxRates({ ...FX_RATES, ...(data.rates as Partial<Record<CurrencyCode, number>>) });
        setRatesUpdatedAt(data.fetchedAt || new Date().toISOString());
        setRatesUnavailable(data.stale === true);
      }
    } catch {
      setRatesUnavailable(true);
    }
  };

  async function loadCurrencySettings(uid: string) {
    try {
      const snap = await get(ref(realtimeDb, `users/${uid}/settings/currencies`));
      if (snap.exists()) {
        const val = snap.val() as { enabled?: string[]; primary?: string };
        const allCodes = ["NOK","USD","EUR","GBP","CHF","PLN","SEK","DKK","CAD","AUD","JPY"] as CurrencyCode[];
        // Filter to only known currency codes, ensure at least one entry
        let safeEnabled: CurrencyCode[] = ["NOK"];
        if (Array.isArray(val.enabled)) {
          const filtered = (val.enabled as string[]).filter(c => allCodes.includes(c as CurrencyCode)) as CurrencyCode[];
          if (filtered.length > 0) safeEnabled = filtered;
        }
        // Ensure primary is a known code and is included in enabled
        let safePrimary: CurrencyCode = safeEnabled[0];
        if (val.primary && allCodes.includes(val.primary as CurrencyCode)) {
          const p = val.primary as CurrencyCode;
          safePrimary = safeEnabled.includes(p) ? p : safeEnabled[0];
        }
        setEnabledCurrencies(safeEnabled);
        setPrimaryCurrency(safePrimary);
      }
    } catch {
      // Firebase unavailable — keep defaults
    }
  }

  async function syncFromServer(userId: string) {
    try {
      const [userData, txData, notifData, ticketData, friendData, walletData] = await Promise.all([
        fetch(`/api/user/${userId}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/transactions/${userId}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/notifications/${userId}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/support/${userId}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/friends?userId=${userId}`).then(r => r.ok ? r.json() : []),
        fetch("/api/wallet/balances").then(r => r.ok ? r.json() : null),
      ]);

      if (userData) {
        const appUser = dbUserToAppUser(userData);
        setUser(appUser);
        setIsAuthenticated(true);
        localStorage.setItem(StorageKeys.userCache(userId), JSON.stringify(appUser));
      }
      const appTxs = (txData || []).map(dbTxToAppTx);
      setTransactions(appTxs);
      const appNotifs = (notifData || []).map(dbNotifToAppNotif);
      setNotifications(appNotifs);
      const appTickets = (ticketData || []).map(dbTicketToAppTicket);
      setSupportTickets(appTickets);
      setFriends(friendData || []);
      if (walletData) setWallets({ ...DEFAULT_WALLETS, ...(walletData as Partial<Wallets>) });
      refreshRates().catch(() => {});
      loadCurrencySettings(userId).catch(() => {});
    } catch (_err) {
      // Server unreachable
    }
  }

  const addFriend = async (handle: string, name: string) => {
    if (!user) return;
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, handle, name }),
    });
    if (res.ok) {
      const newFriend = await res.json();
      setFriends(prev => [newFriend, ...prev.filter(f => f.friendHandle !== handle)]);
    }
  };

  const removeFriend = async (handle: string) => {
    if (!user) return;
    await fetch("/api/friends", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, handle }),
    });
    setFriends(prev => prev.filter(f => f.friendHandle !== handle));
  };

  const isFriend = (handle: string): boolean => {
    return friends.some(f => f.friendHandle.toLowerCase() === handle.toLowerCase());
  };

  useEffect(() => {
    // Server-first startup: verify the session before trusting localStorage.
    // This prevents stale-cache and cross-user data leaks on shared devices.
    // AbortController gives an 8-second safety net: if /api/me never responds
    // (network hang, slow cold-start) the splash screen unblocks automatically.
    const authController = new AbortController();
    const authTimeout = setTimeout(() => authController.abort(), 8000);

    fetch("/api/me", { signal: authController.signal })
      .then(async (res) => {
        clearTimeout(authTimeout);
        if (!res.ok) {
          // No valid session — clear stale state and ensure the login screen is shown
          localStorage.removeItem(StorageKeys.CURRENT_USER);
          setUser(null);
          setIsAuthenticated(false);
          setAuthLoading(false);
          return;
        }
        const meData = await res.json();
        if (!meData?.loggedIn || !meData?.id) {
          localStorage.removeItem(StorageKeys.CURRENT_USER);
          setUser(null);
          setIsAuthenticated(false);
          setAuthLoading(false);
          return;
        }

        const serverId: string = meData.id;

        // If email is not verified, block access — store email so Auth shows verify step
        if (meData.emailVerified === false) {
          try { sessionStorage.setItem("finlys_pending_verify_email", meData.email || ""); } catch {}
          localStorage.removeItem(StorageKeys.CURRENT_USER);
          setUser(null);
          setIsAuthenticated(false);
          setAuthLoading(false);
          return;
        }

        // Immediately apply the server-confirmed user profile (no stale-cache flash)
        const serverUser = dbUserToAppUser(meData);
        setUser(serverUser);
        setIsAuthenticated(true);
        setSessionConfirmed(true); // server-verified session — gates sensitive screens
        setAuthLoading(false);
        _registerDevice().catch(() => {});
        localStorage.setItem(StorageKeys.CURRENT_USER, serverId);
        localStorage.setItem(StorageKeys.userCache(serverId), JSON.stringify(serverUser));

        // Sync remaining data (transactions, notifications, wallets, etc.)
        syncFromServer(serverId);
      })
      .catch(() => {
        clearTimeout(authTimeout);
        // Network error or abort (8s timeout) — fall back to localStorage
        const userId = localStorage.getItem(StorageKeys.CURRENT_USER);
        setAuthLoading(false);
        if (!userId || userId === "undefined" || userId === "null") {
          if (userId) localStorage.removeItem(StorageKeys.CURRENT_USER);
          return;
        }
        const savedUser = localStorage.getItem(StorageKeys.userCache(userId));
        if (savedUser) {
          try {
            const parsedUser = JSON.parse(savedUser);
            if (!parsedUser.settings?.transferLimits) {
              parsedUser.settings = { ...parsedUser.settings, transferLimits: { daily: 10000, monthly: 50000 } };
            }
            setUser(parsedUser);
            setIsAuthenticated(true);
          } catch {}
        }
        syncFromServer(userId);
      });

    return () => {
      clearTimeout(authTimeout);
      authController.abort();
    };
  }, []);

  // syncData — re-fetches all critical server state. Called by the interval,
  // on visibilitychange/focus, and immediately after any write operation.
  const syncData = useCallback(async () => {
    const userId = user?.id;
    if (!userId) return;
    try {
      const [userData, txData, notifData, walletData] = await Promise.all([
        fetch(`/api/user/${userId}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/transactions/${userId}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/notifications/${userId}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/wallet/balances`).then(r => r.ok ? r.json() : null),
      ]);
      if (userData) {
        const fresh = dbUserToAppUser(userData);
        setUser(prev => {
          if (!prev) return fresh;
          return {
            ...prev,
            name: fresh.name,
            handle: fresh.handle,
            email: fresh.email,
            phone: fresh.phone,
            address: fresh.address,
            balance: fresh.balance,
            language: fresh.language,
            settings: { ...prev.settings, ...fresh.settings },
          };
        });
        localStorage.setItem(StorageKeys.userCache(userId), JSON.stringify(fresh));
      }
      if (txData) setTransactions((txData as any[]).map(dbTxToAppTx));
      if (notifData) setNotifications((notifData as any[]).map(dbNotifToAppNotif));
      if (walletData) setWallets({ ...DEFAULT_WALLETS, ...(walletData as Partial<Wallets>) });
    } catch { /* silent */ }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(syncData, 8000);
    const onVisible = () => { if (document.visibilityState === "visible") syncData(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", syncData);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", syncData);
    };
  }, [user?.id, syncData]);

  // Firebase — incoming transfer signal listener
  useEffect(() => {
    if (!user?.id) return;
    const transferRef = ref(realtimeDb, `transfers/inbox/${user.id}`);
    const unsub = onValue(transferRef, () => { syncData().catch(() => {}); });
    return () => off(transferRef, "value", unsub);
  }, [user?.id, syncData]);

  const login = (userData: any) => {
    const appUser = dbUserToAppUser(userData);
    const userId = appUser.id;
    if (!userId || userId === "undefined" || userId === "null") {
      console.error("[Finlys] login: invalid user id, ignoring", userData);
      return;
    }
    localStorage.setItem(StorageKeys.CURRENT_USER, userId);
    localStorage.setItem(StorageKeys.userCache(userId), JSON.stringify(appUser));

    setUser(appUser);
    setIsAuthenticated(true);
    setSessionConfirmed(true);
    setTransactions([]);
    setNotifications([]);
    setConversations([]);
    setSupportTickets([]);
    syncFromServer(userId);
  };

  const logout = () => {
    localStorage.removeItem(StorageKeys.CURRENT_USER);
    setUser(null);
    setIsAuthenticated(false);
    setSessionConfirmed(false);
    setTransactions([]);
    setNotifications([]);
    setConversations([]);
    setSupportTickets([]);
    setWallets({ ...DEFAULT_WALLETS });
    setEnabledCurrencies(["NOK", "USD", "EUR"]);
    setPrimaryCurrency("NOK");
  };

  const updateUser = (userData: Partial<User>) => {
    if (!user) return;
    const updatedUser = { ...user, ...userData };
    setUser(updatedUser);
    localStorage.setItem(StorageKeys.userCache(user.id), JSON.stringify(updatedUser));

    // Sync to server
    const body: any = { ...userData };
    delete body.settings;
    if (userData.settings) {
      Object.assign(body, {
        pushNotifications: userData.settings.pushNotifications,
        emailDigest: userData.settings.emailDigest,
        biometricLogin: userData.settings.biometricLogin,
        hideBalances: userData.settings.hideBalances,
        appearance: userData.settings.appearance,
      });
    }
    fetch(`/api/user/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  };

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    if (!user) return;
    const updatedUser = { ...user, settings: { ...user.settings, ...newSettings } };
    setUser(updatedUser);
    localStorage.setItem(StorageKeys.userCache(user.id), JSON.stringify(updatedUser));

    // Sync relevant settings to server
    fetch(`/api/user/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pushNotifications: newSettings.pushNotifications ?? user.settings.pushNotifications,
        emailDigest: newSettings.emailDigest ?? user.settings.emailDigest,
        biometricLogin: newSettings.biometricLogin ?? user.settings.biometricLogin,
        hideBalances: newSettings.hideBalances ?? user.settings.hideBalances,
        appearance: newSettings.appearance ?? user.settings.appearance,
      })
    }).catch(() => {});
  };

  const sendMoney = async (amount: number, recipient: string, note?: string, currency: CurrencyCode = "USD", riskAcknowledged = false, pinToken?: string): Promise<{ success: boolean; error?: string; requiresPin?: boolean; requiresAcknowledgment?: boolean; riskLevel?: string; riskReasons?: string[] }> => {
    if (!user) return { success: false, error: "Authentication required" };
    if (amount <= 0) return { success: false, error: "Invalid amount" };

    const walletBalance = wallets[currency] ?? 0;
    if (walletBalance < amount) return { success: false, error: "Insufficient balance" };

    if (recipient.toLowerCase() === user.handle.toLowerCase()) {
      return { success: false, error: "You cannot transfer money to yourself" };
    }

    const dailyLimit = user.settings.transferLimits?.daily || 10000;
    if (amount > dailyLimit) {
      return { success: false, error: `Amount exceeds daily transfer limit of ${formatMoney(dailyLimit, currency)}` };
    }

    // Defensive: if recipient looks like a bare handle slug (starts with a letter,
    // word-chars only, ≤30 chars) ensure it has the @ prefix so the P2P branch fires.
    if (recipient && !recipient.startsWith("@") && /^[a-zA-Z][a-zA-Z0-9._-]{0,29}$/.test(recipient)) {
      recipient = `@${recipient}`;
    }

    let targetName = recipient;
    if (recipient.startsWith("@")) {
      const existingContact = contacts.find(c => c.handle.toLowerCase() === recipient.toLowerCase());
      if (existingContact) {
        targetName = existingContact.name;
      } else {
        targetName = recipient.substring(1).replace(/([A-Z])/g, ' $1').trim();
        targetName = targetName.charAt(0).toUpperCase() + targetName.slice(1);
      }
    }

    if (recipient.startsWith("@")) {
      // P2P: call API first — only update UI state on confirmed success (no optimistic deduction)
      try {
        const res = await fetch("/api/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderId: user.id, recipientHandle: recipient, amount, note: note || "Transfer", currency, riskAcknowledged, ...(pinToken ? { pinToken } : {}) }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          if (res.status === 402 && errData?.requiresPin) {
            return { success: false, requiresPin: true };
          }
          if (res.status === 422 && errData?.requiresAcknowledgment) {
            return {
              success: false,
              error: errData.message || "Wymagane potwierdzenie ryzyka.",
              requiresAcknowledgment: true,
              riskLevel: errData.riskLevel,
              riskReasons: errData.riskReasons,
            };
          }
          return { success: false, error: errData?.message || "Transfer failed" };
        }

        const data = await res.json().catch(() => null);

        // Update wallets from server-confirmed response
        if (data?.senderWallets) {
          setWallets((prev) => ({ ...prev, ...(data.senderWallets as Partial<Wallets>) }));
        } else {
          setWallets((prev) => ({ ...prev, [currency]: parseFloat(((prev[currency] ?? 0) - amount).toFixed(2)) }));
        }

        // Add local transaction record
        const newTx: Transaction = {
          id: Math.random().toString(36).substr(2, 9),
          type: "send", status: "completed",
          amount: -amount, title: targetName,
          subtitle: note || "Transfer",
          date: new Date().toISOString(), category: "Transfer",
        };
        setTransactions((prev) => [newTx, ...prev]);

        // Add transfer message to conversation
        const transferMessage: Message = {
          id: Math.random().toString(36).substr(2, 9),
          senderId: "user",
          text: note || "Sent a transfer",
          timestamp: new Date().toISOString(),
          status: "delivered",
          isTransfer: true, transferAmount: amount, transferStatus: "completed",
        };
        setConversations((prev) => {
          const idx = prev.findIndex(c => c.contactHandle.toLowerCase() === recipient.toLowerCase());
          if (idx >= 0) {
            return prev.map((c, i) => i === idx ? { ...c, messages: [...c.messages, transferMessage] } : c);
          }
          const newConvoId = `c_${Math.random().toString(36).substr(2, 6)}`;
          return [{ id: newConvoId, contactId: newConvoId, contactName: targetName || recipient, contactHandle: recipient, unreadCount: 0, messages: [transferMessage] }, ...prev];
        });

        addNotification({ type: "transfer", title: "Transfer Sent", message: `${formatMoney(amount, currency)} sent to ${targetName}` });
        syncData().catch(() => {});
        // Firebase signal → recipient's device refreshes balance + transactions instantly
        if (data?.recipientId) {
          set(ref(realtimeDb, `transfers/inbox/${data.recipientId}`), { at: Date.now(), amount, currency, from: user.id }).catch(() => {});
        }
        return { success: true, riskLevel: data?.riskLevel };
      } catch {
        return { success: false, error: "Network error. Please try again." };
      }
    } else {
      // External/non-@ recipient — must use the full Transfer flow (/transfer page → /api/sandbox-transfers).
      // Direct balance writes are not allowed from the store for security.
      return { success: false, error: "Użyj ekranu Przelewu, aby wysłać środki zewnętrznie." };
    }
  };

  const addMoney = (amount: number) => {
    if (!user) return;
    const newTx: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      type: "topup",
      status: "completed",
      amount: amount,
      title: "Top-up",
      subtitle: "From bank account",
      date: new Date().toISOString(),
      category: "Transfer"
    };
    const updatedUser = { ...user, balance: user.balance + amount };
    setUser(updatedUser);
    localStorage.setItem(StorageKeys.userCache(user.id), JSON.stringify(updatedUser));

    const updatedTx = [newTx, ...transactions];
    setTransactions(updatedTx);

    // Persist to server
    fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, type: "topup", status: "completed", amount, title: "Top-up", subtitle: "From bank account", category: "Transfer" })
    }).catch(() => {});

    addNotification({
      type: "success",
      title: "Funds Added",
      message: `Successfully added $${amount.toLocaleString()} to your account.`
    });
  };

  const markAsRead = (id: string) => {
    const updatedNotifs = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    setNotifications(updatedNotifs);
    fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {});
  };

  const markAllAsRead = () => {
    const updatedNotifs = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updatedNotifs);
    if (user) fetch(`/api/notifications/user/${user.id}/read-all`, { method: "PATCH" }).catch(() => {});
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const addNotification = (notif: Omit<Notification, "id" | "date" | "read">) => {
    const newNotif: Notification = {
      ...notif,
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
      read: false
    };
    const updatedNotifs = [newNotif, ...notifications];
    setNotifications(updatedNotifs);
    if (user) {
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, ...notif, read: false })
      }).catch(() => {});
    }
  };

  const sendMessage = (conversationId: string, text: string) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: user?.id ?? "user",
      text,
      timestamp: new Date().toISOString(),
      status: "sent"
    };
    const updatedConvos = conversations.map(c =>
      c.id === conversationId
        ? { ...c, messages: [...c.messages, newMessage] }
        : c
    );
    setConversations(updatedConvos);

    // Find target conversation to get recipientHandle
    const targetConvo = conversations.find(c => c.id === conversationId);
    const isP2P = targetConvo && targetConvo.contactHandle !== "@support" && user;

    if (isP2P) {
      fetch("/api/message/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: user!.id, recipientHandle: targetConvo.contactHandle, text })
      }).catch(() => {});
    }
  };

  const refreshConversations = useCallback(async () => {
    // Conversations are synced via the dm_conversations system in installMessagesFix.ts
    // No-op here — ChatThread.tsx fetches directly from /api/dm/*
  }, []);

  const markConversationRead = (conversationId: string) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== conversationId) return c;
      return {
        ...c,
        unreadCount: 0,
        messages: c.messages.map(m =>
          m.senderId !== "user" && m.senderId !== user?.id && m.status !== "read"
            ? { ...m, status: "read" as const }
            : m
        ),
      };
    }));
  };

  const openConversation = (handle: string, name: string): string => {
    const existing = conversations.find(c => c.contactHandle.toLowerCase() === handle.toLowerCase());
    if (existing) return existing.id;
    const newId = `c_${Math.random().toString(36).substr(2, 9)}`;
    const newConvo: Conversation & { messages: Message[] } = {
      id: newId,
      contactId: newId,
      contactName: name,
      contactHandle: handle,
      unreadCount: 0,
      messages: []
    };
    setConversations(prev => [newConvo, ...prev]);
    return newId;
  };

  const createSupportTicket = (title: string, message: string, attachments?: string[]) => {
    const newTicket: SupportTicket = {
      id: "t_" + Math.random().toString(36).substr(2, 9),
      title,
      status: "open",
      updatedAt: new Date().toISOString(),
      messages: [{
        id: "m_" + Math.random().toString(36).substr(2, 9),
        senderId: "user",
        text: message,
        timestamp: new Date().toISOString(),
      }]
    };
    const updatedTickets = [newTicket, ...supportTickets];
    setSupportTickets(updatedTickets);
    if (user) {
      fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, title, message })
      }).catch(() => {});
    }
    return newTicket.id;
  };

  const addSupportMessage = (ticketId: string, text: string, attachments?: string[]) => {
    const updatedTickets = supportTickets.map(t => {
      if (t.id === ticketId) {
        return {
          ...t,
          status: t.status === "closed" || t.status === "resolved" ? "open" as const : t.status,
          updatedAt: new Date().toISOString(),
          messages: [...t.messages, {
            id: "m_" + Math.random().toString(36).substr(2, 9),
            senderId: "user",
            text,
            timestamp: new Date().toISOString(),
          }]
        };
      }
      return t;
    });
    setSupportTickets(updatedTickets);
    fetch(`/api/support/${ticketId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: "user", text })
    }).catch(() => {});
  };

  const refreshWallets = async (): Promise<void> => {
    try {
      const data = await fetch("/api/wallet/balances").then(r => r.ok ? r.json() : null);
      if (data) setWallets({ ...DEFAULT_WALLETS, ...(data as Partial<Wallets>) });
    } catch { /* silent */ }
  };

  const saveCurrencySettings = async (enabled: CurrencyCode[], primary: CurrencyCode): Promise<void> => {
    // Defensive: ensure enabled is never empty and primary is always in enabled
    const safeEnabled = enabled.length > 0 ? enabled : [primary];
    const safePrimary = safeEnabled.includes(primary) ? primary : safeEnabled[0];
    setEnabledCurrencies(safeEnabled);
    setPrimaryCurrency(safePrimary);
    if (!user?.id) return;
    // Persist to Firebase RTDB (primary source)
    try {
      await set(ref(realtimeDb, `users/${user.id}/settings/currencies`), { enabled: safeEnabled, primary: safePrimary });
    } catch {
      // Firebase unavailable — state already updated locally
    }
    // Also persist to backend DB for cross-device durability
    fetch(`/api/user/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currencies: { enabled: safeEnabled, primary: safePrimary } }),
    }).catch(() => {});
  };

  // depositToWallet — DEMO STUB ONLY.
  // Real fund additions must go through /wallet/top-up → Stripe Checkout → webhook.
  // This function only updates local UI state optimistically (no server balance write).
  const depositToWallet = (currency: CurrencyCode, amount: number) => {
    // Local optimistic refresh — balance will be synced from server after Stripe confirmation.
    refreshWallets().catch(() => {});
    if (user) {
      addNotification({
        type: "success",
        title: "Deposit pending",
        message: `Awaiting payment confirmation for ${amount} ${currency}`,
      });
    }
  };

  const exchangeCurrency = async (from: CurrencyCode, to: CurrencyCode, amount: number): Promise<{ success: boolean; error?: string; received?: number }> => {
    if (from === to) return { success: false, error: "Wybierz dwie różne waluty" };
    if (!amount || amount <= 0) return { success: false, error: "Wpisz poprawną kwotę" };
    const fromBal = wallets[from] ?? 0;
    if (fromBal < amount) return { success: false, error: "Brak wystarczających środków" };

    const rates = fxRates;
    const amountInUSD = amount / rates[from];
    const received = parseFloat((amountInUSD * rates[to]).toFixed(2));

    const snapshot = { ...wallets };
    const optimistic: Wallets = {
      ...wallets,
      [from]: parseFloat((fromBal - amount).toFixed(2)),
      [to]:   parseFloat(((wallets[to] ?? 0) + received).toFixed(2)),
    };
    setWallets(optimistic);

    try {
      const r = await fetch("/api/wallet/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromCurrency: from, toCurrency: to, fromAmount: amount }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setWallets(snapshot);
        const msg = (err as { message?: string }).message ?? "Błąd wymiany";
        const polish = msg === "Insufficient balance" ? "Brak wystarczających środków"
          : msg === "Same currency" ? "Wybierz dwie różne waluty"
          : msg === "Invalid amount" ? "Wpisz poprawną kwotę"
          : msg;
        return { success: false, error: polish };
      }
      const data = await r.json();
      if (data?.wallets) setWallets(data.wallets as Wallets);
    } catch {
      // Network error — rollback optimistic update; do NOT write balance directly.
      setWallets(snapshot);
    }

    if (user) {
      const subtitle = `${formatMoney(amount, from)} → ${formatMoney(received, to)}`;
      const newTx: Transaction = {
        id: Math.random().toString(36).substr(2, 9),
        type: "payment",
        status: "completed",
        amount: -amount,
        title: "Wymiana walut",
        subtitle,
        date: new Date().toISOString(),
        category: "Exchange",
      };
      setTransactions(prev => [newTx, ...prev]);
      fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, type: "payment", status: "completed", amount: -amount, title: "Wymiana walut", subtitle, category: "Exchange", noBalanceUpdate: true }),
      }).catch(() => {});
      addNotification({
        type: "success",
        title: "Wymiana zakończona",
        message: subtitle,
      });
    }
    return { success: true, received };
  };

  return (
    <AppContext.Provider value={{
      user, isAuthenticated, authLoading, sessionConfirmed, transactions, notifications, conversations, contacts, supportTickets,
      wallets, exchangeCurrency, depositToWallet,
      login, logout, sendMoney, addMoney, updateSettings, updateUser,
      markAsRead, markAllAsRead, removeNotification, addNotification, sendMessage, markConversationRead,
      openConversation, createSupportTicket, addSupportMessage,
      friends, addFriend, removeFriend, isFriend,
      refreshConversations, refreshWallets,
      fxRates, ratesUpdatedAt, ratesUnavailable, refreshRates,
      enabledCurrencies, primaryCurrency, saveCurrencySettings,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const context = useContext(AppContext);
  if (context === undefined) throw new Error("useAppStore must be used within an AppProvider");
  return context;
}
