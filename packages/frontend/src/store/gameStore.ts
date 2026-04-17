// Game State Mirror — read-only snapshot of simulation state.
// Updated by the game loop via pushGameState(). React components read from here.
// The simulation itself does NOT use this store directly.
import { create } from "zustand";

export type ResourcePool = {
  wood: number;
  water: number;
  mana: number;
};

export type GameStateMirror = {
  tick: number;
  resources: ResourcePool;
  // TODO: next step — add unit list, building list, diplomacy states, fog data
};

export type GameStore = {
  gameState: GameStateMirror | null;
  pushGameState: (state: GameStateMirror) => void;
};

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  pushGameState: (state) => set({ gameState: state }),
}));
