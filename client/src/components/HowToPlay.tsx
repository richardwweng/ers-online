import { useEffect, useRef } from "react";
import { SLAP_RULES } from "../rules";
import { XIcon } from "./ui";
import type { Settings } from "../types";
import "./HowToPlay.css";

type Props = {
  open: boolean;
  onClose: () => void;
  settings?: Settings; // from the lobby or a game: marks which slap rules are on
};

// A row of small cards, written like "7♠ K♦ 7♥". "…" shows a gap of other cards.
function Cards({ text }: { text: string }) {
  return (
    <span className="mc-row" aria-label={text.replace("…", "then other cards, then")}>
      {text.split(" ").map((c, i) =>
        c === "…" ? (
          <span key={i} className="mc-gap" aria-hidden="true">…</span>
        ) : (
          <span key={i} className={`mc ${/[♥♦]/.test(c) ? "mc-red" : ""}`} aria-hidden="true">
            {c.slice(0, -1)}
            <span className="mc-suit">{c.slice(-1)}</span>
          </span>
        )
      )}
    </span>
  );
}

// What each slap rule means, in plain words, with an example
const RULE_INFO: Record<keyof Settings, { what: string; cards: string }> = {
  doubles: { what: "The top two cards are the same rank.", cards: "7♠ 7♥" },
  sandwich: { what: "The top card matches the card two below it.", cards: "7♠ K♦ 7♥" },
  topBottom: { what: "The top card matches the first card played on the pile.", cards: "4♣ … 9♥ 4♦" },
  tens: { what: "The top two cards add up to 10. Aces count as 1.", cards: "3♠ 7♥" },
  marriage: { what: "A king and a queen back to back, either order.", cards: "K♠ Q♥" },
  sixSeven: { what: "A 6, then a 7 right after it.", cards: "6♣ 7♦" },
  ladders: { what: "Three cards in a row, going up or down. It loops around, so K, A, 2 and Q, K, A count too.", cards: "5♠ 6♥ 7♣" },
};

