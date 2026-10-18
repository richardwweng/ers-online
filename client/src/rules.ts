import type { Settings } from "./types";

// Every slap rule, with a short example. Used by the lobby toggles and the table sidebar.
export const SLAP_RULES: { key: keyof Settings; label: string; example: string }[] = [
  { key: "doubles", label: "Doubles", example: "7, 7" },
  { key: "sandwich", label: "Sandwich", example: "7, K, 7" },
  { key: "topBottom", label: "Top and bottom", example: "top card matches first card played" },
  { key: "tens", label: "Tens", example: "two cards adding to 10, like 3, 7" },
  { key: "marriage", label: "Marriage", example: "K, Q or Q, K" },
];