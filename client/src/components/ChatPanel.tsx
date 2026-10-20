import { useEffect, useRef, useState } from "react";
import { QUICK_CHAT, sendChat, useChat } from "../chat";
import { COLORS } from "../colors";
import { XIcon } from "./ui";
import type { RoomState } from "../types";
import "./Chat.css";

type Props = {
  room: RoomState;
  myId: string;
  variant: "panel" | "inline" | "drawer";
  blurOnSend?: boolean; // during a game: hand the keyboard back so Space slaps right away
  onClose?: () => void; // drawer only
};

// The chat: full typing on private tables, quick phrases only on public tables
export default function ChatPanel({ room, myId, variant, blurOnSend = false, onClose }: Props) {
  const { messages, muted, toggleMute, unmuteAll } = useChat();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [menuFor, setMenuFor] = useState<number | null>(null); // which message's "Mute" option is showing
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = messages.filter((m) => !muted.has(m.personId));
  const mutedCount = muted.size;

  // Keep the newest message in view: when messages arrive and when the box changes size,
  // unless you've scrolled up to read older messages
  const stickToBottom = useRef(true);
  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [visible.length]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) list.scrollTop = list.scrollHeight;
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  // Errors (like "Slow down a little.") fade after a few seconds
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 3000);
    return () => clearTimeout(t);
  }, [error]);

  async function send(payload: { text: string } | { quick: number }) {
    const problem = await sendChat(payload);
    if (problem) setError(problem);
    else if ("text" in payload) setDraft("");
  }

  function colorFor(personId: string) {
    const seat = room.players.findIndex((p) => p.id === personId);
    return seat === -1 ? "#a8b8af" : COLORS[seat % COLORS.length].bg; // watchers are gray
  }

  return (
    <section className={`chat chat-${variant}`} aria-label="Chat">
      <header className="chat-head">
        <h2 className="chat-title">Chat</h2>
        {room.isPublic && <span className="chat-hint">Quick chat only on public tables</span>}
        {onClose && (
          <button type="button" className="chat-close" onClick={onClose} aria-label="Close chat">
            <XIcon size={16} />
          </button>
        )}
      </header>

      <div
        className="chat-list"
        ref={listRef}
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {visible.length === 0 ? (
          <p className="chat-empty">{room.isPublic ? "Send a quick message below." : "No messages yet. Say hi!"}</p>
        ) : (
          visible.map((m) => (
            <div key={m.id} className={`chat-msg ${m.kind === "quick" ? "is-quick" : ""}`}>
              {m.personId === myId ? (
                <span className="chat-name" style={{ color: colorFor(m.personId) }}>You</span>
              ) : (
                <button
                  type="button"
                  className="chat-name"
                  style={{ color: colorFor(m.personId) }}
                  onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                  title={`Options for ${m.name}`}
                >
                  {m.name}
                </button>
              )}
              <span className="chat-text">{m.text}</span>
              {menuFor === m.id && (
                <span className="chat-menu">
                  <button
                    type="button"
                    className="chat-menu-btn"
                    onClick={() => {
                      toggleMute(m.personId);
                      setMenuFor(null);
                    }}
                  >
                    Mute {m.name}
                  </button>
                  <button type="button" className="chat-menu-btn ghost" onClick={() => setMenuFor(null)}>
                    Cancel
                  </button>
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {mutedCount > 0 && (
        <button type="button" className="chat-muted" onClick={unmuteAll}>
          {mutedCount} muted · Unmute all
        </button>
      )}
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}

      {room.isPublic ? (
        <div className="chat-quick">
          {QUICK_CHAT.map((phrase, i) => (
            <button
              key={phrase}
              type="button"
              className="chat-chip"
              onMouseDown={(e) => e.preventDefault()} // keep focus off it so Space still slaps
              onClick={() => send({ quick: i })}
            >
              {phrase}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            send({ text: draft });
            if (blurOnSend) inputRef.current?.blur();
          }}
        >
          <input
            ref={inputRef}
            className="chat-input"
            value={draft}
            maxLength={200}
            placeholder="Say something…"
            aria-label="Chat message"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && inputRef.current?.blur()}
          />
          <button type="submit" className="chat-send" disabled={!draft.trim()}>
            Send
          </button>
        </form>
      )}
    </section>
  );
}
