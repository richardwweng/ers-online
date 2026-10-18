import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { socket, playerToken, useConnected } from "../socket";
import Table from "../components/Table";
import { SLAP_RULES } from "../rules";
import type { JoinReply, Person, RoomState } from "../types";

export default function Game() {
  const { roomId } = useParams();
  const [name, setName] = useState(() => localStorage.getItem("ers-name") ?? "");
  const [checking, setChecking] = useState(true); // still checking for a saved seat?
  const [myId, setMyId] = useState<string | null>(null); // our public ID once joined
  const [error, setError] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [replaced, setReplaced] = useState(false); // this game was opened in another tab
  const connected = useConnected();

  // Update whenever the server sends new room info
  useEffect(() => {
    socket.on("room", setRoom);
    return () => {
      socket.off("room", setRoom);
    };
  }, []);

  // On page load (and after any reconnect), try to get back into our seat
  useEffect(() => {
    function rejoin() {
      socket.emit("joinRoom", { roomId, token: playerToken }, (res: JoinReply) => {
        if (res.ok && res.you) {
          setMyId(res.you);
        } else {
          setMyId(null);
          setRoom(null);
          if (res.error) setError(res.error);
        }
        setChecking(false);
      });
    }
    rejoin();
    socket.on("connect", rejoin);
    return () => {
      socket.off("connect", rejoin);
    };
  }, [roomId]);

  // Another tab took our seat: disconnect this one so the two don't fight over it
  useEffect(() => {
    function onReplaced() {
      setReplaced(true);
      socket.disconnect();
    }
    socket.on("replaced", onReplaced);
    return () => {
      socket.off("replaced", onReplaced);
    };
  }, []);

  function takeBackSeat() {
    setReplaced(false);
    socket.connect(); // reconnecting runs rejoin(), which takes the seat back
  }

  function join(spectate: boolean) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name first");
      return;
    }
    localStorage.setItem("ers-name", trimmed); // remember the name for next time
    socket.emit("joinRoom", { roomId, token: playerToken, name: trimmed, spectate }, (res: JoinReply) => {
      if (res.ok && res.you) {
        setMyId(res.you);
        setError("");
      } else {
        setError(res.error ?? "Could not join");
      }
    });
  }

  if (replaced) {
    return (
      <main>
        <h1>Open in another tab</h1>
        <p>This game is open in another tab or window, so this one was disconnected.</p>
        <button onClick={takeBackSeat}>Play here instead</button>
      </main>
    );
  }

  if (checking) {
    return (
      <main>
        <p>{connected ? "Loading..." : "Waking up the server. This can take up to a minute..."}</p>
      </main>
    );
  }

  // Screen 1: enter a name
  if (!myId) {
    return (
      <main>
        <h1>Join game {roomId}</h1>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && join(false)}
          placeholder="Your name"
          maxLength={16}
        />
        <button onClick={() => join(false)}>Join</button>
        <button onClick={() => join(true)}>Spectate</button>
        {error && <p>{error}</p>}
      </main>
    );
  }

  if (!room) return <main><p>Loading...</p></main>;

  const isHost = room.hostId === myId;

  // Screen 3: the table (during and after a game)
  if (room.phase !== "lobby" && room.game) {
    return <Table room={room} game={room.game} myId={myId} isHost={isHost} />;
  }

  const isPlayer = room.players.some((p) => p.id === myId);
  const seatsOpen = room.players.length < room.maxPlayers;
  const link = window.location.href;

  const label = (p: Person) =>
    p.name +
    (p.id === room.hostId ? " (host)" : "") +
    (p.id === myId ? " (you)" : "") +
    (p.connected ? "" : " (reconnecting...)");

  // Screen 2: the lobby
  return (
    <main>
      <h1>Game {room.id}</h1>
      <p>Invite link: {link}</p>
      <button onClick={() => navigator.clipboard.writeText(link)}>Copy link</button>

      <h2>Players ({room.players.length}/{room.maxPlayers})</h2>
      <ul>
        {room.players.map((p) => (
          <li key={p.id}>{label(p)}</li>
        ))}
      </ul>

      {room.spectators.length > 0 && (
        <>
          <h2>Spectators ({room.spectators.length})</h2>
          <ul>
            {room.spectators.map((s) => (
              <li key={s.id}>{label(s)}</li>
            ))}
          </ul>
        </>
      )}

      {!isPlayer && seatsOpen && (
        <button onClick={() => socket.emit("takeSeat")}>Take a seat</button>
      )}

      <h2>Slap rules</h2>
      {SLAP_RULES.map((rule) => (
        <label key={rule.key} style={{ display: "block" }}>
          <input
            type="checkbox"
            checked={room.settings[rule.key]}
            disabled={!isHost}
            onChange={(e) => socket.emit("updateSettings", { [rule.key]: e.target.checked })}
          />{" "}
          {rule.label} <small>({rule.example})</small>
        </label>
      ))}
      {!isHost && <p><small>Only the host can change these.</small></p>}

      {isHost ? (
        <button disabled={room.players.length < 2} onClick={() => socket.emit("startGame")}>
          {room.players.length < 2 ? "Need at least 2 players" : "Start game"}
        </button>
      ) : (
        <p>Waiting for the host to start...</p>
      )}
    </main>
  );
}