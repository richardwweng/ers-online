import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { socket, useConnected } from "../socket";
import { SLAP_RULES } from "../rules";
import Card, { CardBack } from "./Card";
import { Avatar, HelpIcon, SoundOffIcon, SoundOnIcon } from "./ui";
import HowToPlay from "./HowToPlay";
import Emotes from "./Emotes";
import { EMOTES } from "../emotes";
import { COLORS } from "../colors";
import { playSound, toggleMute, useMuted } from "../sound";
import { buzz } from "../haptics";
import type { Card as CardData, GameView, RoomState, SeatView, SlapEntry } from "../types";
import "./Table.css";

// Where seats sit around the table, going clockwise from you at the bottom
const POSITIONS: Record<number, string[]> = {
  1: ["bottom"],
  2: ["bottom", "top"],
  3: ["bottom", "left", "right"],
  4: ["bottom", "left", "top", "right"],
};

// Where a seat sits on screen, seen from `viewFrom` (your seat is always at the bottom)
function positionFor(index: number, n: number, viewFrom: number) {
  return POSITIONS[n]?.[(index - viewFrom + n) % n] ?? "top";
}

type FxKind = "won" | "late" | "wrong";
type Fx = { kind: FxKind; key: number }; // a quick effect on one seat after a slap
type Sweep = { cards: CardData[]; to: string; key: number }; // the pile flying to whoever won it
type Burn = { card: CardData; from: string; seat: number; name: string; key: number }; // a burned card being shown

const FX_LABEL = { won: "Won!", late: "Late", wrong: "−1" } as const;

