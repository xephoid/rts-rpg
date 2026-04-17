// Game State Mirror — read-only snapshot of simulation state.
// Updated by the game loop via pushGameState(). React components read from here.
// The simulation itself does NOT use this store directly.
import { create } from "zustand";
import type { GameStateSnapshot } from "@neither/shared";

export type GameStore = {
  gameState: GameStateSnapshot | null;
  pushGameState: (state: GameStateSnapshot) => void;
};

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  pushGameState: (state) => set({ gameState: state }),
}));
