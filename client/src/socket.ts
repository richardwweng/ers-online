import { useSyncExternalStore } from "react";
import { io } from "socket.io-client";

export const socket = io(import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001");

// Where to keep this player's secret ID:
// - Live site: localStorage, so closing and reopening the tab keeps your seat.
// - localhost: sessionStorage, so each tab is a separate player for easy testing.
const storage = window.location.hostname === "localhost" ? sessionStorage : localStorage;

function getToken(): string {
  let token = storage.getItem("ers-token");
  if (!token) {
    token = crypto.randomUUID();
    storage.setItem("ers-token", token);
  }
  return token;
}

export const playerToken = getToken();

// Reply right away when the server measures our ping
socket.on("latency", (ack: () => void) => ack());

// useConnected(): true while we're connected to the server. Any page can use it.
function subscribe(onChange: () => void) {
  socket.on("connect", onChange);
  socket.on("disconnect", onChange);
  return () => {
    socket.off("connect", onChange);
    socket.off("disconnect", onChange);
  };
}

export function useConnected() {
  return useSyncExternalStore(subscribe, () => socket.connected);
}