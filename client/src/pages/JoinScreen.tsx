import { useEffect, useState } from "react";
import { Link } from "react-router";
import { socket, useConnected } from "../socket";
import { seatColor } from "../colors";
import { Avatar, Brand, EyeIcon } from "../components/ui";
import type { RoomPeek } from "../types";

type Props = {
  roomId: string;
  error: string; // from the server, if joining failed
  onJoin: (name: string, spectate: boolean) => void;
};

// What you see when you open an invite link: who's there, then Take a seat or Just watch
export default function JoinScreen({ roomId, error, onJoin }: Props) {
  const connected = useConnected();
  const [name, setName] = useState(() => localStorage.getItem("ers-name") ?? "");
  const [nameError, setNameError] = useState("");
  const [peek, setPeek] = useState<RoomPeek | null | undefined>(undefined); // undefined = still loading

  // Ask the server who's in this game (without joining it yet)
  useEffect(() => {
    if (!connected) return;
    socket.emit("peekRoom", roomId, (info: RoomPeek | null) => setPeek(info));
  }, [roomId, connected]);

  if (peek === null || error.startsWith("Game not found")) {
    return (
      <div className="pg pg-felt-center">
        <header className="pg-header">
          <Brand />
        </header>
        <div className="center-msg">
          <h1 className="msg-title">Game not found</h1>
          <p className="note">
            There's no game with the code <span className="mono">{roomId}</span>. Games close when everyone leaves or the
            server restarts.
          </p>
          <Link className="btn btn-primary btn-lg" to="/">Start a new game</Link>
        </div>
      </div>
    );
  }

  const players = peek?.players ?? [];
  const maxPlayers = peek?.maxPlayers ?? 4;
  const started = peek ? peek.phase !== "lobby" : false;
  const full = players.length >= maxPlayers;
  const canSit = !started && !full;

  let status = "Loading the table…";
  if (peek) {
    if (started) status = "Game in progress · you'll watch until the next one";
    else if (full) status = "The table is full · you can watch";
    else status = `${players.length} of ${maxPlayers} seats taken · waiting to start`;
  }

  function submit(spectate: boolean) {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Enter a name first");
      return;
    }
    onJoin(trimmed, spectate);
  }

  return (
    <div className="pg pg-felt-center">
      <header className="pg-header">
        <Brand />
        <span className="status">
          <span className={`status-dot ${connected ? "" : "waking"}`} />
          {connected ? "Connected" : "Waking up the server…"}
        </span>
      </header>

      <main className="join-main">
        <div className="join-head">
          <div className="join-invited">{peek?.hostName ? `${peek.hostName} invited you to` : "You're invited to"}</div>
          <h1 className="join-code">{roomId}</h1>
        </div>

        <div className="seat-dots" aria-label={`Seated: ${players.join(", ") || "nobody yet"}`}>
          {Array.from({ length: maxPlayers }, (_, i) =>
            players[i] ? (
              <Avatar key={i} name={players[i]} color={seatColor(i)} size={44} />
            ) : (
              <div key={i} className="seat-empty" aria-hidden="true" />
            )
          )}
        </div>
        <p className="join-sub">{status}</p>

        <div className="form-card">
          <label htmlFor="join-name" className="field-label">Your name</label>
          <input
            id="join-name"
            className="input"
            value={name}
            maxLength={16}
            autoComplete="nickname"
            placeholder="What should we call you?"
            onChange={(e) => {
              setName(e.target.value);
              setNameError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && submit(!canSit)}
          />
          {(nameError || error) && <p className="field-error" role="alert">{nameError || error}</p>}

          {canSit ? (
            <>
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => submit(false)} disabled={!connected}>
                Take a seat
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={() => submit(true)} disabled={!connected}>
                <EyeIcon />
                Just watch
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => submit(true)} disabled={!connected || !peek}>
              <EyeIcon />
              Watch the game
            </button>
          )}
          <p className="note center">
            Watchers see every card as it's played but can't slap. You can take an open seat before the next game.
          </p>
        </div>
      </main>
    </div>
  );
}
