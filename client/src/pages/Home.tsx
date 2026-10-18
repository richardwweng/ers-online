import { useState } from "react";
import { useNavigate } from "react-router";
import { socket, useConnected } from "../socket";
import Card from "../components/Card";
import { Brand, EyeIcon } from "../components/ui";
import type { Card as CardData, RoomPeek } from "../types";
import "./Pages.css";

// The three cards fanned out on the right (just decoration)
const FAN: CardData[] = [
  { id: 901, rank: "K", suit: "S" },
  { id: 902, rank: "J", suit: "H" },
  { id: 903, rank: "K", suit: "C" },
];

export default function Home() {
  const navigate = useNavigate();
  const connected = useConnected();
  const [name, setName] = useState(() => localStorage.getItem("ers-name") ?? "");
  const [code, setCode] = useState("");
  const [nameError, setNameError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [creating, setCreating] = useState(false);

  // Make sure there's a name, and remember it for next time
  function checkName(): boolean {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Enter your name first");
      return false;
    }
    localStorage.setItem("ers-name", trimmed);
    return true;
  }

  function createGame() {
    if (!checkName() || creating) return;
    setCreating(true);
    // Ask the server for a new room, then go straight into it as a player
    socket.emit("createRoom", (roomId: string) => {
      navigate(`/game/${roomId}`, { state: { intent: "play" } });
    });
  }

  function goToCode(intent: "play" | "watch") {
    if (!checkName()) return;
    if (code.length !== 6) {
      setCodeError("Game codes are 6 letters and numbers");
      return;
    }
    // Check the game exists before leaving this page
    socket.emit("peekRoom", code, (info: RoomPeek | null) => {
      if (!info) {
        setCodeError(`No game with the code ${code}`);
        return;
      }
      navigate(`/game/${code}`, { state: { intent } });
    });
  }

  return (
    <div className="pg pg-felt">
      <header className="pg-header">
        <Brand />
        <div className="pg-header-right">
          <a className="link-quiet" href="#how">How to play</a>
          <span className="status">
            <span className={`status-dot ${connected ? "" : "waking"}`} />
            {connected ? "Server ready" : "Waking up the server…"}
          </span>
        </div>
      </header>

      <main className="home-main">
        <section className="home-hero">
          <div>
            <h1 className="home-title">
              Slap first.
              <br />
              <span className="accent">Remember everything.</span>
            </h1>
            <p className="home-lead">
              Egyptian Ratscrew with your friends, right in the browser. Make a table, send the link, and play.
            </p>
          </div>

          <div className="form-card home-form">
            <label htmlFor="home-name" className="field-label">Your name</label>
            <input
              id="home-name"
              className="input"
              value={name}
              maxLength={16}
              autoComplete="nickname"
              placeholder="What should we call you?"
              onChange={(e) => {
                setName(e.target.value);
                setNameError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && createGame()}
            />
            {nameError && <p className="field-error" role="alert">{nameError}</p>}

            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              onClick={createGame}
              disabled={!connected || creating}
            >
              {!connected ? "Waking up the server…" : creating ? "Creating…" : "Create a game"}
            </button>
            {!connected && (
              <p className="note">This can take up to a minute if nobody has played in a while.</p>
            )}

            <div className="divider-text">or join a friend</div>

            <label htmlFor="home-code" className="sr-only">Game code</label>
            <div className="code-row">
              <input
                id="home-code"
                className="input input-code"
                placeholder="GAME CODE"
                value={code}
                maxLength={6}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                  setCodeError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && goToCode("play")}
              />
              <button type="button" className="btn" onClick={() => goToCode("play")} disabled={!connected}>
                Join
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => goToCode("watch")} disabled={!connected}>
                <EyeIcon size={17} />
                Watch
              </button>
            </div>
            {codeError && <p className="field-error" role="alert">{codeError}</p>}
          </div>
        </section>

        <div className="home-art" aria-hidden="true">
          <div className="fan">
            {FAN.map((card) => (
              <Card key={card.id} card={card} />
            ))}
          </div>
        </div>
      </main>

      <section id="how" className="how" aria-label="How to play">
        <div className="how-step">
          <div className="how-num">01</div>
          <h2>Play in turn</h2>
          <p>Flip your top card onto the pile. Face cards make the next player answer: J gives 1 try, Q 2, K 3, A 4.</p>
        </div>
        <div className="how-step">
          <div className="how-num">02</div>
          <h2>Slap the patterns</h2>
          <p>Doubles, sandwiches and more. The fastest correct slap takes the pile. A wrong slap burns a card.</p>
        </div>
        <div className="how-step">
          <div className="how-num">03</div>
          <h2>Take every card</h2>
          <p>Run out and you can still slap back in, until someone wins that pile. Last player with cards wins.</p>
        </div>
      </section>
    </div>
  );
}
