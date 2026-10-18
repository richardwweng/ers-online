import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

export default function App() {
  const [status, setStatus] = useState("Connecting...");

  useEffect(() => {
    const onConnect = () => setStatus("Connected as " + socket.id);
    const onDisconnect = () => setStatus("Disconnected");
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      if (socket.connected) onConnect();
    };
  }, []);

  return <h1>{status}</h1>;
}