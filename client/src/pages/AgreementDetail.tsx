import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Send, CheckCircle2, XCircle, AlertTriangle,
  Loader2, FileText, Clock, Image, MessageSquare, Shield,
  ChevronDown, ChevronUp, Edit3, Check, X,
  Lock, ClipboardCheck, Banknote, UserCheck, Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { ref as dbRef, onValue, off, set, push } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import { useAppStore, formatMoney, type CurrencyCode } from "@/lib/store";
import { useLang } from "@/context/LanguageContext";
import { type AgreementStatus, type Agreement, type AgreementAcceptance, statusLabel, statusColor } from "./Agreements";

type AgreementEvent = {
  id: string;
  type: string;
  actorUid: string;
  actorName: string;
  timestamp: string;
  note?: string;
  imageBase64?: string;
};

type AgreementMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  imageBase64?: string;
};

type SubmitModal = {
  note: string;
  image: string | null;
};

type ChangeRequestChanges = {
  deadline?: string;
  amount?: number;
  terms?: string;
};

type ChangeRequest = {
  id: string;
  requestedBy: string;
  requestedByName: string;
  changes?: ChangeRequestChanges;
  note?: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
};

type ChangeModalState = {
  newDeadline: string;
  newAmount: string;
  newTerms: string;
  note: string;
};

