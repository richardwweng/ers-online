import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { socket, useConnected } from "../socket";
import { SLAP_RULES } from "../rules";
import Card, { CardBack } from "./Card";
import type { GameView, RoomState, SeatView, SlapEntry } from "../types";
import "./Table.css";

type Color = { bg: string; fg: string };

// One color per seat, matching the mockup
const COLORS: Color[] = [
  { bg: "#6E9BFF", fg: "#0F1C3A" },
  { bg: "#F0837A", fg: "#3A1512" },
  { bg: "#A58BFF", fg: "#1A1530" },
  { bg: "#4CC4B0", fg: "#0D2A25" },
];

// Where seats sit around the table, going clockwise from you at the bottom
const POSITIONS: Record<number, string[]> = {
  1: ["bottom"],
  2: ["bottom", "top"],
  3: ["bottom", "left", "right"],
  4: ["bottom", "left", "top", "right"],
};

const RESULT_LABEL = { won: "WON", late: "LATE", wrong: "BURN" } as const;
const RESULT_TEXT = { won: "won the pile", late: "was too late", wrong: "slapped wrong" } as const;

function seatText(s: SeatView) {
  if (s.status === "eliminated") return "Out";
  if (s.status === "out") return "0 cards · can slap back in";
  if (!s.connected) return `${s.cardCount} cards · reconnecting…`;
  return `${s.cardCount} cards`;
}

// A small fixed tilt for each card, so the pile looks hand-thrown but doesn't jump around
function tilt(cardId: number) {
  return ((cardId * 37) % 17) - 8;
}

