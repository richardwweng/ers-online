import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { socket } from "../socket";

type Player = { id: string; name: string };

export default function Game() {
  const { roomId } = useParams(); // the "K7PQ2M" part of the URL
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);

  // Update the player list whenever the server sends a new one
  useEffect(() => {
    socket.on("players", setPlayers);
    return () => {
      socket.off("players", setPlayers);
    };
  }, []);

  function join() {
    if (!name.trim()) {
      setError("Enter a name first");
      return;
    }
    socket.emit("joinRoom", { roomId, name: name.trim() }, (ok: boolean) => {
      if (ok) setJoined(true);
      else setError("Game not found. Check the link.");
    });
  }

  const link = window.location.href;

  // Before joining: ask for a name
  if (!joined) {
    return (
      <main>
        <h1>Join game {roomId}</h1>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && join()}
          placeholder="Your name"
        />
        <button onClick={join}>Join</button>
        {error && <p>{error}</p>}
      </main>
    );
  }

  // After joining: show the lobby
  return (
    <main>
      <h1>Game {roomId}</h1>
      <p>Invite link: {link}</p>
      <button onClick={() => navigator.clipboard.writeText(link)}>Copy link</button>
      <h2>Players ({players.length})</h2>
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            {p.name}
            {p.id === socket.id ? " (you)" : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}