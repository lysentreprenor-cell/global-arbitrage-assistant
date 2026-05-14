/**
 * Currency, number and date formatting utilities.
 * All formatting logic lives here — no more inline `.toLocaleString()` scattered in components.
 * Respects the active locale (EN / PL) from LanguageContext.
 */

import { useMemo } from "react";
import { useLang, type Lang } from "@/context/LanguageContext";
import { CURRENCY_SYMBOLS, type CurrencyCode } from "@/lib/store";

const LOCALE_MAP: Record<Lang, string> = {
  en: "en-US",
  pl: "pl-PL",
};

// ─── Standalone pure formatters (use anywhere, no hook needed) ────────────────

export function formatCurrencyStatic(
  amount: number,
  currency: CurrencyCode,
  locale = "en-US",
  opts: Partial<Intl.NumberFormatOptions> = {},
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style:                 "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...opts,
    }).format(amount);
  } catch {
    const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
    return `${symbol}${amount.toFixed(2)}`;
  }
}

export function formatNumberStatic(
  value: number,
  locale = "en-US",
  opts: Partial<Intl.NumberFormatOptions> = {},
): string {
  return new Intl.NumberFormat(locale, opts).format(value);
}

export function formatDateStatic(date: string | Date, locale = "en-US"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    day:   "2-digit",
    month: "short",
    year:  "numeric",
  }).format(d);
}

export function formatRelativeDateStatic(date: string | Date): string {
  const d      = typeof date === "string" ? new Date(date) : date;
  const now    = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffS  = Math.floor(diffMs / 1000);
  const diffM  = Math.floor(diffS / 60);
  const diffH  = Math.floor(diffM / 60);
  const diffD  = Math.floor(diffH / 24);

  if (diffS < 60)  return "just now";
  if (diffM < 60)  return `${diffM}m ago`;
  if (diffH < 24)  return `${diffH}h ago`;
  if (diffD === 1) return "yesterday";
  if (diffD < 7)   return `${diffD}d ago`;
  return formatDateStatic(d);
}

export function maskBalance(value: string): string {
  return value.replace(/[0-9]/g, "•");
}

// ─── Hook (locale-aware) ──────────────────────────────────────────────────────

export type Formatters = {
  formatCurrency: (amount: number, currency: CurrencyCode, opts?: Partial<Intl.NumberFormatOptions>) => string;
  formatNumber:   (value: number, opts?: Partial<Intl.NumberFormatOptions>) => string;
  formatDate:     (date: string | Date) => string;
  formatRelativeDate: (date: string | Date) => string;
  formatBalanceOrMask: (amount: number, currency: CurrencyCode, hidden: boolean) => string;
  maskBalance:    (value: string) => string;
  locale:         string;
};

export function useFormatters(): Formatters {
  const { lang } = useLang();
  const locale   = LOCALE_MAP[lang] ?? "en-US";

  return useMemo<Formatters>(
    () => ({
      locale,

      formatCurrency: (amount, currency, opts) =>
        formatCurrencyStatic(amount, currency, locale, opts),

      formatNumber: (value, opts) =>
        formatNumberStatic(value, locale, opts),

      formatDate: (date) =>
        formatDateStatic(date, locale),

      formatRelativeDate: (date) =>
        formatRelativeDateStatic(date),

      formatBalanceOrMask: (amount, currency, hidden) => {
        const formatted = formatCurrencyStatic(amount, currency, locale);
        return hidden ? maskBalance(formatted) : formatted;
      },

      maskBalance,
    }),
    [locale],
  );
}
