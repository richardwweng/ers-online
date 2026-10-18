import { Server } from "socket.io";

const io = new Server(3001, {
  cors: { origin: "http://localhost:5173" }, // allow your frontend to connect
});

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);
  socket.on("disconnect", () => console.log("Player left:", socket.id));
});

console.log("Server running on port 3001");