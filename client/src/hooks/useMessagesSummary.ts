import { useMemo } from "react";
import { useAppStore } from "@/lib/store";

export function useMessagesSummary() {
  const { conversations } = useAppStore();

  return useMemo(() => {
    const unreadCount = conversations.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0);
    const recentConversations = [...conversations].sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.timestamp ?? "";
      const bLast = b.messages[b.messages.length - 1]?.timestamp ?? "";
      return bLast.localeCompare(aLast);
    });
    const latestConversation = recentConversations[0] ?? null;

    return {
      conversations,
      recentConversations,
      latestConversation,
      unreadCount,
      total: conversations.length,
      hasUnread: unreadCount > 0,
    };
  }, [conversations]);
}
