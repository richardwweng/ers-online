import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { socket, playerToken, useConnected } from "../socket";
import Table from "../components/Table";
import { Brand } from "../components/ui";
import JoinScreen from "./JoinScreen";
import Lobby from "./Lobby";
import GameOver from "./GameOver";
import type { JoinReply, RoomState } from "../types";
import "./Pages.css";

type Intent = "play" | "watch";

// A full-screen message (loading, waking up, open in another tab)
function Message({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="pg pg-felt-center">
      <header className="pg-header">
        <Brand />
      </header>
      <div className="center-msg">
        {title && <h1 className="msg-title">{title}</h1>}
        {children}
      </div>
    </div>
  );
}

// Everything at /game/ABC123: join screen, lobby, then the table
export default function Game() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const connected = useConnected();

  // Set when you come from the home page, so you join without typing your name again
  const intent = useRef<Intent | null>((location.state as { intent?: Intent } | null)?.intent ?? null);

  const [checking, setChecking] = useState(true); // still checking for a saved seat?
  const [myId, setMyId] = useState<string | null>(null); // our public ID once joined
  const [error, setError] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [replaced, setReplaced] = useState(false); // this game was opened in another tab

  // Update whenever the server sends new room info
  useEffect(() => {
    socket.on("room", setRoom);
    return () => {
      socket.off("room", setRoom);
    };
  }, []);

  const join = useCallback(
    (name: string, spectate: boolean) => {
      localStorage.setItem("ers-name", name); // remember the name for next time
      socket.emit("joinRoom", { roomId, token: playerToken, name, spectate }, (res: JoinReply) => {
        if (res.ok && res.you) {
          setMyId(res.you);
          setError("");
        } else {
          setError(res.error ?? "Could not join");
        }
      });
    },
    [roomId]
  );

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
          // Came from the home page with a name: join right away
          const savedName = localStorage.getItem("ers-name")?.trim();
          if (!res.error && intent.current && savedName) join(savedName, intent.current === "watch");
        }
        intent.current = null; // only join automatically once
        setChecking(false);
      });
    }
    rejoin();
    socket.on("connect", rejoin);
    return () => {
      socket.off("connect", rejoin);
    };
  }, [roomId, join]);

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

  function leave() {
    socket.emit("leaveRoom");
    navigate("/");
  }

  if (replaced) {
    return (
      <Message title="Open in another tab">
        <p className="note">This game is open in another tab or window, so this one was disconnected.</p>
        <button type="button" className="btn btn-primary btn-lg" onClick={takeBackSeat}>
          Play here instead
        </button>
      </Message>
    );
  }

  const loading = (
    <Message>
      <div className="spinner" aria-hidden="true" />
      <p className="note">
        {connected ? "Loading the table…" : "Waking up the server. This can take up to a minute…"}
      </p>
    </Message>
  );

  if (checking) return loading;
  if (!myId) return <JoinScreen roomId={roomId} error={error} onJoin={join} />;
  if (!room) return loading;

  // After a game: winner, stats, play again
  if (room.phase === "finished" && room.game) {
    return <GameOver room={room} game={room.game} myId={myId} onLeave={leave} />;
  }

  // During a game: the table
  if (room.phase === "playing" && room.game) {
    return <Table room={room} game={room.game} myId={myId} />;
  }

  return <Lobby room={room} myId={myId} onLeave={leave} />;
}
