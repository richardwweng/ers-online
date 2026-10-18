import { Server } from "socket.io";

type Player = { id: string; name: string };
type Room = { id: string; players: Player[] };

// All active games, looked up by room ID
const rooms = new Map<string, Room>();

// Letters and numbers that are hard to mix up (no 0/O or 1/I/L)
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeRoomId(): string {
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return rooms.has(id) ? makeRoomId() : id; // try again if the ID is taken
}

const io = new Server(3001, {
  cors: { origin: "http://localhost:5173" },
});

// Send the current player list to everyone in a room
function sendPlayers(room: Room) {
  io.to(room.id).emit("players", room.players);
}

io.on("connection", (socket) => {
  let currentRoom: Room | null = null;

  // Someone clicked "Create game"
  socket.on("createRoom", (reply: (roomId: string) => void) => {
    const room: Room = { id: makeRoomId(), players: [] };
    rooms.set(room.id, room);
    console.log("Room created:", room.id);
    reply(room.id);
  });

  // Someone entered their name on a game page
  socket.on(
    "joinRoom",
    ({ roomId, name }: { roomId: string; name: string }, reply: (ok: boolean) => void) => {
      const room = rooms.get(roomId);
      if (!room) return reply(false); // no game with that ID

      if (!room.players.some((p) => p.id === socket.id)) {
        room.players.push({ id: socket.id, name: name.slice(0, 16) });
      }
      currentRoom = room;
      socket.join(room.id);
      reply(true);
      sendPlayers(room);
    }
  );

  // Someone closed their tab or lost connection
  socket.on("disconnect", () => {
    if (!currentRoom) return;
    const room = currentRoom;
    room.players = room.players.filter((p) => p.id !== socket.id);
    sendPlayers(room);

    // Delete the room if it stays empty for a minute
    if (room.players.length === 0) {
      setTimeout(() => {
        if (room.players.length === 0) {
          rooms.delete(room.id);
          console.log("Room closed:", room.id);
        }
      }, 60_000);
    }
  });
});

console.log("Server running on port 3001");