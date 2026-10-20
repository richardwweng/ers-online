import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { socket, playerToken, useConnected } from "../socket";
import Card from "../components/Card";
import HowToPlay from "../components/HowToPlay";
import OpenTables from "../components/OpenTables";
import { BoltIcon, Brand, EyeIcon } from "../components/ui";
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
  const [showRules, setShowRules] = useState(false);
  const [finding, setFinding] = useState(false);

  // A secret: tap the logo 5 times quickly ♥
  const [showNote, setShowNote] = useState(false);
  const logoTaps = useRef<number[]>([]);
  function tapLogo() {
    const now = Date.now();
    logoTaps.current = [...logoTaps.current.filter((t) => now - t < 2500), now];
    if (logoTaps.current.length >= 5) {
      logoTaps.current = [];
      setShowNote(true);
    }
  }
  useEffect(() => {
    if (!showNote) return;
    const t = setTimeout(() => setShowNote(false), 4500);
    return () => clearTimeout(t);
  }, [showNote]);

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

  // Quick play: the server finds the fullest open public table, or opens a new one
  function quickPlay() {
    if (!checkName() || finding) return;
    setFinding(true);
    socket.emit("quickPlay", playerToken, (roomId: string) => {
      navigate(`/game/${roomId}`, { state: { intent: "play" } });
    });
  }

  // Joining (or watching) a table from the Open tables list
  function joinTable(roomId: string, watch: boolean) {
    if (!checkName()) return;
    navigate(`/game/${roomId}`, { state: { intent: watch ? "watch" : "play" } });
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
        <div className="secret-logo" onClick={tapLogo}>
          <Brand />
          {showNote && (
            <span className="secret-note" role="status">
              made for my amazing gf Narae ♥
            </span>
          )}
        </div>
        <div className="pg-header-right">
          <button type="button" className="link-quiet link-btn" onClick={() => setShowRules(true)}>
            How to play
          </button>
          <span className="status">
            <span className={`status-dot ${connected ? "" : "waking"}`} />
            {connected ? "Server ready" : "Waking up the server…"}
          </span>
        </div>
      </header>

      <main className="home-main">
        <section className="home-hero">
          <div>
            <p className="home-eyebrow">ERS · Egyptian Rat Screw</p>
            <h1 className="home-title">
              Keep track.
              <br />
              <span className="accent">Slap fast.</span>
            </h1>
            <p className="home-lead">
              The fast card-slapping game, online. Make a table and send the link to friends, or jump into an open table with anyone.
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

            <button type="button" className="btn btn-lg btn-block btn-quick" onClick={quickPlay} disabled={!connected || finding}>
              <BoltIcon />
              {finding ? "Finding a table…" : "Quick play"}
            </button>
            <p className="note center">Join an open table with anyone online.</p>

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

      <OpenTables connected={connected} onJoin={joinTable} />

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

      <HowToPlay open={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
}
