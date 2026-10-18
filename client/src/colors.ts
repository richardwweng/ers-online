export type Color = { bg: string; fg: string };

// One color per seat, used everywhere a player appears (lobby, table, game over)
export const COLORS: Color[] = [
  { bg: "#6E9BFF", fg: "#0F1C3A" },
  { bg: "#F0837A", fg: "#3A1512" },
  { bg: "#A58BFF", fg: "#1A1530" },
  { bg: "#4CC4B0", fg: "#0D2A25" },
];

export function seatColor(index: number): Color {
  return COLORS[Math.max(index, 0) % COLORS.length];
}
