// Shapes of the data the server sends us

export type Person = { id: string; name: string; connected: boolean };

export type Settings = {
  doubles: boolean;
  sandwich: boolean;
  topBottom: boolean;
  tens: boolean;
  marriage: boolean;
  sixSeven: boolean;
};

export type Card = { id: number; rank: string; suit: "S" | "H" | "D" | "C" };

export type SeatStats = {
  pilesWon: number;
  wrongSlaps: number;
  fastestWinMs: number | null; // quickest reaction on a slap that won a pile
  outAtPile: number | null;
  outOrder: number | null; // 1 = first player out
  forfeited: boolean;
};

export type SeatView = {
  id: string;
  name: string;
  cardCount: number;
  status: "active" | "out" | "eliminated";
  connected: boolean;
  stats: SeatStats;
};

export type SlapEntry = { name: string; ms: number; result: "won" | "late" | "wrong" };

export type GameView = {
  seats: SeatView[];
  pile: Card[];
  pileBy: number[]; // which seat played each pile card
  pileCount: number;
  burnedCount: number;
  turn: number;
  challenge: { bySeat: number; chancesLeft: number } | null;
  collecting: boolean;
  slapHistory: SlapEntry[];
  winner: string | null;
  winnerSeat: number | null;
  pilesPlayed: number;
  durationMs: number;
};

export type RoomState = {
  id: string;
  phase: "lobby" | "playing" | "finished";
  hostId: string | null;
  settings: Settings;
  players: Person[];
  spectators: Person[];
  maxPlayers: number;
  game: GameView | null;
};

export type JoinReply = { ok: boolean; you?: string; error?: string; kicked?: boolean };

// What the join screen can see about a game before you join it
export type RoomPeek = {
  hostName: string | null;
  players: string[];
  maxPlayers: number;
  phase: "lobby" | "playing" | "finished";
};
