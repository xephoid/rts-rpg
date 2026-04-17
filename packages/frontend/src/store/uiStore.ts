// UI Store — selected unit/building, open panels, camera, alerts, dialog state.
import { create } from "zustand";
import type { Faction } from "@neither/shared";

export type Selection =
  | { mode: "none" }
  | { mode: "single"; id: string; kind: "unit" | "building" }
  | { mode: "multi"; ids: string[] }; // units only

export type UIStore = {
  activeFaction: Faction;
  setActiveFaction: (faction: Faction) => void;

  selection: Selection;
  setSelection: (s: Selection) => void;

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

  /** Entity IDs awaiting a stop command — consumed by App.tsx then cleared. */
  pendingStop: string[] | null;
  issueStop: (ids: string[]) => void;
  clearPendingStop: () => void;

  /**
   * Entity IDs in patrol mode — next right-click sets the patrol destination.
   * App.tsx intercepts the move order and issues patrol orders instead, then clears this.
   */
  pendingPatrolIds: string[] | null;
  setPendingPatrolIds: (ids: string[] | null) => void;

  /** Production order waiting to be forwarded to the engine. */
  pendingProduction: { buildingId: string; unitTypeKey: string } | null;
  issueProduction: (buildingId: string, unitTypeKey: string) => void;
  clearPendingProduction: () => void;
};

export const useUIStore = create<UIStore>((set) => ({
  activeFaction: "wizards",
  setActiveFaction: (faction) => set({ activeFaction: faction }),

  selection: { mode: "none" },
  setSelection: (s) => set({ selection: s }),

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

  pendingStop: null,
  issueStop: (ids) => set({ pendingStop: ids }),
  clearPendingStop: () => set({ pendingStop: null }),

  pendingPatrolIds: null,
  setPendingPatrolIds: (ids) => set({ pendingPatrolIds: ids }),

  pendingProduction: null,
  issueProduction: (buildingId, unitTypeKey) => set({ pendingProduction: { buildingId, unitTypeKey } }),
  clearPendingProduction: () => set({ pendingProduction: null }),
}));
