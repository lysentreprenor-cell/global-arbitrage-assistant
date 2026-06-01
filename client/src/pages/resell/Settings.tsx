import React, { useState, useEffect } from "react";
import { Settings as SettingsIcon, Key, Eye, EyeOff, Check, ExternalLink, Trash2, Plus, AlertCircle, CheckCircle, Link2 } from "lucide-react";
import { loadEbayToken, saveEbayToken, clearEbayToken, isEbayConnected } from "@/lib/ebayAuth";
import { saveEtsyToken, clearEtsyToken, isEtsyConnected } from "@/lib/etsyAuth";
import { ResellLayout } from "@/components/resell/ResellLayout";

type ApiEntry = {
  id: string; name: string; logo: string; color: string;
  description: string; docsUrl: string; keyLabel: string;
  secretLabel?: string; required?: boolean;
  fields: { key: string; label: string; placeholder: string }[];
  status?: "active" | "error" | "untested";
};

const PLATFORM_APIS: ApiEntry[] = [
  {
    id: "anthropic",
    name: "Anthropic AI",
    logo: "🤖",
    color: "#a78bfa",
    required: true,
    description: "⭐ JEDYNY WYMAGANY KLUCZ — bez niego nic nie działa. Darmowe konto: console.anthropic.com",
    docsUrl: "https://console.anthropic.com/settings/keys",
    keyLabel: "API Key",
    fields: [{ key: "apiKey", label: "ANTHROPIC_API_KEY", placeholder: "sk-ant-..." }],
  },
  {
    id: "gemini",
    name: "Google Gemini AI",
    logo: "✨",
    color: "#4285f4",
    description: "Opcjonalne — generowanie filmików reklamowych (Veo 3) i grafik (Imagen 3). Darmowy tier na start. Klucz w Google AI Studio: aistudio.google.com",
    docsUrl: "https://aistudio.google.com/app/apikey",
    keyLabel: "API Key",
    fields: [{ key: "apiKey", label: "GEMINI_API_KEY", placeholder: "AIza..." }],
  },
  {
    id: "youtube",
    name: "YouTube Data API v3",
    logo: "▶️",
    color: "#ef4444",
    description: "Opcjonalne — pobieranie komentarzy z YouTube do analizy marketingowej. Darmowy limit: 10 000 jednostek/dzień. Klucz w Google Cloud Console.",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    keyLabel: "API Key",
    fields: [{ key: "apiKey", label: "YouTube Data API v3 Key", placeholder: "AIza..." }],
  },
  {
    id: "ebay",
    name: "eBay",
    logo: "🛒",
    color: "#f5c842",
    description: "Skanowanie cen + wystawianie ogłoszeń przez API (OAuth). Klucze z developer.ebay.com",
    docsUrl: "https://developer.ebay.com/my/keys",
    keyLabel: "App ID",
    fields: [
      { key: "appId",  label: "App ID (Client ID)",    placeholder: "YourApp-xxxxx-PRD-xxxxxxxx" },
      { key: "certId", label: "Cert ID (Client Secret)", placeholder: "PRD-xxxxxxxxxxxxxxxx" },
      { key: "ruName", label: "RuName (Redirect URL Name)", placeholder: "YourApp-YourApp-PRD-xx-xxxxxxxx" },
    ],
  },
  {
    id: "etsy",
    name: "Etsy",
    logo: "🧶",
    color: "#f97316",
    description: "Opcjonalne — żywe ceny z Etsy, popularne listingi",
    docsUrl: "https://www.etsy.com/developers/your-apps",
    keyLabel: "API Key",
    fields: [{ key: "apiKey", label: "Keystring (API Key)", placeholder: "xxxxxxxxxxxxxxxxxxxx" }],
  },
  {
    id: "amazon",
    name: "Amazon (PA API)",
    logo: "📦",
    color: "#34d399",
    description: "Opcjonalne — ceny Amazon, bestsellery",
    docsUrl: "https://affiliate-program.amazon.com/assoc_credentials/home",
    keyLabel: "Access Key",
    fields: [
      { key: "accessKey", label: "Access Key ID", placeholder: "AKIAIOSFODNN7EXAMPLE" },
      { key: "secretKey", label: "Secret Access Key", placeholder: "wJalrXUtnFEMI/..." },
      { key: "associateTag", label: "Associate Tag", placeholder: "mytag-20" },
    ],
  },
  {
    id: "allegro",
    name: "Allegro",
    logo: "🇵🇱",
    color: "#f87171",
    description: "Opcjonalne — ceny na Allegro, oferty z Polski",
    docsUrl: "https://apps.developer.allegro.pl/",
    keyLabel: "Client ID",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { key: "clientSecret", label: "Client Secret", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxx" },
    ],
  },
  {
    id: "aliexpress",
    name: "AliExpress",
    logo: "🇨🇳",
    color: "#f59e0b",
    description: "Opcjonalne — ceny hurtowe z Chin",
    docsUrl: "https://portals.aliexpress.com",
    keyLabel: "App Key",
    fields: [
      { key: "appKey", label: "App Key", placeholder: "12345678" },
      { key: "appSecret", label: "App Secret", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    ],
  },
  {
    id: "rapidapi",
    name: "RapidAPI Hub",
    logo: "⚡",
    color: "#60a5fa",
    description: "Opcjonalne — dostęp do Jumia, Shopee, Mercado Libre i innych",
    docsUrl: "https://rapidapi.com/developer/dashboard",
    keyLabel: "API Key",
    fields: [{ key: "apiKey", label: "X-RapidAPI-Key", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }],
  },
  {
    id: "custom",
    name: "Własne API",
    logo: "🔧",
    color: "#94a3b8",
    description: "Opcjonalne — dodaj dowolne API",
    docsUrl: "",
    keyLabel: "API Key",
    fields: [
      { key: "name", label: "Nazwa sklepu/API", placeholder: "np. Zalando, Shopee, Temu..." },
      { key: "baseUrl", label: "Base URL", placeholder: "https://api.example.com/v1" },
      { key: "apiKey", label: "API Key / Token", placeholder: "Bearer xxxxxxxx" },
    ],
  },
];

const STORAGE_KEY = "resell_api_keys";

function loadKeys(): Record<string, Record<string, string>> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveKeys(keys: Record<string, Record<string, string>>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export default function Settings() {
  const [keys, setKeys] = useState<Record<string, Record<string, string>>>(loadKeys);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, "ok" | "fail" | null>>({});
  const [customApis, setCustomApis] = useState<{ id: string; name: string; baseUrl: string; apiKey: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem("resell_custom_apis") || "[]"); } catch { return []; }
  });
  const [ebayConnected, setEbayConnected] = useState(isEbayConnected);
  const [ebayConnecting, setEbayConnecting] = useState(false);
  const [ebayError, setEbayError] = useState<string | null>(null);
  const [etsyConnected, setEtsyConnected] = useState(isEtsyConnected);
  const [etsyConnecting, setEtsyConnecting] = useState(false);
  const [etsyError, setEtsyError] = useState<string | null>(null);

  const connectEbay = async () => {
    const appId  = keys.ebay?.appId  || "";
    const certId = keys.ebay?.certId || "";
    const ruName = keys.ebay?.ruName || "";
    if (!appId || !certId || !ruName) {
      setEbayError("Uzupełnij App ID, Cert ID i RuName przed połączeniem."); return;
    }
    setEbayConnecting(true); setEbayError(null);
    try {
      const r = await fetch(`/api/ebay/auth-url?clientId=${encodeURIComponent(appId)}&ruName=${encodeURIComponent(ruName)}`);
      const { url, error } = await r.json();
      if (error || !url) { setEbayError(error || "Nie można wygenerować URL"); setEbayConnecting(false); return; }

      const popup = window.open(url, "ebay-oauth", "width=600,height=700,left=200,top=100");
      const handler = async (e: MessageEvent) => {
        if (e.data?.type === "EBAY_CODE") {
          window.removeEventListener("message", handler);
          const { code } = e.data;
          const tr = await fetch("/api/ebay/exchange-token", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code, clientId: appId, certId, ruName }),
          });
          const td = await tr.json();
          if (td.error) { setEbayError(td.error); setEbayConnecting(false); return; }
          saveEbayToken({ accessToken: td.accessToken, refreshToken: td.refreshToken, expiry: Date.now() + td.expiresIn * 1000 });
          setEbayConnected(true); setEbayConnecting(false);
        }
        if (e.data?.type === "EBAY_ERROR") {
          window.removeEventListener("message", handler);
          setEbayError(e.data.error || "Błąd autoryzacji eBay"); setEbayConnecting(false);
        }
      };
      window.addEventListener("message", handler);
      // Fallback: if popup closed without message
      const check = setInterval(() => { if (popup?.closed) { clearInterval(check); window.removeEventListener("message", handler); setEbayConnecting(false); } }, 500);
    } catch (e: any) { setEbayError(e.message); setEbayConnecting(false); }
  };

  const connectEtsy = async () => {
    const apiKey = keys.etsy?.apiKey || "";
    if (!apiKey) {
      setEtsyError("Uzupełnij Keystring (API Key) Etsy przed połączeniem."); return;
    }
    setEtsyConnecting(true); setEtsyError(null);
    const redirectUri = `${window.location.origin}/api/etsy/callback`;
    try {
      const r = await fetch(`/api/etsy/auth-url?clientId=${encodeURIComponent(apiKey)}&redirectUri=${encodeURIComponent(redirectUri)}`);
      const { url, state, error } = await r.json() as { url?: string; state?: string; error?: string };
      if (error || !url) { setEtsyError(error || "Nie można wygenerować URL"); setEtsyConnecting(false); return; }

      const popup = window.open(url, "etsy-oauth", "width=600,height=700,left=200,top=100");
      const handler = async (e: MessageEvent) => {
        if (e.data?.type === "ETSY_CODE") {
          window.removeEventListener("message", handler);
          const { code, state: returnedState } = e.data as { code: string; state: string };
          const tr = await fetch("/api/etsy/exchange-token", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code, clientId: apiKey, redirectUri, state: returnedState ?? state }),
          });
          const td = await tr.json() as { accessToken?: string; refreshToken?: string; expiresIn?: number; error?: string };
          if (td.error) { setEtsyError(td.error); setEtsyConnecting(false); return; }
          saveEtsyToken({
            accessToken: td.accessToken!,
            refreshToken: td.refreshToken!,
            expiry: Date.now() + (td.expiresIn ?? 3600) * 1000,
            clientId: apiKey,
          });
          setEtsyConnected(true); setEtsyConnecting(false);
        }
        if (e.data?.type === "ETSY_ERROR") {
          window.removeEventListener("message", handler);
          setEtsyError((e.data as { error?: string }).error || "Błąd autoryzacji Etsy"); setEtsyConnecting(false);
        }
      };
      window.addEventListener("message", handler);
      // Fallback: if popup closed without message
      const check = setInterval(() => { if (popup?.closed) { clearInterval(check); window.removeEventListener("message", handler); setEtsyConnecting(false); } }, 500);
    } catch (e: unknown) {
      setEtsyError(e instanceof Error ? e.message : "Nieznany błąd"); setEtsyConnecting(false);
    }
  };

  const update = (platformId: string, field: string, value: string) => {
    setKeys(prev => {
      const next = { ...prev, [platformId]: { ...(prev[platformId] || {}), [field]: value } };
      saveKeys(next);
      return next;
    });
  };

  const saveAndNotify = (platformId: string) => {
    saveKeys(keys);
    setSaved(prev => ({ ...prev, [platformId]: true }));
    setTimeout(() => setSaved(prev => ({ ...prev, [platformId]: false })), 2000);
  };

  const clearPlatform = (platformId: string) => {
    setKeys(prev => {
      const next = { ...prev };
      delete next[platformId];
      saveKeys(next);
      return next;
    });
    setTestResult(prev => ({ ...prev, [platformId]: null }));
  };

  const testKey = async (platformId: string) => {
    setTesting(prev => ({ ...prev, [platformId]: true }));
    setTestResult(prev => ({ ...prev, [platformId]: null }));
    try {
      const res = await fetch("/api/settings/test-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platformId, keys: keys[platformId] }),
      });
      const data = await res.json();
      setTestResult(prev => ({ ...prev, [platformId]: data.ok ? "ok" : "fail" }));
    } catch {
      setTestResult(prev => ({ ...prev, [platformId]: "fail" }));
    }
    setTesting(prev => ({ ...prev, [platformId]: false }));
  };

  const hasKeys = (platformId: string) => {
    const k = keys[platformId];
    return k && Object.values(k).some(v => v.trim().length > 0);
  };

  const activeCount = PLATFORM_APIS.filter(p => hasKeys(p.id)).length;

  return (
    <ResellLayout>
      <div style={{ padding: "28px 24px 60px", maxWidth: 720 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SettingsIcon size={18} color="#a78bfa" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, margin: 0 }}>Ustawienia API</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>Dodaj klucze API sklepów — app użyje prawdziwych danych zamiast AI</p>
          </div>
        </div>

        {/* Status bar */}
        <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <AlertCircle size={15} color="#a78bfa" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <span style={{ color: "#c4b5fd", fontWeight: 700 }}>Potrzebujesz tylko 1 klucza</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}> — klucz <strong style={{ color: "#a78bfa" }}>Anthropic AI</strong> wystarczy żeby aplikacja działała w pełni. Reszta jest opcjonalna i dodaje dokładniejsze dane na żywo z poszczególnych platform.</span>
          </div>
        </div>
        <div style={{ background: hasKeys("anthropic") ? "rgba(74,222,128,0.08)" : "rgba(245,200,66,0.08)", border: `1px solid ${hasKeys("anthropic") ? "rgba(74,222,128,0.2)" : "rgba(245,200,66,0.2)"}`, borderRadius: 12, padding: "10px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
          {hasKeys("anthropic") ? <CheckCircle size={15} color="#4ade80" /> : <AlertCircle size={15} color="#f5c842" />}
          <span style={{ color: hasKeys("anthropic") ? "#86efac" : "#fde68a", fontSize: 13 }}>
            {hasKeys("anthropic")
              ? `✓ Klucz Anthropic ustawiony — aplikacja działa. ${activeCount > 1 ? `+ ${activeCount - 1} dodatkowe platformy.` : ""}`
              : "⚠ Brak klucza Anthropic — dodaj go poniżej żeby aplikacja zaczęła działać"}
          </span>
        </div>

        {/* API Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {PLATFORM_APIS.map(platform => {
            const hasKey = hasKeys(platform.id);
            const result = testResult[platform.id];
            return (
              <div key={platform.id} style={{
                background: hasKey ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${hasKey ? `${platform.color}25` : "rgba(255,255,255,0.07)"}`,
                borderRadius: 16, overflow: "hidden",
              }}>
                {/* Card header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: `${platform.color}15`, border: `1px solid ${platform.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                      {platform.logo}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{platform.name}</span>
                        {platform.required && !hasKey && (
                          <span style={{ background: "rgba(248,113,113,0.18)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 99, padding: "1px 8px", color: "#f87171", fontSize: 10, fontWeight: 700 }}>WYMAGANE</span>
                        )}
                        {!platform.required && (
                          <span style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 99, padding: "1px 8px", color: "rgba(255,255,255,0.3)", fontSize: 10 }}>opcjonalne</span>
                        )}
                        {hasKey && (
                          result === "ok"
                            ? <span style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 99, padding: "1px 8px", color: "#4ade80", fontSize: 10, fontWeight: 700 }}>✓ Aktywne</span>
                            : result === "fail"
                              ? <span style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 99, padding: "1px 8px", color: "#f87171", fontSize: 10, fontWeight: 700 }}>✗ Błąd</span>
                              : <span style={{ background: `${platform.color}15`, border: `1px solid ${platform.color}30`, borderRadius: 99, padding: "1px 8px", color: platform.color, fontSize: 10, fontWeight: 700 }}>Dodano</span>
                        )}
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>{platform.description}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {platform.docsUrl && (
                      <a href={platform.docsUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", fontSize: 11, textDecoration: "none" }}>
                        Docs <ExternalLink size={10} />
                      </a>
                    )}
                    {hasKey && (
                      <button onClick={() => clearPlatform(platform.id)} style={{ padding: "5px 8px", borderRadius: 7, background: "rgba(248,113,113,0.1)", border: "none", cursor: "pointer", color: "#f87171" }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Fields */}
                <div style={{ padding: "0 18px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {platform.fields.map(field => (
                    <div key={field.key}>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 5 }}>{field.label}</div>
                      <div style={{ position: "relative" }}>
                        <input
                          type={visible[`${platform.id}_${field.key}`] ? "text" : "password"}
                          value={keys[platform.id]?.[field.key] || ""}
                          onChange={e => update(platform.id, field.key, e.target.value)}
                          placeholder={field.placeholder}
                          style={{
                            width: "100%", background: "rgba(0,0,0,0.3)",
                            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                            padding: "9px 38px 9px 12px", color: "#fff", fontSize: 13,
                            fontFamily: "monospace", boxSizing: "border-box",
                          }}
                        />
                        <button
                          onClick={() => setVisible(v => ({ ...v, [`${platform.id}_${field.key}`]: !v[`${platform.id}_${field.key}`] }))}
                          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 0 }}
                        >
                          {visible[`${platform.id}_${field.key}`] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* eBay OAuth Connect section */}
                  {platform.id === "ebay" && (
                    <div style={{ background: "rgba(245,200,66,0.05)", border: "1px solid rgba(245,200,66,0.15)", borderRadius: 10, padding: "12px 14px", marginTop: 4 }}>
                      <div style={{ color: "#f5c842", fontSize: 10, fontWeight: 700, marginBottom: 8 }}>🔑 KROK 2 — AUTORYZUJ KONTO SPRZEDAJĄCEGO (OAuth)</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 10, lineHeight: 1.6 }}>
                        W developer.ebay.com → Twoja aplikacja → <strong style={{ color: "rgba(255,255,255,0.6)" }}>User Tokens → Utwórz RuName</strong> → wpisz jako Accept URL:<br />
                        <span style={{ fontFamily: "monospace", color: "#93c5fd", fontSize: 10, wordBreak: "break-all" }}>{window.location.origin}/api/ebay/callback</span>
                      </div>
                      {ebayError && (
                        <div style={{ color: "#f87171", fontSize: 11, marginBottom: 8, background: "rgba(248,113,113,0.1)", borderRadius: 6, padding: "6px 10px" }}>{ebayError}</div>
                      )}
                      {ebayConnected ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <CheckCircle size={14} color="#4ade80" />
                          <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 700, flex: 1 }}>Konto eBay połączone — możesz wystawiać ogłoszenia z Agent AI</span>
                          <button onClick={() => { clearEbayToken(); setEbayConnected(false); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.3)", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: 11 }}>Rozłącz</button>
                        </div>
                      ) : (
                        <button onClick={connectEbay} disabled={ebayConnecting} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", cursor: ebayConnecting ? "not-allowed" : "pointer", background: ebayConnecting ? "rgba(245,200,66,0.1)" : "linear-gradient(135deg,#b45309,#d97706,#f5c842)", color: ebayConnecting ? "#f5c842" : "#000", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          <Link2 size={14} /> {ebayConnecting ? "Otwieranie eBay..." : "Połącz konto eBay (OAuth)"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Etsy OAuth Connect section */}
                  {platform.id === "etsy" && (
                    <div style={{ background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.15)", borderRadius: 10, padding: "12px 14px", marginTop: 4 }}>
                      <div style={{ color: "#f97316", fontSize: 10, fontWeight: 700, marginBottom: 8 }}>🔑 AUTORYZUJ KONTO ETSY (OAuth)</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 10, lineHeight: 1.6 }}>
                        W developer.etsy.com → Twoja aplikacja → <strong style={{ color: "rgba(255,255,255,0.6)" }}>Redirect URIs</strong> → dodaj:<br />
                        <span style={{ fontFamily: "monospace", color: "#93c5fd", fontSize: 10, wordBreak: "break-all" }}>{window.location.origin}/api/etsy/callback</span>
                      </div>
                      {etsyError && (
                        <div style={{ color: "#f87171", fontSize: 11, marginBottom: 8, background: "rgba(248,113,113,0.1)", borderRadius: 6, padding: "6px 10px" }}>{etsyError}</div>
                      )}
                      {etsyConnected ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <CheckCircle size={14} color="#4ade80" />
                          <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 700, flex: 1 }}>Konto Etsy połączone — możesz wystawiać ogłoszenia z Agent AI</span>
                          <button onClick={() => { clearEtsyToken(); setEtsyConnected(false); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.3)", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: 11 }}>Rozłącz</button>
                        </div>
                      ) : (
                        <button onClick={connectEtsy} disabled={etsyConnecting} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", cursor: etsyConnecting ? "not-allowed" : "pointer", background: etsyConnecting ? "rgba(249,115,22,0.1)" : "linear-gradient(135deg,#c2410c,#ea580c,#f97316)", color: etsyConnecting ? "#f97316" : "#fff", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          <Link2 size={14} /> {etsyConnecting ? "Otwieranie Etsy..." : "Połącz konto Etsy (OAuth)"}
                        </button>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => saveAndNotify(platform.id)}
                      style={{
                        flex: 1, padding: "9px", borderRadius: 8, border: "none", cursor: "pointer",
                        background: saved[platform.id] ? "rgba(74,222,128,0.2)" : `${platform.color}20`,
                        color: saved[platform.id] ? "#4ade80" : platform.color,
                        fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}
                    >
                      {saved[platform.id] ? <><Check size={13} /> Zapisano!</> : <><Key size={13} /> Zapisz klucz</>}
                    </button>
                    {hasKey && (
                      <button
                        onClick={() => testKey(platform.id)}
                        disabled={testing[platform.id]}
                        style={{
                          padding: "9px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                          background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
                          fontWeight: 700, fontSize: 13,
                        }}
                      >
                        {testing[platform.id] ? "Testuję…" : "Testuj"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Info box */}
        <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 12, padding: "14px 16px", marginTop: 20 }}>
          <div style={{ color: "#93c5fd", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>🔐 Bezpieczeństwo</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.6 }}>
            Klucze są zapisywane lokalnie w przeglądarce (localStorage). Nie są wysyłane na zewnętrzne serwery.
            Przy każdym żądaniu API klucz jest przesyłany tylko do Twojego własnego serwera.
          </div>
        </div>
      </div>
    </ResellLayout>
  );
}
