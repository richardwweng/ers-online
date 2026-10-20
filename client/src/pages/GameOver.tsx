import { socket } from "../socket";
import { seatColor } from "../colors";
import { Avatar, Brand } from "../components/ui";
import type { GameView, RoomState, SeatView } from "../types";
import { deadlineFrom, useSecondsLeft } from "../useCountdown";

type Props = { room: RoomState; game: GameView; myId: string; onLeave: () => void };

// 873000 ms -> "14:33"
function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// 873000 ms -> "15 minutes"
function minutes(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 1) return "under a minute";
  return m === 1 ? "1 minute" : `${m} minutes`;
}

// Which seat has the highest (or lowest) number for a stat. Null if nobody has one.
function leader(seats: SeatView[], value: (s: SeatView) => number | null, pick: "most" | "least") {
  let best: { index: number; value: number } | null = null;
  seats.forEach((s, index) => {
    const v = value(s);
    if (v === null || v <= 0) return;
    if (!best || (pick === "most" ? v > best.value : v < best.value)) best = { index, value: v };
  });
  return best as { index: number; value: number } | null;
}

export default function GameOver({ room, game, myId, onLeave }: Props) {
  const isHost = room.hostId === myId;
  const backIn = useSecondsLeft(deadlineFrom(room.receivedAt, room.lobbyReturnIn)); // public tables only
  const host = room.players.find((p) => p.id === room.hostId);
  const enoughPlayers = room.players.length >= 2;
  const winnerIndex = game.winnerSeat;
  const winner = winnerIndex === null ? null : game.seats[winnerIndex];
  const iWon = winner?.id === myId;
  const nameOf = (s: SeatView) => (s.id === myId ? `${s.name} (you)` : s.name);

  const fastest = leader(game.seats, (s) => s.stats.fastestWinMs, "least");
  const mostPiles = leader(game.seats, (s) => s.stats.pilesWon, "most");
  const mostWrong = leader(game.seats, (s) => s.stats.wrongSlaps, "most");

  // Winner first, then whoever lasted longest
  const standings = game.seats
    .map((seat, index) => ({ seat, index }))
    .sort((a, b) => {
      if (a.index === winnerIndex) return -1;
      if (b.index === winnerIndex) return 1;
      return (b.seat.stats.outOrder ?? 999) - (a.seat.stats.outOrder ?? 999);
    });

  function standingText(seat: SeatView, index: number) {
    if (index === winnerIndex) return "Winner";
    if (seat.stats.forfeited) return seat.stats.outAtPile ? `Forfeited at pile ${seat.stats.outAtPile}` : "Forfeited";
    if (seat.stats.outAtPile) return `Out at pile ${seat.stats.outAtPile}`;
    return "Out";
  }

  return (
    <div className="pg pg-felt-center">
      <header className="pg-header">
        <Brand />
        <span className="mono dim" style={{ fontSize: 13 }}>
          GAME {room.id} · {clock(game.durationMs)}
        </span>
      </header>

      <main className="over-main">
        <section className="over-hero">
          <svg className="crown" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />
          </svg>
          {winner && winnerIndex !== null && (
            <div className="over-avatar">
              <Avatar name={winner.name} color={seatColor(winnerIndex)} size={96} />
            </div>
          )}
          <h1 className="over-title">{winner ? (iWon ? "You win!" : `${winner.name} wins`) : "Game over"}</h1>
          <p className="over-sub">
            Last one standing after {minutes(game.durationMs)} and {game.pilesPlayed} {game.pilesPlayed === 1 ? "pile" : "piles"}.
          </p>
        </section>

        <section className="stat-grid" aria-label="Game stats">
          <div className="stat">
            <div className="stat-label">FASTEST SLAP</div>
            {fastest ? (
              <>
                <div className="stat-value mono">{fastest.value}<span className="stat-unit">ms</span></div>
                <div className="stat-who" style={{ color: seatColor(fastest.index).bg }}>{nameOf(game.seats[fastest.index])}</div>
              </>
            ) : (
              <>
                <div className="stat-value mono">—</div>
                <div className="stat-who dim">No piles won by slapping</div>
              </>
            )}
          </div>
          <div className="stat">
            <div className="stat-label">MOST PILES WON</div>
            {mostPiles ? (
              <>
                <div className="stat-value mono">{mostPiles.value}</div>
                <div className="stat-who" style={{ color: seatColor(mostPiles.index).bg }}>{nameOf(game.seats[mostPiles.index])}</div>
              </>
            ) : (
              <>
                <div className="stat-value mono">0</div>
                <div className="stat-who dim">No piles won</div>
              </>
            )}
          </div>
          <div className="stat">
            <div className="stat-label">MOST WRONG SLAPS</div>
            {mostWrong ? (
              <>
                <div className="stat-value mono">{mostWrong.value}</div>
                <div className="stat-who" style={{ color: seatColor(mostWrong.index).bg }}>{nameOf(game.seats[mostWrong.index])}</div>
              </>
            ) : (
              <>
                <div className="stat-value mono">0</div>
                <div className="stat-who dim">Nobody slapped wrong</div>
              </>
            )}
          </div>
        </section>

        <section className="standings">
          <h2 className="standings-title">Final standings</h2>
          <ol className="standings-list">
            {standings.map(({ seat, index }, place) => (
              <li key={seat.id} className={index === winnerIndex ? "is-winner" : ""}>
                <span className="standing-place mono">{place + 1}</span>
                <span className="dot" style={{ background: seatColor(index).bg }} />
                <span className="standing-name">{nameOf(seat)}</span>
                <span className="standing-note">{standingText(seat, index)}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="over-actions">
          {isHost ? (
            <>
              <button type="button" className="btn btn-primary btn-start" disabled={!enoughPlayers} onClick={() => socket.emit("playAgain")}>
                Play again
              </button>
              <button type="button" className="btn btn-lg" onClick={() => socket.emit("backToLobby")}>
                Back to lobby
              </button>
            </>
          ) : (
            <p className="waiting">Waiting for {host?.name ?? "the host"} to start the next game…</p>
          )}
          <button type="button" className="btn btn-ghost btn-lg" onClick={onLeave}>
            Leave
          </button>
        </div>
        {backIn !== null && (
          <p className="autostart center-self" role="status">
            Back to the lobby in <b>{backIn}s</b>. The next game starts on its own.
          </p>
        )}
        {isHost && backIn === null && (
          <p className="note center">
            {enoughPlayers
              ? "Play again keeps everyone seated with the same slap rules. Back to lobby lets people change seats and rules."
              : "You need 2 seated players to play again. Go back to the lobby to invite someone."}
          </p>
        )}
      </main>
    </div>
  );
}
