import { Server } from "socket.io";
import { randomUUID } from "crypto";

type Person = {
  id: string; // public ID, safe to show everyone
  token: string; // secret ID from the player's browser tab, never sent to others
  name: string;
  socketId: string | null; // null while disconnected
  leaveTimer?: ReturnType<typeof setTimeout>;
};

type Settings = {
  doubles: boolean;
  sandwich: boolean;
  topBottom: boolean;
  tens: boolean;
  marriage: boolean;
};

type Room = {
  id: string;
  phase: "lobby" | "playing" | "finished";
  hostId: string | null;
  settings: Settings;
  players: Person[];
  spectators: Person[];
};

type JoinRequest = { roomId: string; token: string; name?: string; spectate?: boolean };
type JoinReply = { ok: boolean; you?: string; error?: string };

const MAX_PLAYERS = 4;
const RECONNECT_GRACE_MS = 30_000; // how long a seat is held after disconnecting
const rooms = new Map<string, Room>();

// Letters and numbers that are hard to mix up (no 0/O or 1/I/L)
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeRoomId(): string {
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return rooms.has(id) ? makeRoomId() : id;
}

const io = new Server(3001, {
  cors: { origin: "http://localhost:5173" },
});

// What everyone is allowed to see about a person (no secret token)
function publicPerson(p: Person) {
  return { id: p.id, name: p.name, connected: p.socketId !== null };
}

// What everyone in the room is allowed to see
function publicRoom(room: Room) {
  return {
    id: room.id,
    phase: room.phase,
    hostId: room.hostId,
    settings: room.settings,
    players: room.players.map(publicPerson),
    spectators: room.spectators.map(publicPerson),
    maxPlayers: MAX_PLAYERS,
  };
}

function sendRoom(room: Room) {
  io.to(room.id).emit("room", publicRoom(room));
}

// Delete a room after a delay if it's still empty by then
function deleteIfEmpty(room: Room, delayMs: number) {
  setTimeout(() => {
    const empty = room.players.length === 0 && room.spectators.length === 0;
    if (empty && rooms.get(room.id) === room) {
      rooms.delete(room.id);
      console.log("Room closed:", room.id);
    }
  }, delayMs);
}

// Someone didn't come back in time: remove them for good
function removePerson(room: Room, person: Person) {
  room.players = room.players.filter((p) => p !== person);
  room.spectators = room.spectators.filter((p) => p !== person);

  // If the host left, pass host to the next connected player
  if (room.hostId === person.id) {
    const next = room.players.find((p) => p.socketId !== null) ?? room.players[0];
    room.hostId = next?.id ?? null;
  }

  sendRoom(room);
  deleteIfEmpty(room, 60_000);
}

io.on("connection", (socket) => {
  let currentRoom: Room | null = null;
  let me: Person | null = null;

  // Someone clicked "Create game"
  socket.on("createRoom", (reply: (roomId: string) => void) => {
    const room: Room = {
      id: makeRoomId(),
      phase: "lobby",
      hostId: null,
      settings: { doubles: true, sandwich: true, topBottom: true, tens: true, marriage: true },
      players: [],
      spectators: [],
    };
    rooms.set(room.id, room);
    deleteIfEmpty(room, 5 * 60_000); // clean up if nobody joins within 5 minutes
    console.log("Room created:", room.id);
    reply(room.id);
  });

  // Joining for the first time, or coming back after a refresh
  socket.on("joinRoom", ({ roomId, token, name, spectate }: JoinRequest, reply: (res: JoinReply) => void) => {
    const room = rooms.get(roomId);
    if (!room) return reply({ ok: false, error: "Game not found. Check the link." });
    if (typeof token !== "string" || token.length > 100) {
      return reply({ ok: false, error: "Invalid player ID." });
    }

    let person = [...room.players, ...room.spectators].find((p) => p.token === token);

    if (person) {
      // Returning player: put them back in their seat
      clearTimeout(person.leaveTimer);
      if (person.socketId && person.socketId !== socket.id) {
        io.sockets.sockets.get(person.socketId)?.leave(room.id); // an older tab loses the seat
      }
      person.socketId = socket.id;
    } else {
      // New player: they need a name first
      if (!name || !name.trim()) return reply({ ok: false });

      person = { id: randomUUID(), token, name: name.trim().slice(0, 16), socketId: socket.id };
      const canSit = !spectate && room.phase === "lobby" && room.players.length < MAX_PLAYERS;
      if (canSit) {
        room.players.push(person);
        if (!room.hostId) room.hostId = person.id; // first player becomes host
      } else {
        room.spectators.push(person); // full, already started, or chose to watch
      }
    }

    currentRoom = room;
    me = person;
    socket.join(room.id);
    reply({ ok: true, you: person.id });
    sendRoom(room);
  });

  // A spectator wants to move into an open seat (lobby only)
  socket.on("takeSeat", () => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || room.phase !== "lobby" || room.players.length >= MAX_PLAYERS) return;
    if (!room.spectators.includes(person)) return;
    room.spectators = room.spectators.filter((p) => p !== person);
    room.players.push(person);
    if (!room.hostId) room.hostId = person.id;
    sendRoom(room);
  });

  // The host flipped a slap-rule toggle
  socket.on("updateSettings", (changes: Partial<Settings>) => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || room.hostId !== person.id || room.phase !== "lobby") return;
    for (const key of Object.keys(room.settings) as (keyof Settings)[]) {
      const value = changes[key];
      if (typeof value === "boolean") room.settings[key] = value;
    }
    sendRoom(room);
  });

  // The host clicked "Start game"
  socket.on("startGame", () => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || room.hostId !== person.id || room.phase !== "lobby") return;
    if (room.players.length < 2) return;
    room.phase = "playing"; // dealing cards comes in the next step
    console.log("Game started:", room.id);
    sendRoom(room);
  });

  // Tab closed, refreshed, or lost connection: hold their spot for a bit
  socket.on("disconnect", () => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || person.socketId !== socket.id) return; // a newer tab already took over
    person.socketId = null;
    sendRoom(room); // everyone sees "(reconnecting...)"
    person.leaveTimer = setTimeout(() => removePerson(room, person), RECONNECT_GRACE_MS);
  });
});

console.log("Server running on port 3001");