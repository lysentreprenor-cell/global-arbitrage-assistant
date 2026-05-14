import { useEffect, useState } from "react";
import { onValue, DataSnapshot } from "firebase/database";
import { getConversationMessagesRef } from "./messageService";

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: number;
  readAt: number | null;
}

interface UseMessagesReturn {
  messages: Message[];
  loading: boolean;
  error: string | null;
}

export function useMessages(conversationId: string | null): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    setLoading(true);
    setError(null);

    const messagesRef = getConversationMessagesRef(conversationId);

    const unsubscribe = onValue(
      messagesRef,
      (snapshot: DataSnapshot) => {
        const data = snapshot.val();
        if (!data) {
          setMessages([]);
        } else {
          const parsed: Message[] = Object.values(data) as Message[];
          parsed.sort((a, b) => a.createdAt - b.createdAt);
          setMessages(parsed);
        }
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [conversationId]);

  return { messages, loading, error };
}
