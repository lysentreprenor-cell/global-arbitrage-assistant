import React, { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

type Props = {
  conversationId: string;
};

export default function Conversation({ conversationId }: Props) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!content.trim()) return;

    setSending(true);
    setError(null);

    try {
      await apiFetch(`/api/messages/${conversationId}/send`, {
        method: "POST",
        body: JSON.stringify({ text: content.trim() }),
      });
      setContent("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nie udało się wysłać wiadomości");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {error ? <div style={{ color: "#ff9090" }}>{error}</div> : null}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        placeholder="Napisz wiadomość..."
        style={{
          minHeight: 80,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "#0d1118",
          color: "white",
          padding: "10px 12px",
          outline: "none",
          resize: "none",
        }}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={sending || !content.trim()}
        style={{
          minHeight: 46,
          borderRadius: 12,
          border: "none",
          background: "#d7a71a",
          color: "#111",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {sending ? "Wysyłanie..." : "Wyślij"}
      </button>
    </div>
  );
}
