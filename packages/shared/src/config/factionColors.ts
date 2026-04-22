// Per-faction-slot display colors used by the renderer (territory lines, minimap
// dots, selection rings, sprite-fallback tint). One entry per `Faction` slot.
//
// Slots 1-2 keep their historical purple/gold (wizards/robots) so 1-v-1 matches
// don't change visually. Slots 3-6 are distinct hues — Initial guess; expect
// tuning after first multi-faction playtest.

import type { Faction } from "../types/index.js";

export const factionColors: Record<Faction, number> = {
  wizards: 0xa855f7, // Confirmed: purple — existing wizard color
  robots:  0xeab308, // Confirmed: gold — existing robot color
  f3:      0x22c55e, // Initial guess: green
  f4:      0xef4444, // Initial guess: red
  f5:      0x3b82f6, // Initial guess: blue
  f6:      0xec4899, // Initial guess: pink
};
