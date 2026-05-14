import { ref, push, set, update, get, query, orderByChild } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";

function getConversationId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

export async function createConversation(currentUserId: string, otherUserId: string): Promise<string> {
  const conversationId = getConversationId(currentUserId, otherUserId);
  const convRef = ref(realtimeDb, `conversations/${conversationId}`);
  const snapshot = await get(convRef);

  if (!snapshot.exists()) {
    const now = Date.now();
    await set(convRef, {
      id: conversationId,
      participants: {
        [currentUserId]: true,
        [otherUserId]: true,
      },
      lastMessage: null,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return conversationId;
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  receiverId: string,
  text: string
): Promise<void> {
  const messagesRef = ref(realtimeDb, `messages/${conversationId}`);
  const newMessageRef = push(messagesRef);
  const now = Date.now();

  const message = {
    id: newMessageRef.key,
    conversationId,
    senderId,
    receiverId,
    text,
    createdAt: now,
    readAt: null,
  };

  await set(newMessageRef, message);

  const convRef = ref(realtimeDb, `conversations/${conversationId}`);
  await update(convRef, {
    id: conversationId,
    participants: {
      [senderId]: true,
      [receiverId]: true,
    },
    lastMessage: text,
    lastMessageAt: now,
    updatedAt: now,
  });
}

export async function markMessageAsRead(conversationId: string, messageId: string): Promise<void> {
  const messageRef = ref(realtimeDb, `messages/${conversationId}/${messageId}`);
  await update(messageRef, { readAt: Date.now() });
}

export function getConversationMessagesRef(conversationId: string) {
  return query(
    ref(realtimeDb, `messages/${conversationId}`),
    orderByChild("createdAt")
  );
}

export function getUserConversationsRef(userId: string) {
  return query(
    ref(realtimeDb, `conversations`),
    orderByChild(`participants/${userId}`)
  );
}
