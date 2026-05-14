import { useMemo } from "react";
import { useCommunicationWorkspace } from "@/hooks/useCommunicationWorkspace";
import { useWorkspaceBadgesSummary } from "@/hooks/useWorkspaceBadgesSummary";

export function useBankingCommunicationReadiness() {
  const communication = useCommunicationWorkspace();
  const badges = useWorkspaceBadgesSummary();

  return useMemo(
    () => ({
      hasConversations: communication.messages.conversations.length > 0,
      hasNotifications: communication.notifications.list.length > 0,
      hasSupportTickets: communication.support.tickets.length > 0,
      unreadMessages: badges.messagesBadge,
      unreadNotifications: badges.notificationsBadge,
      openSupportTickets: badges.supportBadge,
      ready: communication.isAuthenticated,
    }),
    [communication, badges],
  );
}
