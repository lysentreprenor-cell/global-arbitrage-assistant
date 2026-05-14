/**
 * Clean user-session hook.
 * Wraps useAppStore() and exposes derived helpers so every component doesn't
 * need to compute initials, check auth state, etc. manually.
 */

import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { getDisplayHandle } from "@/lib/handleUtils";

export type CurrentUserInfo = {
  isAuthenticated: boolean;
  userId: string | null;
  userName: string | null;
  userHandle: string | null;
  userEmail: string | null;
  userPhone: string | null;
  userAddress: string | null;
  initials: string;
  balance: number;
  hideBalances: boolean;
  appearance: string;
  pushNotifications: boolean;
  emailDigest: boolean;
  biometricLogin: boolean;
  cardLimits: { daily: number; monthly: number; atm: number };
  transferLimits: { daily: number; monthly: number };
};

export function useCurrentUser(): CurrentUserInfo {
  const { user, isAuthenticated } = useAppStore();

  return useMemo<CurrentUserInfo>(() => {
    if (!user) {
      return {
        isAuthenticated: false,
        userId:          null,
        userName:        null,
        userHandle:      null,
        userEmail:       null,
        userPhone:       null,
        userAddress:     null,
        initials:        "?",
        balance:         0,
        hideBalances:    false,
        appearance:      "obsidian-gold",
        pushNotifications: true,
        emailDigest:     false,
        biometricLogin:  true,
        cardLimits:      { daily: 5000, monthly: 25000, atm: 1000 },
        transferLimits:  { daily: 10000, monthly: 50000 },
      };
    }

    const parts = user.name.trim().split(/\s+/);
    const initials =
      parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();

    return {
      isAuthenticated,
      userId:          user.id,
      userName:        user.name,
      userHandle:      getDisplayHandle(user.name || "user", user.handle || "", user.id || ""),
      userEmail:       user.email,
      userPhone:       user.phone ?? null,
      userAddress:     user.address ?? null,
      initials,
      balance:         user.balance,
      hideBalances:    user.settings.hideBalances,
      appearance:      user.settings.appearance ?? "obsidian-gold",
      pushNotifications: user.settings.pushNotifications,
      emailDigest:     user.settings.emailDigest,
      biometricLogin:  user.settings.biometricLogin,
      cardLimits:      user.settings.cardLimits  ?? { daily: 5000, monthly: 25000, atm: 1000 },
      transferLimits:  user.settings.transferLimits ?? { daily: 10000, monthly: 50000 },
    };
  }, [user, isAuthenticated]);
}
