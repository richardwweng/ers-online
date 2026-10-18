import type { CSSProperties } from "react";
import type { Card as CardData } from "../types";
import "./Card.css";

const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
const SUIT_NAME = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" } as const;
const RANK_NAME: Record<string, string> = { A: "Ace", J: "Jack", Q: "Queen", K: "King" };

function cardLabel(card: CardData) {
  return `${RANK_NAME[card.rank] ?? card.rank} of ${SUIT_NAME[card.suit]}`;
}

type Props = { card: CardData; className?: string; style?: CSSProperties; from?: string };

// A face-up playing card
export default function Card({ card, className = "", style, from }: Props) {
  const red = card.suit === "H" || card.suit === "D";
  const suit = SUIT[card.suit];
  return (
    <div className={`card ${red ? "card-red" : ""} ${className}`} style={style} data-from={from} role="img" aria-label={cardLabel(card)}>
      <span className="card-corner">{card.rank}<br />{suit}</span>
      <span className="card-pip" aria-hidden="true">{suit}</span>
      <span className="card-corner card-corner-flip" aria-hidden="true">{card.rank}<br />{suit}</span>
    </div>
  );
}

// A face-down card, used to show each player's stack
export function CardBack({ small = false }: { small?: boolean }) {
  return <div className={`card-back ${small ? "card-back-sm" : ""}`} aria-hidden="true" />;
}