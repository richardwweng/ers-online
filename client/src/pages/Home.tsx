import { useNavigate } from "react-router";
import { socket } from "../socket";

export default function Home() {
  const navigate = useNavigate();

  function createGame() {
    // Ask the server for a new room, then go to its page
    socket.emit("createRoom", (roomId: string) => {
      navigate(`/game/${roomId}`);
    });
  }

  return (
    <main>
      <h1>ERS Online</h1>
      <button onClick={createGame}>Create game</button>
    </main>
  );
}