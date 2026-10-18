import { useCallback, useEffect, useRef } from "react";
import { socket } from "../socket";
import { SLAP_RULES } from "../rules";
import type { Card, GameView, RoomState, SeatView } from "../types";

const SUIT_SYMBOLS = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;

const RESULT_TEXT = {
  won: "won the pile",
  late: "correct, but too late",
  wrong: "wrong slap",
} as const;

function cardText(card: Card) {
  return card.rank + SUIT_SYMBOLS[card.suit];
}

function cardColor(card: Card) {
  return card.suit === "H" || card.suit === "D" ? "#e5484d" : "inherit";
}

function seatStatus(s: SeatView) {
  if (s.status === "eliminated") return "Eliminated";
  if (s.status === "out") return "0 cards (can slap back in)";
  return `${s.cardCount} cards`;
}

type Props = { room: RoomState; game: GameView; myId: string; isHost: boolean };

export default function Table({ room, game, myId, isHost }: Props) {
  const mySeatIndex = game.seats.findIndex((s) => s.id === myId);
  const mySeat = mySeatIndex === -1 ? null : game.seats[mySeatIndex];
  const topCard = game.pile.length > 0 ? game.pile[game.pile.length - 1] : null;
  const playing = room.phase === "playing";
  const activeRules = SLAP_RULES.filter((rule) => room.settings[rule.key]);

  // What this player is allowed to do right now
  const canPlay =
    playing && mySeat !== null && mySeat.status === "active" && game.turn === mySeatIndex && !game.collecting;
  const canSlap = playing && mySeat !== null && mySeat.status !== "eliminated" && topCard !== null;

  // Remember when the current top card appeared, to measure reaction time
  const cardShownAt = useRef(0);
  const topCardId = topCard?.id ?? null;
  useEffect(() => {
    cardShownAt.current = performance.now();
  }, [topCardId]);

  const slap = useCallback(() => {
    if (!canSlap) return;
    socket.emit("slap", { ms: Math.round(performance.now() - cardShownAt.current) });
  }, [canSlap]);

  // Space bar slaps (except while typing in a text box)
  useEffect(() => {
    function isTyping(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || isTyping(e)) return;
      e.preventDefault(); // don't scroll the page
      if (!e.repeat) slap(); // holding Space down only slaps once
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space" && !isTyping(e)) e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [slap]);

  // Text for the Play button when you can't play
  let playLabel = "Play";
  if (mySeat?.status === "eliminated") playLabel = "You're out";
  else if (mySeat?.status === "out") playLabel = "No cards: slap to get back in";
  else if (game.collecting) playLabel = "Collecting...";
  else if (game.turn !== mySeatIndex) playLabel = `Waiting for ${game.seats[game.turn].name}`;

  return (
    <main style={{ display: "flex", gap: 32, alignItems: "flex-start", justifyContent: "center" }}>
      {/* Main game area */}
      <div style={{ flex: 1, maxWidth: 720 }}>
        <h1>Game {room.id}</h1>

        {room.phase === "finished" && (
          <div>
            <h2>{game.winner ?? "Nobody"} wins!</h2>
            {isHost ? (
              <button onClick={() => socket.emit("backToLobby")}>Back to lobby</button>
            ) : (
              <p>Waiting for the host...</p>
            )}
          </div>
        )}

        {/* Seats */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {game.seats.map((s, i) => (
            <div
              key={s.id}
              style={{
                border: `2px solid ${playing && i === game.turn ? "#7c5cff" : "#444"}`,
                borderRadius: 8,
                padding: "8px 12px",
                minWidth: 140,
                opacity: s.status === "eliminated" ? 0.4 : 1,
              }}
            >
              <strong>
                {s.name}
                {s.id === myId ? " (you)" : ""}
              </strong>
              <div>{seatStatus(s)}</div>
              {!s.connected && s.status !== "eliminated" && (
                <div>
                  <small>reconnecting...</small>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Center pile */}
        <div style={{ margin: "24px 0" }}>
          {playing && game.challenge && (
            <p>
              Countdown: {game.challenge.chancesLeft} (challenge from {game.seats[game.challenge.bySeat].name})
            </p>
          )}
          {playing && game.collecting && <p>Collecting the pile...</p>}

          <div style={{ display: "flex", gap: 12, justifyContent: "center", fontSize: 36, minHeight: 52 }}>
            {game.pile.length === 0 && <span style={{ opacity: 0.4, fontSize: 20 }}>Empty pile</span>}
            {game.pile.slice(-3).map((card, idx, shown) => (
              <span
                key={card.id}
                style={{ color: cardColor(card), opacity: idx === shown.length - 1 ? 1 : 0.45 }}
              >
                {cardText(card)}
              </span>
            ))}
          </div>

          <p>
            <small>
              Pile: {game.pile.length} | Burned: {game.burnedCount}
              {game.pile.length > 0 ? ` | First card: ${cardText(game.pile[0])}` : ""}
            </small>
          </p>
        </div>

        {/* Controls */}
        {mySeat && playing && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onMouseDown={(e) => e.preventDefault()} // don't let the button keep focus (so Space never "clicks" it)
              onClick={() => canPlay && socket.emit("play")}
              disabled={!canPlay}
            >
              {playLabel}
            </button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={slap} disabled={!canSlap}>
              Slap (Space)
            </button>
          </div>
        )}
        {!mySeat && <p>You're spectating.</p>}

        {/* Slap history */}
        <h2>Slap history</h2>
        {game.slapHistory.length === 0 ? (
          <p>
            <small>No slaps yet</small>
          </p>
        ) : (
          <ul>
            {[...game.slapHistory].reverse().map((h, i) => (
              <li key={i}>
                {h.name}: {h.ms}ms ({RESULT_TEXT[h.result]})
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sidebar: the slap rules for this game */}
      <aside
        style={{
          width: 240,
          textAlign: "left",
          border: "1px solid #444",
          borderRadius: 8,
          padding: 16,
          marginTop: 24,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Slap rules</h3>
        {activeRules.length === 0 ? (
          <p>
            <small>No slap rules this game. Only face-card challenges win piles.</small>
          </p>
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {activeRules.map((rule) => (
              <li key={rule.key} style={{ marginBottom: 8 }}>
                <strong>{rule.label}</strong>
                <br />
                <small>{rule.example}</small>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginBottom: 0 }}>
          <small>Wrong slap: burn 1 card. Space bar slaps.</small>
        </p>
      </aside>
    </main>
  );
}