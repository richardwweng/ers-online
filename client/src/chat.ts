import { createContext, useContext, useEffect, useState } from "react";
import { socket } from "./socket";

// Preset phrases. Public tables (strangers) can only send these; private tables can also type.
// The server has the same list (server/src/index.ts).
export const QUICK_CHAT = ["Nice slap!", "GG", "Unlucky", "One more?", "Didn't see that 😂", "Too fast!", "Good luck!", "Oops"];

export type ChatMessage = { id: number; personId: string; name: string; text: string; kind: "text" | "quick"; at: number };

export type ChatState = {
  messages: ChatMessage[];
  muted: Set<string>; // people whose messages you've hidden (just for you, for this visit)
  toggleMute: (personId: string) => void;
  unmuteAll: () => void;
};

// Shared by the lobby, the table and the results screen, so mutes and messages carry across
export const ChatContext = createContext<ChatState | null>(null);

export function useChatState(): ChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [muted, setMuted] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const onHistory = (history: ChatMessage[]) => setMessages(history);
    const onMessage = (m: ChatMessage) => setMessages((prev) => [...prev.slice(-99), m]);
    socket.on("chatHistory", onHistory);
    socket.on("chat", onMessage);
    return () => {
      socket.off("chatHistory", onHistory);
      socket.off("chat", onMessage);
    };
  }, []);

  return {
    messages,
    muted,
    toggleMute: (id) =>
      setMuted((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    unmuteAll: () => setMuted(new Set()),
  };
}

export function useChat(): ChatState {
  const chat = useContext(ChatContext);
  if (!chat) throw new Error("useChat must be used inside the game page");
  return chat;
}

// Send a typed message or a quick phrase. Resolves with an error message if the server refused it.
export function sendChat(payload: { text: string } | { quick: number }): Promise<string | null> {
  return new Promise((resolve) => {
    socket.timeout(5000).emit("chat", payload, (err: Error | null, res?: { ok: boolean; error?: string }) => {
      if (err) return resolve("Couldn't send. Check your connection.");
      resolve(res?.ok ? null : (res?.error ?? null));
    });
  });
}
