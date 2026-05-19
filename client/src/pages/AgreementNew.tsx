import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type CurrencyCode } from "@/lib/store";

// ——— Types
type Category = "usluga" | "remont" | "sprzedaz" | "wynajem" | "wlasna" | "pozyczka";
type PricingMethod = string;
type DeadlineType = "single" | "range" | "stages" | "cyclic" | "tbd";
type ProtocolStatus = "accepted" | "with_notes" | "needs_fixes" | "rejected";
type PaymentMethodType = "upfront" | "after" | "stages" | "deposit" | "partial_deposit";