function withoutKey<T>(obj: Record<number, T>, key: number) {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

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

type Props = { room: RoomState; game: GameView; myId: string };

export default function Table({ room, game, myId }: Props) {
  const connected = useConnected();
  const muted = useMuted();
  const [copied, setCopied] = useState(false);
  const [fx, setFx] = useState<Record<number, Fx>>({});
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const [stamp, setStamp] = useState<{ seat: number; key: number } | null>(null);
  const [burn, setBurn] = useState<Burn | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [emotes, setEmotes] = useState<Record<number, { emoji: string; key: number }>>({}); // emotes showing by each seat
  const [emoteCooldown, setEmoteCooldown] = useState(false);
  const [tap, setTap] = useState<{ x: number; y: number; key: number } | null>(null); // ring where the table was tapped

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

  // Measure the table and scale the pile and burned card to fit it. CSS alone can't do this
  // reliably: phone browsers report a taller screen than you can see while their toolbars show.
  const feltRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const felt = feltRef.current;
    if (!felt) return;
    const update = () => {
      const inner = felt.clientHeight;
      const center = felt.querySelector<HTMLElement>(".felt-center");
      const gap = center ? parseFloat(getComputedStyle(center).rowGap) || 0 : 0;
      const seat = felt.querySelector<HTMLElement>(".seat");
      const seatsOnTable = seat !== null && getComputedStyle(seat).display !== "none";
      const room = inner - (seatsOnTable ? 168 : 12); // leave space for the seats at the top and bottom
      const fixed = 36 + 18 + gap * 2; // challenge chip + pile count + spacing (these don't shrink)
      const fit = Math.min(1, Math.max(0.4, (room - fixed) / 200)); // the pile is 200px tall at full size
      const burnFit = Math.min(1, Math.max(0.4, (inner - 52) / 190)); // burned card (scaled up 12%) + its label
      felt.style.setProperty("--fit", fit.toFixed(3));
      felt.style.setProperty("--burn-fit", burnFit.toFixed(3));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(felt);
    return () => observer.disconnect();
  }, []);

  // Sounds: a flick for each new card, and a ping when it becomes your turn
  const prevTopId = useRef(topCardId);
  useEffect(() => {
    if (topCardId !== null && topCardId !== prevTopId.current) playSound("card");
    prevTopId.current = topCardId;
  }, [topCardId]);

  const wasMyTurn = useRef(isMyTurn);
  useEffect(() => {
    if (isMyTurn && !wasMyTurn.current) playSound("turn");
    wasMyTurn.current = isMyTurn;
  }, [isMyTurn]);

  // Keep the latest pile and seat layout handy for the server's effect messages below
  const pileRef = useRef(game.pile);
  const layoutRef = useRef({ n, viewFrom });
  const seatsRef = useRef(game.seats);
  const mySeatRef = useRef(mySeatIndex);
  useEffect(() => {
    pileRef.current = game.pile;
    layoutRef.current = { n, viewFrom };
    seatsRef.current = game.seats;
    mySeatRef.current = mySeatIndex;
  }, [game.pile, n, viewFrom, game.seats, mySeatIndex]);

  // Effects the server tells us about: slaps (shake, flash, stamp) and piles being won (sweep)
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    function onSlapFx({ seat, result, card }: { seat: number; result: FxKind; card?: CardData | null }) {
      const key = Date.now() + Math.random();
      setFx((prev) => ({ ...prev, [seat]: { kind: result, key } }));
      timers.push(setTimeout(() => setFx((prev) => (prev[seat]?.key === key ? withoutKey(prev, seat) : prev)), 900));
      if (result === "wrong") playSound("wrong");
      // Phones that can vibrate: a double buzz when YOU burn, a firm one when YOU win the slap
      if (seat === mySeatRef.current) buzz(result === "wrong" ? [70, 50, 70] : result === "won" ? 45 : 0);
      if (result === "wrong" && card) {
        // Show everyone the burned card for a second, then it slides under the pile
        const { n, viewFrom } = layoutRef.current;
        const name = seatsRef.current[seat]?.name ?? "";
        setBurn({ card, from: positionFor(seat, n, viewFrom), seat, name, key });
        timers.push(setTimeout(() => setBurn((b) => (b?.key === key ? null : b)), 1500));
      }
      if (result === "won") {
        playSound("slap");
        setStamp({ seat, key });
        timers.push(setTimeout(() => setStamp((s) => (s?.key === key ? null : s)), 800));
      }
    }

    function onPileWon({ seat }: { seat: number }) {
      const { n, viewFrom } = layoutRef.current;
      const key = Date.now() + Math.random();
      setSweep({ cards: pileRef.current, to: positionFor(seat, n, viewFrom), key });
      timers.push(setTimeout(() => setSweep((s) => (s?.key === key ? null : s)), 650));
      timers.push(setTimeout(() => playSound("win"), 120));
    }

    socket.on("slapFx", onSlapFx);
    // Someone sent an emote: show it by their seat for a couple of seconds
    function onEmote({ seat, emoji }: { seat: number; emoji: string }) {
      const key = Date.now() + Math.random();
      setEmotes((prev) => ({ ...prev, [seat]: { emoji, key } }));
      timers.push(setTimeout(() => setEmotes((prev) => (prev[seat]?.key === key ? withoutKey(prev, seat) : prev)), 2200));
    }

    socket.on("pileWon", onPileWon);
    socket.on("emote", onEmote);
    return () => {
      socket.off("slapFx", onSlapFx);
      socket.off("pileWon", onPileWon);
      socket.off("emote", onEmote);
      timers.forEach(clearTimeout);
    };
  }, []);

  const slap = useCallback(() => {
    if (!canSlap) return false;
    socket.emit("slap", { ms: Math.round(performance.now() - cardShownAt.current) });
    buzz(12); // a tiny tap you can feel (Android only)
    return true;
  }, [canSlap]);

  // Send an emote (at most about one a second; the server enforces it too)
  const sendEmote = useCallback(
    (emoji: string) => {
      if (!mySeat || emoteCooldown) return;
      socket.emit("emote", emoji);
      setEmoteCooldown(true);
      setTimeout(() => setEmoteCooldown(false), 1200);
    },
    [mySeat, emoteCooldown]
  );

  // Phones: touching anywhere on the table slaps, the moment the finger lands
  function onFeltPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return; // mouse users slap with Space or the button
    if (!slap()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ring = { x: e.clientX - rect.left, y: e.clientY - rect.top, key: e.timeStamp };
    setTap(ring);
    setTimeout(() => setTap((t) => (t?.key === ring.key ? null : t)), 450);
  }

  // Space bar slaps (except while typing in a text box)
  useEffect(() => {
    function isTyping(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    }
    function onKeyDown(e: KeyboardEvent) {
      // Number keys 1–6 send an emote
      const digit = /^Digit([1-6])$/.exec(e.code);
      if (digit && !isTyping(e) && !e.repeat && !document.querySelector("dialog[open]")) {
        sendEmote(EMOTES[Number(digit[1]) - 1]);
        return;
      }
      if (e.code !== "Space" || isTyping(e)) return;
      if (document.querySelector("dialog[open]")) return; // the How to play guide is open: let Space scroll it
      e.preventDefault(); // don't scroll the page
      if (!e.repeat) slap(); // holding Space down only slaps once
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space" && !isTyping(e) && !document.querySelector("dialog[open]")) e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [slap, sendEmote]);

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
    position: positionFor(index, n, viewFrom),
  }));
  const fxClass = (index: number) => (fx[index] ? `fx-${fx[index].kind}` : "");
  const emoteFor = (index: number) =>
    emotes[index] ? (
      <span key={emotes[index].key} className="emote" aria-hidden="true">
        {emotes[index].emoji}
      </span>
    ) : null;
  const fxBubble = (index: number) =>
    fx[index] ? (
      <span key={fx[index].key} className={`fx-bubble fx-bubble-${fx[index].kind}`} aria-hidden="true">
        {FX_LABEL[fx[index].kind]}
      </span>
    ) : null;
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
          <button
            type="button"
            className="ghost-btn icon-btn"
            onClick={() => setShowRules(true)}
            aria-label="How to play"
            title="How to play"
          >
            <HelpIcon />
          </button>
          <button
            type="button"
            className="ghost-btn icon-btn"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? "Turn sound on" : "Mute sound"}
            title={muted ? "Turn sound on" : "Mute sound"}
          >
            {muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
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
                className={`mini-seat ${playing && index === game.turn ? "is-turn" : ""} ${seat.status === "eliminated" || !seat.connected ? "is-off" : ""} ${fxClass(index)}`}
              >
                {fxBubble(index)}
                {emoteFor(index)}
                <Avatar name={seat.name} color={color} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div className="mini-name">{seat.name}</div>
                  <div className="mono dim small">{seat.status === "eliminated" ? "out" : seat.cardCount}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={`felt ${canSlap ? "is-slappable" : ""}`} ref={feltRef} onPointerDown={onFeltPointerDown}>
            {tap && <span key={tap.key} className="tap-ring" style={{ left: tap.x, top: tap.y }} aria-hidden="true" />}
            {/* Desktop: seats around the table */}
            {seats.map(({ seat, index, color, position }) => {
              const isMe = index === mySeatIndex;
              const isTurn = playing && !game.collecting && index === game.turn;
              const off = seat.status === "eliminated" || !seat.connected;
              return (
                <div key={seat.id} className={`seat pos-${position} ${isMe ? "is-me" : ""} ${isTurn ? "is-turn" : ""} ${off ? "is-off" : ""} ${fxClass(index)}`}>
                  {fxBubble(index)}
                  {emoteFor(index)}
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
                {game.pile.length === 0 && !sweep && <div className="pile-empty">Empty pile</div>}
                {/* The pile that was just won, flying to the winner */}
                {sweep?.cards.map((card, k) => (
                  <Card
                    key={`sweep-${sweep.key}-${card.id}`}
                    card={card}
                    className="sweep"
                    from={sweep.to}
                    style={{ "--r": `${tilt(card.id)}deg`, "--x": `${(k - (sweep.cards.length - 1)) * 28 + 14}px` } as CSSProperties}
                  />
                ))}
                {/* Each card flies in from the seat of whoever played it */}
                {game.pile.map((card, k) => (
                  <Card
                    key={card.id}
                    card={card}
                    className={k === game.pile.length - 1 ? "is-top" : ""}
                    from={game.pileBy[k] === undefined ? undefined : positionFor(game.pileBy[k], n, viewFrom)}
                    style={{ "--r": `${tilt(card.id)}deg`, "--x": `${(k - (game.pile.length - 1)) * 28 + 14}px` } as CSSProperties}
                  />
                ))}
              </div>

              <div className="pile-info mono">
                PILE {game.pileCount} · BURNED {game.burnedCount}
              </div>
            </div>

            {burn && (
              <div key={burn.key} className="burn-show" aria-live="polite">
                <div className="burn-card-wrap" data-from={burn.from}>
                  <Card card={burn.card} />
                </div>
                <span className="burn-label" style={{ background: COLORS[burn.seat % COLORS.length].bg }}>
                  {burn.name} burned
                </span>
              </div>
            )}

            {stamp && (
              <div key={stamp.key} className="slap-stamp" style={{ color: COLORS[stamp.seat % COLORS.length].bg }} aria-hidden="true">
                SLAP!
              </div>
            )}
          </div>

          {/* Phone: your seat below the table */}
          {mySeat && (
            <div className={`tp-me ${isMyTurn ? "is-turn" : ""} ${fxClass(mySeatIndex)}`}>
              {fxBubble(mySeatIndex)}
              {emoteFor(mySeatIndex)}
              <Avatar name={mySeat.name} color={myColor} size={40} />
              <div style={{ flex: 1 }}>
                <div className="seat-name">You</div>
                <div className={`seat-sub ${isMyTurn ? "accent" : ""}`}>
                  {isMyTurn ? `Your turn · ${mySeat.cardCount} cards` : seatText(mySeat)}
                </div>
              </div>
              {playing && <Emotes className="emote-phone" onSend={sendEmote} coolingDown={emoteCooldown} />}
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
                  className="btn btn-danger btn-xl btn-slap"
                  onMouseDown={(e) => e.preventDefault()}
                  // Slap the instant a finger or mouse button goes down, like the Space bar does.
                  // A normal click only fires when you let go, which made phone slaps slower.
                  onPointerDown={(e) => {
                    if (e.button !== 0) return; // left mouse button, finger or pen only
                    e.preventDefault();
                    slap();
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) slap(); // keyboard "click" (Enter): no pointer was involved
                  }}
                  disabled={!canSlap}
                >
                  Slap <span className="kbd">Space</span>
                </button>
                <Emotes className="emote-desktop" onSend={sendEmote} coolingDown={emoteCooldown} />
              </>
            ) : !mySeat ? (
              <p className="dim">You're watching this game.</p>
            ) : null}
          </div>

          {/* Phone: which slaps count */}
          <div className="tp-rule-chips">
            {mySeat && <span className="chip chip-tap">Tap the table to slap</span>}
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

      <HowToPlay
        open={showRules}
        onClose={() => {
          setShowRules(false);
          // Take focus off the "?" button so Space goes straight back to slapping
          requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur());
        }}
        settings={room.settings}
      />
    </div>
  );
}