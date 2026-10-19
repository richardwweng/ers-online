import type { Settings } from "./types";

// Every slap rule, with a short example. Used by the lobby toggles and the table sidebar.
export const SLAP_RULES: { key: keyof Settings; label: string; example: string }[] = [
  { key: "doubles", label: "Doubles", example: "7, 7" },
  { key: "sandwich", label: "Sandwich", example: "7, K, 7" },
  { key: "topBottom", label: "Top and bottom", example: "top card matches first card played" },
  { key: "tens", label: "Tens", example: "two cards adding to 10, like 3, 7" },
  { key: "marriage", label: "Marriage", example: "K, Q or Q, K" },
  { key: "sixSeven", label: "6 7", example: "a 6, then a 7 right after" },
  { key: "ladders", label: "Ladders", example: "3 in a row, up or down: 5, 6, 7 or K, A, 2" },
];