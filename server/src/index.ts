import { Server } from "socket.io";
import { randomUUID } from "crypto";
import type { Settings, GameState } from "./engine";
import { createGame, playCard, isValidSlap, wrongSlap, awardPile, forfeit } from "./engine";

type Person = {
  id: string; // public ID, safe to show everyone
  token: string; // secret ID from the player's browser tab, never sent to others
  name: string;
  socketId: string | null; // null while disconnected
  leaveTimer?: ReturnType<typeof setTimeout>;
  ping: number; // round-trip time to this player's browser, in ms (0 until measured)
};

// A correct slap waiting to be compared. `ms` is the reaction time we trust, `at` is when it arrived.
type SlapAttempt = { seat: number; ms: number; at: number };

type Room = {
  id: string;
  phase: "lobby" | "playing" | "finished";
  hostId: string | null;
  settings: Settings;
  players: Person[];
  spectators: Person[];
  game: GameState | null;
  awardTimer: ReturnType<typeof setTimeout> | null; // the pause before a face-card pile is collected
  slapRace: SlapAttempt[] | null; // correct slaps being compared to find the fastest
  topCardAt: number; // when the server sent out the current top card
  kicked: Set<string>; // secret IDs of people the host removed; they can't rejoin this game
};

type JoinRequest = { roomId: string; token: string; name?: string; spectate?: boolean };
type JoinReply = { ok: boolean; you?: string; error?: string; kicked?: boolean };

const MAX_PLAYERS = 4;
const RECONNECT_GRACE_MS = 30_000; // how long a seat is held after disconnecting
const AWARD_DELAY_MS = 1000; // pause before a failed challenge's pile is collected
const SLAP_WINDOW_MS = 100; // shortest wait to collect correct slaps before picking the fastest
const MAX_SLAP_WINDOW_MS = 300; // longest wait, for players with a lot of lag
const MAX_PING_COMPENSATION_MS = 300; // cap so nobody can fake a huge ping for an advantage
const PING_SLACK_MS = 40; // allowance for ping wobbling between measurements

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

// The hosting service tells us which port to use. On your laptop, it's 3001.
const PORT = Number(process.env.PORT) || 3001;

// Which websites may connect. Online, this is your Netlify address.
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());

const io = new Server(PORT, {
  cors: { origin: CLIENT_ORIGINS },
});

// ---------- What browsers are allowed to see ----------

function publicPerson(p: Person) {
  return { id: p.id, name: p.name, connected: p.socketId !== null };
}

// Card counts only, never anyone's actual hand
function publicGame(room: Room) {
  const game = room.game;
  if (!game) return null;
  return {
    seats: game.seats.map((s) => ({
      id: s.personId,
      name: s.name,
      cardCount: s.hand.length,
      status: s.status,
      connected: room.players.some((p) => p.id === s.personId && p.socketId !== null),
      stats: s.stats,
    })),
    pile: game.pile.slice(-3), // only the top 3 cards, so nobody can look up the first card
    pileBy: game.pileBy.slice(-3), // who played each of those 3 cards, so they can fly in from the right seat
    pileCount: game.pile.length,
    burnedCount: game.burned.length,
    turn: game.turn,
    challenge: game.challenge,
    collecting: game.awardTo !== null,
    slapHistory: game.slapHistory.slice(-10),
    winner: game.winner === null ? null : game.seats[game.winner].name,
    winnerSeat: game.winner,
    pilesPlayed: game.pilesPlayed,
    durationMs: (game.endedAt ?? Date.now()) - game.startedAt,
  };
}

function publicRoom(room: Room) {
  return {
    id: room.id,
    phase: room.phase,
    hostId: room.hostId,
    settings: room.settings,
    players: room.players.map(publicPerson),
    spectators: room.spectators.map(publicPerson),
    maxPlayers: MAX_PLAYERS,
    game: publicGame(room),
  };
}

function sendRoom(room: Room) {
  io.to(room.id).emit("room", publicRoom(room));
}

// ---------- Game flow ----------

