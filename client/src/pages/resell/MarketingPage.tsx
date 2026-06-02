import { useState, useEffect } from "react";
import {
  Megaphone, Globe, Rocket, Copy, CheckCircle, Loader2,
  AlertCircle, ChevronRight, ChevronDown, BarChart2, Mail, Search, Users,
  Youtube, DollarSign, Calendar, Lightbulb, Target, Link, X,
  MessageSquare, ThumbsUp, Send, Video, Image, Download, Sparkles, Bot,
} from "lucide-react";
import { useLocation } from "wouter";
import { ResellLayout } from "@/components/resell/ResellLayout";
import { getAnthropicKey, getYouTubeKey, getGeminiKey } from "@/lib/apiKeys";
import { recordTokenUsage } from "@/lib/tokenUsage";

// ─── Data ──────────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: "PL", label: "Poland 🇵🇱", continent: "Europe" },
  { code: "DE", label: "Germany 🇩🇪", continent: "Europe" },
  { code: "FR", label: "France 🇫🇷", continent: "Europe" },
  { code: "GB", label: "UK 🇬🇧", continent: "Europe" },
  { code: "IT", label: "Italy 🇮🇹", continent: "Europe" },
  { code: "ES", label: "Spain 🇪🇸", continent: "Europe" },
  { code: "NL", label: "Netherlands 🇳🇱", continent: "Europe" },
  { code: "SE", label: "Sweden 🇸🇪", continent: "Europe" },
  { code: "CZ", label: "Czech Republic 🇨🇿", continent: "Europe" },
  { code: "US", label: "USA 🇺🇸", continent: "North America" },
  { code: "CA", label: "Canada 🇨🇦", continent: "North America" },
  { code: "JP", label: "Japan 🇯🇵", continent: "Asia" },
  { code: "CN", label: "China 🇨🇳", continent: "Asia" },
  { code: "KR", label: "South Korea 🇰🇷", continent: "Asia" },
  { code: "IN", label: "India 🇮🇳", continent: "Asia" },
  { code: "AU", label: "Australia 🇦🇺", continent: "Oceania" },
  { code: "BR", label: "Brazil 🇧🇷", continent: "South America" },
  { code: "NG", label: "Nigeria 🇳🇬", continent: "Africa" },
  { code: "ZA", label: "South Africa 🇿🇦", continent: "Africa" },
  { code: "EG", label: "Egypt 🇪🇬", continent: "Africa" },
];

const CONTINENTS = [
  { code: "Europe", label: "Europa 🇪🇺" },
  { code: "North America", label: "Ameryka Północna 🌎" },
  { code: "Asia", label: "Azja 🌏" },
  { code: "Africa", label: "Afryka 🌍" },
  { code: "South America", label: "Ameryka Południowa 🌎" },
  { code: "Oceania", label: "Oceania 🌏" },
];

const CATEGORIES = ["Electronics", "Clothing", "Watches", "Jewelry", "Sneakers", "Collectibles", "Antiques", "Spirits", "General"];
const CAMPAIGN_TYPES = [
  { value: "launch", label: "🚀 Nowy produkt", desc: "Maksymalna ekspozycja przy premierze" },
  { value: "seasonal", label: "🎄 Sezonowa", desc: "Święta, wyprzedaże, Black Friday" },
  { value: "clearance", label: "🔥 Wyprzedaż", desc: "Szybka sprzedaż z rabatem" },
  { value: "brand", label: "👑 Brand awareness", desc: "Budowanie rozpoznawalności" },
  { value: "retargeting", label: "🎯 Retargeting", desc: "Powrót porzuconych klientów" },
];

const PLATFORM_ICONS: Record<string, string> = {
  Instagram: "📸", Facebook: "📘", TikTok: "🎵", YouTube: "▶️",
  Google: "🔍", Pinterest: "📌", Twitter: "🐦", Snapchat: "👻",
  WhatsApp: "💬", Amazon: "📦", eBay: "🛒", Allegro: "🛍",
};

type Campaign = {
  summary: {
    marketOverview: string; uniqueSellingPoint: string;
    expectedROAS: string; seasonality: string; complianceNote: string;
  };
  audience: {
    ageRange: string; gender: string; income: string;
    interests: string[]; psychographics: string;
    painPoints: string[]; buyingTriggers: string[];
  };
  platforms: { platform: string; priority: number; reason: string; expectedCPM: string; bestFormat: string }[];
  budget: { monthly_min: number; monthly_max: number; allocation: Record<string, string>; tip: string };
  social: {
    instagram: { caption: string; hashtags: string[]; cta: string; format: string; visualIdea: string };
    facebook: { headline: string; primaryText: string; linkDescription: string; audienceNote: string };
    tiktok: { hook: string; script: string; hashtags: string[]; musicMood: string; trendSuggestion: string };
    youtube: { title: string; description: string; tags: string[] };
  };
  ads: {
    google: { headlines: string[]; descriptions: string[]; displayUrl: string; exactKeywords: string[]; broadKeywords: string[]; negativeKeywords: string[]; bidStrategy: string; shoppingFeedTitle: string };
    meta: { primaryText: string; headline: string; description: string; cta: string; audienceTargeting: string; lookalike: string };
  };
  email: { subject: string; preheader: string; body: string; cta: string };
  seo: { pageTitle: string; metaDescription: string; h1: string; primaryKeywords: string[]; longTailKeywords: string[]; contentIdeas: string[] };
  localInsights: string;
  launchPlan: { week: number; focus: string; actions: string[]; platforms: string[]; budget_pct: string }[];
};

type Result = { campaign: Campaign; meta: { product: string; targetMarket: string; marketType: string; campaignType: string; language: string; currency: string } };

