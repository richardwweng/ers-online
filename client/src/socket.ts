import { io } from "socket.io-client";

// One shared connection to the server, used by every page
export const socket = io("http://localhost:3001");