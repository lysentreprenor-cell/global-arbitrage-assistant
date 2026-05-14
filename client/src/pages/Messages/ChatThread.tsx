import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useWsContext } from "@/context/WsContext";
import {get, off, onValue, ref, set} from "firebase/database";
import {realtimeDb} from "@/lib/firebase";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Send, ArrowUpRight, ShieldCheck, MoreVertical, Check, CheckCheck,
  UserPlus, UserMinus, FileText, Mic, Paperclip, X, Search, Play, Pause,
  Shield, Flag, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useAppStore, formatMoney, type CurrencyCode } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import { useLang } from "@/context/LanguageContext";
import { statusLabel, type AgreementStatus } from "@/pages/Agreements";

// ── Types ──────────────────────────────────────────────────────────────────────

type AttachmentMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type ChatMessage = {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  status: "sent" | "delivered" | "read";
  isOwn?: boolean;
  attachmentId?: string | null;
  attachment?: AttachmentMeta | null;
  isTransfer?: boolean;
  transferAmount?: number;
  transferStatus?: string;
  isAgreement?: boolean;
  agreementId?: string;
  agreementTitle?: string;
  agreementAmount?: number;
  agreementCurrency?: string;
  agreementStatus?: string;
};

type ConvMeta = {
  contactName: string;
  contactHandle: string;
  targetUserId?: string;
  isOnline?: boolean;
  lastSeenAt?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Dzisiaj";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Wczoraj";
  return d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtLastSeen(iso: string | null | undefined): string {
  if (!iso) return "Ostatnio nieznany";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Aktywny przed chwilą";
  if (diff < 3600_000) return `Aktywny ${Math.floor(diff / 60_000)} min temu`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Aktywny dzisiaj o ${d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Aktywny wczoraj o ${d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
  return `Aktywny ${d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}`;
}

const TRANSFER_STATUS_PL: Record<string, string> = {
  completed: "Zrealizowany",
  pending: "W trakcie",
  failed: "Nieudany",
  cancelled: "Anulowany",
  processing: "Przetwarzanie",
  refunded: "Zwrócony",
};

type RawMessage = {
  id?: string;
  senderId?: string;
  text?: string | null;
  createdAt?: string;
  timestamp?: string;
  status?: string;
  isOwn?: boolean;
  attachmentId?: string | null;
  attachment?: { id?: string; fileName?: string; mimeType?: string; sizeBytes?: number; url?: string } | null;
  isTransfer?: boolean;
  transferAmount?: number;
  transferStatus?: string;
  isAgreement?: boolean;
  agreementId?: string;
  agreementTitle?: string;
  agreementAmount?: number;
  agreementCurrency?: string;
  agreementStatus?: string;
  [key: string]: unknown;
};

function normalizeMessage(m: RawMessage): ChatMessage {
  const rawAtt = m.attachment;
  const attachment: AttachmentMeta | null = rawAtt
    ? { id: rawAtt.id ?? "", fileName: rawAtt.fileName ?? "", mimeType: rawAtt.mimeType ?? "", sizeBytes: rawAtt.sizeBytes ?? 0 }
    : null;
  return {
    id: m.id ?? "",
    senderId: m.senderId ?? "",
    text: m.text ?? "",
    createdAt: m.createdAt ?? m.timestamp ?? new Date().toISOString(),
    status: (m.status as ChatMessage["status"]) ?? "delivered",
    isOwn: m.isOwn,
    attachmentId: m.attachmentId ?? null,
    attachment,
    isTransfer: m.isTransfer ?? false,
    transferAmount: m.transferAmount,
    transferStatus: m.transferStatus,
    isAgreement: m.isAgreement ?? false,
    agreementId: m.agreementId,
    agreementTitle: m.agreementTitle,
    agreementAmount: m.agreementAmount,
    agreementCurrency: m.agreementCurrency,
    agreementStatus: m.agreementStatus,
  };
}

// ── VoiceMessagePlayer ────────────────────────────────────────────────────────

const VOICE_BARS = 28;

// Generate stable pseudo-random heights from attachmentId for visual variety
function genBarHeights(seed: string): number[] {
  const heights: number[] = [];
  for (let i = 0; i < VOICE_BARS; i++) {
    const c = seed.charCodeAt(i % seed.length) || 80;
    heights.push(20 + ((c * (i + 1) * 7) % 65));
  }
  return heights;
}

function VoiceMessagePlayer({ attachmentId, isOwn }: { attachmentId: string; isOwn: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [liveBars, setLiveBars] = useState<number[] | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const staticBars = genBarHeights(attachmentId);

  useEffect(() => {
    const audio = new Audio(`/api/messages/attachment/${attachmentId}`);
    audioRef.current = audio;
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.ontimeupdate = () => setProgress(audio.currentTime / (audio.duration || 1));
    audio.onended = () => {
      setPlaying(false);
      setProgress(0);
      setLiveBars(null);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
    return () => {
      audio.pause();
      audio.src = "";
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { audioCtxRef.current?.close(); } catch {}
    };
  }, [attachmentId]);

  function startAnalysis(audio: HTMLAudioElement) {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      const src = ctx.createMediaElementSource(audio);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const binSize = Math.max(1, Math.floor(data.length / VOICE_BARS));
        setLiveBars(Array.from({ length: VOICE_BARS }, (_, i) => {
          let s = 0;
          for (let j = 0; j < binSize; j++) s += data[i * binSize + j] || 0;
          return 8 + ((binSize > 0 ? s / binSize : 0) / 255) * 58;
        }));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {}
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      setLiveBars(null);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    } else {
      audio.play().then(() => {
        setPlaying(true);
        startAnalysis(audio);
      }).catch(() => {});
    }
  }

  const elapsed = progress * duration;
  const bars = liveBars ?? staticBars;

  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl min-w-[200px] ${isOwn ? "bg-primary/20 border border-primary/30" : "bg-secondary border border-border"}`}
      data-testid={`voice-player-${attachmentId}`}
    >
      <button
        onClick={toggle}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${isOwn ? "bg-primary/30 text-primary hover:bg-primary/40" : "bg-muted text-foreground hover:bg-muted/80"}`}
        aria-label={playing ? "Pauza" : "Odtwórz"}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      {/* Waveform bars */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-[2px] h-[28px]">
          {bars.map((h, i) => {
            const filled = playing ? (i / VOICE_BARS) < progress : false;
            return (
              <div
                key={i}
                className={`rounded-full flex-1 transition-all duration-75 ${filled ? (isOwn ? "bg-primary" : "bg-foreground") : (isOwn ? "bg-primary/40" : "bg-muted-foreground/30")}`}
                style={{ height: `${Math.round(h)}%`, maxHeight: "100%" }}
              />
            );
          })}
        </div>
        <span className="text-[12px] text-muted-foreground font-medium tabular-nums">
          {fmtDuration(playing ? elapsed : duration)}
        </span>
      </div>

      <Mic className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────

const NUM_BARS = 18;
const MAX_REC_SECS = 120;

// ── ChatThread ─────────────────────────────────────────────────────────────────

export default function ChatThread() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user, sessionConfirmed, isFriend, addFriend, removeFriend } = useAppStore();
  const { t } = useLang();

  // ── Core state ────────────────────────────────────────────────────────────
  const [meta, setMeta] = useState<ConvMeta | null>(null);
  const { user: storeUser } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>(user?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  useEffect(() => {
    if (!user?.id || !id) return;
    const muteRef = ref(realtimeDb, `messaging/inbox/${user.id}/settings/${id}/muted`);
    const unsub = onValue(muteRef, (snap) => setIsMuted(snap.val() === true));
    return unsub;
  }, [user?.id, id]);


  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  // ── UI state ─────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState("");
  const [sendPending, setSendPending] = useState(false);
  const [attachPending, setAttachPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Recording state ───────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(Array(NUM_BARS).fill(6));

  // ── Block / report state ──────────────────────────────────────────────────
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Typing indicator ──────────────────────────────────────────────────────
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerReadAt, setPartnerReadAt] = useState<string | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformRafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alreadyFriend = meta ? isFriend(meta.contactHandle) : false;
  const isSelfConvo = !!(user && meta && meta.contactHandle === user.handle);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => { if (isMounted.current) setToast(null); }, 3500);
  }

  function scrollToBottom(smooth = true) {
    const el = scrollRef.current;
    const end = messagesEndRef.current;

    const go = () => {
      if (el) {
        const bottom = el.scrollHeight;

        // Mobile-safe: bezpośredni scrollTop działa pewniej niż samo scrollTo().
        el.scrollTop = bottom;

        try {
          el.scrollTo({
            top: bottom,
            behavior: smooth ? "smooth" : "auto",
          });
        } catch {
          el.scrollTop = bottom;
        }
      }

      // Punkt końcowy na dole listy wiadomości, jak w Messenger/WhatsApp.
      try {
        end?.scrollIntoView({
          block: "end",
          behavior: smooth ? "smooth" : "auto",
        });
      } catch {}
    };

    go();
    requestAnimationFrame(go);
    window.setTimeout(go, 80);
    window.setTimeout(go, 220);
  }

  // ── WebSocket (shared global connection via WsContext) ────────────────────

  const { subscribe, send: wsSend } = useWsContext();
  const convIdRef = useRef(id ?? "");
  convIdRef.current = id ?? "";
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  useEffect(() => {
    if (!id || !(user && sessionConfirmed)) return;
    return subscribe((event) => {
      const convId = convIdRef.current;
      if (event.type === "message" && String(event.conversationId) === convId) {
        const raw = (event.message ?? event) as Record<string, unknown>;
        const msg = normalizeMessage(raw as RawMessage);
        if (msg.senderId !== currentUserIdRef.current) {
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          scrollToBottom();
          fetch(`/api/messages/${encodeURIComponent(convId)}/read`, { method: "POST", credentials: "include" }).catch(() => {});
        }
      } else if (event.type === "read" && String(event.conversationId) === convId) {
        setPartnerReadAt(new Date().toISOString());
        setMessages(prev => prev.map(m => m.isOwn ? { ...m, status: "read" as const } : m));
      } else if (event.type === "typing" && String(event.conversationId) === convId) {
        const typing = !!event.isTyping;
        setPartnerTyping(typing);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        if (typing) typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 4000);
      } else if (event.type === "online" && event.userId) {
        setMeta(prev => {
          if (!prev?.targetUserId) return prev;
          if (String(event.userId) !== String(prev.targetUserId)) return prev;
          return { ...prev, isOnline: !!event.online };
        });
      }
    });
  }, [subscribe, id, user, sessionConfirmed]);

  function sendTyping() {
    wsSend({ type: "typing_start", conversationId: convIdRef.current });
  }

  // ── Firebase real-time inbox signal (incoming messages) ───────────────────
  useEffect(() => {
    if (!user?.id || !sessionConfirmed) return;
    const inboxRef = ref(realtimeDb, `messaging/inbox/${user.id}`);
    const unsub = onValue(inboxRef, (snap) => {
      if (!snap.exists() || !isMounted.current) return;
      const signal = snap.val() as { convId?: string } | null;
      if (!signal?.convId || signal.convId !== id) return;
      loadThreadRef.current(true);
    });
    return () => off(inboxRef, "value", unsub);
  }, [user?.id, sessionConfirmed, id]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const metaSetRef = useRef(false);
  const loadThreadRef = useRef<(silent?: boolean) => void>(() => {});

  const loadThread = useCallback(async (silent = false) => {
    try {
      if (!user || !sessionConfirmed) { setLoading(false); return; }
      if (!id) { setNotFound(true); setLoading(false); return; }

      // Load conversations list + messages in parallel
      const [convRes, msgRes] = await Promise.all([
        fetch("/api/messages/conversations", { credentials: "include" }),
        fetch(`/api/messages/${encodeURIComponent(id)}`, { credentials: "include" }),
      ]);

      if (!isMounted.current) return;

      // Extract conversation metadata from list
      let foundMeta = false;
      if (convRes.ok) {
        const convJson = await convRes.json().catch(() => ({}));
        type RawConv = { id?: string; target_display_name?: string; target_handle?: string | null; target_user_id?: string; is_online?: boolean; target_last_seen_at?: string | null };
        const list: RawConv[] = convJson?.conversations ?? convJson?.items ?? [];
        const found = list.find((c) => c.id === id);
        if (found) {
          foundMeta = true;
          setMeta({
            contactName: found.target_display_name || "Użytkownik",
            contactHandle: found.target_handle
              ? (found.target_handle.startsWith("@") ? found.target_handle : `@${found.target_handle}`)
              : "",
            targetUserId: found.target_user_id,
            isOnline: found.is_online ?? false,
            lastSeenAt: found.target_last_seen_at ?? null,
          });
          metaSetRef.current = true;
          // Load block status from server (authoritative); fall back to localStorage cache
          if (found.target_user_id && !silent) {
            fetch(`/api/messages/block-status/${encodeURIComponent(found.target_user_id)}`, { credentials: "include" })
              .then(r => r.ok ? r.json() : null)
              .then((data: { ok?: boolean; blocked?: boolean } | null) => {
                if (isMounted.current && data?.ok) {
                  setIsBlockedByMe(!!data.blocked);
                  // Sync localStorage cache with server truth
                  try {
                    const cache = JSON.parse(localStorage.getItem("finlys_blocked_users") || "{}");
                    if (data.blocked) cache[found.target_user_id!] = true;
                    else delete cache[found.target_user_id!];
                    localStorage.setItem("finlys_blocked_users", JSON.stringify(cache));
                  } catch {}
                } else if (isMounted.current) {
                  // Server unavailable — fall back to localStorage cache
                  try {
                    const cache = JSON.parse(localStorage.getItem("finlys_blocked_users") || "{}");
                    setIsBlockedByMe(!!cache[found.target_user_id!]);
                  } catch {}
                }
              })
              .catch(() => {
                // Network error — fall back to localStorage cache
                try {
                  const cache = JSON.parse(localStorage.getItem("finlys_blocked_users") || "{}");
                  setIsBlockedByMe(!!cache[found.target_user_id!]);
                } catch {}
              });
          }
        }
      }


      // Get messages from messages API
      if (msgRes.ok) {
        const msgJson = await msgRes.json().catch(() => ({}));
        if (!isMounted.current) return;
        if (msgJson?.currentUserId) setCurrentUserId(msgJson.currentUserId);
        const msgs: ChatMessage[] = (msgJson?.messages ?? []).map(normalizeMessage);
        if (!silent) {
          setMessages(msgs);
          scrollToBottom(false);
        } else {
          setMessages(prev => {
            const serverIds = new Set(msgs.map(m => m.id));
            const optimistic = prev.filter(m => m.id.startsWith("opt_") && !serverIds.has(m.id));
            return [...msgs, ...optimistic];
          });
        }
      } else if (!silent && (msgRes.status === 404 || msgRes.status === 403)) {
            setNotFound(true);
          }

    } catch (err: any) {
      if (!isMounted.current) return;
      if (!silent) setError(err?.message || "Nie udało się załadować rozmowy.");
    } finally {
      if (isMounted.current && !silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadThreadRef.current = loadThread; }, [loadThread]);

  useEffect(() => {
    isMounted.current = true;
    setLoading(true);
    setMessages([]);
    setMeta(null);
    setNotFound(false);
    setError("");
    loadThread();

    const pollInterval = setInterval(() => { loadThread(true); }, 8000);
    const onVisible = () => { if (document.visibilityState === "visible") loadThread(true); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      isMounted.current = false;
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      // Stop any active recording and release media resources on unmount
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
          if (mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
          }
        } catch {}
        mediaRecorderRef.current = null;
      }
      if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
      if (waveformRafRef.current) { cancelAnimationFrame(waveformRafRef.current); waveformRafRef.current = null; }
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
      if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
    };
  }, [id, loadThread]);

  // Auto-scroll on new messages
  useEffect(() => {
    // Po zmianie liczby wiadomości przewiń dopiero po renderze DOM.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToBottom(false));
    });

    const t1 = window.setTimeout(() => scrollToBottom(false), 120);
    const t2 = window.setTimeout(() => scrollToBottom(false), 350);
    const t3 = window.setTimeout(() => scrollToBottom(false), 700);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [messages.length]);

  // Mark as read on mount — only when fully authenticated
  useEffect(() => {
    if (!id || !user || !sessionConfirmed) return;
    fetch(`/api/messages/${encodeURIComponent(id)}/read`, { method: "POST", credentials: "include" }).catch(() => {});
  }, [id, user, sessionConfirmed]);

  // ── Sending ───────────────────────────────────────────────────────────────

  async function handleSend(attachmentId?: string, attachMeta?: AttachmentMeta) {
    const text = draft.trim();
    if ((!text && !attachmentId) || !id || sendPending) return;
    try {
      setSendPending(true);
      const isVoice = attachMeta?.mimeType?.startsWith("audio/");
      const optimistic: ChatMessage = {
        id: `opt_${Date.now()}`,
        senderId: currentUserId || "me",
        text: text || (isVoice ? "" : attachMeta ? `📎 ${attachMeta.fileName}` : ""),
        createdAt: new Date().toISOString(),
        status: "sent",
        isOwn: true,
        attachmentId: attachmentId ?? null,
        attachment: attachMeta ?? null,
      };
      setMessages(prev => [...prev, optimistic]);
      setDraft("");
      scrollToBottom();

      const res = await fetch(`/api/messages/${encodeURIComponent(id)}/send`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ text, ...(attachmentId ? { attachmentId } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.message || `Błąd ${res.status}`);
      await loadThread(true);
      // Firebase: ping recipient so they get instant update on any device
      if (meta?.targetUserId && user?.id) {
        set(ref(realtimeDb, `messaging/inbox/${meta.targetUserId}`), {
          at: Date.now(), convId: id, from: user.id,
        }).catch(() => {});
      }
    } catch (err: any) {
      if (!isMounted.current) return;
      showToast(err?.message || "Nie udało się wysłać.", false);
      setMessages(prev => prev.filter(m => !m.id.startsWith("opt_")));
    } finally {
      if (isMounted.current) { setSendPending(false); inputRef.current?.focus(); }
    }
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    e.target.value = "";
    try {
      setAttachPending(true);
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch("/api/messages/upload", { method: "POST", credentials: "include", body: form });
      const uploadJson = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) throw new Error(uploadJson?.error || "Nie udało się wgrać pliku.");
      const meta: AttachmentMeta = { id: uploadJson.attachmentId, fileName: uploadJson.fileName, mimeType: uploadJson.mimeType, sizeBytes: uploadJson.sizeBytes };
      setAttachPending(false);
      await handleSend(meta.id, meta);
    } catch (err: any) {
      setAttachPending(false);
      showToast(err?.message || "Błąd przesyłania.", false);
    }
  }

  // ── Voice recording ────────────────────────────────────────────────────────

  function stopWaveformLoop() {
    if (waveformRafRef.current) { cancelAnimationFrame(waveformRafRef.current); waveformRafRef.current = null; }
    if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
    analyserRef.current = null;
    setWaveformBars(Array(NUM_BARS).fill(6));
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        await uploadVoiceBlob(blob, mimeType);
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSeconds(0);
      recTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);

      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          ctx.createMediaStreamSource(stream).connect(analyser);
          audioContextRef.current = ctx;
          analyserRef.current = analyser;
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            const binSize = Math.floor(dataArray.length / NUM_BARS);
            setWaveformBars(Array.from({ length: NUM_BARS }, (_, i) => {
              let sum = 0;
              for (let j = 0; j < binSize; j++) sum += dataArray[i * binSize + j];
              return 4 + ((binSize > 0 ? sum / binSize : 0) / 255) * 26;
            }));
            waveformRafRef.current = requestAnimationFrame(tick);
          };
          waveformRafRef.current = requestAnimationFrame(tick);
        }
      } catch {}
    } catch {
      showToast("Nie można uzyskać dostępu do mikrofonu.", false);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setRecordingSeconds(0);
    stopWaveformLoop();
  }

  function cancelRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setRecordingSeconds(0);
    audioChunksRef.current = [];
    stopWaveformLoop();
  }

  useEffect(() => {
    if (!isRecording) return;
    if (recordingSeconds >= MAX_REC_SECS) { stopRecording(); showToast("Osiągnięto limit 2 minut.", true); }
    if (recordingSeconds === MAX_REC_SECS - 10) showToast("Zostało 10 sekund nagrania!", true);
  }, [recordingSeconds, isRecording]);

  async function uploadVoiceBlob(blob: Blob, mimeType: string) {
    try {
      setAttachPending(true);
      const ext = mimeType.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mimeType });
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch("/api/messages/upload", { method: "POST", credentials: "include", body: form });
      const uploadJson = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) throw new Error(uploadJson?.error || "Nie udało się wgrać nagrania.");
      const meta: AttachmentMeta = { id: uploadJson.attachmentId, fileName: uploadJson.fileName, mimeType: uploadJson.mimeType, sizeBytes: uploadJson.sizeBytes };
      setAttachPending(false);
      await handleSend(meta.id, meta);
    } catch (err: any) {
      setAttachPending(false);
      showToast(err?.message || "Błąd przesyłania nagrania.", false);
    }
  }

  // ── Block / Report ────────────────────────────────────────────────────────


  const handleDeleteConversation = () => {
    setShowMenu(false);
    setShowDeleteConfirm(true);
  };

  const doDeleteConversation = async () => {
    setShowDeleteConfirm(false);
    if (user?.id && id) {
      await set(ref(realtimeDb, `messaging/inbox/${user.id}/settings/${id}/deletedForMe`), true);
    }
    setLocation("/messages");
  };

  async function handleBlock() {
    if (!meta?.targetUserId) return showToast("Brak ID użytkownika.", false);
    try {
      setBlockLoading(true);
      const method = isBlockedByMe ? "DELETE" : "POST";
      const res = await fetch(`/api/messages/block/${meta.targetUserId}`, { method, credentials: "include" });
      if (!res.ok) throw new Error("Błąd.");
      const newBlocked = !isBlockedByMe;
      setIsBlockedByMe(newBlocked);
      // Persist to localStorage so Messages list can filter Zablokowane
      try {
        const cache = JSON.parse(localStorage.getItem("finlys_blocked_users") || "{}");
        if (newBlocked) cache[meta.targetUserId] = true;
        else delete cache[meta.targetUserId];
        localStorage.setItem("finlys_blocked_users", JSON.stringify(cache));
      } catch {}
      showToast(isBlockedByMe ? "Odblokowano użytkownika." : "Zablokowano użytkownika.", true);
      setMenuOpen(false);
    } catch { showToast("Nie udało się wykonać operacji.", false); }
    finally { setBlockLoading(false); }
  }

  async function handleReport() {
    if (!meta?.targetUserId || !reportReason.trim()) return;
    try {
      setReportLoading(true);
      const res = await fetch(`/api/messages/report/${meta.targetUserId}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason }),
      });
      if (!res.ok) throw new Error("Błąd.");
      setShowReportModal(false);
      setReportReason("");
      showToast("Zgłoszenie wysłane. Dziękujemy.", true);
    } catch { showToast("Nie udało się wysłać zgłoszenia.", false); }
    finally { setReportLoading(false); }
  }

  // ── Friend toggle ─────────────────────────────────────────────────────────

  async function handleToggleFriend() {
    setMenuOpen(false);
    if (!meta) return;
    if (alreadyFriend) {
      await removeFriend(meta.contactHandle);
      showToast("Usunięto ze znajomych.", true);
    } else {
      await addFriend(meta.contactHandle, meta.contactName);
      showToast("Dodano do znajomych!", true);
    }
  }

  // ── New agreement ─────────────────────────────────────────────────────────

  const handleNewAgreement = useCallback(async () => {
    if (!meta || isSelfConvo) return;
    setMenuOpen(false);
    try {
      const handle = meta.contactHandle.startsWith("@") ? meta.contactHandle : `@${meta.contactHandle}`;
      const resp = await fetch(`/api/users/by-handle?handle=${encodeURIComponent(handle)}`);
      const worker = resp.ok ? await resp.json() : null;
      const params = new URLSearchParams({ conversationId: id ?? "", workerName: meta.contactName, workerHandle: meta.contactHandle });
      if (worker?.id) params.set("workerUid", worker.id);
      setLocation(`/agreements/new?${params.toString()}`);
    } catch {
      setLocation(`/agreements/new?conversationId=${id}&workerName=${meta.contactName}&workerHandle=${meta.contactHandle}`);
    }
  }, [meta, isSelfConvo, id, setLocation]);

  // ── Search ────────────────────────────────────────────────────────────────

  const displayedMessages = searchQuery.trim()
    ? messages.filter(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()) || (m.attachment?.fileName || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  function highlightText(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((p, i) =>
      p.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-primary/40 text-foreground rounded-sm">{p}</mark>
        : p
    );
  }

  // Group messages by date
  const groupedMessages = displayedMessages.reduce((acc, msg) => {
    const date = fmtDate(msg.createdAt);
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {} as Record<string, ChatMessage[]>);

  // Is message mine?
  function isOwn(msg: ChatMessage): boolean {
    if (msg.isOwn !== undefined) return msg.isOwn;
    return msg.senderId === currentUserId || msg.senderId === "user" || (!!user && msg.senderId === user.id);
  }

  // ── States ────────────────────────────────────────────────────────────────

  if (loading && !meta) {
    return (
      <div className="bg-background flex flex-col items-center justify-center h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden relative fixed inset-0 w-full">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Ładowanie rozmowy…</p>
      </div>
    );
  }

  if (notFound || error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-heading text-foreground">Nie znaleziono rozmowy</h2>
        <p className="text-sm text-muted-foreground mt-2">{error || "Ta rozmowa nie istnieje lub nie masz do niej dostępu."}</p>
        <Button onClick={() => setLocation("/messages")} variant="outline" className="mt-5 rounded-2xl">
          Wróć do wiadomości
        </Button>
      </div>
    );
  }

  const contactName = meta?.contactName ?? "Użytkownik";
  const contactHandle = meta?.contactHandle ? (meta.contactHandle.startsWith("@") ? meta.contactHandle : `@${meta.contactHandle}`) : "";
  const initials = contactName.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();

  const recRemaining = MAX_REC_SECS - recordingSeconds;
  const recWarning = recRemaining <= 10;
  const recElapsed = `${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`;
  const recRemainingStr = `-${String(Math.floor(recRemaining / 60)).padStart(2, "0")}:${String(recRemaining % 60).padStart(2, "0")}`;

  // ── Fail-closed auth guard ────────────────────────────────────────────────

  if (!user || !sessionConfirmed) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6">
        <ShieldCheck className="w-10 h-10 text-primary/60" />
        <p className="text-[15px] text-muted-foreground text-center" data-testid="chat-auth-guard">
          Zaloguj się, aby kontynuować
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-[100dvh] max-h-[100dvh] min-h-0 bg-background relative overflow-hidden flex flex-col">
      {/* Ambient glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" aria-hidden />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-floating border pointer-events-none ${toast.ok ? "bg-card border-success/30 text-success" : "bg-card border-destructive/30 text-destructive"}`}
            data-testid="toast-message"
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report modal */}
      <AnimatePresence>
        {showReportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-overlay/70 z-50 flex items-center justify-center p-4"
            onClick={() => setShowReportModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="font-heading text-lg text-foreground mb-1">Zgłoś użytkownika</h3>
              <p className="text-sm text-muted-foreground mb-4">Twoje zgłoszenie zostanie sprawdzone przez administratora.</p>
              <textarea
                value={reportReason}
                onChange={e => setReportReason(e.target.value)}
                placeholder="Opisz powód zgłoszenia…"
                maxLength={500}
                rows={3}
                className="w-full rounded-2xl border border-border bg-secondary text-foreground placeholder:text-muted-foreground text-sm p-3.5 outline-none focus:border-primary/50 resize-none transition-colors"
                data-testid="input-report-reason"
              />
              <div className="flex gap-2.5 mt-4 justify-end">
                <Button variant="outline" onClick={() => { setShowReportModal(false); setReportReason(""); }} className="rounded-2xl" data-testid="button-cancel-report">
                  Anuluj
                </Button>
                <Button
                  onClick={handleReport}
                  disabled={reportLoading || !reportReason.trim()}
                  className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-submit-report"
                >
                  {reportLoading ? "Wysyłam…" : "Wyślij zgłoszenie"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
{/* Messages */}

      {/* NEW_CHAT_TOP_CREATED_START */}
      <div
        data-created-chat-top="true"
       
       className="shrink-0 z-50 bg-background border-b border-border px-4 pt-14 pb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="w-10 h-10 rounded-full flex items-center justify-center text-2xl text-foreground active:scale-95 transition-transform"
            aria-label="Wróć"
          >
            ←
          </button>

          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <span className="text-primary font-bold text-lg">
              {String(meta?.contactName || meta?.displayName || meta?.name || meta?.contactHandle || "R").slice(0, 1).toUpperCase()}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold text-foreground truncate">
              {meta?.contactName || meta?.displayName || meta?.name || meta?.contactHandle || "Rozmowa"}
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {meta?.contactHandle ? "@" + meta.contactHandle + " · " : ""}
              {meta?.isOnline ? "Aktywny teraz" : "Aktywny"}
            </div>
                </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu(prev => !prev)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl text-muted-foreground hover:bg-secondary/80 active:scale-95 transition"
                aria-label="Otwórz menu rozmowy"
                data-testid="button-chat-thread-menu"
              >
                ...
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-12 z-50 min-w-[210px] rounded-xl bg-card border border-border shadow-xl overflow-hidden">
                    <button type="button" onClick={() => { setShowMenu(false); setLocation('/users'); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-secondary/60 transition text-left"><span>👤</span> Profil użytkownika</button>
                    <button type="button" onClick={() => { const next = !isMuted; set(ref(realtimeDb, `messaging/inbox/${user.id}/settings/${id}/muted`), next ? true : null); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-secondary/60 transition text-left">{isMuted ? "🔔" : "🔕"} {isMuted ? "Wyłącz wyciszenie" : "Wycisz rozmowę"}</button>
                    <button type="button" onClick={() => { setShowReportModal(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-secondary/60 transition text-left"><span>🚩</span> Zgłoś użytkownika</button>
                    <button type="button" onClick={handleBlock} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-secondary/60 transition text-left"><span>🚫</span> {isBlockedByMe ? "Odblokuj użytkownika" : "Zablokuj użytkownika"}</button>
                    <div className="border-t border-border" />
                    <button type="button" onClick={handleDeleteConversation} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 transition text-left"><span>🗑️</span> Usuń rozmowę u mnie</button>
                  </div>
                </>
              )}
            </div>
          </div>
         </div>
         {/* NEW_CHAT_TOP_CREATED_END */}         
      {/* NEW_CHAT_TOP_CREATED_END */}
<main ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-4 space-y-6 scroll-smooth touch-pan-y overscroll-contain">
        {/* Encryption note */}
        <div className="text-center py-4 px-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary border border-border flex items-center justify-center mb-3">
            <ShieldCheck className="w-7 h-7 text-muted-foreground/40" />
          </div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest leading-relaxed max-w-[240px] mx-auto">
            Wiadomości chronione szyfrowaniem dwustronnym
          </p>
        </div>

        {/* Message groups */}
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date} className="space-y-3">
            {/* Date label */}
            <div className="flex justify-center">
              <span className="px-3 py-1 bg-secondary/80 backdrop-blur-md rounded-full text-[12px] font-semibold uppercase tracking-widest text-muted-foreground border border-border">
                {date}
              </span>
            </div>

            {msgs.map((msg) => {
              const own = isOwn(msg);
              const isOptimistic = msg.id.startsWith("opt_");
              const isImage = msg.attachment?.mimeType?.startsWith("image/");
              const isAudio = msg.attachment?.mimeType?.startsWith("audio/");
              const effectiveStatus = own
                ? (partnerReadAt && new Date(partnerReadAt) > new Date(msg.createdAt) ? "read" : msg.status)
                : msg.status;

              // Agreement card
              if (msg.isAgreement) {
                return (
                  <div key={msg.id} className={`flex w-full ${own ? "justify-end" : "justify-start"} my-2`}>
                    <div className="max-w-[270px] bg-card border border-border rounded-3xl p-5 shadow-premium">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-highlight/20 text-highlight border border-highlight/30">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground">{t.agreeNewContract}</p>
                          <p className="text-sm font-semibold text-foreground leading-tight">{msg.agreementTitle || msg.text}</p>
                        </div>
                      </div>
                      {msg.agreementAmount != null && msg.agreementCurrency && (
                        <p className="text-xl font-heading text-foreground mb-3">
                          {formatMoney(msg.agreementAmount, msg.agreementCurrency as CurrencyCode)}
                        </p>
                      )}
                      <div className="mt-2 pt-3 border-t border-border flex items-center justify-between">
                        <span className={`text-[13px] font-bold uppercase tracking-wider ${msg.agreementStatus === "released" || msg.agreementStatus === "completed" ? "text-success" : msg.agreementStatus === "disputed" ? "text-destructive" : "text-highlight"}`}>
                          {statusLabel((msg.agreementStatus ?? "pending_acceptance") as AgreementStatus, t)}
                        </span>
                        {msg.agreementId && (
                          <Button variant="ghost" className="h-8 text-[13px] font-bold uppercase tracking-widest text-highlight hover:bg-highlight/10 px-2" onClick={() => setLocation(`/agreements/${msg.agreementId}`)} data-testid={`button-open-agreement-${msg.agreementId}`}>
                            {t.agreeOpenContract} →
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // Transfer card
              if (msg.isTransfer) {
                return (
                  <div key={msg.id} className={`flex w-full ${own ? "justify-end" : "justify-start"} my-2`}>
                    <div className="max-w-[260px] bg-card border border-border rounded-3xl p-5 shadow-premium">
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${own ? "bg-primary/20 text-primary border border-primary/30" : "bg-success/20 text-success border border-success/30"}`}>
                          <ArrowUpRight className={`w-5 h-5 ${!own && "rotate-180"}`} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{own ? "Wysłano" : "Otrzymano"}</p>
                          <p className="text-xl font-heading text-foreground">{msg.transferAmount?.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł</p>
                        </div>
                      </div>
                      {msg.text && (
                        <div className="bg-secondary/50 rounded-xl p-3 text-sm text-foreground/80">&quot;{msg.text}&quot;</div>
                      )}
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                        <span className={`text-[13px] font-bold uppercase tracking-wider ${msg.transferStatus === "completed" ? "text-success" : msg.transferStatus === "failed" ? "text-destructive" : "text-warning"}`}>
                          {TRANSFER_STATUS_PL[msg.transferStatus || "completed"] ?? TRANSFER_STATUS_PL["completed"]}
                        </span>
                        <Button variant="ghost" className="h-8 text-[13px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 px-2">
                          Potwierdzenie
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }

              // Regular message bubble
              return (
                <div key={msg.id} className={`flex gap-2 ${own ? "justify-end" : "justify-start"}`}>
                  {!own && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[13px] shrink-0 self-end border border-primary/20">
                      {initials[0]}
                    </div>
                  )}
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 flex flex-col gap-1 ${own ? "bg-primary/20 border border-primary/30 rounded-br-sm" : "bg-card border border-border rounded-bl-sm"}`}
                    data-testid={`bubble-msg-${msg.id}`}
                  >
                    {/* Image attachment */}
                    {isImage && msg.attachment && (
                      <a href={`/api/messages/attachment/${msg.attachment.id}`} target="_blank" rel="noopener noreferrer">
                        <img src={`/api/messages/attachment/${msg.attachment.id}`} alt={msg.attachment.fileName}
                          className="max-w-[220px] max-h-[180px] rounded-xl object-cover"
                          data-testid={`img-attachment-${msg.attachment.id}`}
                        />
                      </a>
                    )}
                    {/* Audio / voice message */}
                    {isAudio && msg.attachment && (
                      <VoiceMessagePlayer attachmentId={msg.attachment.id} isOwn={own} />
                    )}
                    {/* File attachment */}
                    {msg.attachment && !isImage && !isAudio && (
                      <a
                        href={`/api/messages/attachment/${msg.attachment.id}`}
                        target="_blank" rel="noopener noreferrer"
                        className={`flex items-center gap-2 text-sm font-medium no-underline ${own ? "text-primary" : "text-primary"}`}
                        data-testid={`link-attachment-${msg.attachment.id}`}
                      >
                        <Paperclip className="w-4 h-4 shrink-0" />
                        <span className="truncate max-w-[150px]">{msg.attachment.fileName}</span>
                        <span className="text-[12px] text-muted-foreground shrink-0">({(msg.attachment.sizeBytes / 1024).toFixed(0)} KB)</span>
                      </a>
                    )}
                    {/* Text */}
                    {msg.text && (
                      <p className="text-[15px] leading-relaxed text-foreground">{searchQuery ? highlightText(msg.text, searchQuery) : msg.text}</p>
                    )}
                    {/* Meta row */}
                    <div className={`flex items-center gap-1.5 ${own ? "justify-end" : "justify-start"} mt-0.5`}>
                      <span className="text-[12px] text-muted-foreground">{fmtTime(msg.createdAt)}</span>
                      {own && (
                        <span data-testid={`status-msg-${msg.id}`} className={`text-[12px] font-semibold ${isOptimistic ? "text-muted-foreground" : effectiveStatus === "read" ? "text-primary" : "text-muted-foreground"}`}>
                          {isOptimistic ? "…" : effectiveStatus === "read" ? "✓✓" : effectiveStatus === "delivered" ? "✓✓" : "✓"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Typing indicator */}
        {partnerTyping && (
          <div className="flex gap-2 justify-start" data-testid="typing-indicator">
            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[13px] shrink-0 self-end border border-primary/20">
              {initials[0]}
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="text-[13px] text-muted-foreground italic mr-1">pisze</span>
              {[0, 0.2, 0.4].map((delay, i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 inline-block animate-bounce" style={{ animationDelay: `${delay}s` }} />
              ))}
            </div>
          </div>
        )}

          <div
            ref={messagesEndRef}
            className="h-1 shrink-0"
            aria-hidden="true"
            data-testid="messages-end"
          />
</main>

      {/* Send row */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-background/90 backdrop-blur-xl border-t border-border px-4 py-3 pb-6">
        {isBlockedByMe ? (
          <div className="flex items-center justify-center py-2 shrink-0 z-50 bg-background border-t border-border">
            <p className="text-sm text-destructive font-semibold text-center">Zablokowałeś tego użytkownika. Odblokuj, aby pisać.</p>
          </div>
        ) : (
          <>
            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf,text/plain,text/csv" className="hidden" onChange={handleAttachFile} data-testid="input-file-attach" />

            {isRecording ? (
              /* Recording mode */
              <div ref={chatComposerRef} className="flex items-center gap-2 fixed bottom-0 inset-x-0 z-[90] shrink-0 bg-background border-t border-border px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
                <button onClick={cancelRecording} className="w-10 h-10 rounded-full flex items-center justify-center bg-destructive/10 border border-destructive/30 text-destructive shrink-0" data-testid="button-cancel-recording" aria-label="Anuluj nagranie">
                  <X className="w-4 h-4" />
                </button>
                <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-2xl border transition-colors ${recWarning ? "bg-alert/10 border-alert/30" : "bg-destructive/10 border-destructive/25"}`} data-testid="status-recording">
                  <span className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${recWarning ? "bg-alert" : "bg-destructive"}`} />
                  <span className={`text-sm font-bold shrink-0 ${recWarning ? "text-alert" : "text-destructive"}`}>{recElapsed}</span>
                  <div ref={chatComposerRef} className="flex-1 flex items-center gap-0.5 fixed inset-x-0 bottom-0 z-[80] shrink-0 bg-background border-t border-border px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]" data-testid="waveform-live">
                    {waveformBars.map((h, i) => (
                      <div key={i} className={`w-0.5 rounded-full transition-all duration-75 ${recWarning ? "bg-alert/60" : "bg-destructive/60"}`} style={{ height: `${h}px` }} />
                    ))}
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${recWarning ? "text-alert" : "text-muted-foreground"}`} data-testid="text-recording-countdown">{recRemainingStr}</span>
                </div>
                <button onClick={stopRecording} className="w-10 h-10 rounded-full flex items-center justify-center bg-destructive text-destructive-foreground shrink-0" data-testid="button-send-recording" aria-label="Wyślij nagranie">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* Normal mode */
              <div className="shrink-0 bg-background border-t border-border px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] flex items-center gap-2 z-50">
                <button onClick={() => fileInputRef.current?.click()} disabled={attachPending || sendPending} className="w-10 h-10 rounded-full flex items-center justify-center bg-secondary border border-border text-muted-foreground hover:text-foreground shrink-0 transition-colors" data-testid="button-attach-file" aria-label="Dodaj załącznik">
                  {attachPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={e => { setDraft(e.target.value); sendTyping(); }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Napisz wiadomość…"
                  disabled={sendPending}
                  className="flex-1 h-11 px-4 bg-secondary border border-border rounded-full text-[15px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 outline-none transition-colors"
                  data-testid="input-message"
                />
                <AnimatePresence mode="wait">
                  {draft.trim() ? (
                    <motion.button
                      key="send"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      onClick={() => handleSend()}
                      disabled={sendPending}
                      className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-premium disabled:opacity-50"
                      data-testid="button-send-message"
                      aria-label="Wyślij"
                    >
                      {sendPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
                    </motion.button>
                  ) : (
                    <motion.button
                      key="mic"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      onClick={startRecording}
                      disabled={attachPending || sendPending}
                      className="w-11 h-11 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground flex items-center justify-center shrink-0 transition-colors"
                      data-testid="button-start-recording"
                      aria-label="Nagraj wiadomość głosową"
                    >
                      <Mic className="w-4 h-4" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
      </div>
      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl p-6">
            <h3 className="text-base font-semibold text-foreground mb-2">Usuń rozmowę</h3>
            <p className="text-sm text-muted-foreground mb-6">Zniknie tylko u Ciebie. Druga osoba nadal ją widzi.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-secondary text-foreground hover:bg-secondary/80 transition"
              >
                Anuluj
              </button>
              <button
                onClick={doDeleteConversation}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition"
              >
                Usuń
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