export default function AgreementDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user, wallets, refreshWallets } = useAppStore();
  const { t } = useLang();

  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [events, setEvents]       = useState<AgreementEvent[]>([]);
  const [messages, setMessages]   = useState<AgreementMessage[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [submitModal, setSubmitModal] = useState<SubmitModal | null>(null);
  const [submitConfirmed, setSubmitConfirmed] = useState(false);
  const [disputeNote, setDisputeNote] = useState("");
  const [disputeType, setDisputeType] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [changeModal, setChangeModal] = useState<ChangeModalState | null>(null);
  const [pendingChange, setPendingChange] = useState<ChangeRequest | null>(null);
  const [showRawEvents, setShowRawEvents] = useState(false);
  const [workerRatingCount, setWorkerRatingCount] = useState<number | null>(null);
  const [workerRatingLoaded, setWorkerRatingLoaded] = useState(false);
  const [workerRatingFetchOk, setWorkerRatingFetchOk] = useState(false);
  const [workerProfile, setWorkerProfile] = useState<{
    ratingAverage: number | null;
    ratingCount: number;
    recommendedPercent: number | null;
    completedAgreements: number;
  } | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingOnTime, setRatingOnTime] = useState<boolean | null>(null);
  const [ratingRecommend, setRatingRecommend] = useState<boolean | null>(null);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingThanks, setRatingThanks] = useState(false);
  const [hasRated, setHasRated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const agRef   = dbRef(realtimeDb, `agreements/${id}`);
    const evRef   = dbRef(realtimeDb, `agreementEvents/${id}`);
    const msgRef  = dbRef(realtimeDb, `agreementMessages/${id}`);
    const crRef   = dbRef(realtimeDb, `agreementChangeRequests/${id}`);

    onValue(agRef, snap => {
      if (!isMounted.current) return;
      if (snap.exists()) {
        setAgreement({ ...snap.val() as Agreement, id: id! });
        setLoading(false);
      } else {
        setLoading(false);
        setError(t.agreeErrNotFound);
      }
    });

    onValue(evRef, snap => {
      if (!isMounted.current) return;
      if (snap.exists()) {
        const raw = snap.val() as Record<string, Omit<AgreementEvent, "id">>;
        const vals: AgreementEvent[] = Object.entries(raw).map(([k, v]) => ({ ...v, id: k }));
        setEvents(vals.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
      }
    });

    onValue(msgRef, snap => {
      if (!isMounted.current) return;
      if (snap.exists()) {
        const rawM = snap.val() as Record<string, Omit<AgreementMessage, "id">>;
        const vals: AgreementMessage[] = Object.entries(rawM).map(([k, v]) => ({ ...v, id: k }));
        setMessages(vals.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
      }
    });

    onValue(crRef, snap => {
      if (!isMounted.current) return;
      if (snap.exists()) {
        const raw = snap.val() as Record<string, Omit<ChangeRequest, "id">>;
        const allChanges: ChangeRequest[] = Object.entries(raw).map(([k, v]) => ({ ...v, id: k }));
        const pending = allChanges
          .filter(c => c.status === "pending")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
        setPendingChange(pending);
      } else {
        setPendingChange(null);
      }
    });

    return () => {
      isMounted.current = false;
      off(agRef); off(evRef); off(msgRef); off(crRef);
    };
  }, [id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (!agreement?.workerUid) return;
    fetch(`/api/users/${agreement.workerUid}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { ratingCount?: number } | null) => {
        if (!isMounted.current) return;
        setWorkerRatingCount(data?.ratingCount ?? null);
        setWorkerRatingFetchOk(true);
        setWorkerRatingLoaded(true);
      })
      .catch(() => { if (isMounted.current) { setWorkerRatingFetchOk(false); setWorkerRatingLoaded(true); } });
  }, [agreement?.workerUid]);

  useEffect(() => {
    if (!agreement?.workerUid) return;
    const profileRef = dbRef(realtimeDb, `users/${agreement.workerUid}/profile`);
    const unsub = onValue(profileRef, snap => {
      if (!isMounted.current) return;
      if (snap.exists()) {
        const p = snap.val() as {
          ratingAverage?: number;
          ratingCount?: number;
          recommendedPercent?: number;
          completedAgreements?: number;
        };
        setWorkerProfile({
          ratingAverage: p.ratingAverage ?? null,
          ratingCount: p.ratingCount ?? 0,
          recommendedPercent: p.recommendedPercent ?? null,
          completedAgreements: p.completedAgreements ?? 0,
        });
      }
    });
    return () => off(profileRef);
  }, [agreement?.workerUid]);

  useEffect(() => {
    if (!user?.id || !id || !agreement) return;
    const ratedRef = dbRef(realtimeDb, `agreements/${id}/ratedBy/${user.id}`);
    const unsub = onValue(ratedRef, snap => {
      if (!isMounted.current) return;
      setHasRated(snap.exists() && snap.val() === true);
    });
    return () => off(ratedRef);
  }, [user?.id, id, agreement?.status]);

  useEffect(() => {
    if (!agreement || !user?.id) return;
    if ((agreement.status === "released" || agreement.status === "completed") && !hasRated) {
      const timer = setTimeout(() => {
        if (isMounted.current) setShowRatingModal(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [agreement?.status, hasRated]);

  const ag = agreement;
  const isCreator = ag?.creatorUid === user?.id;
  const isWorker  = ag?.workerUid  === user?.id;
  const isParty   = isCreator || isWorker;

  const addEvent = async (type: string, note?: string, extra?: Record<string, unknown>) => {
    if (!user || !id) return;
    const evId = `ev_${Date.now()}`;
    await set(dbRef(realtimeDb, `agreementEvents/${id}/${evId}`), {
      type,
      note: note ?? null,
      actorUid:  user.id,
      actorName: user.name,
      timestamp: new Date().toISOString(),
      ...(extra ?? {}),
    });
  };

  const updateStatus = async (status: AgreementStatus) => {
    if (!id) return;
    const now = new Date().toISOString();
    await set(dbRef(realtimeDb, `agreements/${id}/status`), status);
    await set(dbRef(realtimeDb, `agreements/${id}/updatedAt`), now);
  };

  const handleWorkerAccept = async () => {
    if (!ag || actionLoading) return;
    setActionLoading(true);
    try {
      const now = new Date().toISOString();
      await set(dbRef(realtimeDb, `agreements/${id}/acceptance/workerAccepted`), true);
      await set(dbRef(realtimeDb, `agreements/${id}/acceptance/workerAcceptedAt`), now);
      // Normalize legacy acceptance node: creator accepted by creating the agreement,
      // so ensure creatorAccepted is present so the node is never partially missing it.
      if (!ag.acceptance?.creatorAccepted) {
        await set(dbRef(realtimeDb, `agreements/${id}/acceptance/creatorAccepted`), true);
      }
      await updateStatus("accepted");
      await addEvent("workerAccepted");
    } catch { setError(t.agreeErrFailedAccept); }
    setActionLoading(false);
  };

  const handleSubmit = async () => {
    if (!ag || !submitModal || actionLoading) return;
    if (!submitConfirmed) return;
    if (ag.proofPhoto && !submitModal.image) return;
    setActionLoading(true);
    try {
      await updateStatus("submitted");
      await addEvent("submitted", submitModal.note || undefined);
      if (submitModal.image) {
        const evId2 = `ev_${Date.now() + 1}`;
        await set(dbRef(realtimeDb, `agreementEvents/${id}/${evId2}`), {
          type: "proof_image",
          actorUid: user!.id,
          actorName: user!.name,
          timestamp: new Date().toISOString(),
          note: submitModal.note || null,
          imageBase64: submitModal.image,
        });
      }
      setSubmitModal(null);
      setSubmitConfirmed(false);
    } catch { setError(t.agreeErrFailedSubmit); }
    setActionLoading(false);
  };

  const handleFund = async () => {
    if (!ag || actionLoading) return;
    const currentBalance = wallets[(ag.currency as CurrencyCode)] ?? 0;
    if (currentBalance < ag.amount) {
      setError(t.agreeNoFunds);
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const fundResp = await fetch("/api/agreements/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId: ag.id, workerUid: ag.workerUid, amount: ag.amount, currency: ag.currency }),
      });
      if (!fundResp.ok) {
        const err = await fundResp.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? t.agreeNoFunds);
      }

      await set(dbRef(realtimeDb, `agreementHolds/${id}`), {
        creatorUid: ag.creatorUid,
        workerUid:  ag.workerUid,
        amount:     ag.amount,
        currency:   ag.currency,
        status:     "held",
        createdAt:  new Date().toISOString(),
      });

      await updateStatus("funded");
      await addEvent("funded");
      refreshWallets().catch(() => {});
    } catch (e: unknown) { setError(e instanceof Error ? e.message : t.agreeErrFailedFund); }
    setActionLoading(false);
  };

  const handleConfirm = async () => {
    if (!ag || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      const releaseResp = await fetch("/api/agreements/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId: ag.id }),
      });
      if (!releaseResp.ok) {
        const err = await releaseResp.json().catch(() => ({}));
        const msg = (err as { message?: string }).message ?? "";
        // 409 duplicate-release: surface a friendly localized message.
        if (releaseResp.status === 409 || msg === "Funds already released") {
          throw new Error(t.agreeErrFundsAlreadyReleased);
        }
        throw new Error(msg || t.agreeErrFailedConfirm);
      }

      await set(dbRef(realtimeDb, `agreementHolds/${id}/status`), "released");
      await set(dbRef(realtimeDb, `agreementHolds/${id}/releasedAt`), new Date().toISOString());

      const txId = `tx_${Date.now()}`;
      await set(dbRef(realtimeDb, `walletTransactions/${ag.workerUid}/${txId}`), {
        type: "agreement_release",
        agreementId: id,
        agreementTitle: ag.title,
        amount: ag.amount,
        currency: ag.currency,
        fromUid: ag.creatorUid,
        timestamp: new Date().toISOString(),
      });

      await updateStatus("completed");
      await addEvent("completed");
      await updateStatus("released");
      await addEvent("released");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : t.agreeErrFailedConfirm); }
    setActionLoading(false);
  };

  const handleDispute = async () => {
    if (!ag || actionLoading || !disputeNote.trim() || !disputeType) return;
    setActionLoading(true);
    try {
      const disputeLabel = disputeReasons.find(r => r.value === disputeType)?.label ?? disputeType;
      await set(dbRef(realtimeDb, `agreements/${id}/disputeType`), disputeType);
      await set(dbRef(realtimeDb, `agreements/${id}/disputeReason`), disputeLabel);
      await set(dbRef(realtimeDb, `agreements/${id}/disputeNote`), disputeNote.trim());
      await updateStatus("disputed");
      await addEvent("disputed", `[${disputeLabel}] ${disputeNote.trim()}`);
      setShowDispute(false);
      setDisputeNote("");
      setDisputeType("");
    } catch { setError(t.agreeErrFailedDispute); }
    setActionLoading(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !user || !id) return;
    const txt = chatInput.trim();
    setChatInput("");
    const msgRef2 = dbRef(realtimeDb, `agreementMessages/${id}`);
    await push(msgRef2, {
      senderId:   user.id,
      senderName: user.name,
      text: txt,
      timestamp: new Date().toISOString(),
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setError(t.agreeErrImageSize); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      setSubmitModal(prev => prev ? { ...prev, image: ev.target?.result as string } : prev);
    };
    reader.readAsDataURL(file);
  };

  const handleSendChange = async () => {
    if (!ag || !changeModal || !user || !id) return;
    const { newDeadline, newAmount, newTerms, note } = changeModal;
    const changes: ChangeRequestChanges = {};
    if (newDeadline.trim()) changes.deadline = newDeadline.trim();
    // Amount locked once funds held in sandbox ledger (intentional product constraint).
    if (!["funded", "in_progress"].includes(ag.status) && newAmount.trim() && !isNaN(Number(newAmount))) changes.amount = parseFloat(parseFloat(newAmount).toFixed(2));
    if (newTerms.trim()) changes.terms = newTerms.trim();
    if (Object.keys(changes).length === 0) return;
    setActionLoading(true);
    try {
      const changeId = `ch_${Date.now()}`;
      await set(dbRef(realtimeDb, `agreementChangeRequests/${id}/${changeId}`), {
        requestedBy:     user.id,
        requestedByName: user.name,
        changes,
        note: note.trim() || null,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      await addEvent("changeProposed", note.trim() || undefined);
      setChangeModal(null);
    } catch { setError(t.agreeErrFailedPropose); }
    setActionLoading(false);
  };

  const handleChangeAccept = async () => {
    if (!ag || !pendingChange || !id) return;
    // Guard: only the counterparty (not the proposer) may accept a change request.
    if (!user || pendingChange.requestedBy === user.id) return;
    setActionLoading(true);
    try {
      const { changes } = pendingChange;
      if (changes) {
        if (changes.deadline?.trim()) {
          await set(dbRef(realtimeDb, `agreements/${id}/deadline`), changes.deadline.trim());
        }
        if (changes.amount && isFinite(changes.amount) && changes.amount > 0) {
          await set(dbRef(realtimeDb, `agreements/${id}/amount`), parseFloat(changes.amount.toFixed(2)));
        }
        if (changes.terms?.trim()) {
          await set(dbRef(realtimeDb, `agreements/${id}/terms`), changes.terms.trim());
        }
        await set(dbRef(realtimeDb, `agreements/${id}/updatedAt`), new Date().toISOString());
      }
      await set(dbRef(realtimeDb, `agreementChangeRequests/${id}/${pendingChange.id}/status`), "accepted");
      await addEvent("changeAccepted");
    } catch { setError(t.agreeErrFailedApply); }
    setActionLoading(false);
  };

  const handleChangeReject = async () => {
    if (!ag || !pendingChange || !id) return;
    // Guard: only the counterparty (not the proposer) may reject a change request.
    if (!user || pendingChange.requestedBy === user.id) return;
    setActionLoading(true);
    try {
      await set(dbRef(realtimeDb, `agreementChangeRequests/${id}/${pendingChange.id}/status`), "rejected");
      await addEvent("changeRejected");
    } catch { setError(t.agreeErrFailedReject); }
    setActionLoading(false);
  };

  const computeUserLevel = (completedAgreements: number, ratingAverage: number | null, emailVerified: boolean): string => {
    if (completedAgreements >= 25 && (ratingAverage ?? 0) >= 4.8) return "super";
    if (completedAgreements >= 10 && (ratingAverage ?? 0) >= 4.7) return "top";
    if (completedAgreements >= 3 && (ratingAverage ?? 0) >= 4.5) return "trusted";
    if (emailVerified) return "verified";
    return "new";
  };

  const levelLabel = (level: string): string => {
    const map: Record<string, string> = {
      super: t.levelSuper, top: t.levelTop, trusted: t.levelTrusted,
      verified: t.levelVerified, new: t.levelNew,
    };
    return map[level] ?? level;
  };

  const levelColor = (level: string): string => {
    const map: Record<string, string> = {
      super: "#f59e0b", top: "#a855f7", trusted: "#3b82f6",
      verified: "#22c55e", new: "rgba(255,255,255,0.4)",
    };
    return map[level] ?? "rgba(255,255,255,0.4)";
  };

  const handleRateSubmit = async () => {
    if (!user || !ag || ratingStars === 0) return;

    // Guard: current user must be a party to this agreement
    const isParty = ag.creatorUid === user.id || ag.workerUid === user.id;
    // Guard: agreement must be in a rateable status
    const isRateableStatus = ag.status === "released" || ag.status === "completed";
    if (!isParty || !isRateableStatus) return;

    const toUid = isCreator ? ag.workerUid : ag.creatorUid;
    if (!toUid || toUid === user.id) return;
    setRatingSubmitting(true);
    try {
      const ratingId = `rating_${Date.now()}_${user.id.slice(0, 6)}`;
      await set(dbRef(realtimeDb, `ratings/${ratingId}`), {
        agreementId: id,
        fromUid: user.id,
        toUid,
        stars: ratingStars,
        comment: ratingComment.trim() || null,
        onTime: ratingOnTime,
        recommended: ratingRecommend,
        createdAt: new Date().toISOString(),
      });

      const profileRef = dbRef(realtimeDb, `users/${toUid}/profile`);
      const { get } = await import("firebase/database");
      const profileSnap = await get(profileRef);
      const existing = profileSnap.exists() ? profileSnap.val() as {
        ratingAverage?: number;
        ratingCount?: number;
        recommendedYesCount?: number;
        recommendedCount?: number;
        completedAgreements?: number;
      } : {};

      const prevCount = existing.ratingCount ?? 0;
      const prevAvg = existing.ratingAverage ?? 0;
      const newCount = prevCount + 1;
      const newAvg = ((prevAvg * prevCount) + ratingStars) / newCount;

      // Track raw yes/total counts to avoid floating-point percent drift
      const newRecommendedCount = ratingRecommend !== null
        ? (existing.recommendedCount ?? 0) + 1
        : (existing.recommendedCount ?? 0);
      const newRecommendedYesCount = ratingRecommend === true
        ? (existing.recommendedYesCount ?? 0) + 1
        : (existing.recommendedYesCount ?? 0);

      const agreementsSnap = await get(dbRef(realtimeDb, "agreements"));
      let completedCount = 0;
      if (agreementsSnap.exists()) {
        const allAgreements = agreementsSnap.val() as Record<string, {
          workerUid?: string; creatorUid?: string; status?: string;
        }>;
        completedCount = Object.values(allAgreements).filter(a =>
          (a.workerUid === toUid || a.creatorUid === toUid) &&
          (a.status === "released" || a.status === "completed")
        ).length;
      }

      await set(profileRef, {
        ...(existing as object),
        ratingAverage: parseFloat(newAvg.toFixed(2)),
        ratingCount: newCount,
        recommendedYesCount: newRecommendedYesCount,
        recommendedCount: newRecommendedCount,
        completedAgreements: completedCount,
      });

      await set(dbRef(realtimeDb, `agreements/${id}/ratedBy/${user.id}`), true);
      setHasRated(true);
      setRatingThanks(true);
      setTimeout(() => {
        if (isMounted.current) setShowRatingModal(false);
      }, 2000);
    } catch {
      setError(t.unknownError);
    }
    setRatingSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (error && !ag) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <XCircle className="w-10 h-10 text-destructive mb-4" />
        <h2 className="text-xl font-heading text-white">{error}</h2>
        <Button onClick={() => setLocation("/agreements")} variant="outline" className="mt-4 rounded-xl">← {t.agreeTitle}</Button>
      </div>
    );
  }

  if (!ag || !isParty) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <FileText className="w-10 h-10 text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-heading text-white/80">{t.agreeErrNoAccess}</h2>
        <Button onClick={() => setLocation("/agreements")} variant="outline" className="mt-4 rounded-xl">← {t.agreeTitle}</Button>
      </div>
    );
  }

  const color    = statusColor(ag.status);
  const deadline = ag.deadline ? new Date(ag.deadline) : null;

  const acceptance: AgreementAcceptance | undefined = ag.acceptance;
  // For legacy agreements missing the acceptance node, infer from status.
  const workerAccepted = acceptance
    ? (acceptance.workerAccepted ?? false)
    : ag.status !== "pending_acceptance";
  const creatorAccepted = acceptance
    ? (acceptance.creatorAccepted ?? false)
    : ag.status !== "pending_acceptance";

  const canAccept  = isWorker  && ag.status === "pending_acceptance";
  const canSubmit  = isWorker  && (ag.status === "funded" || ag.status === "in_progress");
  const canFund    = isCreator && ag.status === "accepted" && workerAccepted;
  const canConfirm = isCreator && ag.status === "submitted";
  const canDispute = isCreator && ag.status === "submitted";
  const canChange  = isParty   && ["accepted", "funded", "in_progress"].includes(ag.status);
  const fundsHeld  = ["funded", "in_progress"].includes(ag.status);

  const walletBalance = wallets[(ag.currency as CurrencyCode)] ?? 0;
  const shortfall     = ag.amount - walletBalance;
  const hasShortfall  = shortfall > 0;

  const submittedEvent  = events.find(ev => ev.type === "submitted");
  const proofImageEvent = events.find(ev => ev.type === "proof_image");

  const disputeReasons = [
    { value: "not_performed",   label: t.agreeDisputeReason1 },
    { value: "partial",         label: t.agreeDisputeReason2 },
    { value: "unclear_proof",   label: t.agreeDisputeReason3 },
    { value: "deadline_miss",   label: t.agreeDisputeReason4 },
    { value: "amount_mismatch", label: t.agreeDisputeReason5 },
    { value: "other",           label: t.agreeDisputeReason6 },
  ];

  const timelineSteps = [
    { label: t.agreeTimelineStep1, icon: FileText, statuses: ["pending_acceptance", "accepted", "funded", "in_progress", "submitted", "completed", "released", "disputed"] },
    { label: t.agreeTimelineStep2, icon: UserCheck, statuses: ["accepted", "funded", "in_progress", "submitted", "completed", "released"] },
    { label: t.agreeTimelineStep3, icon: Lock, statuses: ["funded", "in_progress", "submitted", "completed", "released"] },
    { label: t.agreeTimelineStep4, icon: ClipboardCheck, statuses: ["submitted", "completed", "released"] },
    { label: t.agreeTimelineStep5, icon: Check, statuses: ["completed", "released"] },
    { label: t.agreeTimelineStep6, icon: Banknote, statuses: ["released"] },
  ];

  const currentTimelineStep = timelineSteps.reduce((acc, step, idx) => {
    return step.statuses.includes(ag.status) ? idx : acc;
  }, -1);

  const eventTypeLabel: Record<string, string> = {
    created:         t.agreeEvtCreated,
    accepted:        t.agreeEvtAccepted,
    workerAccepted:  t.agreeEvtWorkerAccepted,
    funded:          t.agreeEvtFunded,
    submitted:       t.agreeEvtSubmitted,
    proof_image:     t.agreeEvtProofImage,
    completed:       t.agreeEvtCompleted,
    released:        t.agreeEvtReleased,
    disputed:        t.agreeEvtDisputed,
    cancelled:       t.agreeEvtCancelled,
    changeProposed:  t.agreeEvtChangeProposed,
    changeAccepted:  t.agreeEvtChangeAccepted,
    changeRejected:  t.agreeEvtChangeRejected,
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    color: "white", padding: "11px 14px",
    width: "100%", fontSize: 14, outline: "none",
  };

  const pendingChangeIsFromOtherParty = pendingChange && pendingChange.requestedBy !== user?.id;

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-[250px] h-[250px] bg-purple-500/5 rounded-full blur-[70px] pointer-events-none" />

      <header className="px-5 pt-14 pb-4 sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-white/5 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 hover:bg-secondary/80 shrink-0" onClick={() => setLocation("/agreements")}>
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-heading text-white/90 truncate">{ag.title}</h1>
          <span style={{
            display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
            textTransform: "uppercase", color, background: `${color}18`,
            border: `1px solid ${color}28`, borderRadius: 999, padding: "2px 9px", marginTop: 2,
          }}>
            {statusLabel(ag.status, t)}
          </span>
        </div>
        {canChange && (
          <button
            data-testid="button-propose-change"
            onClick={() => setChangeModal({ newDeadline: "", newAmount: "", newTerms: "", note: "" })}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
              color: "#9333ea", background: "rgba(147,51,234,0.10)",
              border: "1px solid rgba(147,51,234,0.25)",
              borderRadius: 10, padding: "5px 9px", cursor: "pointer",
              whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            <Edit3 className="w-3 h-3" />
            {t.agreeChangeBtn}
          </button>
        )}
      </header>

      <main ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ paddingBottom: "calc(130px + env(safe-area-inset-bottom))" }}>

        {/* Main info card */}
        <div className="bg-card border border-white/5 rounded-3xl p-5 space-y-4 shadow-premium">
          <div className="flex justify-between items-start">
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>{t.agreeAmount}</p>
              <p className="text-3xl font-heading text-white">{formatMoney(ag.amount, ag.currency as CurrencyCode)}</p>
            </div>
            {deadline && (
              <div className="flex items-center gap-1.5 bg-secondary/50 rounded-xl px-3 py-2">
                <Clock size={12} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{deadline.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 3 }}>{t.agreeFrom}</p>
              <p className="text-sm font-medium text-white/80">{ag.creatorName}</p>
              {isCreator && <p className="text-[12px] text-purple-400 font-bold">YOU</p>}
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 3 }}>{t.agreeTo}</p>
              <p className="text-sm font-medium text-white/80">{ag.workerName}</p>
              {isWorker && <p className="text-[12px] text-purple-400 font-bold">YOU</p>}
              {workerProfile && (() => {
                const lvl = computeUserLevel(workerProfile.completedAgreements, workerProfile.ratingAverage, false);
                return (
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span data-testid="badge-worker-level" style={{
                      fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                      color: levelColor(lvl), background: `${levelColor(lvl)}18`,
                      border: `1px solid ${levelColor(lvl)}35`, borderRadius: 999, padding: "2px 8px",
                    }}>{levelLabel(lvl)}</span>
                    {workerProfile.ratingAverage !== null && (
                      <span data-testid="badge-worker-rating" className="flex items-center gap-0.5" style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>
                        <Star size={10} fill="#f59e0b" />
                        {workerProfile.ratingAverage.toFixed(1)}
                        <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 400, fontSize: 11 }}>({workerProfile.ratingCount})</span>
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {ag.description && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>{t.agreeFieldDesc}</p>
              <p className="text-sm text-white/60 leading-relaxed">{ag.description}</p>
            </div>
          )}

          <div>
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>{t.agreeFieldTerms}</p>
            <p className="text-sm text-white/60 leading-relaxed">{ag.terms}</p>
          </div>

          {ag.completionCriteria && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>{t.agreeCompletionCriteria}</p>
              <p className="text-sm text-white/60 leading-relaxed">{ag.completionCriteria}</p>
            </div>
          )}

          {(ag.proofPhoto || ag.proofNote) && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>{t.agreeFieldProof}</p>
              <div className="flex gap-2">
                {ag.proofPhoto && <span className="text-[13px] font-bold text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1">{t.agreeProofPhoto}</span>}
                {ag.proofNote  && <span className="text-[13px] font-bold text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1">{t.agreeProofNote}</span>}
              </div>
            </div>
          )}

          {/* Bilateral acceptance indicators */}
          <div className="pt-1 border-t border-white/5">
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>{t.agreeAcceptanceSection}</p>
            <div className="flex gap-2">
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold ${creatorAccepted ? "bg-green-500/12 border border-green-500/25 text-green-400" : "bg-secondary border border-white/8 text-muted-foreground"}`}>
                {creatorAccepted ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                {creatorAccepted ? t.agreeCreatorAcceptedLabel : t.agreeCreatorPendingLabel}
              </div>
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold ${workerAccepted ? "bg-green-500/12 border border-green-500/25 text-green-400" : "bg-secondary border border-white/8 text-muted-foreground"}`}>
                {workerAccepted ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                {workerAccepted ? t.agreeWorkerAcceptedLabel : t.agreeWorkerPendingLabel}
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-card border border-white/5 rounded-3xl p-5">
          <p className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground mb-4">{t.agreeTimelineTitle}</p>
          <div className="relative">
            <div
              className="absolute left-[15px] top-0 bottom-0 w-[1px]"
              style={{ background: "rgba(255,255,255,0.08)" }}
            />
            <div className="space-y-4">
              {timelineSteps.map((step, idx) => {
                const isDone    = step.statuses.includes(ag.status);
                const isCurrent = idx === currentTimelineStep && ag.status !== "released";
                const isDisputed = ag.status === "disputed" && idx === 3;
                const StepIcon  = step.icon;
                const iconColor = isDisputed ? "#ef4444" : isDone ? "#22c55e" : "rgba(255,255,255,0.2)";
                const labelColor = isDone ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)";
                const timestampEv = events.find(ev => {
                  const mapping: Record<number, string[]> = {
                    0: ["created"],
                    1: ["workerAccepted", "accepted"],
                    2: ["funded"],
                    3: ["submitted"],
                    4: ["completed"],
                    5: ["released"],
                  };
                  return mapping[idx]?.includes(ev.type);
                });
                return (
                  <div key={idx} className="flex items-start gap-4 relative">
                    <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        background: isDisputed ? "rgba(239,68,68,0.15)" : isDone ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                        border: `1.5px solid ${iconColor}`,
                        boxShadow: isCurrent ? `0 0 12px ${iconColor}40` : "none",
                      }}
                    >
                      <StepIcon size={13} style={{ color: iconColor }} />
                    </div>
                    <div className="flex-1 pt-1 min-w-0">
                      <p className="text-[14px] font-semibold" style={{ color: labelColor }}>{step.label}</p>
                      {timestampEv && (
                        <p className="text-[12px] text-muted-foreground/50 mt-0.5">
                          {timestampEv.actorName} · {new Date(timestampEv.timestamp).toLocaleString()}
                        </p>
                      )}
                      {isDisputed && (
                        <p className="text-[13px] text-red-400 mt-0.5 font-semibold">⚠ {statusLabel("disputed", t)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="bg-destructive/10 border border-destructive/25 rounded-2xl p-3 text-sm text-destructive flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={14} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pending change proposal banner for the other party */}
        <AnimatePresence>
          {pendingChangeIsFromOtherParty && pendingChange && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-purple-500/8 border border-purple-500/25 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <Edit3 size={13} className="text-purple-400" />
                <p className="text-[14px] font-bold text-purple-300">{t.agreeChangeTitle}</p>
              </div>
              <p className="text-[14px] text-muted-foreground">
                {t.agreeChangePending} — <span className="text-white/70">{pendingChange.requestedByName}</span>
              </p>
              {pendingChange.changes && (() => {
                const ch = pendingChange.changes;
                return (
                  <div className="space-y-1">
                    {ch.deadline && <p className="text-[14px] text-white/60">📅 {t.agreeChangeNewDeadline}: <strong className="text-white/80">{String(ch.deadline)}</strong></p>}
                    {ch.amount   && <p className="text-[14px] text-white/60">💰 {t.agreeChangeNewAmount}: <strong className="text-white/80">{formatMoney(Number(ch.amount), ag.currency as CurrencyCode)}</strong></p>}
                    {ch.terms    && <p className="text-[14px] text-white/60">📋 {t.agreeChangeNewTerms}: <strong className="text-white/80">{String(ch.terms).slice(0, 80)}{String(ch.terms).length > 80 ? "…" : ""}</strong></p>}
                  </div>
                );
              })()}
              {pendingChange.note && <p className="text-[14px] italic text-muted-foreground">"{pendingChange.note}"</p>}
              <div className="flex gap-2">
                <Button
                  data-testid="button-reject-change"
                  onClick={handleChangeReject}
                  disabled={actionLoading}
                  variant="outline"
                  className="flex-1 h-11 rounded-xl text-sm text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <X size={12} className="mr-1" />{t.agreeChangeReject}
                </Button>
                <Button
                  data-testid="button-accept-change"
                  onClick={handleChangeAccept}
                  disabled={actionLoading}
                  className="flex-1 h-11 rounded-xl text-sm"
                  style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "white" }}
                >
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <><Check size={12} className="mr-1" />{t.agreeChangeAccept}</>}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fund note with balance info for creator */}
        {isCreator && canFund && (
          <div className="space-y-2">
            <div className="bg-amber-500/8 border border-amber-500/15 rounded-2xl p-3 text-[14px] text-amber-200/70">
              {t.agreeFundNote}
            </div>
            <div className="bg-card border border-white/5 rounded-2xl p-3">
              <div className="flex justify-between text-[14px]">
                <span className="text-muted-foreground">{t.agreeFundAvailable}</span>
                <span className={`font-bold ${hasShortfall ? "text-red-400" : "text-green-400"}`}>
                  {formatMoney(walletBalance, ag.currency as CurrencyCode)}
                </span>
              </div>
              <div className="flex justify-between text-[14px] mt-1">
                <span className="text-muted-foreground">{t.agreeFieldAmount}</span>
                <span className="font-bold text-white/80">{formatMoney(ag.amount, ag.currency as CurrencyCode)}</span>
              </div>
              {hasShortfall && (
                <div className="flex justify-between text-[14px] mt-1 pt-1 border-t border-white/8">
                  <span className="text-red-400 font-bold">{t.agreeFundShortfall}</span>
                  <span className="font-bold text-red-400">{formatMoney(shortfall, ag.currency as CurrencyCode)}</span>
                </div>
              )}
            </div>
            {!hasShortfall && (
              <p className="text-[12px] text-muted-foreground/60 text-center">{t.agreeFundHoldNote2}</p>
            )}
          </div>
        )}

        {/* Worker no-history warning */}
        {workerRatingLoaded && workerRatingFetchOk && (workerRatingCount === 0 || workerRatingCount === null) && (
          <div className="flex items-start gap-2 bg-orange-500/8 border border-orange-500/15 rounded-2xl p-3">
            <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <p className="text-[14px] leading-relaxed text-orange-300/80">{t.agreeWorkerNoHistory}</p>
          </div>
        )}

        {/* Proof preview card for creator when status = submitted */}
        {isCreator && ag.status === "submitted" && (submittedEvent || proofImageEvent) && (
          <div className="bg-blue-500/8 border border-blue-500/20 rounded-3xl p-4 space-y-3">
            <p className="text-[13px] font-bold uppercase tracking-widest text-blue-300">{t.agreeProofCardTitle}</p>
            {submittedEvent?.note && (
              <div>
                <p className="text-[12px] uppercase tracking-widest text-muted-foreground mb-1">{t.agreeProofCardNote}</p>
                <p className="text-sm text-white/70 italic">"{submittedEvent.note}"</p>
              </div>
            )}
            {proofImageEvent?.imageBase64 && (
              <div>
                <p className="text-[12px] uppercase tracking-widest text-muted-foreground mb-1">{t.agreeProofCardPhoto}</p>
                <img
                  src={proofImageEvent.imageBase64}
                  alt="proof"
                  className="max-w-full rounded-xl border border-white/10"
                  style={{ maxHeight: 240 }}
                />
              </div>
            )}
            {submittedEvent && (
              <p className="text-[12px] text-muted-foreground/50">
                {t.agreeProofCardDate}: {new Date(submittedEvent.timestamp).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Dispute trigger button */}
        {canDispute && !showDispute && (
          <button
            data-testid="button-show-dispute"
            onClick={() => setShowDispute(true)}
            className="w-full text-center text-[13px] text-destructive/70 hover:text-destructive py-2 transition-colors"
          >
            {t.agreeBtnDispute}
          </button>
        )}

        {/* Dispute form with reason selector */}
        <AnimatePresence>
          {showDispute && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-card border border-destructive/20 rounded-3xl p-4 space-y-3"
            >
              <p className="text-sm font-semibold text-white/80">{t.agreeBtnDispute}</p>
              <div>
                <p className="text-[12px] uppercase tracking-widest text-muted-foreground mb-1.5">{t.agreeDisputeReason}</p>
                <select
                  data-testid="select-dispute-reason"
                  value={disputeType}
                  onChange={e => setDisputeType(e.target.value)}
                  style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
                >
                  <option value="" disabled>{t.agreeSelectPlaceholder}</option>
                  {disputeReasons.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <textarea
                data-testid="input-dispute-note"
                value={disputeNote}
                onChange={e => setDisputeNote(e.target.value)}
                placeholder={t.agreeDisputePlaceholder}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
              <div className="flex gap-2">
                <Button onClick={() => { setShowDispute(false); setDisputeType(""); setDisputeNote(""); }} variant="outline" className="flex-1 h-11 rounded-xl text-sm">
                  {t.agreeBtnCancel}
                </Button>
                <Button
                  data-testid="button-submit-dispute"
                  onClick={handleDispute}
                  disabled={actionLoading || !disputeNote.trim() || !disputeType}
                  className="flex-1 h-11 rounded-xl text-sm bg-destructive text-white"
                >
                  {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : t.agreeBtnDispute}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Raw events (collapsible) */}
        {events.length > 0 && (
          <div>
            <button
              className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-muted-foreground mb-3 w-full text-left"
              onClick={() => setShowRawEvents(v => !v)}
            >
              {t.agreeEvents}
              {showRawEvents ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <AnimatePresence>
              {showRawEvents && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
                  <div className="space-y-2">
                    {events.map(ev => (
                      <div key={ev.id} className="flex items-start gap-3 bg-secondary/20 rounded-2xl px-4 py-3">
                        <CheckCircle2 size={14} className="text-purple-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-medium text-white/80">{eventTypeLabel[ev.type] ?? ev.type}</p>
                          {ev.note && <p className="text-[13px] text-muted-foreground mt-0.5 break-words">"{ev.note}"</p>}
                          {ev.imageBase64 && (
                            <img src={ev.imageBase64} alt="proof" className="mt-2 max-w-full rounded-xl border border-white/10" style={{ maxHeight: 200 }} />
                          )}
                          <p className="text-[12px] text-muted-foreground/50 mt-1">{ev.actorName} · {new Date(ev.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Chat */}
        <div>
          <p className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
            <MessageSquare size={11} />
            {t.agreeContractChat}
          </p>
          <div className="flex items-center gap-1.5 mb-3">
            <Shield size={10} className="text-muted-foreground/50" />
            <p className="text-[12px] text-muted-foreground/50">{t.agreeChatSecurityNote}</p>
          </div>

          {messages.length === 0 && (
            <p className="text-[13px] text-muted-foreground/50 italic text-center py-4">No messages yet</p>
          )}

          <div className="space-y-3 mb-4">
            {messages.map(msg => {
              const isMe = msg.senderId === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${isMe ? "bg-purple-500/25 text-white" : "bg-card border border-white/5 text-white/80"}`}>
                    {!isMe && <p className="text-[12px] font-bold text-purple-400 mb-1 uppercase tracking-wider">{msg.senderName}</p>}
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    <p className="text-[12px] text-muted-foreground/50 mt-1 text-right">
                      {new Date(msg.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <Input
              data-testid="input-agreement-chat"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder={t.agreeChatPlaceholder}
              className="flex-1 h-11 bg-card border-white/10 rounded-full px-4 text-sm focus:border-purple-500/50"
            />
            <AnimatePresence>
              {chatInput.trim() && (
                <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}>
                  <Button
                    type="submit"
                    data-testid="button-send-agreement-msg"
                    size="icon"
                    className="w-11 h-11 rounded-full bg-purple-500/25 text-purple-300 hover:bg-purple-500/40"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>
      </main>

      {/* Rate now button for released/completed agreements */}
      {(ag.status === "released" || ag.status === "completed") && !hasRated && isParty && (
        <div
          style={{
            position: "sticky",
            bottom: "calc(86px + env(safe-area-inset-bottom))",
            zIndex: 40,
            width: "100%",
            padding: "12px 16px",
            boxSizing: "border-box",
            background: "linear-gradient(to top, rgba(10,10,10,0.96) 60%, rgba(10,10,10,0.75) 85%, transparent)",
          }}
        >
          <Button
            data-testid="button-rate-agreement"
            onClick={() => setShowRatingModal(true)}
            className="w-full rounded-2xl text-sm font-bold tracking-widest"
            style={{ minHeight: 48, background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "white", boxShadow: "0 4px 20px rgba(245,158,11,0.3)" }}
          >
            <Star className="w-4 h-4 mr-2" fill="white" />
            {t.agreeRateBtn}
          </Button>
        </div>
      )}

      {/* Sticky action buttons */}
      {(canAccept || canSubmit || canFund || canConfirm) && (
        <div
          style={{
            position: "sticky",
            bottom: "calc(86px + env(safe-area-inset-bottom))",
            zIndex: 40,
            width: "100%",
            padding: "12px 16px",
            boxSizing: "border-box",
            background: "linear-gradient(to top, rgba(10,10,10,0.96) 60%, rgba(10,10,10,0.75) 85%, transparent)",
          }}
        >
          {canAccept && (
            <Button
              data-testid="button-accept-agreement"
              onClick={handleWorkerAccept}
              disabled={actionLoading}
              aria-busy={actionLoading}
              className="w-full rounded-2xl text-sm font-bold tracking-widest"
              style={{ minHeight: 48, background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "white", boxShadow: "0 4px 20px rgba(139,92,246,0.3)" }}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t.agreeBtnWorkerAccept}
            </Button>
          )}
          {canSubmit && (
            <Button
              data-testid="button-submit-work"
              onClick={() => { setSubmitModal({ note: "", image: null }); setSubmitConfirmed(false); }}
              disabled={actionLoading}
              className="w-full rounded-2xl text-sm font-bold tracking-widest bg-blue-500/15 text-blue-300 border border-blue-500/25 hover:bg-blue-500/25"
              style={{ minHeight: 48 }}
            >
              {t.agreeBtnSubmit}
            </Button>
          )}
          {canFund && !hasShortfall && (
            <Button
              data-testid="button-fund-agreement"
              onClick={handleFund}
              disabled={actionLoading}
              className="w-full rounded-2xl text-sm font-bold tracking-widest bg-amber-500/15 text-amber-300 border border-amber-500/25 hover:bg-amber-500/25"
              style={{ minHeight: 48 }}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `${t.agreeBtnFund} — ${formatMoney(ag.amount, ag.currency as CurrencyCode)}`}
            </Button>
          )}
          {canFund && hasShortfall && (
            <div className="text-center">
              <p className="text-[13px] text-red-400 mb-2">{t.agreeFundShortfall}: {formatMoney(shortfall, ag.currency as CurrencyCode)}</p>
              <Button disabled className="w-full rounded-2xl text-sm font-bold tracking-widest bg-secondary text-muted-foreground" style={{ minHeight: 48 }}>
                {t.agreeNoFunds}
              </Button>
            </div>
          )}
          {canConfirm && (
            <Button
              data-testid="button-confirm-agreement"
              onClick={handleConfirm}
              disabled={actionLoading}
              className="w-full rounded-2xl text-sm font-bold tracking-widest"
              style={{ minHeight: 48, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "white", boxShadow: "0 4px 20px rgba(34,197,94,0.25)" }}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `${t.agreeBtnConfirm} → ${formatMoney(ag.amount, ag.currency as CurrencyCode)}`}
            </Button>
          )}
        </div>
      )}

      {/* Submit modal */}
      <AnimatePresence>
        {submitModal !== null && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setSubmitModal(null)}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-card border-t border-white/10 rounded-t-3xl flex flex-col"
              style={{ maxHeight: "85vh" }}
            >
              <div className="overflow-y-auto flex-1 p-6 space-y-4">
                <h3 className="text-lg font-heading text-white/90">{t.agreeBtnSubmit}</h3>
                <textarea
                  value={submitModal.note}
                  onChange={e => setSubmitModal(prev => prev ? { ...prev, note: e.target.value } : prev)}
                  placeholder={t.agreeSubmitPlaceholder}
                  rows={3}
                  style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14, color: "white", padding: "11px 14px",
                    width: "100%", fontSize: 14, outline: "none", resize: "none",
                  }}
                />
                {ag.proofPhoto && (
                  <div className="space-y-1">
                    <label
                      data-testid="input-proof-image"
                      className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-white transition-colors"
                    >
                      <Image className="w-4 h-4" />
                      {submitModal.image ? t.agreePhotoSelected : t.agreeProofPhoto + " (max 25 MB)"}
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    {!submitModal.image && (
                      <p className="text-[12px] text-orange-400">{t.agreeSubmitPhotoRequired}</p>
                    )}
                  </div>
                )}
                {/* Confirmation checkbox */}
                <button
                  data-testid="checkbox-submit-confirm"
                  type="button"
                  onClick={() => setSubmitConfirmed(v => !v)}
                  className="flex items-start gap-3 text-left w-full"
                >
                  <div className="mt-0.5 shrink-0" style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: submitConfirmed ? "1.5px solid #b48dff" : "1.5px solid rgba(255,255,255,0.2)",
                    background: submitConfirmed ? "rgba(180,141,255,0.25)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
                  }}>
                    {submitConfirmed && <span style={{ color: "#b48dff", fontSize: 13, fontWeight: 900 }}>✓</span>}
                  </div>
                  <p className="text-[13px] leading-relaxed text-white/70">{t.agreeSubmitConfirmCheck}</p>
                </button>
              </div>
              <div className="flex gap-3 p-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                <Button variant="outline" className="flex-1 h-12 rounded-2xl text-sm" onClick={() => setSubmitModal(null)}>
                  {t.agreeBtnCancel}
                </Button>
                <Button
                  data-testid="button-confirm-submit"
                  onClick={handleSubmit}
                  disabled={actionLoading || !submitConfirmed || (ag.proofPhoto && !submitModal.image)}
                  className="flex-1 h-12 rounded-2xl text-sm font-bold"
                  style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "white" }}
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t.agreeBtnSubmit}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Change proposal modal */}
      <AnimatePresence>
        {changeModal !== null && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setChangeModal(null)}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-card border-t border-white/10 rounded-t-3xl flex flex-col"
              style={{ maxHeight: "85vh" }}
            >
              <div className="overflow-y-auto flex-1 p-6 space-y-4">
                <h3 className="text-lg font-heading text-white/90">{t.agreeChangeTitle}</h3>
                <div>
                  <p className="text-[12px] uppercase tracking-widest text-muted-foreground mb-1.5">{t.agreeChangeNewDeadline}</p>
                  <input
                    type="datetime-local"
                    value={changeModal.newDeadline}
                    onChange={e => setChangeModal(prev => prev ? { ...prev, newDeadline: e.target.value } : prev)}
                    style={{ ...inputStyle }}
                  />
                </div>
                <div>
                  <p className="text-[12px] uppercase tracking-widest text-muted-foreground mb-1.5">{t.agreeChangeNewAmount}</p>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={changeModal.newAmount}
                    onChange={e => !fundsHeld && setChangeModal(prev => prev ? { ...prev, newAmount: e.target.value } : prev)}
                    placeholder="0.00"
                    disabled={fundsHeld}
                    style={{ ...inputStyle, ...(fundsHeld ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}
                  />
                  {fundsHeld && (
                    <p className="text-[12px] text-amber-400/80 mt-1.5 flex items-center gap-1">
                      <Lock size={9} />
                      {t.agreeChangeAmountLocked}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[12px] uppercase tracking-widest text-muted-foreground mb-1.5">{t.agreeChangeNewTerms}</p>
                  <textarea
                    value={changeModal.newTerms}
                    onChange={e => setChangeModal(prev => prev ? { ...prev, newTerms: e.target.value } : prev)}
                    rows={3}
                    style={{ ...inputStyle, resize: "none" }}
                  />
                </div>
                <div>
                  <p className="text-[12px] uppercase tracking-widest text-muted-foreground mb-1.5">{t.agreeChangeNote}</p>
                  <input
                    type="text"
                    value={changeModal.note}
                    onChange={e => setChangeModal(prev => prev ? { ...prev, note: e.target.value } : prev)}
                    style={{ ...inputStyle }}
                  />
                </div>
              </div>
              <div className="flex gap-3 p-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                <Button variant="outline" className="flex-1 h-12 rounded-2xl text-sm" onClick={() => setChangeModal(null)}>
                  {t.agreeBtnCancel}
                </Button>
                <Button
                  data-testid="button-send-change"
                  onClick={handleSendChange}
                  disabled={actionLoading || (!changeModal.newDeadline.trim() && (!changeModal.newAmount.trim() || fundsHeld) && !changeModal.newTerms.trim())}
                  className="flex-1 h-12 rounded-2xl text-sm font-bold"
                  style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "white" }}
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t.agreeChangeSend}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Rating modal */}
      <AnimatePresence>
        {showRatingModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-end justify-center"
            onClick={() => { if (!ratingThanks) setShowRatingModal(false); }}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-card border-t border-white/10 rounded-t-3xl"
              style={{ maxHeight: "90vh", overflowY: "auto" }}
            >
              {ratingThanks ? (
                <div className="flex flex-col items-center justify-center py-14 px-6 gap-4">
                  <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                    <Star className="w-8 h-8 text-amber-400" fill="#f59e0b" />
                  </div>
                  <p data-testid="text-rating-thanks" className="text-lg font-heading text-white/90 text-center">{t.ratingModalThanks}</p>
                </div>
              ) : (
                <div className="p-6 space-y-5">
                  <h3 className="text-lg font-heading text-white/90">{t.ratingModalTitle}</h3>

                  {/* Stars */}
                  <div>
                    <p className="text-[12px] uppercase tracking-widest text-muted-foreground mb-2">{t.ratingModalStars}</p>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          data-testid={`star-${n}`}
                          onClick={() => setRatingStars(n)}
                          className="transition-transform active:scale-110"
                        >
                          <Star
                            size={32}
                            fill={ratingStars >= n ? "#f59e0b" : "transparent"}
                            stroke={ratingStars >= n ? "#f59e0b" : "rgba(255,255,255,0.25)"}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Comment */}
                  <div>
                    <p className="text-[12px] uppercase tracking-widest text-muted-foreground mb-1.5">{t.ratingModalComment}</p>
                    <textarea
                      data-testid="input-rating-comment"
                      value={ratingComment}
                      onChange={e => setRatingComment(e.target.value)}
                      rows={3}
                      placeholder="..."
                      style={{
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 14, color: "white", padding: "11px 14px",
                        width: "100%", fontSize: 14, outline: "none", resize: "none",
                      }}
                    />
                  </div>

                  {/* On time */}
                  <div>
                    <p className="text-[12px] uppercase tracking-widest text-muted-foreground mb-2">{t.ratingModalOnTime}</p>
                    <div className="flex gap-2">
                      {([true, false] as const).map(val => (
                        <button
                          key={String(val)}
                          data-testid={`toggle-ontime-${val}`}
                          onClick={() => setRatingOnTime(prev => prev === val ? null : val)}
                          style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "5px 14px",
                            border: ratingOnTime === val ? `1.5px solid ${val ? "#22c55e" : "#ef4444"}` : "1.5px solid rgba(255,255,255,0.12)",
                            background: ratingOnTime === val ? (val ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)") : "transparent",
                            color: ratingOnTime === val ? (val ? "#22c55e" : "#ef4444") : "rgba(255,255,255,0.45)",
                            cursor: "pointer", transition: "all 0.15s",
                          }}
                        >
                          {val ? `✓ ${t.ratingYes}` : `✗ ${t.ratingNo}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Recommend */}
                  <div>
                    <p className="text-[12px] uppercase tracking-widest text-muted-foreground mb-2">{t.ratingModalRecommend}</p>
                    <div className="flex gap-2">
                      {([true, false] as const).map(val => (
                        <button
                          key={String(val)}
                          data-testid={`toggle-recommend-${val}`}
                          onClick={() => setRatingRecommend(prev => prev === val ? null : val)}
                          style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "5px 14px",
                            border: ratingRecommend === val ? `1.5px solid ${val ? "#22c55e" : "#ef4444"}` : "1.5px solid rgba(255,255,255,0.12)",
                            background: ratingRecommend === val ? (val ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)") : "transparent",
                            color: ratingRecommend === val ? (val ? "#22c55e" : "#ef4444") : "rgba(255,255,255,0.45)",
                            cursor: "pointer", transition: "all 0.15s",
                          }}
                        >
                          {val ? `✓ ${t.ratingYes}` : `✗ ${t.ratingNo}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pb-[max(0px,env(safe-area-inset-bottom))]">
                    <Button
                      data-testid="button-skip-rating"
                      variant="outline"
                      className="flex-1 h-12 rounded-2xl text-sm"
                      onClick={() => setShowRatingModal(false)}
                    >
                      {t.ratingModalSkip}
                    </Button>
                    <Button
                      data-testid="button-submit-rating"
                      disabled={ratingSubmitting || ratingStars === 0}
                      onClick={handleRateSubmit}
                      className="flex-1 h-12 rounded-2xl text-sm font-bold"
                      style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "white" }}
                    >
                      {ratingSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t.ratingModalSubmit}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
