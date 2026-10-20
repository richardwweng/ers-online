import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { SLAP_RULES } from "../rules";
import { seatColor } from "../colors";
import { Avatar, Brand, CopyIcon, CrownIcon, EyeIcon, HelpIcon, PlusIcon, ShareIcon, XIcon } from "../components/ui";
import HowToPlay from "../components/HowToPlay";
import { deadlineFrom, useSecondsLeft } from "../useCountdown";
import type { RoomState } from "../types";

type Props = { room: RoomState; myId: string; onLeave: () => void };

// On phones, use the share sheet (text the link straight to friends). On computers, copy it.
const useShareSheet =
  typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

export default function Lobby({ room, myId, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  // The host's two-click buttons: which person, and whether we're removing them or making them host
  const [confirm, setConfirm] = useState<{ id: string; action: "kick" | "host" } | null>(null);
  const [hostNotice, setHostNotice] = useState(false); // "You're the host now"
  const startsIn = useSecondsLeft(deadlineFrom(room.receivedAt, room.autoStartIn)); // public tables start by themselves
  const [showRules, setShowRules] = useState(false);

  const isHost = room.hostId === myId;
  const isPlayer = room.players.some((p) => p.id === myId);
  const seatsOpen = room.players.length < room.maxPlayers;
  const enoughPlayers = room.players.length >= 2;
  const host = room.players.find((p) => p.id === room.hostId);
  const link = `${window.location.origin}/game/${room.id}`;
  const seats = Array.from({ length: room.maxPlayers }, (_, i) => room.players[i] ?? null);

  // Removing someone or handing over host takes two clicks; the second has to come within 3 seconds
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(null), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  // When someone hands you the host, say so for a few seconds
  const lastHostId = useRef(room.hostId);
  useEffect(() => {
    const before = lastHostId.current;
    lastHostId.current = room.hostId;
    if (room.hostId !== myId || before === myId || before === null) return;
    setHostNotice(true);
    const t = setTimeout(() => setHostNotice(false), 5000);
    return () => clearTimeout(t);
  }, [room.hostId, myId]);

  function act(personId: string, action: "kick" | "host") {
    if (confirm?.id === personId && confirm.action === action) {
      socket.emit(action === "kick" ? "kick" : "makeHost", personId);
      setConfirm(null);
    } else {
      setConfirm({ id: personId, action });
    }
  }

  // The host's remove button, shown next to everyone except the host
  function kickButton(personId: string, name: string, small = false) {
    if (!isHost || personId === myId) return null;
    const confirming = confirm?.id === personId && confirm.action === "kick";
    return (
      <button
        type="button"
        className={`kick-btn ${small ? "kick-sm" : ""} ${confirming ? "is-confirm" : ""}`}
        onClick={() => act(personId, "kick")}
        aria-label={confirming ? `Click again to remove ${name}` : `Remove ${name}`}
        title={confirming ? "Click again to remove" : `Remove ${name}`}
      >
        {confirming ? "Remove?" : <XIcon size={small ? 12 : 16} />}
      </button>
    );
  }

  // The host's "make host" button, shown next to the other seated players
  function hostButton(personId: string, name: string, connected: boolean) {
    if (!isHost || personId === myId || !connected) return null;
    const confirming = confirm?.id === personId && confirm.action === "host";
    return (
      <button
        type="button"
        className={`kick-btn host-btn ${confirming ? "is-confirm" : ""}`}
        onClick={() => act(personId, "host")}
        aria-label={confirming ? `Click again to make ${name} the host` : `Make ${name} the host`}
        title={confirming ? "Click again to hand over host" : `Make ${name} the host`}
      >
        {confirming ? "Make host?" : <CrownIcon />}
      </button>
    );
  }

  async function shareLink() {
    if (useShareSheet) {
      try {
        await navigator.share({ title: "ERS Online", text: "Join my Egyptian Rat Screw game", url: link });
      } catch {
        // They closed the share sheet; nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the link is still shown on screen to copy by hand
    }
  }

  return (
    <div className="pg">
      <header className="pg-header">
        <Brand />
        <div className="pg-header-right">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRules(true)}>
            <HelpIcon size={16} />
            How to play
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <div className="lobby-body">
        <main className="lobby-main">
          <section className="code-banner" aria-label="Invite">
            <div style={{ minWidth: 0 }}>
              <div className="code-label">
                GAME CODE
                {room.isPublic && <span className="badge-public">PUBLIC</span>}
              </div>
              <h1 className="code-big">{room.id}</h1>
              <div className="code-url">{link.replace(/^https?:\/\//, "")}</div>
            </div>
            <button type="button" className="btn btn-light btn-lg" onClick={shareLink}>
              {useShareSheet ? <ShareIcon /> : <CopyIcon />}
              {useShareSheet ? "Share invite link" : copied ? "Copied!" : "Copy invite link"}
            </button>
          </section>

          <label className={`public-row ${room.isPublic ? "is-on" : ""} ${isHost ? "" : "is-locked"}`}>
            <input
              type="checkbox"
              role="switch"
              className="sr-only"
              checked={room.isPublic}
              disabled={!isHost}
              onChange={(e) => socket.emit("setPublic", e.target.checked)}
            />
            <span className="switch" aria-hidden="true" />
            <span className="public-text">
              <span className="public-title">{room.isPublic ? "Public table" : "Private table"}</span>
              <span className="public-desc">
                {room.isPublic
                  ? "Listed on the home page, so anyone can join. The game starts on its own, and turns are timed (10 seconds)."
                  : isHost
                    ? "Only people with the link can join. Make it public to let anyone on ERS Online find it."
                    : "Only people with the link can join."}
              </span>
            </span>
          </label>

          <section>
            <h2 className="section-title">
              Players <span className="dim" style={{ fontWeight: 500 }}>{room.players.length} of {room.maxPlayers}</span>
            </h2>
            <div className="seat-grid">
              {seats.map((p, i) =>
                p ? (
                  <div key={p.id} className="seat-card">
                    <Avatar name={p.name} color={seatColor(i)} size={52} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="seat-card-name">
                        {p.name}
                        {p.id === myId && <span className="dim" style={{ fontWeight: 500 }}> (you)</span>}
                      </div>
                      {!p.connected ? (
                        <div className="seat-card-sub warn">Reconnecting…</div>
                      ) : p.id === room.hostId ? (
                        <div className="seat-card-sub host">HOST</div>
                      ) : (
                        <div className="seat-card-sub">Seated</div>
                      )}
                    </div>
                    {isHost && p.id !== myId && (
                      <div className="seat-actions">
                        {hostButton(p.id, p.name, p.connected)}
                        {kickButton(p.id, p.name)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div key={`open-${i}`} className="seat-card is-open">
                    <div className="open-ring">
                      <PlusIcon />
                    </div>
                    <div>
                      <div>Open seat</div>
                      <div className="seat-card-sub">{room.isPublic ? "Anyone online can join" : "Send the link to fill it"}</div>
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="watch-row">
              <span className="watch-who">
                <EyeIcon />
                {room.spectators.length === 0 ? (
                  <span>Nobody watching</span>
                ) : (
                  <span className="watch-list">
                    <span>Watching:</span>
                    {room.spectators.map((s) => (
                      <span key={s.id} className={`watch-chip ${s.connected ? "" : "is-away"}`}>
                        {s.name}
                        {s.id === myId ? " (you)" : ""}
                        {!s.connected && " · reconnecting"}
                        {kickButton(s.id, s.name, true)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {isPlayer ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => socket.emit("standUp")}>
                  Switch to watching
                </button>
              ) : seatsOpen ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => socket.emit("takeSeat")}>
                  Take a seat
                </button>
              ) : null}
            </div>
          </section>

          {hostNotice && (
            <p className="host-notice" role="status">
              <CrownIcon /> You're the host now. You pick the slap rules and start the game.
            </p>
          )}

          {isHost ? (
            <div className="start-row">
              <button
                type="button"
                className="btn btn-primary btn-start"
                disabled={!enoughPlayers}
                onClick={() => socket.emit("startGame")}
              >
                Start game
              </button>
              {startsIn !== null ? (
                <span className="autostart" role="status">
                  Starting by itself in <b>{startsIn}s</b>. Start now if everyone's here.
                </span>
              ) : (
                <span className="note">
                  {enoughPlayers
                    ? `Deals 52 cards across ${room.players.length} players.`
                    : room.isPublic
                      ? "Waiting for a second player. Your table is listed on the home page."
                      : "Need at least 2 players to start. Send the link to a friend."}
                </span>
              )}
            </div>
          ) : (
            <p className="waiting">
              {isPlayer && startsIn !== null
                ? `The game starts in ${startsIn}s…`
                : isPlayer
                ? `Waiting for ${host?.name ?? "the host"} to start the game…`
                : seatsOpen
                  ? "You're watching. Take a seat to play in this game."
                  : "You're watching this table."}
            </p>
          )}
        </main>

        <aside className="rules-panel">
          <h2 className="section-title" style={{ marginBottom: 4 }}>Slap rules</h2>
          <p className="note" style={{ marginBottom: 16 }}>
            {isHost ? "You're the host, so you pick." : "Only the host can change these."} They lock when the game starts.
          </p>
          <div className="rule-list">
            {SLAP_RULES.map((rule) => (
              <label key={rule.key} className={`rule-toggle ${isHost ? "" : "is-locked"}`}>
                <input
                  type="checkbox"
                  checked={room.settings[rule.key]}
                  disabled={!isHost}
                  onChange={(e) => socket.emit("updateSettings", { [rule.key]: e.target.checked })}
                />
                <span className="rule-text">
                  <span className="rule-label">{rule.label}</span>
                  <span className="rule-ex">{rule.example}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="rule-summary">
            <div><span>Wrong slap</span><span>Burn 1 card</span></div>
            <div><span>Face cards</span><span className="mono">J1 Q2 K3 A4</span></div>
            <div><span>Slap key</span><span className="mono">Space</span></div>
          </div>
        </aside>
      </div>

      <HowToPlay open={showRules} onClose={() => setShowRules(false)} settings={room.settings} />
    </div>
  );
}
