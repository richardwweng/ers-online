// Shapes of the data the server sends us

export type Person = { id: string; name: string; connected: boolean };

export type Settings = {
  doubles: boolean;
  sandwich: boolean;
  topBottom: boolean;
  tens: boolean;
  marriage: boolean;
};

export type Card = { id: number; rank: string; suit: "S" | "H" | "D" | "C" };

export type SeatView = {
  id: string;
  name: string;
  cardCount: number;
  status: "active" | "out" | "eliminated";
  connected: boolean;
};

export type SlapEntry = { name: string; ms: number; result: "won" | "late" | "wrong" };

export type GameView = {
  seats: SeatView[];
  pile: Card[];
  burnedCount: number;
  turn: number;
  challenge: { bySeat: number; chancesLeft: number } | null;
  collecting: boolean;
  slapHistory: SlapEntry[];
  winner: string | null;
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

export type JoinReply = { ok: boolean; you?: string; error?: string };