// Run after every game action: end the game, start the collect timer, and update everyone
function afterChange(room: Room) {
  const game = room.game;
  if (game) {
    if (game.winner !== null && room.phase === "playing") {
      room.phase = "finished";
      console.log("Game over:", room.id, "winner:", game.seats[game.winner].name);
    } else if (game.awardTo !== null && !room.awardTimer) {
      // Give everyone a moment to slap before the challenger collects
      room.awardTimer = setTimeout(() => {
        room.awardTimer = null;
        const g = room.game;
        if (room.slapRace || !g || g.awardTo === null) return; // a slap is handling it
        io.to(room.id).emit("pileWon", { seat: g.awardTo }); // browsers sweep the pile to the winner
        awardPile(g, g.awardTo);
        afterChange(room);
      }, AWARD_DELAY_MS);
    }
  }
  sendRoom(room);
}

// Pick the correct slap with the fastest reaction time (ties go to whoever arrived first)
function resolveSlapRace(room: Room) {
  const attempts = room.slapRace;
  const game = room.game;
  room.slapRace = null;
  if (!attempts || !game || game.winner !== null || game.pile.length === 0) return;

  const contenders = attempts
    .filter((a) => game.seats[a.seat].status !== "eliminated")
    .sort((a, b) => a.ms - b.ms || a.at - b.at);

  if (contenders.length > 0) {
    const [first, ...rest] = contenders;
    if (room.awardTimer) {
      clearTimeout(room.awardTimer);
      room.awardTimer = null;
    }
    io.to(room.id).emit("slapFx", { seat: first.seat, result: "won" }); // browsers flash the winner
    io.to(room.id).emit("pileWon", { seat: first.seat });
    awardPile(game, first.seat);
    game.slapHistory.push({ name: game.seats[first.seat].name, ms: first.ms, result: "won" });
    const stats = game.seats[first.seat].stats;
    if (first.ms > 0 && (stats.fastestWinMs === null || first.ms < stats.fastestWinMs)) stats.fastestWinMs = first.ms;
    for (const a of rest) {
      game.slapHistory.push({ name: game.seats[a.seat].name, ms: a.ms, result: "late" });
      io.to(room.id).emit("slapFx", { seat: a.seat, result: "late" });
    }
  }
  afterChange(room);
}

// Stop any pending timers (used when a game is replaced or ended early)
function clearTimers(room: Room) {
  if (room.awardTimer) clearTimeout(room.awardTimer);
  room.awardTimer = null;
  room.slapRace = null;
}

// Shuffle and deal a new game for everyone seated
function startNewGame(room: Room) {
  clearTimers(room);
  room.game = createGame(room.players.map((p) => ({ id: p.id, name: p.name })));
  room.phase = "playing";
  const counts = room.game.seats.map((s) => `${s.name}: ${s.hand.length} cards`).join(", ");
  console.log("Game started:", room.id, "|", counts);
  afterChange(room);
}

// Keep the reaction time a sensible number, whatever the browser sends
function cleanMs(ms: unknown): number {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return 0;
  return Math.max(0, Math.min(Math.round(ms), 9999));
}

function cappedPing(person: Person | undefined) {
  return Math.min(person?.ping ?? 0, MAX_PING_COMPENSATION_MS);
}

// The reaction time we'll trust for a slap. The browser reports it, but the server can check it:
// the card had to travel to the player and the slap had to travel back, so the real reaction
// time can't be much less than (time since the card was sent) minus (their ping).
function trustedReactionMs(reported: number, room: Room, person: Person, now: number) {
  const sinceCardSent = Math.max(0, now - room.topCardAt);
  const fastestPossible = Math.max(0, sinceCardSent - cappedPing(person) - PING_SLACK_MS);
  return Math.min(Math.max(reported, fastestPossible), sinceCardSent);
}

// How long to wait for other correct slaps after the first one arrives. A player with more lag
// than the first slapper could have reacted faster but still be on the way, so wait for them.
function slapWindowMs(room: Room, firstSlapper: Person) {
  const game = room.game;
  if (!game) return SLAP_WINDOW_MS;
  const pings = game.seats
    .filter((s) => s.status !== "eliminated")
    .map((s) => cappedPing(room.players.find((p) => p.id === s.personId)));
  const extraLag = Math.max(0, ...pings) - cappedPing(firstSlapper);
  return Math.min(MAX_SLAP_WINDOW_MS, Math.max(SLAP_WINDOW_MS, extraLag + PING_SLACK_MS));
}

