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

  cameraX: number;
  cameraY: number;
  setCameraPosition: (x: number, y: number) => void;

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
  setCameraPosition: (x, y) => set({ cameraX: x, cameraY: y }),

  alerts: [],
  pushAlert: (message) =>
    set((state) => ({ alerts: [...state.alerts.slice(-49), message] })),
  clearAlerts: () => set({ alerts: [] }),
}));
