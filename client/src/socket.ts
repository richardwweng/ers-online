import { io } from "socket.io-client";

export const socket = io("http://localhost:3001");

// A secret ID for this browser tab. It survives refreshes but not closing the tab.
// (sessionStorage is separate for each tab, so multiple tabs still count as different players for testing.)
function getToken(): string {
  let token = sessionStorage.getItem("ers-token");
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem("ers-token", token);
  }
  return token;
}

export const playerToken = getToken();