export default function HowToPlay({ open, onClose, settings }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Open and close the browser's built-in pop-up (it handles Esc and keeps focus inside)
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.scrollTop = 0;
      innerRef.current?.focus(); // focus the text, not the close button, so Space and arrow keys scroll it
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="htp"
      aria-labelledby="htp-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()} // clicking the dark area outside closes it
    >
      <div className="htp-inner" ref={innerRef} tabIndex={-1}>
        <header className="htp-head">
          <div>
            <p className="htp-eyebrow">ERS · Egyptian Rat Screw</p>
            <h2 id="htp-title">How to play</h2>
          </div>
          <button type="button" className="htp-close" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </header>

        <section>
          <h3>The goal</h3>
          <p>Win all 52 cards. The deck is dealt out evenly and nobody looks at their own cards. The last player with cards left wins.</p>
        </section>

        <section>
          <h3>Taking turns</h3>
          <p>
            On your turn, press <b>Play card</b> to flip your top card onto the middle pile. You can only play on your turn.
          </p>
          <p>
            <b>Face cards start a challenge.</b> The next player gets a set number of tries to play a face card of their own:
          </p>
          <div className="htp-faces">
            <span><Cards text="J♠" /> 1 try</span>
            <span><Cards text="Q♥" /> 2 tries</span>
            <span><Cards text="K♣" /> 3 tries</span>
            <span><Cards text="A♦" /> 4 tries</span>
          </div>
          <p>If they play one, the challenge moves on and the next player has to answer their face card. If they run out of tries, whoever played the last face card wins the pile after a one-second pause. Anyone can still slap during that pause.</p>
        </section>

        <section>
          <h3>Slapping</h3>
          <p>
            When the pile makes a pattern, slap it with the <b>Slap</b> button or the <b>Space</b> bar. The fastest correct slap wins the whole pile, whoever's turn it is.
            {!settings && " The host picks which patterns count before each game. Doubles and sandwiches are on by default."}
          </p>
          <ul className="htp-rules">
            {SLAP_RULES.map((rule) => {
              const info = RULE_INFO[rule.key];
              const on = settings ? settings[rule.key] : null;
              return (
                <li key={rule.key} className={on === false ? "is-off" : ""}>
                  <div className="htp-rule-top">
                    <span className="htp-rule-name">{rule.label}</span>
                    {on !== null && <span className={`htp-tag ${on ? "on" : "off"}`}>{on ? "On this game" : "Off this game"}</span>}
                  </div>
                  <Cards text={info.cards} />
                  <span className="htp-rule-what">{info.what}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3>Keep track</h3>
          <ul className="htp-list">
            <li>Only the top 3 cards of the pile are shown. For <b>top and bottom</b>, you have to remember the first card yourself.</li>
            <li>Cards you win go to the bottom of your stack in the order they were played, and your stack is never shuffled. Remember what you won, and you'll know what's coming.</li>
          </ul>
        </section>

        <section>
          <h3>Wrong slaps</h3>
          <ul className="htp-list">
            <li>Slapping when there's no pattern <b>burns</b> your top card. Everyone sees it, then it goes face down under the pile, and whoever wins the pile gets it.</li>
            <li>Slapping an empty pile does nothing.</li>
            <li>A wrong slap when you have no cards left puts you out for good.</li>
          </ul>
        </section>

        <section>
          <h3>Out of cards?</h3>
          <p>You're not out yet. You can still slap your way back in, but only until someone wins the pile you ran out on. After that, you're out.</p>
        </section>

        <section className="htp-timing">
          <h3>Who slapped first? Reaction time</h3>
          <p>
            Every slap shows a time like <span className="mono htp-ms">312ms</span>. That's your <b>reaction time</b>: how long you took to slap after the card
            appeared on <i>your</i> screen. The fastest correct reaction wins the pile.
          </p>
          <p>
            Why not just take whichever slap reaches the server first? Because a player on slow Wi-Fi or phone data would lose twice: the card reaches their
            screen later, <i>and</i> their slap takes longer to travel back. Timing each slap from the moment you see the card takes the internet out of it.
          </p>
          <div className="htp-example">
            <div><b>Ana</b> on fast Wi-Fi reacts in <span className="mono">300ms</span>. Her slap reaches the server after <span className="mono">340ms</span>.</div>
            <div><b>Ben</b> on phone data reacts in <span className="mono">280ms</span>. His slap reaches the server after <span className="mono">480ms</span>.</div>
            <div className="htp-verdict">Ben wins. He was faster, even though his slap arrived later.</div>
          </div>
          <p className="dim small">
            The server double-checks every time against when it sent the card and each player's connection speed, so a faked time doesn't help.
          </p>
        </section>

        <section>
          <h3>Playing on a phone</h3>
          <ul className="htp-list">
            <li><b>Tap anywhere on the table to slap.</b> It counts the moment your finger lands. The Slap button works too.</li>
            <li>
              <b>Play full-screen:</b> add ERS to your home screen. On iPhone, tap Share, then <i>Add to Home Screen</i>. On Android, open the
              browser menu and tap <i>Add to Home screen</i> (or <i>Install app</i>). You get more room for the table, with no browser bars.
            </li>
          </ul>
        </section>

        <section>
          <h3>Emotes</h3>
          <p>
            Tap the <b>😀</b> button to react with 😂 🔥 😤 💀 👏 or 🤡. Everyone at the table sees it pop up by your seat. On a computer, the
            number keys <b>1–6</b> send them instantly.
          </p>
        </section>

        <section>
          <h3>Leaving</h3>
          <p>Forfeiting, or leaving for more than 30 seconds, puts all your cards under the pile. Refreshing or briefly losing connection keeps your seat.</p>
        </section>

        <button type="button" className="btn btn-primary htp-done" onClick={onClose}>
          Got it
        </button>
      </div>
    </dialog>
  );
}
