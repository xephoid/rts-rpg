// UI Store — selected unit/building, open panels, camera, alerts, dialog state.
import { create } from "zustand";
import type { Faction } from "@neither/shared";

export type SelectedEntity =
  | { kind: "unit"; id: string }
  | { kind: "building"; id: string }
  | null;

export type UIStore = {
  activeFaction: Faction;
  setActiveFaction: (faction: Faction) => void;

  selectedEntity: SelectedEntity;
  setSelectedEntity: (entity: SelectedEntity) => void;

  activePanel: "none" | "diplomacy" | "research" | "dialogue";
  setActivePanel: (panel: UIStore["activePanel"]) => void;

  /** Camera position in screen pixels — updated by renderer via onCameraChange. */
  cameraX: number;
  cameraY: number;
  zoom: number;
  setCameraPosition: (x: number, y: number, zoom: number) => void;

  /**
   * Set by minimap click to request a camera move.
   * App.tsx watches this, forwards to renderer.setCameraPosition, then clears it.
   */
  cameraTarget: { x: number; y: number } | null;
  setCameraTarget: (pos: { x: number; y: number } | null) => void;

  alerts: string[];
  pushAlert: (message: string) => void;
  clearAlerts: () => void;
};

export const useUIStore = create<UIStore>((set) => ({
  activeFaction: "wizards",
  setActiveFaction: (faction) => set({ activeFaction: faction }),

  selectedEntity: null,
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),

  activePanel: "none",
  setActivePanel: (panel) => set({ activePanel: panel }),

  cameraX: 0,
  cameraY: 0,
  zoom: 1.0,
  setCameraPosition: (x, y, zoom) => set({ cameraX: x, cameraY: y, zoom }),

  cameraTarget: null,
  setCameraTarget: (pos) => set({ cameraTarget: pos }),

  alerts: [],
  pushAlert: (message) =>
    set((state) => ({ alerts: [...state.alerts.slice(-49), message] })),
  clearAlerts: () => set({ alerts: [] }),
}));