// ─── Component ──────────────────────────────────────────────────────────────
export default function MarketingPage() {
  const [location] = useLocation();
  const [marketType, setMarketType] = useState<"country" | "continent" | "world">("country");
  const [selectedMarket, setSelectedMarket] = useState("Poland");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("product"); if (p) setProduct(p);
    const m = params.get("market"); if (m) setSelectedMarket(m);
    const t = params.get("type") as "country" | "continent" | "world" | null;
    if (t) setMarketType(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);
  const [inputMode, setInputMode] = useState<"manual" | "youtube">("manual");
  const [ytUrl, setYtUrl] = useState("");
  const [ytLoading, setYtLoading] = useState(false);
  const [ytMeta, setYtMeta] = useState<{ title: string; channelName: string; thumbnail: string; description: string } | null>(null);
  const [ytError, setYtError] = useState<string | null>(null);
  const [realComments, setRealComments] = useState<{ text: string; likes: number; author: string }[]>([]);
  const [realCommentsLoading, setRealCommentsLoading] = useState(false);
  const [realCommentsError, setRealCommentsError] = useState<string | null>(null);
  const [commentKit, setCommentKit] = useState<any>(null);
  const [commentKitLoading, setCommentKitLoading] = useState(false);
  const [commentKitError, setCommentKitError] = useState<string | null>(null);
  // Wideo AI
  const [imgPrompt, setImgPrompt] = useState("");
  const [genImgLoading, setGenImgLoading] = useState(false);
  const [genImgResult, setGenImgResult] = useState<string | null>(null);
  const [genImgError, setGenImgError] = useState<string | null>(null);
  const [vidPrompt, setVidPrompt] = useState("");
  const [vidLoading, setVidLoading] = useState(false);
  const [vidOpName, setVidOpName] = useState<string | null>(null);
  const [vidModel, setVidModel] = useState<string | null>(null);
  const [vidResult, setVidResult] = useState<{ uri: string | null; b64: string | null } | null>(null);
  const [vidError, setVidError] = useState<string | null>(null);
  const [vidProgress, setVidProgress] = useState(0);
  const [product, setProduct] = useState("");
  const [category, setCategory] = useState("General");
  const [priceUSD, setPriceUSD] = useState("");
  const [description, setDescription] = useState("");
  const [campaignType, setCampaignType] = useState("launch");
  const [voice, setVoice] = useState("professional");
  const [campaignBudget, setCampaignBudget] = useState("auto");
  const [sections, setSections] = useState<string[]>(["strategy","social","ads","email","seo","plan"]);
  const [sectionDetail, setSectionDetail] = useState<Record<string, "s"|"m"|"l">>({ strategy:"m", social:"m", ads:"m", email:"m", seo:"m", plan:"m" });
  const [lastUsage, setLastUsage] = useState<{ input_tokens: number; output_tokens: number } | null>(null);
  const [genMode, setGenMode] = useState<"form" | "agent">("form");
  const [agentLog, setAgentLog] = useState<{ step: number; message: string; section?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [showReport, setShowReport] = useState(true);
  const [openChannels, setOpenChannels] = useState<Record<string, boolean>>({ strategia: true });
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  // Campaign history
  const [history, setHistory] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem("resell_marketing_history") || "[]"); } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  // Email sequence
  const [emailSeq, setEmailSeq] = useState<any[]>([]);
  const [emailSeqLoading, setEmailSeqLoading] = useState(false);
  const [emailSeqError, setEmailSeqError] = useState<string | null>(null);
  const [emailSeqExpanded, setEmailSeqExpanded] = useState<Record<number, boolean>>({});
  // Landing page
  const [landingPage, setLandingPage] = useState<any>(null);
  const [landingLoading, setLandingLoading] = useState(false);
  const [landingError, setLandingError] = useState<string | null>(null);
  const [faqExpanded, setFaqExpanded] = useState<Record<number, boolean>>({});
  // Content calendar
  const [calendar, setCalendar] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  // Influencer kit
  const [influencer, setInfluencer] = useState<any>(null);
  const [influencerLoading, setInfluencerLoading] = useState(false);
  const [influencerError, setInfluencerError] = useState<string | null>(null);
  // Media upload
  const [uploadedImages, setUploadedImages] = useState<{ name: string; url: string }[]>([]);
  const [uploadedVideos, setUploadedVideos] = useState<{ name: string; url: string }[]>([]);
  const [mediaDragOver, setMediaDragOver] = useState(false);

  const fetchYt = async () => {
    if (!ytUrl.trim()) return;
    setYtLoading(true); setYtError(null); setYtMeta(null);
    try {
      const r = await fetch(`/api/marketing/fetch-yt?url=${encodeURIComponent(ytUrl.trim())}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Nie udało się pobrać danych z YouTube");
      setYtMeta(data);
      // Pre-fill form fields
      if (data.title) setProduct(data.title.replace(/\s*[-|]\s*YouTube.*$/i, "").trim().slice(0, 120));
      if (data.description) setDescription(data.description.slice(0, 300));
    } catch (e: any) {
      setYtError(e.message);
    }
    setYtLoading(false);
  };

  const extractVideoId = (url: string): string => {
    const m = url.match(/[?&]v=([^&]+)/) ?? url.match(/youtu\.be\/([^?&]+)/) ?? url.match(/shorts\/([^?&]+)/);
    return m ? m[1] : "";
  };

  const fetchYtComments = async () => {
    const ytKey = getYouTubeKey();
    if (!ytKey) { setRealCommentsError("Dodaj YouTube Data API v3 key w ⚙ API"); return; }
    const videoId = extractVideoId(ytUrl);
    if (!videoId) { setRealCommentsError("Nie można wyciągnąć ID wideo z podanego URL"); return; }
    setRealCommentsLoading(true); setRealCommentsError(null);
    try {
      const r = await fetch(`/api/marketing/yt-comments?videoId=${videoId}&ytKey=${encodeURIComponent(ytKey)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Błąd pobierania komentarzy");
      setRealComments(data.comments ?? []);
    } catch (e: any) { setRealCommentsError(e.message); }
    setRealCommentsLoading(false);
  };

  const handleMediaUpload = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const url = e.target?.result as string;
        if (file.type.startsWith("image/")) {
          setUploadedImages(prev => prev.length < 8 ? [...prev, { name: file.name, url }] : prev);
        } else if (file.type.startsWith("video/")) {
          setUploadedVideos(prev => prev.length < 4 ? [...prev, { name: file.name, url }] : prev);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const buildDefaultImgPrompt = () => result
    ? `Professional marketing photo for "${result.meta.product}", ${result.meta.campaignType} campaign targeting ${result.meta.targetMarket}. High quality commercial photography, clean background, product showcase style.`
    : "";

  const buildDefaultVidPrompt = () => result
    ? `${result.campaign.social?.tiktok?.hook ?? ""} ${result.campaign.social?.tiktok?.script?.slice(0, 200) ?? ""}. Short 8-second product advertisement for "${result.meta.product}", targeting ${result.meta.targetMarket}. Dynamic, modern, professional.`.trim()
    : "";

  const genImage = async () => {
    const key = getGeminiKey();
    if (!key) { setGenImgError("Dodaj Gemini API key w ⚙ API"); return; }
    const prompt = imgPrompt || buildDefaultImgPrompt();
    if (!prompt) return;
    setGenImgLoading(true); setGenImgError(null); setGenImgResult(null);
    try {
      const r = await fetch("/api/marketing/gen-image", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt, geminiKey: key,
          referenceImage: uploadedImages[0]?.url ?? null,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Błąd generowania grafiki");
      setGenImgResult(data.image);
      if (!imgPrompt) setImgPrompt(prompt);
    } catch (e: any) { setGenImgError(e.message); }
    setGenImgLoading(false);
  };

  const startVideo = async () => {
    const key = getGeminiKey();
    if (!key) { setVidError("Dodaj Gemini API key w ⚙ API"); return; }
    const prompt = vidPrompt || buildDefaultVidPrompt();
    if (!prompt) return;
    setVidLoading(true); setVidError(null); setVidOpName(null); setVidResult(null); setVidProgress(5);
    if (!vidPrompt) setVidPrompt(prompt);
    try {
      const r = await fetch("/api/marketing/gen-video", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, geminiKey: key, withAudio: true }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Błąd uruchamiania Veo");
      setVidOpName(data.operationName);
      setVidModel(data.model);
      setVidProgress(15);
      // Start polling
      pollVideo(data.operationName, key, 15);
    } catch (e: any) { setVidError(e.message); setVidLoading(false); }
  };

  const pollVideo = async (opName: string, key: string, progress: number) => {
    const maxAttempts = 36; // ~3 minutes
    let attempts = 0;
    const tick = async () => {
      attempts++;
      try {
        const r = await fetch(`/api/marketing/video-status?op=${encodeURIComponent(opName)}&geminiKey=${encodeURIComponent(key)}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Błąd sprawdzania statusu");
        if (data.done) {
          setVidResult({ uri: data.videoUri, b64: data.videoB64 });
          setVidLoading(false); setVidProgress(100);
          return;
        }
        const nextProgress = Math.min(90, progress + (80 / maxAttempts));
        setVidProgress(Math.round(nextProgress));
        if (attempts < maxAttempts) setTimeout(tick, 5000);
        else { setVidError("Timeout — wideo trwa zbyt długo. Spróbuj ponownie."); setVidLoading(false); }
      } catch (e: any) { setVidError(e.message); setVidLoading(false); }
    };
    setTimeout(tick, 5000);
  };

  const genComments = async () => {
    const key = getAnthropicKey();
    if (!key) { setCommentKitError("Dodaj klucz Anthropic API w ⚙ API"); return; }
    setCommentKitLoading(true); setCommentKitError(null);
    try {
      const r = await fetch("/api/marketing/gen-comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product: product.trim() || ytMeta?.title || "Produkt",
          description: description.trim(),
          targetMarket: selectedMarket,
          campaignType,
          anthropicKey: key,
          realComments,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Błąd generowania komentarzy");
      setCommentKit(data);
    } catch (e: any) { setCommentKitError(e.message); }
    setCommentKitLoading(false);
  };

  const generate = async () => {
    const key = getAnthropicKey();
    if (!key) { setError("Dodaj klucz Anthropic API w ⚙ API"); return; }
    if (!product.trim()) { setError("Wpisz nazwę produktu"); return; }
    setLoading(true); setError(null); setResult(null);
    setGenImgResult(null); setImgPrompt(""); setVidResult(null); setVidPrompt(""); setVidOpName(null);
    // Reset sub-generators
    setEmailSeq([]); setEmailSeqError(null);
    setLandingPage(null); setLandingError(null);
    setCalendar([]); setCalendarError(null);
    setInfluencer(null); setInfluencerError(null);
    try {
      const r = await fetch("/api/marketing/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product: product.trim(), category, priceUSD: parseFloat(priceUSD) || 0,
          description: description.trim(), targetMarket: selectedMarket,
          marketType, campaignType, voice, campaignBudget, sections, sectionDetail, anthropicKey: key,
        }),
      });
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error("Serwer nie odpowiada — kliknij Stop ■ i Run ▶ w Replit, odczekaj 15 sekund i spróbuj ponownie.");
      }
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Błąd generowania");
      setResult(data);
      if (data.usage) {
        setLastUsage(data.usage);
        recordTokenUsage(data.usage, data.model || "claude-haiku-4-5-20251001");
      }
      setOpenChannels({ strategia: true });
      // Save to history (max 5, newest first)
      const entry = {
        id: Date.now(),
        product: product.trim(),
        targetMarket: selectedMarket,
        campaignType,
        voice,
        createdAt: new Date().toISOString(),
        result: data,
      };
      setHistory(prev => {
        const updated = [entry, ...prev].slice(0, 5);
        localStorage.setItem("resell_marketing_history", JSON.stringify(updated));
        return updated;
      });
    } catch (e: any) {
      setError(e.message === "Failed to fetch"
        ? "Nie można połączyć się z serwerem. Zrestartuj Replit (Stop → Run) i spróbuj ponownie."
        : e.message);
    }
    setLoading(false);
  };

  const agentGenerate = async () => {
    const key = getAnthropicKey();
    if (!key) { setError("Dodaj klucz Anthropic API w ⚙ API"); return; }
    if (!product.trim()) { setError("Wpisz nazwę produktu"); return; }
    setLoading(true); setError(null); setResult(null); setAgentLog([]);
    setGenImgResult(null); setImgPrompt(""); setVidResult(null); setVidPrompt(""); setVidOpName(null);
    setEmailSeq([]); setEmailSeqError(null); setLandingPage(null); setLandingError(null);
    setCalendar([]); setCalendarError(null); setInfluencer(null); setInfluencerError(null);
    try {
      const r = await fetch("/api/marketing/agent-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product: product.trim(), category, priceUSD: parseFloat(priceUSD) || 0,
          description: description.trim(), targetMarket: selectedMarket,
          marketType, campaignType, voice, campaignBudget, sections, anthropicKey: key,
        }),
      });
      if (!r.ok || !r.body) throw new Error("Błąd połączenia z agentem");
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const chunk of parts) {
          const ev = chunk.split("\n").find(l => l.startsWith("event: "))?.slice(7) ?? "status";
          const dl = chunk.split("\n").find(l => l.startsWith("data: "));
          if (!dl) continue;
          const payload = JSON.parse(dl.slice(6));
          if (ev === "status") setAgentLog(p => [...p, payload]);
          else if (ev === "done") {
            if (payload.campaign) {
              const data = payload;
              setResult(data);
              setOpenChannels({ strategia: true });
              if (payload.usage) { setLastUsage(payload.usage); recordTokenUsage(payload.usage, payload.model || "claude-haiku-4-5-20251001"); }
              const entry = { id: Date.now(), product: product.trim(), targetMarket: selectedMarket, campaignType, voice, createdAt: new Date().toISOString(), result: data };
              setHistory(prev => { const updated = [entry, ...prev].slice(0, 5); localStorage.setItem("resell_marketing_history", JSON.stringify(updated)); return updated; });
            } else { setError("Agent nie zwrócił kampanii — spróbuj ponownie."); }
          }
          else if (ev === "error") setError(payload.message);
        }
      }
    } catch (e: any) {
      setError(e.message === "Failed to fetch" ? "Nie można połączyć się z serwerem. Zrestartuj Replit (Stop → Run)." : e.message);
    }
    setLoading(false);
  };

  const genEmailSeq = async () => {
    const key = getAnthropicKey();
    if (!key) { setEmailSeqError("Dodaj klucz Anthropic API w ⚙ API"); return; }
    setEmailSeqLoading(true); setEmailSeqError(null);
    try {
      const r = await fetch("/api/marketing/gen-sequence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product: product.trim(), description: description.trim(),
          targetMarket: selectedMarket, campaignType, voice, anthropicKey: key,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Błąd generowania sekwencji");
      setEmailSeq(Array.isArray(data) ? data : []);
    } catch (e: any) { setEmailSeqError(e.message); }
    setEmailSeqLoading(false);
  };

  const genLanding = async () => {
    const key = getAnthropicKey();
    if (!key) { setLandingError("Dodaj klucz Anthropic API w ⚙ API"); return; }
    setLandingLoading(true); setLandingError(null);
    try {
      const r = await fetch("/api/marketing/gen-landing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product: product.trim(), description: description.trim(),
          targetMarket: selectedMarket, priceUSD: parseFloat(priceUSD) || 0,
          voice, anthropicKey: key,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Błąd generowania landing page");
      setLandingPage(data);
    } catch (e: any) { setLandingError(e.message); }
    setLandingLoading(false);
  };

  const genCalendar = async () => {
    const key = getAnthropicKey();
    if (!key) { setCalendarError("Dodaj klucz Anthropic API w ⚙ API"); return; }
    setCalendarLoading(true); setCalendarError(null);
    try {
      const r = await fetch("/api/marketing/gen-calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product: product.trim(), description: description.trim(),
          targetMarket: selectedMarket, campaignType, voice, anthropicKey: key,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Błąd generowania kalendarza");
      setCalendar(Array.isArray(data) ? data : []);
    } catch (e: any) { setCalendarError(e.message); }
    setCalendarLoading(false);
  };

  const genInfluencer = async () => {
    const key = getAnthropicKey();
    if (!key) { setInfluencerError("Dodaj klucz Anthropic API w ⚙ API"); return; }
    setInfluencerLoading(true); setInfluencerError(null);
    try {
      const r = await fetch("/api/marketing/gen-influencer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product: product.trim(), description: description.trim(),
          targetMarket: selectedMarket, priceUSD: parseFloat(priceUSD) || 0,
          campaignType, voice, anthropicKey: key,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Błąd generowania kitu influencer");
      setInfluencer(data);
    } catch (e: any) { setInfluencerError(e.message); }
    setInfluencerLoading(false);
  };

  const copyText = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
    setCopied(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setCopied(prev => ({ ...prev, [key]: false })), 2000);
  };

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <button onClick={() => copyText(text, id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: copied[id] ? "#4ade80" : "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>
      {copied[id] ? <CheckCircle size={11} /> : <Copy size={11} />}
      {copied[id] ? "Skopiowano" : "Kopiuj"}
    </button>
  );

  const Block = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );

  const TextCard = ({ text, id }: { text: string; id: string }) => (
    <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "12px 14px", position: "relative" }}>
      <div style={{ position: "absolute", top: 8, right: 8 }}><CopyBtn text={text} id={id} /></div>
      <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 1.6, paddingRight: 80, whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  );

  const inp: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 9, color: "#fff", fontSize: 13, padding: "9px 12px", outline: "none", boxSizing: "border-box",
  };

  const toggleCh = (id: string) => setOpenChannels(p => ({ ...p, [id]: !p[id] }));

  return (
    <ResellLayout>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px 80px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, flexShrink: 0, background: "linear-gradient(135deg, #ec4899, #a855f7, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(168,85,247,0.35)" }}>
            <Megaphone size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontWeight: 900, fontSize: 22, margin: 0, letterSpacing: -0.5 }}>Marketing AI</h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>Silnik kampanii marketingowych — kraj, kontynent lub cały świat — gotowe treści i strategie</p>
          </div>
        </div>

        {/* ── Input form ── */}
        {!result && (
          <div style={{ background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 18, padding: "24px 24px" }}>

            {/* Input mode toggle */}
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              {([["manual", "📝", "Wpisz ręcznie"], ["youtube", "▶️", "Link YouTube"]] as const).map(([mode, icon, label]) => (
                <button key={mode} onClick={() => setInputMode(mode)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", borderRadius: 9,
                  border: `1px solid ${inputMode === mode ? "rgba(236,72,153,0.5)" : "rgba(255,255,255,0.1)"}`,
                  background: inputMode === mode ? "rgba(236,72,153,0.12)" : "transparent",
                  color: inputMode === mode ? "#f9a8d4" : "rgba(255,255,255,0.45)",
                  fontWeight: inputMode === mode ? 700 : 400, fontSize: 13, cursor: "pointer",
                }}>
                  <span>{icon}</span> {label}
                </button>
              ))}
            </div>

            {/* YouTube URL input */}
            {inputMode === "youtube" && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 10 }}>LINK DO FILMIKU YOUTUBE</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><Link size={14} color="rgba(255,255,255,0.3)" /></div>
                    <input
                      value={ytUrl}
                      onChange={e => { setYtUrl(e.target.value); setYtMeta(null); setYtError(null); }}
                      onKeyDown={e => e.key === "Enter" && fetchYt()}
                      placeholder="https://www.youtube.com/watch?v=..."
                      style={{ ...inp, paddingLeft: 36 }}
                    />
                  </div>
                  <button onClick={fetchYt} disabled={ytLoading || !ytUrl.trim()} style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: "none",
                    background: ytUrl.trim() ? "linear-gradient(135deg,#ec4899,#a855f7)" : "rgba(255,255,255,0.08)",
                    color: ytUrl.trim() ? "#fff" : "rgba(255,255,255,0.3)",
                    fontWeight: 700, fontSize: 13, cursor: ytUrl.trim() && !ytLoading ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap",
                  }}>
                    {ytLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Youtube size={14} />}
                    {ytLoading ? "Pobieranie…" : "Pobierz dane"}
                  </button>
                </div>
                {ytError && (
                  <div style={{ marginTop: 8, color: "#fca5a5", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertCircle size={12} /> {ytError}
                  </div>
                )}

                {/* Video preview */}
                {ytMeta && (
                  <div style={{ marginTop: 14, background: "rgba(236,72,153,0.07)", border: "1px solid rgba(236,72,153,0.25)", borderRadius: 12, padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                    {ytMeta.thumbnail && (
                      <div style={{ flexShrink: 0, width: 120, height: 68, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
                        <img src={ytMeta.thumbnail} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="thumbnail" />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#f9a8d4", fontWeight: 700, fontSize: 13, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ytMeta.title}</div>
                      {ytMeta.channelName && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 6 }}>@{ytMeta.channelName}</div>}
                      <div style={{ color: "#4ade80", fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
                        <CheckCircle size={11} /> Dane pobrane — formularz wypełniony automatycznie
                      </div>
                    </div>
                    <button onClick={() => { setYtMeta(null); setYtUrl(""); setYtError(null); setRealComments([]); setRealCommentsError(null); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Fetch comments from YouTube */}
                {ytMeta && (
                  <div style={{ marginTop: 10 }}>
                    {realComments.length === 0 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button onClick={fetchYtComments} disabled={realCommentsLoading} style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8,
                          border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.08)",
                          color: "#a5b4fc", fontSize: 12, cursor: "pointer", fontWeight: 600,
                        }}>
                          {realCommentsLoading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <MessageSquare size={12} />}
                          {realCommentsLoading ? "Pobieranie komentarzy…" : "Pobierz komentarze z YT (opcjonalne)"}
                        </button>
                        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>wymaga YouTube Data API key w ⚙ API</span>
                      </div>
                    ) : (
                      <div style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ color: "#a5b4fc", fontSize: 11, fontWeight: 700 }}>💬 {realComments.length} komentarzy załadowanych</div>
                          <button onClick={() => setRealComments([])} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", cursor: "pointer", fontSize: 11 }}>usuń</button>
                        </div>
                        {realComments.slice(0, 3).map((c, i) => (
                          <div key={i} style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span style={{ color: "#6366f1", marginRight: 5 }}>👍{c.likes}</span>{c.text}
                          </div>
                        ))}
                        {realComments.length > 3 && <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>+{realComments.length - 3} więcej</div>}
                      </div>
                    )}
                    {realCommentsError && <div style={{ marginTop: 6, color: "#fca5a5", fontSize: 11 }}>⚠ {realCommentsError}</div>}
                  </div>
                )}
              </div>
            )}

            {/* Product info */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>
                PRODUKT {inputMode === "youtube" && ytMeta ? <span style={{ color: "#4ade80", fontWeight: 400 }}>· prefilled z YouTube</span> : ""}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginBottom: 5 }}>NAZWA PRODUKTU / TEMAT *</div>
                  <input value={product} onChange={e => setProduct(e.target.value)} placeholder="np. Wiertarka Bosch 18V" style={inp} />
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginBottom: 5 }}>CENA (USD)</div>
                  <input type="number" value={priceUSD} onChange={e => setPriceUSD(e.target.value)} placeholder="49.99" style={inp} />
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginBottom: 5 }}>KATEGORIA</div>
                  <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inp, appearance: "none" }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginBottom: 5 }}>OPIS / KONTEKST</div>
                  <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Stan, kolor, cechy szczególne..." style={inp} />
                </div>
              </div>
            </div>

            {/* Media upload */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>
                ZDJĘCIA I FILMY PRODUKTU
                <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400, marginLeft: 8 }}>do 8 zdjęć · 4 filmy · używane jako referencja w AI</span>
              </div>
              {/* Drop zone */}
              <label
                onDragOver={e => { e.preventDefault(); setMediaDragOver(true); }}
                onDragLeave={() => setMediaDragOver(false)}
                onDrop={e => { e.preventDefault(); setMediaDragOver(false); handleMediaUpload(e.dataTransfer.files); }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 8, padding: "18px 12px", borderRadius: 14, cursor: "pointer",
                  border: `2px dashed ${mediaDragOver ? "rgba(74,222,128,0.7)" : "rgba(255,255,255,0.12)"}`,
                  background: mediaDragOver ? "rgba(74,222,128,0.06)" : "rgba(255,255,255,0.02)",
                  transition: "all 0.2s",
                }}
              >
                <input type="file" accept="image/*,video/*" multiple style={{ display: "none" }}
                  onChange={e => handleMediaUpload(e.target.files)} />
                <div style={{ fontSize: 24 }}>📁</div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, textAlign: "center" }}>
                  Kliknij lub przeciągnij zdjęcia/filmy<br />
                  <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>JPG, PNG, WEBP, MP4, MOV, WEBM</span>
                </div>
              </label>
              {/* Image thumbnails */}
              {uploadedImages.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {uploadedImages.map((img, i) => (
                    <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 10, overflow: "hidden", border: i === 0 ? "2px solid #4ade80" : "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
                      <img src={img.url} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      {i === 0 && (
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(74,222,128,0.85)", color: "#000", fontSize: 8, fontWeight: 700, textAlign: "center", padding: "2px 0" }}>REFERENCJA</div>
                      )}
                      <button onClick={() => setUploadedImages(prev => prev.filter((_, j) => j !== i))} style={{
                        position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%",
                        background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {/* Video list */}
              {uploadedVideos.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                  {uploadedVideos.map((vid, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 12px" }}>
                      <span style={{ fontSize: 16 }}>🎬</span>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vid.name}</span>
                      <button onClick={() => setUploadedVideos(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Campaign history */}
            {history.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <button onClick={() => setShowHistory(prev => !prev)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "rgba(168,85,247,0.8)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: showHistory ? 10 : 0 }}>
                  <Calendar size={12} /> Historia kampanii ({history.length}) {showHistory ? "▲" : "▼"}
                </button>
                {showHistory && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {history.map((h: any) => (
                      <button key={h.id} onClick={() => {
                        setProduct(h.product);
                        setSelectedMarket(h.targetMarket);
                        setCampaignType(h.campaignType);
                        setVoice(h.voice || "professional");
                        setResult(h.result);
                        setOpenChannels({ strategia: true });
                        setShowHistory(false);
                      }} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "7px 12px", borderRadius: 9, border: "1px solid rgba(168,85,247,0.3)", background: "rgba(168,85,247,0.07)", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ color: "#c4b5fd", fontSize: 11, fontWeight: 700 }}>{h.product} → {h.targetMarket}</span>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>{new Date(h.createdAt).toLocaleDateString("pl-PL")}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Voice selector */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>TON / GŁOS MARKI</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { value: "professional", label: "👔 Profesjonalny" },
                  { value: "casual", label: "🙂 Przyjazny" },
                  { value: "luxury", label: "💎 Luksusowy" },
                  { value: "aggressive", label: "🔥 Agresywny" },
                  { value: "humor", label: "😂 Humorystyczny" },
                ].map(v => (
                  <button key={v.value} onClick={() => setVoice(v.value)} style={{
                    padding: "8px 14px", borderRadius: 10,
                    border: `1px solid ${voice === v.value ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)"}`,
                    background: voice === v.value ? "rgba(168,85,247,0.15)" : "transparent",
                    color: voice === v.value ? "#c4b5fd" : "rgba(255,255,255,0.45)",
                    fontWeight: voice === v.value ? 700 : 400, fontSize: 12, cursor: "pointer",
                  }}>{v.label}</button>
                ))}
              </div>
            </div>

            {/* Campaign budget */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>MIESIĘCZNY BUDŻET KAMPANII</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { value: "free",   label: "🆓 Darmowy",         desc: "Zero budżetu reklamowego" },
                  { value: "auto",   label: "🤖 AI zdecyduje",    desc: "AI dopasuje do rynku" },
                  { value: "micro",  label: "💸 Do 300 USD",      desc: "Mikro / testowy" },
                  { value: "small",  label: "💰 300–1 000 USD",   desc: "Mały biznes" },
                  { value: "medium", label: "🚀 1 000–5 000 USD", desc: "Rosnący sklep" },
                  { value: "large",  label: "💎 5 000–20 000 USD",desc: "Skalowanie" },
                  { value: "enterprise", label: "🏆 20 000+ USD", desc: "Enterprise" },
                ].map(b => (
                  <button key={b.value} onClick={() => setCampaignBudget(b.value)} style={{
                    padding: "8px 14px", borderRadius: 10,
                    border: `1px solid ${campaignBudget === b.value ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.1)"}`,
                    background: campaignBudget === b.value ? "rgba(245,158,11,0.12)" : "transparent",
                    color: campaignBudget === b.value ? "#fcd34d" : "rgba(255,255,255,0.45)",
                    cursor: "pointer", textAlign: "left",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{b.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{b.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Sections selector */}
            {(() => {
              const SECS = [
                { value: "strategy", label: "📊 Strategia",      desc: "Rynek, audience, budżet" },
                { value: "social",   label: "📱 Social media",    desc: "Instagram, Facebook, TikTok" },
                { value: "ads",      label: "📣 Reklamy",         desc: "Google Ads, Meta Ads" },
                { value: "email",    label: "📧 Email",           desc: "Subject, treść, CTA" },
                { value: "seo",      label: "🔍 SEO",             desc: "Title, meta, słowa kluczowe" },
                { value: "plan",     label: "📅 Plan 4 tygodnie", desc: "Tygodniowy harmonogram" },
              ];
              const tokenW: Record<string, number> = { s: 600, m: 1600, l: 3200 };
              const estTokens = sections.reduce((acc, s) => acc + (tokenW[sectionDetail[s] ?? "m"] || 1600), 0);
              const hasLong = sections.some(s => sectionDetail[s] === "l");
              const useHaiku = sections.length <= 3 && !hasLong;
              const maxTok = Math.min(useHaiku ? 6000 : 16000, Math.max(2000, estTokens + 600));
              const pct = Math.round((estTokens / maxTok) * 100);
              return (
                <div style={{ marginBottom: 22 }}>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8 }}>CO GENEROWAĆ ({sections.length}/6)</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {useHaiku
                        ? <span style={{ color: "#4ade80", fontSize: 10, fontWeight: 700 }}>⚡ Haiku</span>
                        : <span style={{ color: "#fbbf24", fontSize: 10, fontWeight: 700 }}>✦ Sonnet</span>
                      }
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>~{estTokens} / {maxTok} tok</span>
                    </div>
                  </div>
                  {/* Token bar */}
                  <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)", marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, borderRadius: 2, background: pct > 85 ? "#f87171" : useHaiku ? "#4ade80" : "#fbbf24", transition: "width 0.3s" }} />
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginBottom: 10 }}>Zaznacz sekcje. Dla każdej aktywnej wybierz S (skrótowo) / M (standardowo) / L (szczegółowo).</div>
                  {/* Section toggle chips */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {SECS.map(s => {
                      const active = sections.includes(s.value);
                      return (
                        <button key={s.value} onClick={() => setSections(prev =>
                          prev.includes(s.value)
                            ? prev.length > 1 ? prev.filter(x => x !== s.value) : prev
                            : [...prev, s.value]
                        )} style={{
                          padding: "8px 12px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                          border: `1px solid ${active ? "rgba(34,197,94,0.55)" : "rgba(255,255,255,0.1)"}`,
                          background: active ? "rgba(34,197,94,0.12)" : "transparent",
                          color: active ? "#4ade80" : "rgba(255,255,255,0.3)",
                        }}>
                          <div style={{ fontWeight: 700, fontSize: 12 }}>{s.label}</div>
                          <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>{s.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                  {/* S/M/L detail rows for active sections */}
                  {sections.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {SECS.filter(s => sections.includes(s.value)).map(s => {
                        const dl = sectionDetail[s.value] ?? "m";
                        const labels: Record<string, string> = { s: "S — skrótowo", m: "M — standardowo", l: "L — szczegółowo" };
                        return (
                          <div key={s.value} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", minWidth: 120, flexShrink: 0 }}>{s.label}</span>
                            <div style={{ display: "flex", gap: 4 }}>
                              {(["s","m","l"] as const).map(d => (
                                <button key={d} onClick={() => setSectionDetail(prev => ({ ...prev, [s.value]: d }))} style={{
                                  padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                                  border: `1px solid ${dl === d ? "rgba(34,197,94,0.8)" : "rgba(255,255,255,0.12)"}`,
                                  background: dl === d ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.03)",
                                  color: dl === d ? "#4ade80" : "rgba(255,255,255,0.3)",
                                }}>{labels[d]}</button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Campaign type */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>TYP KAMPANII</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CAMPAIGN_TYPES.map(ct => (
                  <button key={ct.value} onClick={() => setCampaignType(ct.value)} style={{
                    padding: "8px 14px", borderRadius: 10, border: `1px solid ${campaignType === ct.value ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)"}`,
                    background: campaignType === ct.value ? "rgba(168,85,247,0.15)" : "transparent",
                    color: campaignType === ct.value ? "#c4b5fd" : "rgba(255,255,255,0.45)",
                    cursor: "pointer", textAlign: "left",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{ct.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{ct.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Target market */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>RYNEK DOCELOWY</div>

              {/* Market type toggle */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {(["country", "continent", "world"] as const).map(t => {
                  const labels = { country: "🗺 Kraj", continent: "🌍 Kontynent", world: "🌐 Cały Świat" };
                  return (
                    <button key={t} onClick={() => {
                      setMarketType(t);
                      if (t === "country") setSelectedMarket("Poland");
                      else if (t === "continent") setSelectedMarket("Europe");
                      else setSelectedMarket("Worldwide");
                    }} style={{
                      padding: "9px 18px", borderRadius: 10,
                      border: `1px solid ${marketType === t ? "rgba(236,72,153,0.5)" : "rgba(255,255,255,0.1)"}`,
                      background: marketType === t ? "linear-gradient(135deg,rgba(236,72,153,0.2),rgba(168,85,247,0.15))" : "transparent",
                      color: marketType === t ? "#f9a8d4" : "rgba(255,255,255,0.45)",
                      fontWeight: marketType === t ? 700 : 500, fontSize: 13, cursor: "pointer",
                    }}>{labels[t]}</button>
                  );
                })}
              </div>

              {marketType === "country" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {COUNTRIES.map(c => (
                    <button key={c.code} onClick={() => setSelectedMarket(c.label.split(" ")[0])} style={{
                      padding: "7px 13px", borderRadius: 9, fontSize: 12,
                      border: `1px solid ${selectedMarket === c.label.split(" ")[0] ? "rgba(236,72,153,0.5)" : "rgba(255,255,255,0.08)"}`,
                      background: selectedMarket === c.label.split(" ")[0] ? "rgba(236,72,153,0.15)" : "rgba(255,255,255,0.03)",
                      color: selectedMarket === c.label.split(" ")[0] ? "#f9a8d4" : "rgba(255,255,255,0.5)",
                      cursor: "pointer",
                    }}>{c.label}</button>
                  ))}
                </div>
              )}

              {marketType === "continent" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {CONTINENTS.map(c => (
                    <button key={c.code} onClick={() => setSelectedMarket(c.code)} style={{
                      padding: "9px 18px", borderRadius: 10, fontSize: 13,
                      border: `1px solid ${selectedMarket === c.code ? "rgba(236,72,153,0.5)" : "rgba(255,255,255,0.08)"}`,
                      background: selectedMarket === c.code ? "rgba(236,72,153,0.15)" : "rgba(255,255,255,0.03)",
                      color: selectedMarket === c.code ? "#f9a8d4" : "rgba(255,255,255,0.5)",
                      cursor: "pointer", fontWeight: selectedMarket === c.code ? 700 : 400,
                    }}>{c.label}</button>
                  ))}
                </div>
              )}

              {marketType === "world" && (
                <div style={{ background: "rgba(236,72,153,0.08)", border: "1px solid rgba(236,72,153,0.25)", borderRadius: 12, padding: "14px 18px" }}>
                  <div style={{ color: "#f9a8d4", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🌐 Kampania globalna</div>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>AI wygeneruje uniwersalną kampanię po angielsku z adaptacjami dla różnych kultur i rynków.</div>
                </div>
              )}
            </div>

            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {([
                { v: "form",  icon: <Megaphone size={13} />, label: "Formularz" },
                { v: "agent", icon: <Bot size={13} />,      label: "🤖 Agent AI" },
              ] as const).map(m => (
                <button key={m.v} onClick={() => setGenMode(m.v as any)} style={{
                  flex: 1, padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                  border: `1px solid ${genMode === m.v ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.1)"}`,
                  background: genMode === m.v ? "rgba(168,85,247,0.15)" : "transparent",
                  color: genMode === m.v ? "#c4b5fd" : "rgba(255,255,255,0.35)",
                  fontWeight: genMode === m.v ? 700 : 400, fontSize: 13,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>{m.icon} {m.label}</button>
              ))}
            </div>
            {genMode === "agent" && (
              <div style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                Agent generuje każdą sekcję osobno, budując kontekst między nimi. Wolniej, ale lepiej dopasowane treści.
              </div>
            )}

            {error && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 9, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, color: "#fca5a5", fontSize: 13 }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button onClick={genMode === "agent" ? agentGenerate : generate} disabled={loading || !product.trim()} style={{
              width: "100%", padding: "14px 24px", borderRadius: 12, border: "none",
              background: loading || !product.trim() ? "rgba(168,85,247,0.2)"
                : genMode === "agent" ? "linear-gradient(135deg,#16a34a,#22c55e,#4ade80)"
                : "linear-gradient(135deg, #ec4899, #a855f7, #6366f1)",
              color: loading || !product.trim() ? "rgba(255,255,255,0.3)" : genMode === "agent" ? "#000" : "#fff",
              fontWeight: 900, fontSize: 15, cursor: loading || !product.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: loading || !product.trim() ? "none" : genMode === "agent" ? "0 4px 20px rgba(34,197,94,0.4)" : "0 4px 20px rgba(168,85,247,0.4)",
              transition: "all 0.2s",
            }}>
              {loading
                ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> {genMode === "agent" ? "Agent pracuje..." : "Generuję kampanię…"}</>
                : genMode === "agent"
                  ? <><Bot size={18} /> Uruchom Agent AI <ChevronRight size={16} /></>
                  : <><Megaphone size={18} /> Generuj kampanię marketingową <ChevronRight size={16} /></>}
            </button>

            {/* Agent live log */}
            {genMode === "agent" && (loading || agentLog.length > 0) && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 7 }}>
                {agentLog.map((entry, i) => {
                  const done = i < agentLog.length - 1 || !loading;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {done
                        ? <CheckCircle size={13} color="#22c55e" style={{ flexShrink: 0 }} />
                        : <Loader2 size={13} color="#22c55e" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />}
                      <span style={{ color: done ? "rgba(255,255,255,0.35)" : "#fff", fontSize: 12 }}>{entry.message}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Form mode loading dots */}
            {genMode === "form" && loading && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {["🎯 Analiza rynku i grupy docelowej", "📱 Generowanie treści social media", "📣 Tworzenie copy reklamowego", "📧 Budowanie strategii email", "🔍 Optymalizacja SEO", "📅 Plan wdrożenia kampanii"].map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(168,85,247,0.5)", animation: `pulse 1.5s ease ${i * 0.25}s infinite`, flexShrink: 0 }} />
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{s}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Results ── */}
        {result && (
          <div>
            {/* Result header */}
            <div style={{ background: "linear-gradient(135deg,rgba(236,72,153,0.12),rgba(168,85,247,0.08))", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 16, padding: "18px 22px", marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ color: "#c4b5fd", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>KAMPANIA GOTOWA</div>
                  <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>{result.meta.product}</div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 }}>
                    {result.meta.targetMarket} · {result.meta.language} · {result.meta.currency} · {CAMPAIGN_TYPES.find(c => c.value === result.meta.campaignType)?.label}
                  </div>
                  {lastUsage && (
                    <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginTop: 5 }}>
                      Tokeny: <span style={{ color: "#a78bfa" }}>{lastUsage.output_tokens.toLocaleString()} out</span> · {lastUsage.input_tokens.toLocaleString()} in
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {result.campaign.summary.expectedROAS && (
                    <div style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700 }}>ROAS</div>
                      <div style={{ color: "#4ade80", fontSize: 16, fontWeight: 900 }}>{result.campaign.summary.expectedROAS}</div>
                    </div>
                  )}
                  <div style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700 }}>BUDŻET</div>
                    <div style={{ color: "#f59e0b", fontSize: 14, fontWeight: 900 }}>{result.campaign.budget?.monthly_min}–{result.campaign.budget?.monthly_max} {result.meta.currency}</div>
                  </div>
                </div>
              </div>
              {/* Prominent new campaign button */}
              <button onClick={() => setResult(null)} style={{
                width: "100%", padding: "12px 20px", borderRadius: 11,
                border: "1px solid rgba(168,85,247,0.4)",
                background: "rgba(168,85,247,0.15)",
                color: "#c4b5fd", fontWeight: 700, fontSize: 14,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                <Megaphone size={16} /> ← Nowa kampania / zmień budżet
              </button>
            </div>

            {/* ── RAPORT DYSTRYBUCJI ── */}
            {(() => {
              try {
                const c = result.campaign;
                const gExact    = c.ads?.google?.exactKeywords?.length    ?? 0;
                const gBroad    = c.ads?.google?.broadKeywords?.length    ?? 0;
                const gNeg      = c.ads?.google?.negativeKeywords?.length ?? 0;
                const gHeadlines= c.ads?.google?.headlines?.length        ?? 0;
                const gDesc     = c.ads?.google?.descriptions?.length     ?? 0;
                const seoMain   = c.seo?.primaryKeywords?.length          ?? 0;
                const seoLong   = c.seo?.longTailKeywords?.length         ?? 0;
                const seoIdeas  = c.seo?.contentIdeas?.length             ?? 0;
                const igHash    = c.social?.instagram?.hashtags?.length   ?? 0;
                const ttHash    = c.social?.tiktok?.hashtags?.length      ?? 0;
                const ytTags    = c.social?.youtube?.tags?.length         ?? 0;
                const totalKw   = gExact + gBroad + gNeg + seoMain + seoLong;
                const totalHash = igHash + ttHash + ytTags;
                const totalContent = (c.social?.instagram?.caption ? 1 : 0) + (c.social?.facebook?.headline ? 1 : 0) + (c.social?.tiktok?.script ? 1 : 0) + (c.social?.youtube?.title ? 1 : 0) + (c.email?.subject ? 1 : 0) + seoIdeas;
                const topPlatforms = (c.platforms ?? []).slice(0, 4);
                const toStrArr = (arr: any): string[] => Array.isArray(arr) ? arr.map(x => String(x ?? "")).filter(Boolean) : [];
                const allKeywords = [
                  ...toStrArr(c.ads?.google?.exactKeywords),
                  ...toStrArr(c.ads?.google?.broadKeywords),
                  ...toStrArr(c.seo?.primaryKeywords),
                  ...toStrArr(c.seo?.longTailKeywords),
                ];
                const allHashtags = [
                  ...toStrArr(c.social?.instagram?.hashtags),
                  ...toStrArr(c.social?.tiktok?.hashtags),
                ];
                return (
                  <div style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 14, marginBottom: 20, overflow: "hidden" }}>
                    <button onClick={() => setShowReport(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <BarChart2 size={14} color="#4ade80" />
                        <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 800, letterSpacing: 0.3 }}>RAPORT DYSTRYBUCJI KAMPANII</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <span style={{ color: "#4ade80", fontSize: 13, fontWeight: 900 }}>{totalKw} kw</span>
                        <span style={{ color: "#a78bfa", fontSize: 13, fontWeight: 900 }}>{totalHash} #</span>
                        <span style={{ color: "#f5c842", fontSize: 13, fontWeight: 900 }}>{totalContent} treści</span>
                        <ChevronDown size={13} color="rgba(255,255,255,0.3)" style={{ transform: showReport ? "rotate(180deg)" : "none", transition: "0.15s" }} />
                      </div>
                    </button>
                    {showReport && (
                      <div style={{ padding: "0 18px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                        {/* Keywords grid */}
                        <div>
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>SŁOWA KLUCZOWE — ŁĄCZNIE {totalKw}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 7 }}>
                            {[
                              { label: "Google Ads (exact)", count: gExact, color: "#4285f4" },
                              { label: "Google Ads (broad)", count: gBroad, color: "#60a5fa" },
                              { label: "Google Ads (neg.)",  count: gNeg,   color: "#f87171" },
                              { label: "Google headlines",   count: gHeadlines, color: "#93c5fd" },
                              { label: "Google desc.",       count: gDesc,  color: "#bfdbfe" },
                              { label: "SEO primary",        count: seoMain, color: "#4ade80" },
                              { label: "SEO long-tail",      count: seoLong, color: "#86efac" },
                              { label: "SEO content ideas",  count: seoIdeas, color: "#a7f3d0" },
                            ].filter(r => r.count > 0).map(r => (
                              <div key={r.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "8px 11px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{r.label}</span>
                                <span style={{ color: r.color, fontWeight: 900, fontSize: 16, minWidth: 24, textAlign: "right" }}>{r.count}</span>
                              </div>
                            ))}
                          </div>
                          {allKeywords.length > 0 && (
                            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {allKeywords.slice(0, 12).map((kw, i) => (
                                <button key={i} onClick={() => navigator.clipboard.writeText(kw).catch(() => {})}
                                  style={{ padding: "3px 9px", borderRadius: 6, border: "1px solid rgba(74,222,128,0.2)", background: "rgba(74,222,128,0.05)", color: "#86efac", fontSize: 10, cursor: "pointer" }}>
                                  {kw}
                                </button>
                              ))}
                              {allKeywords.length > 12 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, alignSelf: "center" }}>+{allKeywords.length - 12} więcej w zakładkach</span>}
                            </div>
                          )}
                        </div>

                        {/* Hashtags */}
                        {totalHash > 0 && (
                          <div>
                            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>HASHTAGI — ŁĄCZNIE {totalHash}</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 7 }}>
                              {[
                                { label: "Instagram", count: igHash, color: "#f472b6", tags: toStrArr(c.social?.instagram?.hashtags) },
                                { label: "TikTok",    count: ttHash, color: "#a78bfa", tags: toStrArr(c.social?.tiktok?.hashtags) },
                                { label: "YouTube",   count: ytTags, color: "#f87171", tags: toStrArr(c.social?.youtube?.tags) },
                              ].filter(r => r.count > 0).map(r => (
                                <button key={r.label} onClick={() => navigator.clipboard.writeText(r.tags.join(" ")).catch(() => {})}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${r.color}30`, background: `${r.color}08`, color: r.color, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                  {PLATFORM_ICONS[r.label] || "#"} {r.label}: <strong>{r.count}</strong> — 📋 kopiuj
                                </button>
                              ))}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {allHashtags.slice(0, 15).map((h, i) => (
                                <span key={i} style={{ padding: "2px 8px", borderRadius: 5, background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.15)", color: "#c4b5fd", fontSize: 10 }}>{h.startsWith("#") ? h : `#${h}`}</span>
                              ))}
                              {allHashtags.length > 15 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, alignSelf: "center" }}>+{allHashtags.length - 15}</span>}
                            </div>
                          </div>
                        )}

                        {/* Content + platforms */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 7 }}>GOTOWE TREŚCI</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {[
                                { label: "Instagram post", ok: !!c.social?.instagram?.caption },
                                { label: "Facebook ad",    ok: !!c.social?.facebook?.headline },
                                { label: "TikTok script",  ok: !!c.social?.tiktok?.script },
                                { label: "YouTube desc.",  ok: !!c.social?.youtube?.description },
                                { label: "Email template", ok: !!c.email?.subject },
                                { label: "Google Ads copy",ok: gHeadlines > 0 },
                                { label: "Meta Ads copy",  ok: !!c.ads?.meta?.primaryText },
                                { label: "SEO page title", ok: !!c.seo?.pageTitle },
                              ].map(r => (
                                <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.ok ? "#4ade80" : "rgba(255,255,255,0.1)", flexShrink: 0 }} />
                                  <span style={{ color: r.ok ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)", fontSize: 11 }}>{r.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 7 }}>TOP PLATFORMY</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {topPlatforms.map((p, i) => (
                                <div key={String(p.platform ?? i)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, minWidth: 14 }}>{i + 1}.</span>
                                  <span style={{ fontSize: 14 }}>{PLATFORM_ICONS[p.platform] || "📣"}</span>
                                  <span style={{ color: "#fff", fontSize: 11, fontWeight: 600 }}>{p.platform}</span>
                                  {p.expectedCPM && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginLeft: "auto" }}>CPM {p.expectedCPM}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {allKeywords.length > 0 && (
                          <button onClick={() => navigator.clipboard.writeText(allKeywords.join("\n")).catch(() => {})}
                            style={{ width: "100%", padding: "9px", borderRadius: 9, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.07)", color: "#4ade80", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                            📋 Kopiuj wszystkie słowa kluczowe ({allKeywords.length}) — do wklejenia w Google Ads
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              } catch { return null; }
            })()}

            {/* ── SEKCJE KANAŁÓW (accordion) ── */}

            {/* helper styles */}
            {(() => {
              const Ch = ({ id, icon, label, subtitle, description, color, status, count, children }: {
                id: string; icon: string; label: string; subtitle?: string; description?: string; color: string;
                status: "done" | "missing" | "generator"; count?: string; children: React.ReactNode;
              }) => {
                const open = openChannels[id];
                const statusLabel = status === "done" ? "✓ GOTOWE" : status === "generator" ? "⚡ GENERATOR" : "— BRAK";
                const statusColor = status === "done" ? "#4ade80" : status === "generator" ? "#a78bfa" : "rgba(255,255,255,0.2)";
                const statusBg = status === "done" ? "rgba(74,222,128,0.1)" : status === "generator" ? "rgba(167,139,250,0.1)" : "rgba(255,255,255,0.04)";
                return (
                  <div style={{ border: `1px solid ${open ? color + "40" : "rgba(255,255,255,0.08)"}`, borderRadius: 14, marginBottom: 10, overflow: "hidden", transition: "border-color 0.2s" }}>
                    <button onClick={() => toggleCh(id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: open ? `${color}08` : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}35`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
                        <div>
                          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{label}</div>
                          {subtitle && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ background: statusBg, color: statusColor, borderRadius: 99, padding: "3px 9px", fontSize: 10, fontWeight: 700 }}>{statusLabel}</span>
                        {count && <span style={{ color, fontSize: 12, fontWeight: 700 }}>{count}</span>}
                        <ChevronDown size={14} color="rgba(255,255,255,0.3)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "0.15s", flexShrink: 0 }} />
                      </div>
                    </button>
                    {open && (
                      <div style={{ padding: "4px 18px 20px", borderTop: `1px solid ${color}20` }}>
                        {description && (
                          <div style={{ background: `${color}09`, border: `1px solid ${color}22`, borderRadius: 10, padding: "10px 14px", margin: "12px 0 16px", color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.65 }}>
                            {description}
                          </div>
                        )}
                        {children}
                      </div>
                    )}
                  </div>
                );
              };

              const summary = result.campaign?.summary ?? {} as any;
              const audience = result.campaign?.audience ?? {} as any;
              const platforms: any[] = result.campaign?.platforms ?? [];
              const budget = result.campaign?.budget ?? {} as any;
              const social = result.campaign?.social ?? {} as any;
              const ads = result.campaign?.ads ?? {} as any;
              const emailData = result.campaign?.email ?? {} as any;
              const seo = result.campaign?.seo ?? {} as any;

              return (
                <div>

                  {/* ── 1. STRATEGIA ── */}
                  <Ch id="strategia" icon="📊" label="Strategia & Rynek" subtitle={`${result.meta.targetMarket} · ROAS ${summary.expectedROAS ?? "–"}`} description="Analiza rynku i konkurencji dla Twojego produktu. Claude identyfikuje grupę docelową, najważniejsze platformy i unikalną przewagę (USP) — podstawa całej kampanii." color="#a78bfa" status="done" count={`${platforms?.length ?? 0} platform`}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
                      <div style={{ gridColumn: "1/-1", background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.18)", borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 6 }}>ANALIZA RYNKU</div>
                        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.7, marginBottom: 10 }}>{summary.marketOverview}</div>
                        <div style={{ background: "rgba(168,85,247,0.12)", borderRadius: 9, padding: "9px 13px", marginBottom: 10 }}>
                          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700, marginBottom: 3 }}>UNIQUE SELLING POINT</div>
                          <div style={{ color: "#c4b5fd", fontSize: 13, fontWeight: 600 }}>{summary.uniqueSellingPoint}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ flex: 1, minWidth: 130, background: "rgba(74,222,128,0.07)", borderRadius: 8, padding: "7px 10px" }}>
                            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700 }}>SEZONOWOŚĆ</div>
                            <div style={{ color: "#4ade80", fontSize: 12, marginTop: 2 }}>{summary.seasonality}</div>
                          </div>
                          {summary.complianceNote && (
                            <div style={{ flex: 1, minWidth: 130, background: "rgba(245,158,11,0.07)", borderRadius: 8, padding: "7px 10px" }}>
                              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700 }}>COMPLIANCE</div>
                              <div style={{ color: "#fbbf24", fontSize: 12, marginTop: 2 }}>{summary.complianceNote}</div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.14)", borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 8 }}>GRUPA DOCELOWA</div>
                        {[["Wiek", audience.ageRange], ["Płeć", audience.gender], ["Dochód", audience.income]].map(([l, v]) => v && (
                          <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{l}</span>
                            <span style={{ color: "#93c5fd", fontSize: 11, fontWeight: 600 }}>{v}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                          {audience.interests?.map(i => <span key={i} style={{ background: "rgba(96,165,250,0.1)", borderRadius: 99, padding: "2px 8px", color: "#93c5fd", fontSize: 10 }}>{i}</span>)}
                        </div>
                      </div>
                      <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.14)", borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 8 }}>TOP PLATFORMY</div>
                        {platforms?.sort((a, b) => a.priority - b.priority).slice(0, 4).map(p => (
                          <div key={p.platform} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 14 }}>{PLATFORM_ICONS[p.platform] ?? "📣"}</span>
                              <span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>{p.platform}</span>
                              <span style={{ background: "rgba(245,158,11,0.15)", borderRadius: 4, padding: "0 5px", color: "#f5c842", fontSize: 9, fontWeight: 700 }}>#{p.priority}</span>
                            </div>
                            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>CPM {p.expectedCPM}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ gridColumn: "1/-1", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.14)", borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 6 }}>BUDŻET MIESIĘCZNY</div>
                        <div style={{ color: "#f59e0b", fontSize: 22, fontWeight: 900, marginBottom: 8 }}>{budget.monthly_min}–{budget.monthly_max} {result.meta.currency}</div>
                        {budget.allocation && (
                          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                            {Object.entries(budget.allocation).map(([ch, pct]) => (
                              <div key={ch} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "5px 10px", textAlign: "center" }}>
                                <div style={{ color: "#f5c842", fontWeight: 700, fontSize: 12 }}>{String(pct)}</div>
                                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>{ch.replace("_", " ")}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {budget.tip && <div style={{ marginTop: 10, color: "rgba(255,200,80,0.65)", fontSize: 11, fontStyle: "italic" }}>💡 {budget.tip}</div>}
                      </div>
                      {result.campaign.localInsights && (
                        <div style={{ gridColumn: "1/-1", background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.18)", borderRadius: 12, padding: "12px 14px" }}>
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 5 }}>LOKALNE INSIGHTY — {result.meta.targetMarket}</div>
                          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 1.7 }}>{result.campaign.localInsights}</div>
                        </div>
                      )}
                    </div>
                  </Ch>

                  {/* ── 2. INSTAGRAM ── */}
                  <Ch id="instagram" icon="📸" label="Instagram" subtitle="Caption · Hashtagi · Visual idea" description="Post na Instagram z angażującym captionem, zestawem hashtagów i pomysłem na grafikę. Trafia do obserwujących i nowych odbiorców przez algorytm — idealny dla produktów wizualnych i lifestyle." color="#ec4899"
                    status={social?.instagram?.caption ? "done" : "missing"}
                    count={social?.instagram?.hashtags?.length ? `${social.instagram.hashtags.length} #` : undefined}>
                    {social?.instagram && (
                      <div style={{ marginTop: 14 }}>
                        {social.instagram.format && <span style={{ background: "rgba(236,72,153,0.15)", borderRadius: 99, padding: "2px 8px", color: "#f472b6", fontSize: 10, marginBottom: 10, display: "inline-block" }}>{social.instagram.format}</span>}
                        <Block label="CAPTION"><TextCard text={social.instagram.caption} id="ig_caption" /></Block>
                        <Block label="HASHTAGI">
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                            {social.instagram.hashtags?.map(h => <span key={h} style={{ background: "rgba(236,72,153,0.1)", borderRadius: 99, padding: "3px 10px", color: "#f9a8d4", fontSize: 11 }}>{h}</span>)}
                          </div>
                          <CopyBtn text={social.instagram.hashtags?.join(" ")} id="ig_hash" />
                        </Block>
                        {social.instagram.visualIdea && <Block label="IDEA WIZUALNA"><div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.6, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px" }}>{social.instagram.visualIdea}</div></Block>}
                        {social.instagram.cta && <Block label="CTA"><div style={{ color: "#f472b6", fontSize: 13, fontWeight: 600 }}>{social.instagram.cta}</div></Block>}
                      </div>
                    )}
                  </Ch>

                  {/* ── 3. FACEBOOK ── */}
                  <Ch id="facebook" icon="📘" label="Facebook" subtitle="Headline · Primary text · Audience note" description="Post organiczny na Facebooku z nagłówkiem i treścią przekonującą do zakupu. Najlepszy zasięg wśród grupy 25–55 lat — szczególnie skuteczny dla produktów domowych, gadżetów i ofert B2C." color="#3b82f6"
                    status={social?.facebook?.headline ? "done" : "missing"}>
                    {social?.facebook && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                          <Block label="HEADLINE"><TextCard text={social.facebook.headline} id="fb_h" /></Block>
                          <Block label="LINK DESCRIPTION"><TextCard text={social.facebook.linkDescription} id="fb_ld" /></Block>
                        </div>
                        <Block label="PRIMARY TEXT"><TextCard text={social.facebook.primaryText} id="fb_pt" /></Block>
                        {social.facebook.audienceNote && <div style={{ color: "rgba(96,165,250,0.8)", fontSize: 12, fontStyle: "italic", marginTop: 8 }}>🎯 {social.facebook.audienceNote}</div>}
                      </div>
                    )}
                  </Ch>

                  {/* ── 4. TIKTOK ── */}
                  <Ch id="tiktok" icon="🎵" label="TikTok" subtitle="Hook · Skrypt · Hashtagi · Muzyka" description="Krótki skrypt wideo z silnym hookiem (pierwsze 3 sekundy), muzyką i hashtagami. Algorytm TikToka promuje nowych twórców — możliwy zasięg viralowy bez budżetu reklamowego." color="#f472b6"
                    status={social?.tiktok?.script ? "done" : "missing"}
                    count={social?.tiktok?.hashtags?.length ? `${social.tiktok.hashtags.length} #` : undefined}>
                    {social?.tiktok && (
                      <div style={{ marginTop: 14 }}>
                        <Block label="HOOK — pierwsze 3 sekundy">
                          <div style={{ background: "rgba(236,72,153,0.1)", border: "1px solid rgba(236,72,153,0.25)", borderRadius: 10, padding: "12px 14px", position: "relative" }}>
                            <div style={{ position: "absolute", top: 8, right: 8 }}><CopyBtn text={social.tiktok.hook} id="tt_hook" /></div>
                            <div style={{ color: "#f9a8d4", fontSize: 14, fontWeight: 700, paddingRight: 80 }}>{social.tiktok.hook}</div>
                          </div>
                        </Block>
                        <Block label="SKRYPT WIDEO"><TextCard text={social.tiktok.script} id="tt_script" /></Block>
                        <div style={{ display: "flex", gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <Block label="HASHTAGI">
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                {social.tiktok.hashtags?.map(h => <span key={h} style={{ background: "rgba(236,72,153,0.1)", borderRadius: 99, padding: "3px 10px", color: "#f9a8d4", fontSize: 11 }}>{h}</span>)}
                              </div>
                              <div style={{ marginTop: 6 }}><CopyBtn text={social.tiktok.hashtags?.join(" ")} id="tt_hash_all" /></div>
                            </Block>
                          </div>
                          <div style={{ flex: 1 }}>
                            <Block label="MUZYKA / NASTRÓJ">
                              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{social.tiktok.musicMood}</div>
                            </Block>
                          </div>
                        </div>
                        {social.tiktok.trendSuggestion && <div style={{ color: "rgba(236,72,153,0.7)", fontSize: 12, fontStyle: "italic", marginTop: 4 }}>💡 Trend: {social.tiktok.trendSuggestion}</div>}
                      </div>
                    )}
                  </Ch>

                  {/* ── 5. YOUTUBE ── */}
                  <Ch id="youtube" icon="▶️" label="YouTube" subtitle="Tytuł · Opis · Tagi" description="Tytuł SEO, opis i tagi do filmiku na YouTube. Wideo rankuje w wyszukiwarce miesiącami — długoterminowy darmowy ruch. Idealne do recenzji, unboxingów i tutoriali produktu." color="#ef4444"
                    status={social?.youtube?.title ? "done" : "missing"}
                    count={social?.youtube?.tags?.length ? `${social.youtube.tags.length} tagów` : undefined}>
                    {social?.youtube && (
                      <div style={{ marginTop: 14 }}>
                        <Block label="TYTUŁ WIDEO"><TextCard text={social.youtube.title} id="yt_title" /></Block>
                        <Block label="OPIS"><TextCard text={social.youtube.description} id="yt_desc" /></Block>
                        {social.youtube.tags?.length > 0 && (
                          <Block label="TAGI">
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              {social.youtube.tags.map(t => <span key={t} style={{ background: "rgba(239,68,68,0.1)", borderRadius: 99, padding: "3px 10px", color: "#fca5a5", fontSize: 11 }}>{t}</span>)}
                            </div>
                            <div style={{ marginTop: 6 }}><CopyBtn text={social.youtube.tags.join(", ")} id="yt_tags_all" /></div>
                          </Block>
                        )}
                      </div>
                    )}
                  </Ch>

                  {/* ── 6. GOOGLE ADS ── */}
                  <Ch id="google" icon="🔍" label="Google Ads" subtitle="Nagłówki · Opisy · Słowa kluczowe" description="Nagłówki i opisy do kampanii Search + lista słów kluczowych. Trafia do osób aktywnie szukających produktu w Google — najwyższa intencja zakupowa, najlepsza konwersja." color="#4285f4"
                    status={ads?.google?.headlines?.length ? "done" : "missing"}
                    count={ads?.google?.exactKeywords?.length ? `${(ads.google.exactKeywords?.length ?? 0) + (ads.google.broadKeywords?.length ?? 0)} kw` : undefined}>
                    {ads?.google && (
                      <div style={{ marginTop: 14 }}>
                        {ads.google.bidStrategy && <div style={{ marginBottom: 10 }}><span style={{ background: "rgba(96,165,250,0.1)", borderRadius: 99, padding: "3px 10px", color: "#93c5fd", fontSize: 11 }}>{ads.google.bidStrategy}</span></div>}
                        {ads.google.shoppingFeedTitle && <Block label="TYTUŁ GOOGLE SHOPPING"><TextCard text={ads.google.shoppingFeedTitle} id="g_shop" /></Block>}
                        <Block label="NAGŁÓWKI (max 30 znaków)">
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {ads.google.headlines?.map((h, i) => (
                              <div key={i} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ color: "#60a5fa", fontSize: 13 }}>{h}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ color: h.length > 30 ? "#f87171" : "rgba(255,255,255,0.2)", fontSize: 10 }}>{h.length}/30</span>
                                  <CopyBtn text={h} id={`g_h${i}`} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </Block>
                        <Block label="OPISY (max 90 znaków)">
                          {ads.google.descriptions?.map((d, i) => (
                            <div key={i} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, flex: 1, marginRight: 8 }}>{d}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                <span style={{ color: d.length > 90 ? "#f87171" : "rgba(255,255,255,0.2)", fontSize: 10 }}>{d.length}/90</span>
                                <CopyBtn text={d} id={`g_d${i}`} />
                              </div>
                            </div>
                          ))}
                        </Block>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                          <Block label="✅ DOKŁADNE">
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {ads.google.exactKeywords?.map(k => (
                                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ color: "#4ade80", fontSize: 11 }}>[{k}]</span>
                                  <CopyBtn text={k} id={`kw_ex_${k}`} />
                                </div>
                              ))}
                            </div>
                          </Block>
                          <Block label="🌐 SZEROKIE">
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {ads.google.broadKeywords?.map(k => (
                                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ color: "#f5c842", fontSize: 11 }}>{k}</span>
                                  <CopyBtn text={k} id={`kw_br_${k}`} />
                                </div>
                              ))}
                            </div>
                          </Block>
                          <Block label="❌ WYKLUCZAJĄCE">
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {ads.google.negativeKeywords?.map(k => (
                                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ color: "#f87171", fontSize: 11 }}>−{k}</span>
                                  <CopyBtn text={k} id={`kw_neg_${k}`} />
                                </div>
                              ))}
                            </div>
                          </Block>
                        </div>
                        {ads.google.exactKeywords?.length > 0 && (
                          <button onClick={() => { const all = [...(ads.google.exactKeywords ?? []), ...(ads.google.broadKeywords ?? [])].join("\n"); navigator.clipboard.writeText(all).catch(() => {}); setCopied(p => ({ ...p, "g_all": true })); setTimeout(() => setCopied(p => ({ ...p, "g_all": false })), 2000); }}
                            style={{ marginTop: 10, width: "100%", padding: "9px", borderRadius: 9, border: "1px solid rgba(66,133,244,0.3)", background: "rgba(66,133,244,0.07)", color: "#93c5fd", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                            {copied["g_all"] ? "✓ Skopiowano!" : `📋 Kopiuj wszystkie słowa kluczowe (${(ads.google.exactKeywords?.length ?? 0) + (ads.google.broadKeywords?.length ?? 0)})`}
                          </button>
                        )}
                      </div>
                    )}
                  </Ch>

                  {/* ── 7. META ADS ── */}
                  <Ch id="meta" icon="📣" label="Meta Ads" subtitle="Facebook Ads · Instagram Ads" description="Gotowe copy do płatnych reklam w systemie Meta (Facebook + Instagram Ads). Primary text, nagłówek i CTA dostosowane do cold traffic — docierasz do nowych odbiorców według zainteresowań." color="#1877f2"
                    status={ads?.meta?.primaryText ? "done" : "missing"}>
                    {ads?.meta && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                          <Block label="HEADLINE"><TextCard text={ads.meta.headline} id="meta_h" /></Block>
                          <Block label="DESCRIPTION"><TextCard text={ads.meta.description} id="meta_d" /></Block>
                        </div>
                        <Block label="PRIMARY TEXT"><TextCard text={ads.meta.primaryText} id="meta_pt" /></Block>
                        {ads.meta.audienceTargeting && <div style={{ color: "rgba(96,165,250,0.7)", fontSize: 12, fontStyle: "italic", marginTop: 8 }}>🎯 Targeting: {ads.meta.audienceTargeting}</div>}
                        {ads.meta.lookalike && <div style={{ color: "rgba(96,165,250,0.5)", fontSize: 12, marginTop: 4 }}>👥 Lookalike: {ads.meta.lookalike}</div>}
                        {ads.meta.cta && <Block label="CTA BUTTON"><div style={{ display: "inline-block", background: "linear-gradient(135deg,#1877f2,#0a52cc)", borderRadius: 9, padding: "10px 24px" }}><span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{ads.meta.cta}</span></div></Block>}
                      </div>
                    )}
                  </Ch>

                  {/* ── 8. EMAIL MARKETING ── */}
                  <Ch id="email" icon="📧" label="Email Marketing" subtitle="Temat · Preheader · Treść · CTA" description="Temat wiadomości, preheader i pełna treść emaila z CTA. Wysyłasz do własnej listy subskrybentów — konwersja 3–5%, zero kosztu emisji. Najlepszy stosunek kosztów do wyników." color="#60a5fa"
                    status={emailData?.subject ? "done" : "missing"}>
                    {emailData && (
                      <div style={{ marginTop: 14 }}>
                        <Block label="TEMAT — A/B test (wybierz jeden)">
                          {emailData.subject?.split("|").map((s, i) => (
                            <div key={i} style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 9, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ color: "#93c5fd", fontWeight: 600, fontSize: 14 }}>{s.trim()}</span>
                              <CopyBtn text={s.trim()} id={`em_sub${i}`} />
                            </div>
                          ))}
                        </Block>
                        <Block label="PREHEADER"><TextCard text={emailData.preheader} id="em_pre" /></Block>
                        <Block label="TREŚĆ EMAILA"><TextCard text={emailData.body} id="em_body" /></Block>
                        <Block label="CTA BUTTON">
                          <div style={{ display: "inline-block", background: "linear-gradient(135deg,#ec4899,#a855f7)", borderRadius: 9, padding: "10px 24px" }}>
                            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{emailData.cta}</span>
                          </div>
                        </Block>
                      </div>
                    )}
                  </Ch>

                  {/* ── 9. SEO ── */}
                  <Ch id="seo" icon="🔎" label="SEO" subtitle="Page title · Meta · Słowa kluczowe · Content ideas" description="Tytuł strony, meta opis i słowa kluczowe zoptymalizowane pod Google + pomysły na artykuły blogowe. Bezpłatny ruch organiczny — efekty widoczne po 2–3 miesiącach." color="#4ade80"
                    status={seo?.pageTitle ? "done" : "missing"}
                    count={seo ? `${(seo.primaryKeywords?.length ?? 0) + (seo.longTailKeywords?.length ?? 0)} kw` : undefined}>
                    {seo && (
                      <div style={{ marginTop: 14 }}>
                        <Block label="PAGE TITLE (max 60 znaków)">
                          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 9, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ color: "#60a5fa", fontSize: 14, fontWeight: 600, flex: 1, marginRight: 8 }}>{seo.pageTitle}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                              <span style={{ color: (seo.pageTitle?.length ?? 0) > 60 ? "#f87171" : "rgba(255,255,255,0.25)", fontSize: 10 }}>{seo.pageTitle?.length ?? 0}/60</span>
                              <CopyBtn text={seo.pageTitle} id="seo_title" />
                            </div>
                          </div>
                        </Block>
                        <Block label="META DESCRIPTION (max 155 znaków)">
                          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 9, padding: "10px 14px", display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{seo.metaDescription}</span>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                              <span style={{ color: (seo.metaDescription?.length ?? 0) > 155 ? "#f87171" : "rgba(255,255,255,0.25)", fontSize: 10 }}>{seo.metaDescription?.length ?? 0}/155</span>
                              <CopyBtn text={seo.metaDescription} id="seo_desc" />
                            </div>
                          </div>
                        </Block>
                        {seo.h1 && <Block label="H1"><TextCard text={seo.h1} id="seo_h1" /></Block>}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <Block label="SŁOWA GŁÓWNE">
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {seo.primaryKeywords?.map(k => <span key={k} style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 99, padding: "3px 10px", color: "#4ade80", fontSize: 11 }}>{k}</span>)}
                            </div>
                          </Block>
                          <Block label="DŁUGI OGON">
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {seo.longTailKeywords?.map(k => <span key={k} style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>• {k}</span>)}
                            </div>
                          </Block>
                        </div>
                        {seo.contentIdeas?.length > 0 && (
                          <Block label="POMYSŁY NA CONTENT">
                            {seo.contentIdeas.map(c => (
                              <div key={c} style={{ background: "rgba(168,85,247,0.07)", borderRadius: 8, padding: "8px 12px", marginBottom: 6, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>💡 {c}</div>
                            ))}
                          </Block>
                        )}
                      </div>
                    )}
                  </Ch>

                  {/* ── 10. PLAN KAMPANII ── */}
                  <Ch id="plan" icon="📅" label="Plan Kampanii" subtitle="Tygodniowy harmonogram działań" description="Gotowy harmonogram: kiedy i co robić w każdym tygodniu kampanii. Budżet, priorytety platform i kamienie milowe — wiesz dokładnie co masz zrobić bez zgadywania." color="#f59e0b"
                    status={result.campaign.launchPlan?.length ? "done" : "missing"}
                    count={result.campaign.launchPlan?.length ? `${result.campaign.launchPlan.length} tygodnie` : undefined}>
                    <div style={{ marginTop: 14 }}>
                      {result.campaign.launchPlan?.map(week => (
                        <div key={week.week} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 30, height: 30, borderRadius: 7, background: "linear-gradient(135deg,#ec4899,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <span style={{ color: "#fff", fontWeight: 900, fontSize: 12 }}>{week.week}</span>
                              </div>
                              <div>
                                <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>Tydzień {week.week}</div>
                                <div style={{ color: "#c4b5fd", fontSize: 11 }}>{week.focus}</div>
                              </div>
                            </div>
                            <span style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 7, padding: "3px 10px", color: "#f59e0b", fontWeight: 700, fontSize: 11 }}>{week.budget_pct}</span>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                            {week.platforms?.map(p => <span key={p} style={{ background: "rgba(168,85,247,0.1)", borderRadius: 99, padding: "2px 8px", color: "#c4b5fd", fontSize: 10 }}>{PLATFORM_ICONS[p] ?? ""} {p}</span>)}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {week.actions?.map(a => <div key={a} style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>→ {a}</div>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Ch>

                  {/* ── 11. INFLUENCERZY ── */}
                  <Ch id="influencer" icon="👥" label="Influencer Marketing" subtitle="Generator: profil · outreach · brief · wynagrodzenie" description="Profil idealnego influencera (nisza, liczba followersów, platformy), wiadomość outreach do wysłania oraz brief ze wskazówkami dla twórcy. Claude dopasowuje do Twojego budżetu i produktu." color="#8b5cf6"
                    status={influencer ? "done" : "generator"}>
                    <div style={{ marginTop: 14 }}>
                    {!influencer ? (
                      <div style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 12, padding: "22px 20px", textAlign: "center" }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 5 }}>Kit Influencer Marketingu</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 14 }}>AI stworzy profil idealnego influencera, wiadomość outreach, brief i propozycję współpracy.</div>
                        {influencerError && <div style={{ background: "rgba(248,113,113,0.1)", borderRadius: 9, padding: "8px 14px", marginBottom: 12, color: "#fca5a5", fontSize: 12 }}><AlertCircle size={12} style={{ marginRight: 6, verticalAlign: "middle" }} />{influencerError}</div>}
                        <button onClick={genInfluencer} disabled={influencerLoading} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 24px", borderRadius: 10, border: "none", background: influencerLoading ? "rgba(168,85,247,0.2)" : "linear-gradient(135deg,#a855f7,#7c3aed)", color: influencerLoading ? "rgba(255,255,255,0.4)" : "#fff", fontWeight: 700, fontSize: 13, cursor: influencerLoading ? "not-allowed" : "pointer" }}>
                          {influencerLoading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Generuję…</> : <><Users size={14} /> Generuj kit influencer</>}
                        </button>
                      </div>
                    ) : (
                  <div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                      <button onClick={() => { setInfluencer(null); setInfluencerError(null); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer" }}>↺ Regeneruj</button>
                    </div>
                    <Block label="IDEALNY PROFIL INFLUENCERA">
                      <div style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 10, padding: "12px 14px", color: "#c4b5fd", fontSize: 13, lineHeight: 1.6 }}>{influencer.idealProfile}</div>
                    </Block>
                    <Block label="TEMAT WIADOMOŚCI DO INFLUENCERA">
                      <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ color: "#c4b5fd", fontWeight: 600, fontSize: 14 }}>{influencer.outreachSubject}</span>
                        <CopyBtn text={influencer.outreachSubject} id="inf_subj" />
                      </div>
                    </Block>
                    <Block label="TREŚĆ WIADOMOŚCI OUTREACH"><TextCard text={influencer.outreachBody} id="inf_body" /></Block>
                    <Block label="BRIEF TREŚCI">
                      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px", color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.6, position: "relative" }}>
                        <div style={{ position: "absolute", top: 8, right: 8 }}><CopyBtn text={influencer.brief} id="inf_brief" /></div>
                        <div style={{ paddingRight: 80, whiteSpace: "pre-wrap" }}>{influencer.brief}</div>
                      </div>
                    </Block>
                    <Block label="WYNAGRODZENIE / WSPÓŁPRACA">
                      <div style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, padding: "12px 14px", color: "#4ade80", fontSize: 13 }}>{influencer.compensation}</div>
                    </Block>
                  </div>
                )}
                </div>
                  </Ch>

                  {/* ── 12. SEKWENCJA EMAIL ── */}
                  <Ch id="sequence" icon="📨" label="Sekwencja Email (5 wiadomości)" subtitle="Generator: drip kampania follow-up" description="5 emaili w kolejności: powitanie → edukacja → dowód społeczny → oferta główna → urgency/last chance. Automatyzuje sprzedaż po zapisaniu się do listy — wyślij raz, działa non-stop." color="#6366f1"
                    status={emailSeq.length > 0 ? "done" : "generator"}
                    count={emailSeq.length > 0 ? `${emailSeq.length} emaile` : undefined}>
                    <div style={{ marginTop: 14 }}>
                    {emailSeq.length === 0 ? (
                      <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 12, padding: "22px 20px", textAlign: "center" }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 5 }}>5-emailowa sekwencja drip</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 14 }}>AI stworzy kompletną sekwencję follow-up dostosowaną do Twojego produktu i rynku.</div>
                        {emailSeqError && <div style={{ background: "rgba(248,113,113,0.1)", borderRadius: 9, padding: "8px 14px", marginBottom: 12, color: "#fca5a5", fontSize: 12 }}><AlertCircle size={12} style={{ marginRight: 6, verticalAlign: "middle" }} />{emailSeqError}</div>}
                        <button onClick={genEmailSeq} disabled={emailSeqLoading} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 24px", borderRadius: 10, border: "none", background: emailSeqLoading ? "rgba(96,165,250,0.2)" : "linear-gradient(135deg,#3b82f6,#6366f1)", color: emailSeqLoading ? "rgba(255,255,255,0.4)" : "#fff", fontWeight: 700, fontSize: 13, cursor: emailSeqLoading ? "not-allowed" : "pointer" }}>
                          {emailSeqLoading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Generuję…</> : <><Mail size={14} /> Generuj sekwencję email</>}
                        </button>
                      </div>
                    ) : (
                  <div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                      <button onClick={() => { setEmailSeq([]); setEmailSeqError(null); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer" }}>↺ Regeneruj</button>
                    </div>
                    {emailSeq.map((email: any, i: number) => (
                      <div key={i} style={{ background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 14, padding: "18px 20px", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                          <div style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", borderRadius: 8, padding: "4px 12px", color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{email.timing}</div>
                          <div style={{ color: "#93c5fd", fontSize: 13, fontWeight: 600 }}>{email.goal}</div>
                        </div>
                        <Block label="TEMAT">
                          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ color: "#60a5fa", fontWeight: 600, fontSize: 13 }}>{email.subject}</span>
                            <CopyBtn text={email.subject} id={`seq_sub${i}`} />
                          </div>
                        </Block>
                        <Block label="PREHEADER">
                          <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>{email.preheader}</span>
                            <CopyBtn text={email.preheader} id={`seq_pre${i}`} />
                          </div>
                        </Block>
                        <Block label="TREŚĆ EMAILA">
                          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, overflow: "hidden" }}>
                            <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <button onClick={() => setEmailSeqExpanded(prev => ({ ...prev, [i]: !prev[i] }))} style={{ background: "none", border: "none", color: "#93c5fd", fontSize: 12, cursor: "pointer", padding: 0 }}>
                                {emailSeqExpanded[i] ? "▲ Zwiń" : "▼ Rozwiń treść"}
                              </button>
                              <CopyBtn text={email.body} id={`seq_body${i}`} />
                            </div>
                            {emailSeqExpanded[i] && <div style={{ padding: "0 14px 14px", color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{email.body}</div>}
                          </div>
                        </Block>
                        <div style={{ display: "inline-block", background: "linear-gradient(135deg,#3b82f6,#6366f1)", borderRadius: 8, padding: "8px 20px" }}>
                          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{email.cta}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                    </div>
                  </Ch>

                  {/* ── 13. LANDING PAGE ── */}
                  <Ch id="landing" icon="🌐" label="Landing Page" subtitle="Generator: hero · problem · solution · FAQ · CTA" description="Kompletna struktura strony sprzedażowej: hero z USP, sekcja problemu, rozwiązanie, korzyści, dowód społeczny, FAQ i CTA. Wklejasz do Webflow, WordPress lub Shopify — gotowe do konwersji." color="#22c55e"
                    status={landingPage ? "done" : "generator"}>
                    <div style={{ marginTop: 14 }}>
                    {!landingPage ? (
                      <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: "22px 20px", textAlign: "center" }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 5 }}>Landing Page Copy</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 14 }}>AI wygeneruje kompletny tekst strony — hero, problem, rozwiązanie, social proof, FAQ i CTA.</div>
                        {landingError && <div style={{ background: "rgba(248,113,113,0.1)", borderRadius: 9, padding: "8px 14px", marginBottom: 12, color: "#fca5a5", fontSize: 12 }}><AlertCircle size={12} style={{ marginRight: 6, verticalAlign: "middle" }} />{landingError}</div>}
                        <button onClick={genLanding} disabled={landingLoading} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 24px", borderRadius: 10, border: "none", background: landingLoading ? "rgba(34,197,94,0.2)" : "linear-gradient(135deg,#22c55e,#16a34a)", color: landingLoading ? "rgba(255,255,255,0.4)" : "#fff", fontWeight: 700, fontSize: 13, cursor: landingLoading ? "not-allowed" : "pointer" }}>
                          {landingLoading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Generuję…</> : <><Globe size={14} /> Generuj landing page</>}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                          <button onClick={() => { setLandingPage(null); setLandingError(null); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer" }}>↺ Regeneruj</button>
                        </div>

                        {/* Hero */}
                    {landingPage.hero && (
                      <div style={{ background: "linear-gradient(135deg,rgba(34,197,94,0.08),rgba(16,163,74,0.05))", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 14, padding: "20px 22px", marginBottom: 12 }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 12 }}>HERO SECTION</div>
                        <Block label="HEADLINE">
                          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 9, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ color: "#22c55e", fontWeight: 800, fontSize: 18 }}>{landingPage.hero.headline}</span>
                            <CopyBtn text={landingPage.hero.headline} id="lp_hero_h" />
                          </div>
                        </Block>
                        <Block label="SUBHEADLINE"><TextCard text={landingPage.hero.subheadline} id="lp_hero_sub" /></Block>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          <div style={{ display: "inline-block", background: "linear-gradient(135deg,#22c55e,#16a34a)", borderRadius: 9, padding: "10px 24px" }}>
                            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{landingPage.hero.cta}</span>
                          </div>
                          {landingPage.hero.socialProofLine && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>✓ {landingPage.hero.socialProofLine}</span>}
                        </div>
                      </div>
                    )}

                    {/* Problem */}
                    {landingPage.problem && (
                      <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 14, padding: "20px 22px", marginBottom: 12 }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 10 }}>PROBLEM SECTION</div>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{landingPage.problem.heading}</div>
                        {landingPage.problem.points?.map((p: string, i: number) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                            <span style={{ color: "#f87171", fontWeight: 700 }}>✗</span>
                            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{p}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Solution */}
                    {landingPage.solution && (
                      <div style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 14, padding: "20px 22px", marginBottom: 12 }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 10 }}>SOLUTION SECTION</div>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 10 }}>{landingPage.solution.heading}</div>
                        <Block label="OPIS"><TextCard text={landingPage.solution.description} id="lp_sol_desc" /></Block>
                        {landingPage.solution.bullets?.map((b: string, i: number) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                            <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span>
                            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{b}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Features */}
                    {landingPage.features?.length > 0 && (
                      <div style={{ background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: 14, padding: "20px 22px", marginBottom: 12 }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 14 }}>FEATURES SECTION</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          {landingPage.features.map((f: any, i: number) => (
                            <div key={i} style={{ background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: 10, padding: "14px 16px" }}>
                              <div style={{ fontSize: 22, marginBottom: 8 }}>{f.emoji}</div>
                              <div style={{ color: "#c4b5fd", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{f.title}</div>
                              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.5 }}>{f.desc}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Social proof */}
                    {landingPage.socialProof && (
                      <div style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 14, padding: "20px 22px", marginBottom: 12 }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 10 }}>SOCIAL PROOF</div>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{landingPage.socialProof.heading}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {landingPage.socialProof.testimonials?.map((t: any, i: number) => (
                            <div key={i} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "14px 16px" }}>
                              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.6, marginBottom: 8, fontStyle: "italic" }}>"{t.text}"</div>
                              <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700 }}>{t.author}</div>
                              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{t.role}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* FAQ */}
                    {landingPage.faq?.length > 0 && (
                      <div style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 14, padding: "20px 22px", marginBottom: 12 }}>
                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 14 }}>FAQ</div>
                        {landingPage.faq.map((item: any, i: number) => (
                          <div key={i} style={{ borderBottom: i < landingPage.faq.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none", paddingBottom: 12, marginBottom: 12 }}>
                            <button onClick={() => setFaqExpanded(prev => ({ ...prev, [i]: !prev[i] }))} style={{ background: "none", border: "none", color: "#a5b4fc", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, textAlign: "left", width: "100%" }}>
                              {faqExpanded[i] ? "▲" : "▶"} {item.q}
                            </button>
                            {faqExpanded[i] && <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 1.6, marginTop: 8, paddingLeft: 16 }}>{item.a}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Final CTA */}
                    {landingPage.finalCta && (
                      <div style={{ background: "linear-gradient(135deg,rgba(34,197,94,0.1),rgba(16,163,74,0.07))", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 14, padding: "24px 22px", textAlign: "center" }}>
                        <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, marginBottom: 8 }}>{landingPage.finalCta.headline}</div>
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 20 }}>{landingPage.finalCta.subtext}</div>
                        <div style={{ display: "inline-block", background: "linear-gradient(135deg,#22c55e,#16a34a)", borderRadius: 11, padding: "14px 36px" }}>
                          <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{landingPage.finalCta.cta}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                    </div>
                  </Ch>

                  {/* ── 14. KALENDARZ 30 DNI ── */}
                  <Ch id="calendar" icon="📆" label="Kalendarz 30 dni" subtitle="Generator: dzienny plan TikTok · IG · FB · YT" description="Dzienny plan publikacji na 30 dni: która platforma, jaki typ treści, godzina publikacji i hook. Eliminuje pytanie 'co dziś wrzucić' — masz gotowy plan na cały miesiąc." color="#ec4899"
                    status={calendar.length > 0 ? "done" : "generator"}
                    count={calendar.length > 0 ? `${calendar.length} dni` : undefined}>
                    <div style={{ marginTop: 14 }}>
                    {calendar.length === 0 ? (
                      <div style={{ background: "rgba(236,72,153,0.06)", border: "1px solid rgba(236,72,153,0.2)", borderRadius: 12, padding: "22px 20px", textAlign: "center" }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 5 }}>30-dniowy Kalendarz Contentowy</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 14 }}>AI stworzy dzienny plan publikacji na TikTok, Instagram, Facebook i YouTube.</div>
                        {calendarError && <div style={{ background: "rgba(248,113,113,0.1)", borderRadius: 9, padding: "8px 14px", marginBottom: 12, color: "#fca5a5", fontSize: 12 }}><AlertCircle size={12} style={{ marginRight: 6, verticalAlign: "middle" }} />{calendarError}</div>}
                        <button onClick={genCalendar} disabled={calendarLoading} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 24px", borderRadius: 10, border: "none", background: calendarLoading ? "rgba(236,72,153,0.2)" : "linear-gradient(135deg,#ec4899,#a855f7)", color: calendarLoading ? "rgba(255,255,255,0.4)" : "#fff", fontWeight: 700, fontSize: 13, cursor: calendarLoading ? "not-allowed" : "pointer" }}>
                          {calendarLoading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Generuję…</> : <><Calendar size={14} /> Generuj kalendarz 30 dni</>}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                          <button onClick={() => { setCalendar([]); setCalendarError(null); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer" }}>↺ Regeneruj</button>
                        </div>
                    {[0, 1, 2, 3].map(week => {
                      const weekDays = calendar.slice(week * 7, week * 7 + 7);
                      if (weekDays.length === 0) return null;
                      return (
                        <div key={week} style={{ marginBottom: 20 }}>
                          <div style={{ color: "#c4b5fd", fontWeight: 700, fontSize: 12, letterSpacing: 1, marginBottom: 10, paddingLeft: 4 }}>TYDZIEŃ {week + 1}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {weekDays.map((day: any) => {
                              const platformColors: Record<string, string> = {
                                TikTok: "rgba(236,72,153,0.8)", Instagram: "rgba(168,85,247,0.8)",
                                Facebook: "rgba(59,130,246,0.8)", YouTube: "rgba(239,68,68,0.8)",
                              };
                              const platformBg: Record<string, string> = {
                                TikTok: "rgba(236,72,153,0.15)", Instagram: "rgba(168,85,247,0.15)",
                                Facebook: "rgba(59,130,246,0.15)", YouTube: "rgba(239,68,68,0.15)",
                              };
                              const color = platformColors[day.platform] ?? "rgba(255,255,255,0.6)";
                              const bg = platformBg[day.platform] ?? "rgba(255,255,255,0.06)";
                              return (
                                <div key={day.day} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" }}>
                                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                      <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg,#ec4899,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <span style={{ color: "#fff", fontWeight: 900, fontSize: 11 }}>{day.day}</span>
                                      </div>
                                      <div>
                                        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>{day.label}</div>
                                        <div style={{ display: "flex", gap: 5, marginTop: 3 }}>
                                          <span style={{ background: bg, borderRadius: 99, padding: "1px 8px", color, fontSize: 10, fontWeight: 700 }}>{day.platform}</span>
                                          <span style={{ background: "rgba(255,255,255,0.06)", borderRadius: 99, padding: "1px 8px", color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{day.type}</span>
                                          {day.bestTime && <span style={{ background: "rgba(245,158,11,0.1)", borderRadius: 99, padding: "1px 8px", color: "#f59e0b", fontSize: 10 }}>⏰ {day.bestTime}</span>}
                                        </div>
                                      </div>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 200 }}>
                                      <div style={{ color: "#f9a8d4", fontWeight: 600, fontSize: 12, marginBottom: 4 }}>🪝 {day.hook}</div>
                                      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>{day.content}</div>
                                      {day.hashtags?.length > 0 && (
                                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                          {day.hashtags.map((h: string) => <span key={h} style={{ color: color, fontSize: 10 }}>{h}</span>)}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {/* Days 29-30 (remainder) */}
                    {calendar.length > 28 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ color: "#c4b5fd", fontWeight: 700, fontSize: 12, letterSpacing: 1, marginBottom: 10, paddingLeft: 4 }}>OSTATNIE DNI</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {calendar.slice(28).map((day: any) => {
                            const platformColors: Record<string, string> = { TikTok: "rgba(236,72,153,0.8)", Instagram: "rgba(168,85,247,0.8)", Facebook: "rgba(59,130,246,0.8)", YouTube: "rgba(239,68,68,0.8)" };
                            const platformBg: Record<string, string> = { TikTok: "rgba(236,72,153,0.15)", Instagram: "rgba(168,85,247,0.15)", Facebook: "rgba(59,130,246,0.15)", YouTube: "rgba(239,68,68,0.15)" };
                            const color = platformColors[day.platform] ?? "rgba(255,255,255,0.6)";
                            const bg = platformBg[day.platform] ?? "rgba(255,255,255,0.06)";
                            return (
                              <div key={day.day} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" }}>
                                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg,#ec4899,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <span style={{ color: "#fff", fontWeight: 900, fontSize: 11 }}>{day.day}</span>
                                    </div>
                                    <div>
                                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>{day.label}</div>
                                      <div style={{ display: "flex", gap: 5, marginTop: 3 }}>
                                        <span style={{ background: bg, borderRadius: 99, padding: "1px 8px", color, fontSize: 10, fontWeight: 700 }}>{day.platform}</span>
                                        <span style={{ background: "rgba(255,255,255,0.06)", borderRadius: 99, padding: "1px 8px", color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{day.type}</span>
                                        {day.bestTime && <span style={{ background: "rgba(245,158,11,0.1)", borderRadius: 99, padding: "1px 8px", color: "#f59e0b", fontSize: 10 }}>⏰ {day.bestTime}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 200 }}>
                                    <div style={{ color: "#f9a8d4", fontWeight: 600, fontSize: 12, marginBottom: 4 }}>🪝 {day.hook}</div>
                                    <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>{day.content}</div>
                                    {day.hashtags?.length > 0 && (
                                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                        {day.hashtags.map((h: string) => <span key={h} style={{ color, fontSize: 10 }}>{h}</span>)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    </div>
                    )}
                    </div>
                  </Ch>

                  {/* ── 15. KOMENTARZE YT/TT ── */}
                  <Ch id="comments" icon="💬" label="Komentarze YT / TikTok" subtitle="Generator: szablony komentarzy marketingowych" description="Gotowe szablony komentarzy do wklejania pod popularnymi filmami w Twojej niszy. Subtelnie promujesz produkt, budujesz ruch bez budżetu. Claude analizuje realne komentarze jeśli je wkleisz." color="#818cf8"
                    status={commentKit ? "done" : "generator"}>
                    <div style={{ marginTop: 14 }}>
                    {!commentKit && (
                      <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 12, padding: "22px 20px", textAlign: "center" }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 5 }}>Szablony komentarzy marketingowych</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 14 }}>
                          AI stworzy gotowe komentarze do wklejenia na YouTube i TikTok.
                          {realComments.length > 0 && ` Masz ${realComments.length} prawdziwych komentarzy — Claude przeanalizuje je i dopasuje strategię.`}
                        </div>
                        {realComments.length > 0 && (
                          <div style={{ background: "rgba(99,102,241,0.1)", borderRadius: 9, padding: "7px 12px", marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <CheckCircle size={11} color="#818cf8" />
                            <span style={{ color: "#818cf8", fontSize: 11 }}>Analiza {realComments.length} komentarzy z YouTube</span>
                          </div>
                        )}
                        {commentKitError && <div style={{ background: "rgba(248,113,113,0.1)", borderRadius: 9, padding: "8px 14px", marginBottom: 12, color: "#fca5a5", fontSize: 12 }}><AlertCircle size={12} style={{ marginRight: 6, verticalAlign: "middle" }} />{commentKitError}</div>}
                        <button onClick={genComments} disabled={commentKitLoading} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 24px", borderRadius: 10, border: "none", background: commentKitLoading ? "rgba(99,102,241,0.2)" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color: commentKitLoading ? "rgba(255,255,255,0.4)" : "#fff", fontWeight: 700, fontSize: 13, cursor: commentKitLoading ? "not-allowed" : "pointer" }}>
                          {commentKitLoading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Generuję…</> : <><MessageSquare size={14} /> Generuj komentarze</>}
                        </button>
                      </div>
                    )}


                {commentKit && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Regenerate button */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={() => { setCommentKit(null); setCommentKitError(null); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer" }}>
                        ↺ Generuj ponownie
                      </button>
                    </div>

                    {/* Audience insights (from real comments) */}
                    {commentKit.insights && (
                      <div style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 14, padding: "18px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                          <Users size={16} color="#818cf8" />
                          <span style={{ color: "#fff", fontWeight: 700 }}>Analiza komentarzy — Co mówi audytorium</span>
                          <span style={{ background: "rgba(99,102,241,0.15)", borderRadius: 99, padding: "2px 8px", color: "#818cf8", fontSize: 10, fontWeight: 700 }}>
                            {commentKit.insights.sentiment === "positive" ? "😊 Pozytywny" : commentKit.insights.sentiment === "negative" ? "😤 Negatywny" : "😐 Mieszany"} sentyment
                          </span>
                        </div>
                        {commentKit.insights.opportunity && (
                          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "12px 14px", marginBottom: 12, color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.6 }}>
                            💡 {commentKit.insights.opportunity}
                          </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                          {commentKit.insights.topPhrases?.length > 0 && (
                            <div>
                              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 6 }}>POPULARNE FRAZY</div>
                              {commentKit.insights.topPhrases.map((p: string) => <div key={p} style={{ color: "#a5b4fc", fontSize: 11, marginBottom: 3 }}>"{p}"</div>)}
                            </div>
                          )}
                          {commentKit.insights.audienceDesires?.length > 0 && (
                            <div>
                              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 6 }}>PRAGNIENIA</div>
                              {commentKit.insights.audienceDesires.map((d: string) => <div key={d} style={{ color: "#4ade80", fontSize: 11, marginBottom: 3 }}>✓ {d}</div>)}
                            </div>
                          )}
                          {commentKit.insights.audiencePainPoints?.length > 0 && (
                            <div>
                              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, marginBottom: 6 }}>PAIN POINTS</div>
                              {commentKit.insights.audiencePainPoints.map((p: string) => <div key={p} style={{ color: "#f87171", fontSize: 11, marginBottom: 3 }}>• {p}</div>)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* YouTube comments */}
                    {commentKit.youtube && (
                      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "18px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                          <span style={{ fontSize: 20 }}>▶️</span>
                          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>YouTube — Szablony komentarzy</span>
                        </div>

                        {commentKit.youtube.viral && (
                          <div style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.1),rgba(239,68,68,0.07))", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 11, padding: "12px 14px", marginBottom: 14 }}>
                            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: 700, marginBottom: 5 }}>⭐ KOMENTARZ VIRALOWY</div>
                            <div style={{ color: "#fcd34d", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{commentKit.youtube.viral}</div>
                            <CopyBtn text={commentKit.youtube.viral} id="yt_viral" />
                          </div>
                        )}

                        {commentKit.youtube.pinned && (
                          <Block label="📌 DO PRZYPIĘCIA POD WŁASNYM WIDEO">
                            <TextCard text={commentKit.youtube.pinned} id="yt_pinned" />
                          </Block>
                        )}

                        <Block label="💬 KOMENTARZE ANGAŻUJĄCE (wklej na innych filmach)">
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {commentKit.youtube.engagement?.map((c: string, i: number) => (
                              <div key={i} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 9, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                                <div style={{ flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.5 }}>{c}</div>
                                <CopyBtn text={c} id={`yt_eng${i}`} />
                              </div>
                            ))}
                          </div>
                        </Block>

                        {commentKit.youtube.replies?.length > 0 && (
                          <Block label="↩ SZABLONY ODPOWIEDZI">
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {commentKit.youtube.replies.map((r: string, i: number) => (
                                <div key={i} style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 9, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                                  <Send size={12} color="#818cf8" style={{ marginTop: 3, flexShrink: 0 }} />
                                  <div style={{ flex: 1, color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.5 }}>{r}</div>
                                  <CopyBtn text={r} id={`yt_rep${i}`} />
                                </div>
                              ))}
                            </div>
                          </Block>
                        )}
                      </div>
                    )}

                    {/* TikTok comments */}
                    {commentKit.tiktok && (
                      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "18px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                          <span style={{ fontSize: 20 }}>🎵</span>
                          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>TikTok — Szablony komentarzy</span>
                        </div>

                        <Block label="🪝 HOOK COMMENTS (zatrzymują przewijanie)">
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {commentKit.tiktok.hooks?.map((h: string, i: number) => (
                              <div key={i} style={{ background: "rgba(236,72,153,0.07)", border: "1px solid rgba(236,72,153,0.18)", borderRadius: 9, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                                <div style={{ flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.5 }}>{h}</div>
                                <CopyBtn text={h} id={`tt_hook${i}`} />
                              </div>
                            ))}
                          </div>
                        </Block>

                        <Block label="🔥 TRENDING FORMAT">
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {commentKit.tiktok.trending?.map((t: string, i: number) => (
                              <div key={i} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 9, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                                <div style={{ flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.5 }}>{t}</div>
                                <CopyBtn text={t} id={`tt_trend${i}`} />
                              </div>
                            ))}
                          </div>
                        </Block>

                        {commentKit.tiktok.duetStitch && (
                          <Block label="🎬 DUET / STITCH STRATEGIA">
                            <div style={{ background: "rgba(236,72,153,0.05)", border: "1px solid rgba(236,72,153,0.15)", borderRadius: 9, padding: "12px 14px", color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 1.6 }}>
                              {commentKit.tiktok.duetStitch}
                            </div>
                          </Block>
                        )}

                        {commentKit.tiktok.replies?.length > 0 && (
                          <Block label="↩ SZABLONY ODPOWIEDZI">
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {commentKit.tiktok.replies.map((r: string, i: number) => (
                                <div key={i} style={{ background: "rgba(236,72,153,0.05)", border: "1px solid rgba(236,72,153,0.12)", borderRadius: 9, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                                  <ThumbsUp size={12} color="#f472b6" style={{ marginTop: 3, flexShrink: 0 }} />
                                  <div style={{ flex: 1, color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.5 }}>{r}</div>
                                  <CopyBtn text={r} id={`tt_rep${i}`} />
                                </div>
                              ))}
                            </div>
                          </Block>
                        )}
                      </div>
                    )}
                      </div>
                    )}
                    </div>
                  </Ch>

                  {/* ── 16. WIDEO AI ── */}
                  <Ch id="video" icon="🎬" label="Wideo AI" subtitle="Imagen 3 — grafika · Veo 3 — filmik reklamowy" description="Grafika reklamowa (Google Imagen 3) i 8-sekundowy filmik z lektorem i muzyką (Google Veo 3). Gotowe materiały wizualne bez fotografa i studia — bezpośrednio do Social Media i reklam." color="#ea4335"
                    status={genImgResult || vidResult ? "done" : "generator"}>
                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 18 }}>

                {/* Uploaded media reference */}
                {(uploadedImages.length > 0 || uploadedVideos.length > 0) && (
                  <div style={{ background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.18)", borderRadius: 14, padding: "16px 18px" }}>
                    <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 12, marginBottom: 12 }}>📎 Twoje materiały (referencja dla AI)</div>
                    {uploadedImages.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: uploadedVideos.length > 0 ? 10 : 0 }}>
                        {uploadedImages.map((img, i) => (
                          <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 10, overflow: "hidden", border: i === 0 ? "2px solid #4ade80" : "1px solid rgba(255,255,255,0.1)" }}>
                            <img src={img.url} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            {i === 0 && (
                              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(74,222,128,0.9)", color: "#000", fontSize: 8, fontWeight: 700, textAlign: "center", padding: "2px 0" }}>REFERENCJA</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {uploadedVideos.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {uploadedVideos.map((vid, i) => (
                          <video key={i} controls src={vid.url} style={{ width: "100%", borderRadius: 10, maxHeight: 200, border: "1px solid rgba(255,255,255,0.08)" }} />
                        ))}
                      </div>
                    )}
                    {uploadedImages.length > 0 && (
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 8 }}>
                        Pierwsze zdjęcie jest wysyłane jako referencja do Imagen 3
                      </div>
                    )}
                  </div>
                )}

                {/* Imagen 3 — grafika */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 22px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#4285f4,#34a853)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Image size={18} color="#fff" />
                    </div>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Imagen 3 — Grafika reklamowa</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Google AI · wymaga Gemini API key w ⚙ API</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>PROMPT (edytuj lub zostaw domyślny)</div>
                    <textarea
                      value={imgPrompt || buildDefaultImgPrompt()}
                      onChange={e => setImgPrompt(e.target.value)}
                      rows={3}
                      style={{ ...inp, resize: "vertical" } as any}
                      placeholder="Opis grafiki reklamowej..."
                    />
                  </div>
                  {genImgError && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 10 }}>⚠ {genImgError}</div>}
                  <button onClick={genImage} disabled={genImgLoading} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "none",
                    background: genImgLoading ? "rgba(66,133,244,0.2)" : "linear-gradient(135deg,#4285f4,#34a853)",
                    color: genImgLoading ? "rgba(255,255,255,0.4)" : "#fff",
                    fontWeight: 700, fontSize: 13, cursor: genImgLoading ? "not-allowed" : "pointer",
                    boxShadow: genImgLoading ? "none" : "0 4px 14px rgba(66,133,244,0.3)",
                  }}>
                    {genImgLoading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Generuję…</> : <><Sparkles size={14} /> Generuj grafikę</>}
                  </button>
                  {genImgResult && (
                    <div style={{ marginTop: 16 }}>
                      <img src={genImgResult} alt="Marketing graphic" style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }} />
                      <a href={genImgResult} download="marketing-image.png" style={{
                        display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10,
                        padding: "8px 16px", borderRadius: 8, background: "rgba(74,222,128,0.12)",
                        border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80", fontSize: 12, textDecoration: "none", fontWeight: 600,
                      }}>
                        <Download size={12} /> Pobierz PNG
                      </a>
                    </div>
                  )}
                </div>

                {/* Veo 3 — filmik */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 22px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#ea4335,#fbbc04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Video size={18} color="#fff" />
                    </div>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Veo 3 — Filmik reklamowy z dźwiękiem</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>Google DeepMind · 8 sekund · lektor + muzyka AI · wymaga dostępu do Veo</div>
                    </div>
                    {vidModel && <span style={{ background: "rgba(234,67,53,0.15)", border: "1px solid rgba(234,67,53,0.3)", borderRadius: 99, padding: "2px 8px", color: "#fca5a5", fontSize: 10 }}>{vidModel}</span>}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>PROMPT WIDEO</div>
                    <textarea
                      value={vidPrompt || buildDefaultVidPrompt()}
                      onChange={e => setVidPrompt(e.target.value)}
                      rows={3}
                      style={{ ...inp, resize: "vertical" } as any}
                      placeholder="Opis filmiku reklamowego..."
                    />
                  </div>
                  {/* Progress bar */}
                  {vidLoading && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>Renderowanie wideo… (ok. 2-3 min)</span>
                        <span style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700 }}>{vidProgress}%</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${vidProgress}%`, background: "linear-gradient(90deg,#ea4335,#fbbc04)", borderRadius: 99, transition: "width 0.5s ease" }} />
                      </div>
                    </div>
                  )}
                  {vidError && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 10 }}>⚠ {vidError}</div>}
                  {!vidResult && (
                    <button onClick={startVideo} disabled={vidLoading} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "none",
                      background: vidLoading ? "rgba(234,67,53,0.15)" : "linear-gradient(135deg,#ea4335,#fbbc04)",
                      color: vidLoading ? "rgba(255,255,255,0.4)" : "#fff",
                      fontWeight: 700, fontSize: 13, cursor: vidLoading ? "not-allowed" : "pointer",
                      boxShadow: vidLoading ? "none" : "0 4px 14px rgba(234,67,53,0.3)",
                    }}>
                      {vidLoading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Renderuję filmik…</> : <><Video size={14} /> Generuj filmik Veo</>}
                    </button>
                  )}
                  {vidResult && (
                    <div style={{ marginTop: 16 }}>
                      {vidResult.uri && (
                        <video controls style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
                          <source src={vidResult.uri} type="video/mp4" />
                        </video>
                      )}
                      {vidResult.b64 && !vidResult.uri && (
                        <video controls style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
                          <source src={`data:video/mp4;base64,${vidResult.b64}`} type="video/mp4" />
                        </video>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        {vidResult.uri && (
                          <a href={vidResult.uri} download="marketing-video.mp4" style={{
                            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8,
                            background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)",
                            color: "#4ade80", fontSize: 12, textDecoration: "none", fontWeight: 600,
                          }}>
                            <Download size={12} /> Pobierz MP4
                          </a>
                        )}
                        <button onClick={() => { setVidResult(null); setVidOpName(null); setVidProgress(0); }} style={{
                          display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
                          background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                          color: "rgba(255,255,255,0.35)", fontSize: 12, cursor: "pointer",
                        }}>↺ Nowy filmik</button>
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 14, background: "rgba(251,188,4,0.06)", borderRadius: 9, padding: "10px 14px", color: "rgba(251,188,4,0.7)", fontSize: 11 }}>
                    💡 Veo 3 wymaga dostępu preview w Google AI Studio. Jeśli nie masz dostępu — automatycznie używamy Veo 2 (bez audio).
                  </div>
                    </div>
                    </div>
                  </Ch>

                </div>
              );
            })()}
          </div>
        )}

        {/* ── Floating bottom bar when result is shown ── */}
        {result && (
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
            background: "rgba(0,10,3,0.92)", backdropFilter: "blur(12px)",
            borderTop: "1px solid rgba(168,85,247,0.3)",
            padding: "12px 16px", display: "flex", gap: 10, alignItems: "center",
          }}>
            <button onClick={() => setResult(null)} style={{
              flex: 1, padding: "13px 20px", borderRadius: 11, border: "none",
              background: "linear-gradient(135deg,#ec4899,#a855f7,#6366f1)",
              color: "#fff", fontWeight: 900, fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 20px rgba(168,85,247,0.45)",
            }}>
              <Megaphone size={16} /> Nowa kampania
            </button>
          </div>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
          input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.2); }
          select option { background: #0d1117; color: #fff; }
        `}</style>
      </div>
    </ResellLayout>
  );
}
