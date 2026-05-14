import { useMemo } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function useProfileOverview() {
  const user = useCurrentUser();

  return useMemo(
    () => ({
      isAuthenticated: user.isAuthenticated,
      userId: user.userId,
      userName: user.userName,
      userHandle: user.userHandle,
      userEmail: user.userEmail,
      userPhone: user.userPhone,
      userAddress: user.userAddress,
      initials: user.initials,
      balance: user.balance,
      hideBalances: user.hideBalances,
      pushNotifications: user.pushNotifications,
      emailDigest: user.emailDigest,
      biometricLogin: user.biometricLogin,
      appearance: user.appearance,
      cardLimits: user.cardLimits,
      transferLimits: user.transferLimits,
    }),
    [user],
  );
}
