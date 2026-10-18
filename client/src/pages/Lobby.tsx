import { useEffect, useState } from "react";
import { socket } from "../socket";
import { SLAP_RULES } from "../rules";
import { seatColor } from "../colors";
import { Avatar, Brand, CopyIcon, EyeIcon, PlusIcon, ShareIcon, XIcon } from "../components/ui";
import type { RoomState } from "../types";

type Props = { room: RoomState; myId: string; onLeave: () => void };

// On phones, use the share sheet (text the link straight to friends). On computers, copy it.
const useShareSheet =
  typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

export default function Lobby({ room, myId, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmKick, setConfirmKick] = useState<string | null>(null); // who we're about to remove

  const isHost = room.hostId === myId;
  const isPlayer = room.players.some((p) => p.id === myId);
  const seatsOpen = room.players.length < room.maxPlayers;
  const enoughPlayers = room.players.length >= 2;
  const host = room.players.find((p) => p.id === room.hostId);
  const link = `${window.location.origin}/game/${room.id}`;
  const seats = Array.from({ length: room.maxPlayers }, (_, i) => room.players[i] ?? null);

  // Removing someone takes two clicks; the second click has to come within 3 seconds
  useEffect(() => {
    if (!confirmKick) return;
    const t = setTimeout(() => setConfirmKick(null), 3000);
    return () => clearTimeout(t);
  }, [confirmKick]);

  function kick(personId: string) {
    if (confirmKick === personId) {
      socket.emit("kick", personId);
      setConfirmKick(null);
    } else {
      setConfirmKick(personId);
    }
  }

  // The host's remove button, shown next to everyone except the host
  function kickButton(personId: string, name: string, small = false) {
    if (!isHost || personId === myId) return null;
    const confirming = confirmKick === personId;
    return (
      <button
        type="button"
        className={`kick-btn ${small ? "kick-sm" : ""} ${confirming ? "is-confirm" : ""}`}
        onClick={() => kick(personId)}
        aria-label={confirming ? `Click again to remove ${name}` : `Remove ${name}`}
        title={confirming ? "Click again to remove" : `Remove ${name}`}
      >
        {confirming ? "Remove?" : <XIcon size={small ? 12 : 16} />}
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLeave}>
          Leave
        </button>
      </header>

      <div className="lobby-body">
        <main className="lobby-main">
          <section className="code-banner" aria-label="Invite">
            <div style={{ minWidth: 0 }}>
              <div className="code-label">GAME CODE</div>
              <h1 className="code-big">{room.id}</h1>
              <div className="code-url">{link.replace(/^https?:\/\//, "")}</div>
            </div>
            <button type="button" className="btn btn-light btn-lg" onClick={shareLink}>
              {useShareSheet ? <ShareIcon /> : <CopyIcon />}
              {useShareSheet ? "Share invite link" : copied ? "Copied!" : "Copy invite link"}
            </button>
          </section>

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
                    {kickButton(p.id, p.name)}
                  </div>
                ) : (
                  <div key={`open-${i}`} className="seat-card is-open">
                    <div className="open-ring">
                      <PlusIcon />
                    </div>
                    <div>
                      <div>Open seat</div>
                      <div className="seat-card-sub">Send the link to fill it</div>
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
              <span className="note">
                {enoughPlayers
                  ? `Deals 52 cards across ${room.players.length} players.`
                  : "Need at least 2 players to start. Send the link to a friend."}
              </span>
            </div>
          ) : (
            <p className="waiting">
              {isPlayer
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
    </div>
  );
}