// ---------- Rooms and people ----------

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
  // If they were in a game, they forfeit
  if (room.game && room.phase === "playing") {
    const seat = room.game.seats.findIndex((s) => s.personId === person.id);
    if (seat !== -1) forfeit(room.game, seat);
  }

  room.players = room.players.filter((p) => p !== person);
  room.spectators = room.spectators.filter((p) => p !== person);

  // If the host left, pass host to the next connected player
  if (room.hostId === person.id) {
    const next = room.players.find((p) => p.socketId !== null) ?? room.players[0];
    room.hostId = next?.id ?? null;
  }

  afterChange(room);
  deleteIfEmpty(room, 60_000);
}

io.on("connection", (socket) => {
  let currentRoom: Room | null = null;
  let me: Person | null = null;

  // Measure this player's ping every few seconds (used to judge slaps fairly).
  // Use the middle of the last 5 readings so one slow reading doesn't throw it off.
  const pings: number[] = [];
  let rtt = 0;
  function measurePing() {
    const start = Date.now();
    socket.timeout(2000).emit("latency", (err: Error | null) => {
      if (err) return;
      pings.push(Date.now() - start);
      if (pings.length > 5) pings.shift();
      rtt = [...pings].sort((a, b) => a - b)[Math.floor(pings.length / 2)];
      if (me) me.ping = rtt;
    });
  }
  measurePing();
  const pingTimer = setInterval(measurePing, 3000);

  // Someone clicked "Create game"
  socket.on("createRoom", (reply: (roomId: string) => void) => {
    const room: Room = {
      id: makeRoomId(),
      phase: "lobby",
      hostId: null,
      settings: { doubles: true, sandwich: true, topBottom: false, tens: false, marriage: false, sixSeven: false }, // only doubles and sandwiches start on
      players: [],
      spectators: [],
      game: null,
      awardTimer: null,
      slapRace: null,
      topCardAt: 0,
      kicked: new Set(),
    };
    rooms.set(room.id, room);
    deleteIfEmpty(room, 5 * 60_000); // clean up if nobody joins within 5 minutes
    console.log("Room created:", room.id);
    reply(room.id);
  });

  // The join screen asks who's in a game before you join it
  socket.on("peekRoom", (roomId: string, reply: (info: unknown) => void) => {
    if (typeof reply !== "function") return;
    const room = typeof roomId === "string" ? rooms.get(roomId.toUpperCase()) : undefined;
    if (!room) return reply(null);
    const host = room.players.find((p) => p.id === room.hostId);
    reply({
      hostName: host?.name ?? null,
      players: room.players.map((p) => p.name),
      maxPlayers: MAX_PLAYERS,
      phase: room.phase,
    });
  });

  // Joining for the first time, or coming back after a refresh
  socket.on("joinRoom", ({ roomId, token, name, spectate }: JoinRequest, reply: (res: JoinReply) => void) => {
    const room = rooms.get(roomId);
    if (!room) return reply({ ok: false, error: "Game not found. Check the link." });
    if (typeof token !== "string" || token.length > 100) {
      return reply({ ok: false, error: "Invalid player ID." });
    }
    if (room.kicked.has(token)) {
      return reply({ ok: false, kicked: true, error: "The host removed you from this game." });
    }

    let person = [...room.players, ...room.spectators].find((p) => p.token === token);

    if (person) {
      // Returning player: put them back in their seat
      clearTimeout(person.leaveTimer);
      if (person.socketId && person.socketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(person.socketId);
        oldSocket?.leave(room.id);
        oldSocket?.emit("replaced"); // tell the older tab it lost the seat
      }
      person.socketId = socket.id;
    } else {
      // New player: they need a name first
      if (!name || !name.trim()) return reply({ ok: false });

      person = { id: randomUUID(), token, name: name.trim().slice(0, 16), socketId: socket.id, ping: rtt };
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
    if (rtt) person.ping = rtt;
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

  // The host removed someone from the lobby (player or watcher)
  socket.on("kick", (personId: string) => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || room.hostId !== person.id || room.phase !== "lobby") return;
    if (typeof personId !== "string" || personId === person.id) return;
    const target = [...room.players, ...room.spectators].find((p) => p.id === personId);
    if (!target) return;

    clearTimeout(target.leaveTimer);
    room.kicked.add(target.token);
    if (target.socketId) {
      const theirSocket = io.sockets.sockets.get(target.socketId);
      theirSocket?.leave(room.id);
      theirSocket?.emit("kicked"); // their screen shows "You were removed"
    }
    target.socketId = null;
    console.log("Kicked:", target.name, "from", room.id);
    removePerson(room, target);
  });

  // A seated player wants to watch instead (lobby only)
  socket.on("standUp", () => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || room.phase !== "lobby") return;
    if (!room.players.includes(person)) return;
    room.players = room.players.filter((p) => p !== person);
    room.spectators.push(person);

    // If the host stood up, pass host to the next connected player
    if (room.hostId === person.id) {
      const next = room.players.find((p) => p.socketId !== null) ?? room.players[0];
      room.hostId = next?.id ?? null;
    }
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

  // The host clicked "Start game": shuffle and deal
  socket.on("startGame", () => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || room.hostId !== person.id || room.phase !== "lobby") return;
    if (room.players.length < 2) return;
    startNewGame(room);
  });

  // The host clicked "Play again" after a game: same seats, same rules, new deal
  socket.on("playAgain", () => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || room.hostId !== person.id || room.phase !== "finished") return;
    if (room.players.length < 2) return;
    startNewGame(room);
  });

  // A player clicked Play
  socket.on("play", () => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || room.phase !== "playing" || !room.game) return;
    if (room.slapRace) return; // wait until the current slap is decided
    const seat = room.game.seats.findIndex((s) => s.personId === person.id);
    if (seat === -1) return; // spectators can't play
    if (playCard(room.game, seat)) {
      room.topCardAt = Date.now();
      afterChange(room);
    }
  });

  // A player slapped (button or Space). `ms` is their reaction time, measured in their browser.
  socket.on("slap", (data: { ms?: number }) => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || room.phase !== "playing" || !room.game) return;
    const game = room.game;
    const seat = game.seats.findIndex((s) => s.personId === person.id);
    if (seat === -1) return; // spectators can't slap
    const s = game.seats[seat];
    if (s.status === "eliminated" || game.winner !== null) return;
    if (game.pile.length === 0) return; // empty pile: slapping does nothing

    const now = Date.now();
    const ms = trustedReactionMs(cleanMs(data?.ms), room, person, now);

    if (!isValidSlap(game.pile, room.settings)) {
      const burned = wrongSlap(game, seat);
      game.slapHistory.push({ name: s.name, ms, result: "wrong" });
      // Browsers shake the slapper's seat and show everyone the burned card
      io.to(room.id).emit("slapFx", { seat, result: "wrong", card: burned });
      afterChange(room);
      return;
    }

    // Correct slap: collect every correct slap in the next moment, then pick the fastest reaction
    if (!room.slapRace) {
      room.slapRace = [];
      setTimeout(() => resolveSlapRace(room), slapWindowMs(room, person));
    }
    if (room.slapRace.some((a) => a.seat === seat)) return; // already slapped this pile
    room.slapRace.push({ seat, ms, at: now });
  });

  // A player gave up: same as leaving, so their cards go under the pile
  socket.on("forfeit", () => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || room.phase !== "playing" || !room.game) return;
    const seat = room.game.seats.findIndex((s) => s.personId === person.id);
    if (seat === -1 || room.game.seats[seat].status === "eliminated") return;
    forfeit(room.game, seat);
    afterChange(room);
  });

  // The host clicked "Back to lobby" after a game ended
  socket.on("backToLobby", () => {
    const room = currentRoom;
    const person = me;
    if (!room || !person || room.hostId !== person.id || room.phase !== "finished") return;
    clearTimers(room);
    room.phase = "lobby";
    room.game = null;
    sendRoom(room);
  });

  // Someone clicked Leave: remove them right away instead of holding their seat
  socket.on("leaveRoom", () => {
    const room = currentRoom;
    const person = me;
    if (!room || !person) return;
    clearTimeout(person.leaveTimer);
    socket.leave(room.id);
    currentRoom = null;
    me = null;
    removePerson(room, person);
  });

  // Tab closed, refreshed, or lost connection: hold their spot for a bit
  socket.on("disconnect", () => {
    clearInterval(pingTimer);
    const room = currentRoom;
    const person = me;
    if (!room || !person || person.socketId !== socket.id) return; // a newer tab already took over
    person.socketId = null;
    sendRoom(room); // everyone sees "(reconnecting...)"
    person.leaveTimer = setTimeout(() => removePerson(room, person), RECONNECT_GRACE_MS);
  });
});

console.log(`Server running on port ${PORT}`);