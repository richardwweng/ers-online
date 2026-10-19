import { useEffect, useRef, useState } from "react";
import { EMOTES } from "../emotes";
import "./Emotes.css";

type Props = {
  onSend: (emoji: string) => void;
  coolingDown: boolean; // just sent one: wait a moment
  className?: string;
};

// The 😀 button that opens a small tray of emotes
export default function Emotes({ onSend, coolingDown, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Tapping anywhere else closes the tray
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`emote-picker ${className}`} ref={ref}>
      <button
        type="button"
        className={`emote-toggle ${open ? "is-open" : ""}`}
        onMouseDown={(e) => e.preventDefault()} // keep focus off it so Space still slaps
        onClick={() => setOpen((o) => !o)}
        aria-label="Emotes"
        aria-expanded={open}
        title="Emotes (keys 1–6)"
      >
        😀
      </button>
      {open && (
        <div className="emote-tray" role="menu" aria-label="Send an emote">
          {EMOTES.map((emoji, i) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              className="emote-choice"
              disabled={coolingDown}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSend(emoji);
                setOpen(false);
              }}
              aria-label={`Send ${emoji}`}
            >
              {emoji}
              <span className="emote-key" aria-hidden="true">{i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
