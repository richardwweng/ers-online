import { useNavigate } from "react-router";
import { socket, useConnected } from "../socket";

export default function Home() {
  const navigate = useNavigate();
  const connected = useConnected();

  function createGame() {
    // Ask the server for a new room, then go to its page
    socket.emit("createRoom", (roomId: string) => {
      navigate(`/game/${roomId}`);
    });
  }

  return (
    <main>
      <h1>ERS Online</h1>
      <button onClick={createGame} disabled={!connected}>
        {connected ? "Create game" : "Connecting..."}
      </button>
      {!connected && (
        <p>
          <small>Waking up the server. This can take up to a minute if nobody has played in a while.</small>
        </p>
      )}
    </main>
  );
}