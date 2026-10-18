import { randomInt } from "crypto";

// ---------- Types ----------

export type Suit = "S" | "H" | "D" | "C";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Card = { id: number; rank: Rank; suit: Suit };

export type Settings = {
  doubles: boolean;
  sandwich: boolean;
  topBottom: boolean;
  tens: boolean;
  marriage: boolean;
};

// active: has cards
// out: no cards, but can slap back in until the current pile is won
// eliminated: done for this game
export type SeatStatus = "active" | "out" | "eliminated";

export type Seat = { personId: string; name: string; hand: Card[]; status: SeatStatus };

// won: fastest correct slap. late: correct, but someone was faster. wrong: burned a card.
export type SlapEntry = { name: string; ms: number; result: "won" | "late" | "wrong" };

export type GameState = {
  seats: Seat[]; // in turn order
  pile: Card[]; // cards actually played; slap rules only look at these
  burned: Card[]; // burned cards, kept under the pile; they go to whoever wins it
  turn: number; // index of the seat whose turn it is
  challenge: { bySeat: number; chancesLeft: number } | null; // active face-card countdown
  awardTo: number | null; // seat about to collect the pile after a failed challenge
  slapHistory: SlapEntry[];
  winner: number | null; // seat index of the winner, once the game is over
};

// ---------- Setup ----------

const SUITS: Suit[] = ["S", "H", "D", "C"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// How many chances the next player gets after each face card
const FACE_CHANCES: Partial<Record<Rank, number>> = { J: 1, Q: 2, K: 3, A: 4 };

// Card values for the "tens" rule (face cards never count)
const TEN_VALUES: Partial<Record<Rank, number>> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
};

function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ id: deck.length, rank, suit });
  }
  return deck;
}

// Fisher-Yates shuffle, using a secure random number generator
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function createGame(people: { id: string; name: string }[]): GameState {
  const deck = shuffle(makeDeck());
  const seats: Seat[] = people.map((p) => ({ personId: p.id, name: p.name, hand: [], status: "active" }));

  // Deal one card at a time around the table
  deck.forEach((card, i) => seats[i % seats.length].hand.push(card));

  return {
    seats,
    pile: [],
    burned: [],
    turn: randomInt(seats.length), // random first player
    challenge: null,
    awardTo: null,
    slapHistory: [],
    winner: null,
  };
}

// ---------- Helpers ----------

// The next seat after `from` that still has cards, or -1 if nobody does
function nextActive(game: GameState, from: number): number {
  const n = game.seats.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (game.seats[i].status === "active") return i;
  }
  return -1;
}

// `preferred` if they're still in the game, otherwise anyone who is
function firstAlive(game: GameState, preferred: number): number | null {
  if (game.seats[preferred].status !== "eliminated") return preferred;
  const i = game.seats.findIndex((s) => s.status !== "eliminated");
  return i === -1 ? null : i;
}

// Move the turn to the next player who can play
function advanceTurn(game: GameState, from: number) {
  const next = nextActive(game, from);
  if (next === -1) {
    // Nobody has cards left: the pile goes to the challenger, or whoever played last
    game.awardTo = game.challenge?.bySeat ?? firstAlive(game, from);
    return;
  }
  if (game.challenge && next === game.challenge.bySeat) {
    // The only player left with cards is the one who set the challenge: they win the pile
    game.awardTo = next;
    return;
  }
  game.turn = next;
}

function checkWinner(game: GameState) {
  const alive = game.seats
    .map((seat, index) => ({ seat, index }))
    .filter((x) => x.seat.status !== "eliminated");
  if (alive.length === 1) {
    game.winner = alive[0].index;
    game.awardTo = null;
  }
}

// Clean up after a seat is eliminated (wrong slap with no cards, or forfeit)
function onEliminated(game: GameState, seat: number) {
  if (game.challenge?.bySeat === seat) {
    game.challenge = null; // their challenge is cancelled
    if (game.awardTo === seat) game.awardTo = null;
  }
  if (game.awardTo === null && game.turn === seat) advanceTurn(game, seat);
  checkWinner(game);
}

// ---------- Actions ----------

// A player tries to play their top card. Returns false if they're not allowed to.
export function playCard(game: GameState, seat: number): boolean {
  if (game.winner !== null || game.awardTo !== null || seat !== game.turn) return false;
  const s = game.seats[seat];
  if (s.status !== "active") return false;

  const card = s.hand.shift()!;
  game.pile.push(card);
  if (s.hand.length === 0) s.status = "out"; // can still slap back in during this pile

  const chances = FACE_CHANCES[card.rank];
  if (chances) {
    // Face card: start a new challenge for the next player
    game.challenge = { bySeat: seat, chancesLeft: chances };
    advanceTurn(game, seat);
  } else if (game.challenge) {
    // Answering a challenge with a number card uses up one chance
    game.challenge.chancesLeft -= 1;
    if (game.challenge.chancesLeft === 0) {
      game.awardTo = game.challenge.bySeat; // failed: challenger collects (after a short pause)
    } else if (s.status === "out") {
      advanceTurn(game, seat); // ran out of cards: the next player takes over the challenge
    }
  } else {
    advanceTurn(game, seat);
  }
  return true;
}

// Does the current pile match any slap rule the host turned on?
export function isValidSlap(pile: Card[], settings: Settings): boolean {
  const n = pile.length;
  if (n < 2) return false;
  const top = pile[n - 1];
  const second = pile[n - 2];
  const third = n >= 3 ? pile[n - 3] : null;

  if (settings.doubles && top.rank === second.rank) return true;
  if (settings.sandwich && third && top.rank === third.rank) return true;
  if (settings.topBottom && n >= 3 && top.rank === pile[0].rank) return true;
  if (settings.tens) {
    const a = TEN_VALUES[top.rank];
    const b = TEN_VALUES[second.rank];
    if (a !== undefined && b !== undefined && a + b === 10) return true;
  }
  if (settings.marriage) {
    const pair = top.rank + second.rank;
    if (pair === "KQ" || pair === "QK") return true;
  }
  return false;
}

// A seat collects the whole pile (from a correct slap or a won challenge)
export function awardPile(game: GameState, seat: number) {
  const s = game.seats[seat];
  s.hand.push(...game.burned, ...game.pile); // burned cards first, like flipping a real pile over
  game.pile = [];
  game.burned = [];
  game.challenge = null;
  game.awardTo = null;
  s.status = "active";

  // Anyone who ran out during this pile has now missed their chance to slap back in
  for (const other of game.seats) {
    if (other !== s && other.status === "out") other.status = "eliminated";
  }

  game.turn = seat; // the winner leads the next pile
  checkWinner(game);
}

// A seat slapped when they shouldn't have
export function wrongSlap(game: GameState, seat: number) {
  const s = game.seats[seat];

  if (s.hand.length === 0) {
    // Nothing to burn: they're out for good
    s.status = "eliminated";
    onEliminated(game, seat);
    return;
  }

  game.burned.push(s.hand.shift()!); // burn one card under the pile
  if (s.hand.length === 0) {
    s.status = "out";
    if (game.turn === seat && game.awardTo === null) advanceTurn(game, seat);
  }
}

// A seat disconnected and didn't come back in time
export function forfeit(game: GameState, seat: number) {
  const s = game.seats[seat];
  if (s.status === "eliminated") return;
  game.burned.push(...s.hand); // their cards go under the pile for the next winner
  s.hand = [];
  s.status = "eliminated";
  onEliminated(game, seat);
}