function Avatar({ name, color, size = 46 }: { name: string; color: Color; size?: number }) {
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, background: color.bg, color: color.fg, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7BE3A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9D4CD" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

type Props = { room: RoomState; game: GameView; myId: string; isHost: boolean };

export default function Table({ room, game, myId, isHost }: Props) {
  const connected = useConnected();
  const [copied, setCopied] = useState(false);

  const n = game.seats.length;
  const mySeatIndex = game.seats.findIndex((s) => s.id === myId);
  const mySeat = mySeatIndex === -1 ? null : game.seats[mySeatIndex];
  const viewFrom = mySeatIndex === -1 ? 0 : mySeatIndex; // spectators see seat 0 at the bottom
  const topCard = game.pile.length > 0 ? game.pile[game.pile.length - 1] : null;
  const playing = room.phase === "playing";
  const activeRules = SLAP_RULES.filter((r) => room.settings[r.key]);
  const offRules = SLAP_RULES.filter((r) => !room.settings[r.key]);

  // What this player is allowed to do right now
  const isMyTurn = playing && mySeatIndex === game.turn && !game.collecting;
  const canPlay = isMyTurn && mySeat !== null && mySeat.status === "active";
  const canSlap = playing && mySeat !== null && mySeat.status !== "eliminated" && topCard !== null;
  const canForfeit = playing && mySeat !== null && mySeat.status !== "eliminated";

  // Forfeit asks once before going through, and cancels itself after 4 seconds
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  useEffect(() => {
    if (!confirmForfeit) return;
    const t = setTimeout(() => setConfirmForfeit(false), 4000);
    return () => clearTimeout(t);
  }, [confirmForfeit]);  

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

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Text for the Play button when you can't play
  let playLabel = "Play card";
  if (mySeat?.status === "eliminated") playLabel = "You're out";
  else if (mySeat?.status === "out") playLabel = "Slap to get back in";
  else if (game.collecting) playLabel = "Collecting…";
  else if (game.turn !== mySeatIndex) playLabel = `${game.seats[game.turn]?.name ?? "…"}'s turn`;

  const seats = game.seats.map((seat, index) => ({
    seat,
    index,
    color: COLORS[index % COLORS.length],
    position: POSITIONS[n]?.[(index - viewFrom + n) % n] ?? "top",
  }));
  const opponents = seats.filter((s) => s.index !== mySeatIndex);
  const myColor = COLORS[Math.max(mySeatIndex, 0) % COLORS.length];

  const history = [...game.slapHistory].reverse();
  const lastSlap: SlapEntry | undefined = history[0];
  const colorFor = (name: string) => COLORS[game.seats.findIndex((s) => s.name === name)] ?? COLORS[0];

  const challenger = game.challenge ? game.seats[game.challenge.bySeat] : null;
  const chances = game.challenge?.chancesLeft ?? 0;

  return (
    <div className="tp">
      <header className="tp-header">
        <div className="brand">
          <span className="brand-mark">ERS</span>
          <span className="brand-sub">Online</span>
        </div>
        <div className="room-pill">
          <span className="dim small">Room</span>
          <span className="mono room-code">{room.id}</span>
          <button type="button" className="pill-btn" onClick={copyLink}>
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </div>
        <div className="tp-header-right">
          <span className="conn">
            <span className={`conn-dot ${connected ? "" : "off"}`} />
            <span className="conn-text">{connected ? "Connected" : "Reconnecting…"}</span>
          </span>
          {canForfeit &&
            (confirmForfeit ? (
              <div className="forfeit-confirm">
                <span className="small dim">Your cards go under the pile.</span>
                <button
                  type="button"
                  className="ghost-btn danger"
                  onClick={() => {
                    socket.emit("forfeit");
                    setConfirmForfeit(false);
                  }}
                >
                  Yes, forfeit
                </button>
                <button type="button" className="ghost-btn" onClick={() => setConfirmForfeit(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="ghost-btn" onClick={() => setConfirmForfeit(true)}>
                Forfeit
              </button>
            ))}
        </div>
      </header>

      <div className="tp-body">
        {/* Left: slap history */}
        <aside className="panel tp-history">
          <h2 className="panel-title">Slap history</h2>
          {history.length === 0 ? (
            <p className="dim small" style={{ marginBottom: 14 }}>No slaps yet</p>
          ) : (
            <ul className="history">
              {history.map((h, i) => (
                <li key={`${game.slapHistory.length - i}-${h.name}-${h.ms}`}>
                  <span className="dot" style={{ background: colorFor(h.name).bg }} />
                  <span className="history-name">{h.name}</span>
                  <span className={`tag tag-${h.result}`}>{RESULT_LABEL[h.result]}</span>
                  <span className="mono history-ms">{h.ms}ms</span>
                </li>
              ))}
            </ul>
          )}
          <p className="dim small">Reaction time from when the card hit your screen.</p>
        </aside>

        {/* Center: the table */}
        <div className="tp-center">
          {/* Phone: opponents in a row above the table */}
          <div className="tp-opponents">
            {opponents.map(({ seat, index, color }) => (
              <div
                key={seat.id}
                className={`mini-seat ${playing && index === game.turn ? "is-turn" : ""} ${seat.status === "eliminated" || !seat.connected ? "is-off" : ""}`}
              >
                <Avatar name={seat.name} color={color} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div className="mini-name">{seat.name}</div>
                  <div className="mono dim small">{seat.status === "eliminated" ? "out" : seat.cardCount}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="felt">
            {/* Desktop: seats around the table */}
            {seats.map(({ seat, index, color, position }) => {
              const isMe = index === mySeatIndex;
              const isTurn = playing && !game.collecting && index === game.turn;
              const off = seat.status === "eliminated" || !seat.connected;
              return (
                <div key={seat.id} className={`seat pos-${position} ${isMe ? "is-me" : ""} ${isTurn ? "is-turn" : ""} ${off ? "is-off" : ""}`}>
                  <Avatar name={seat.name} color={color} />
                  <div>
                    <div className="seat-name">
                      {seat.name}
                      {isMe && <span className="dim" style={{ fontWeight: 500 }}> (you)</span>}
                    </div>
                    <div className={`seat-sub ${isMe && isTurn ? "accent" : ""}`}>
                      {isMe && isTurn ? `Your turn · ${seat.cardCount} cards` : seatText(seat)}
                    </div>
                  </div>
                  {seat.cardCount > 0 && <CardBack />}
                </div>
              );
            })}

            <div className="felt-center">
              {playing && challenger && !game.collecting ? (
                <div className="chip-challenge">
                  <span>
                    Challenge from <strong style={{ color: colorFor(challenger.name).bg }}>{challenger.name}</strong>
                  </span>
                  <span className="dots" aria-hidden="true">
                    {Array.from({ length: chances }, (_, k) => <span key={k} />)}
                  </span>
                  <strong className="accent">
                    {chances} {chances === 1 ? "chance" : "chances"} left
                  </strong>
                </div>
              ) : playing && game.collecting ? (
                <div className="chip-challenge">Collecting the pile…</div>
              ) : (
                <div className="chip-spacer" />
              )}

              <div className="pile">
                {game.pile.length === 0 ? (
                  <div className="pile-empty">Empty pile</div>
                ) : (
                  game.pile.map((card, k) => (
                    <Card
                      key={card.id}
                      card={card}
                      className={k === game.pile.length - 1 ? "is-top" : ""}
                      style={{ "--r": `${tilt(card.id)}deg`, "--x": `${(k - (game.pile.length - 1)) * 28 + 14}px` } as CSSProperties}
                    />
                  ))
                )}
              </div>

              <div className="pile-info mono">
                PILE {game.pileCount} · BURNED {game.burnedCount}
              </div>
            </div>

            {room.phase === "finished" && (
              <div className="felt-over">
                <h2>{game.winner ?? "Nobody"} wins</h2>
                {isHost ? (
                  <button type="button" className="btn btn-primary btn-xl" onClick={() => socket.emit("backToLobby")}>
                    Back to lobby
                  </button>
                ) : (
                  <p className="dim">Waiting for the host…</p>
                )}
              </div>
            )}
          </div>

          {/* Phone: your seat below the table */}
          {mySeat && (
            <div className={`tp-me ${isMyTurn ? "is-turn" : ""}`}>
              <Avatar name={mySeat.name} color={myColor} size={40} />
              <div style={{ flex: 1 }}>
                <div className="seat-name">You</div>
                <div className={`seat-sub ${isMyTurn ? "accent" : ""}`}>
                  {isMyTurn ? `Your turn · ${mySeat.cardCount} cards` : seatText(mySeat)}
                </div>
              </div>
              {mySeat.cardCount > 0 && <CardBack small />}
            </div>
          )}

          {/* Phone: the latest slap */}
          <div className="tp-last">
            {lastSlap ? (
              <>
                <span className="dot" style={{ background: colorFor(lastSlap.name).bg }} />
                <span style={{ flex: 1 }}>
                  {lastSlap.name} {RESULT_TEXT[lastSlap.result]}
                </span>
                <span className="mono">{lastSlap.ms}ms</span>
              </>
            ) : (
              <span className="dim">No slaps yet</span>
            )}
          </div>

          <div className="tp-controls">
            {mySeat && playing ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-xl"
                  onMouseDown={(e) => e.preventDefault()} // keep focus off the button so Space never "clicks" it
                  onClick={() => canPlay && socket.emit("play")}
                  disabled={!canPlay}
                >
                  {playLabel}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-xl"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={slap}
                  disabled={!canSlap}
                >
                  Slap <span className="kbd">Space</span>
                </button>
              </>
            ) : !mySeat ? (
              <p className="dim">You're watching this game.</p>
            ) : null}
          </div>

          {/* Phone: which slaps count */}
          <div className="tp-rule-chips">
            {activeRules.map((r) => (
              <span key={r.key} className="chip">{r.label}</span>
            ))}
          </div>
        </div>

        {/* Right: rules */}
        <aside className="tp-side">
          <section className="panel">
            <h2 className="panel-title">Valid slaps</h2>
            <ul className="rules">
              {activeRules.map((r) => (
                <li key={r.key}>
                  <CheckIcon />
                  <div>
                    <div className="rule-name">{r.label}</div>
                    <div className="dim small">{r.example}</div>
                  </div>
                </li>
              ))}
              {offRules.map((r) => (
                <li key={r.key} className="is-off">
                  <CrossIcon />
                  <div>
                    <div className="rule-name strike">{r.label}</div>
                    <div className="small">Off this game</div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="rules-foot">Wrong slap burns 1 card under the pile.</p>
          </section>
          {room.spectators.length > 0 && (
            <section className="panel">
              <p className="dim small">{room.spectators.length} watching</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}