import { useMemo } from "react";
import { useAppStore } from "@/lib/store";

export const ADMIN_EMAIL = "lysenteprenor@gmail.com";

export function normalizeEmail(email?: string | null): string {
  return String(email ?? "").trim().toLowerCase();
}

export function isAdminEmail(email?: string | null): boolean {
  return normalizeEmail(email) === normalizeEmail(ADMIN_EMAIL);
}

/**
 * Returns admin status based on the currently logged-in user's email.
 * Source of truth: DB via login response (user.email stored in Zustand).
 * Backend re-verifies via the session cookie (sent automatically on same-origin requests).
 */
export function useAdminAccess() {
  const { user } = useAppStore();
  return useMemo(() => ({
    isAdmin: isAdminEmail(user?.email),
    adminEmail: ADMIN_EMAIL,
  }), [user?.email]);
}

/**
 * Returns any extra headers needed for admin API calls.
 * Authentication is handled automatically via the session cookie.
 */
export function useAdminHeaders() {
  return useMemo(() => ({}), []);
}
