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

  /** Cancel production order waiting to be forwarded to the engine. */
  pendingCancelProduction: { buildingId: string } | null;
  cancelProduction: (buildingId: string) => void;
  clearPendingCancelProduction: () => void;

  /** Active ghost placement mode — set when a build button is clicked. */
  buildMode: { unitId: string; buildingTypeKey: string; footprintTiles: number; faction: "wizards" | "robots" } | null;
  setBuildMode: (mode: UIStore["buildMode"]) => void;

  /** True when CommandsPanel is showing the build sub-panel instead of unit commands. */
  buildMenuOpen: boolean;
  setBuildMenuOpen: (open: boolean) => void;

  /** Build order waiting to be forwarded to the engine. */
  pendingBuildOrder: { unitId: string; buildingTypeKey: string; tilePos: { x: number; y: number } } | null;
  issueBuildOrder: (unitId: string, buildingTypeKey: string, tilePos: { x: number; y: number }) => void;
  clearPendingBuildOrder: () => void;

  /** Demolish order waiting to be forwarded to the engine. */
  pendingDemolish: { buildingId: string } | null;
  issueDemolish: (buildingId: string) => void;
  clearPendingDemolish: () => void;

  /** Resume construction order waiting to be forwarded to the engine. */
  pendingResumeConstruction: { unitId: string; buildingId: string } | null;
  issueResumeConstruction: (unitId: string, buildingId: string) => void;
  clearPendingResumeConstruction: () => void;

  /** Research order waiting to be forwarded to the engine. */
  pendingResearch: { buildingId: string; researchKey: string } | null;
  issueResearch: (buildingId: string, researchKey: string) => void;
  clearPendingResearch: () => void;

  /** Cancel research order waiting to be forwarded to the engine. */
  pendingCancelResearch: { buildingId: string } | null;
  issueCancelResearch: (buildingId: string) => void;
  clearPendingCancelResearch: () => void;

  /** Attach order: Core moves to and attaches to a platform. */
  pendingAttach: { coreId: string; platformId: string } | null;
  issueAttach: (coreId: string, platformId: string) => void;
  clearPendingAttach: () => void;

  /** Detach order: Platform ejects its Core passenger. */
  pendingDetach: { platformId: string } | null;
  issueDetach: (platformId: string) => void;
  clearPendingDetach: () => void;

  /** Leave garrison order: garrisoned wizard unit exits Wizard Tower. */
  pendingLeaveGarrison: string | null;
  issueLeaveGarrison: (unitId: string) => void;
  clearPendingLeaveGarrison: () => void;

  /** Eject-occupants order: a building ejects all garrisoned units / Cores. Used for
   *  wizardTower (1 occupant) and immobileCombatPlatform (up to 3 occupants). */
  pendingEjectOccupants: string | null;
  issueEjectOccupants: (buildingId: string) => void;
  clearPendingEjectOccupants: () => void;

  /** Mana Shield toggle order for a wizard unit. */
  pendingManaShieldToggle: string | null;
  issueManaShieldToggle: (unitId: string) => void;
  clearPendingManaShieldToggle: () => void;

  /** Illusionist invisibility toggle. */
  pendingInvisibilityToggle: string | null;
  issueInvisibilityToggle: (unitId: string) => void;
  clearPendingInvisibilityToggle: () => void;

  /** Infiltration Platform disguise — picker UI shows enemy roster; on pick we issue. */
  disguisePickerUnitId: string | null;
  setDisguisePickerUnitId: (unitId: string | null) => void;

  pendingDisguise: { unitId: string; targetTypeKey: string } | null;
  issueDisguise: (unitId: string, targetTypeKey: string) => void;
  clearPendingDisguise: () => void;

  pendingClearDisguise: string | null;
  issueClearDisguise: (unitId: string) => void;
  clearPendingClearDisguise: () => void;

  /** Hide-in-building: civilian/leader enters a friendly Cottage or Recharge Station. */
  pendingHideOrder: { unitId: string; buildingId: string } | null;
  issueHideOrder: (unitId: string, buildingId: string) => void;
  clearPendingHideOrder: () => void;

  pendingLeaveHiding: string | null;
  issueLeaveHiding: (unitId: string) => void;
  clearPendingLeaveHiding: () => void;

  /** Spy infiltrates an enemy hiding-capable building. */
  pendingInfiltrate: { spyId: string; buildingId: string } | null;
  issueInfiltrate: (spyId: string, buildingId: string) => void;
  clearPendingInfiltrate: () => void;

  pendingInfiltrateAttack: { platformId: string; occupantId: string } | null;
  issueInfiltrateAttack: (platformId: string, occupantId: string) => void;
  clearPendingInfiltrateAttack: () => void;

  /** Diplomacy (Phase 14): outgoing proposal waiting to reach the engine. Single
   *  slot is fine — proposals are discrete and the UI sends them one at a time. */
  pendingDiplomaticProposal: {
    sender: Faction;
    target: Faction;
    kind: "openBorders" | "nonCombat" | "resourceRequest" | "unitRequest";
    resource?: { kind: "wood" | "water" | "mana"; amount: number };
    unitId?: string;
  } | null;
  issueDiplomaticProposal: (p: NonNullable<UIStore["pendingDiplomaticProposal"]>) => void;
  clearPendingDiplomaticProposal: () => void;

  /** Diplomacy (Phase 14): response to an incoming proposal. */
  pendingDiplomaticResponse: { proposalId: string; accept: boolean } | null;
  issueDiplomaticResponse: (proposalId: string, accept: boolean) => void;
  clearPendingDiplomaticResponse: () => void;

  /** Active spell targeting mode — set when a spell button is clicked. Cleared on cast or Escape. */
  pendingSpell: { kind: "iceBlast" | "fieryExplosion" | "enlarge" | "reduce"; casterId: string } | null;
  setPendingSpell: (spell: UIStore["pendingSpell"]) => void;

  pendingIceBlast: { casterId: string; targetId: string } | null;
  issueIceBlast: (casterId: string, targetId: string) => void;
  clearPendingIceBlast: () => void;

  pendingFieryExplosion: { casterId: string; targetPos: { x: number; y: number } } | null;
  issueFieryExplosion: (casterId: string, targetPos: { x: number; y: number }) => void;
  clearPendingFieryExplosion: () => void;

  pendingEnlarge: { casterId: string; targetId: string } | null;
  issueEnlarge: (casterId: string, targetId: string) => void;
  clearPendingEnlarge: () => void;

  pendingReduce: { casterId: string; targetId: string } | null;
  issueReduce: (casterId: string, targetId: string) => void;
  clearPendingReduce: () => void;

  statsOpen: boolean;
  setStatsOpen: (open: boolean) => void;
};

export const useUIStore = create<UIStore>((set) => ({
  activeFaction: "robots",
  setActiveFaction: (faction) => set({ activeFaction: faction }),

  selection: { mode: "none" },
  setSelection: (s) => set({ selection: s, buildMenuOpen: false, pendingSpell: null }),

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

  pendingCancelProduction: null,
  cancelProduction: (buildingId) => set({ pendingCancelProduction: { buildingId } }),
  clearPendingCancelProduction: () => set({ pendingCancelProduction: null }),

  buildMode: null,
  setBuildMode: (mode) => set({ buildMode: mode }),

  buildMenuOpen: false,
  setBuildMenuOpen: (open) => set({ buildMenuOpen: open }),

  pendingBuildOrder: null,
  issueBuildOrder: (unitId, buildingTypeKey, tilePos) =>
    set({ pendingBuildOrder: { unitId, buildingTypeKey, tilePos } }),
  clearPendingBuildOrder: () => set({ pendingBuildOrder: null }),

  pendingDemolish: null,
  issueDemolish: (buildingId) => set({ pendingDemolish: { buildingId } }),
  clearPendingDemolish: () => set({ pendingDemolish: null }),

  pendingResumeConstruction: null,
  issueResumeConstruction: (unitId, buildingId) =>
    set({ pendingResumeConstruction: { unitId, buildingId } }),
  clearPendingResumeConstruction: () => set({ pendingResumeConstruction: null }),

  pendingResearch: null,
  issueResearch: (buildingId, researchKey) => set({ pendingResearch: { buildingId, researchKey } }),
  clearPendingResearch: () => set({ pendingResearch: null }),

  pendingCancelResearch: null,
  issueCancelResearch: (buildingId) => set({ pendingCancelResearch: { buildingId } }),
  clearPendingCancelResearch: () => set({ pendingCancelResearch: null }),

  pendingAttach: null,
  issueAttach: (coreId, platformId) => set({ pendingAttach: { coreId, platformId } }),
  clearPendingAttach: () => set({ pendingAttach: null }),

  pendingDetach: null,
  issueDetach: (platformId) => set({ pendingDetach: { platformId } }),
  clearPendingDetach: () => set({ pendingDetach: null }),

  pendingLeaveGarrison: null,
  issueLeaveGarrison: (unitId) => set({ pendingLeaveGarrison: unitId }),
  clearPendingLeaveGarrison: () => set({ pendingLeaveGarrison: null }),

  pendingEjectOccupants: null,
  issueEjectOccupants: (buildingId) => set({ pendingEjectOccupants: buildingId }),
  clearPendingEjectOccupants: () => set({ pendingEjectOccupants: null }),

  pendingManaShieldToggle: null,
  issueManaShieldToggle: (unitId) => set({ pendingManaShieldToggle: unitId }),
  clearPendingManaShieldToggle: () => set({ pendingManaShieldToggle: null }),

  pendingInvisibilityToggle: null,
  issueInvisibilityToggle: (unitId) => set({ pendingInvisibilityToggle: unitId }),
  clearPendingInvisibilityToggle: () => set({ pendingInvisibilityToggle: null }),

  disguisePickerUnitId: null,
  setDisguisePickerUnitId: (unitId) => set({ disguisePickerUnitId: unitId }),

  pendingDisguise: null,
  issueDisguise: (unitId, targetTypeKey) =>
    set({ pendingDisguise: { unitId, targetTypeKey }, disguisePickerUnitId: null }),
  clearPendingDisguise: () => set({ pendingDisguise: null }),

  pendingClearDisguise: null,
  issueClearDisguise: (unitId) => set({ pendingClearDisguise: unitId }),
  clearPendingClearDisguise: () => set({ pendingClearDisguise: null }),

  pendingHideOrder: null,
  issueHideOrder: (unitId, buildingId) => set({ pendingHideOrder: { unitId, buildingId } }),
  clearPendingHideOrder: () => set({ pendingHideOrder: null }),

  pendingLeaveHiding: null,
  issueLeaveHiding: (unitId) => set({ pendingLeaveHiding: unitId }),
  clearPendingLeaveHiding: () => set({ pendingLeaveHiding: null }),

  pendingInfiltrate: null,
  issueInfiltrate: (spyId, buildingId) => set({ pendingInfiltrate: { spyId, buildingId } }),
  clearPendingInfiltrate: () => set({ pendingInfiltrate: null }),

  pendingInfiltrateAttack: null,
  issueInfiltrateAttack: (platformId, occupantId) =>
    set({ pendingInfiltrateAttack: { platformId, occupantId } }),
  clearPendingInfiltrateAttack: () => set({ pendingInfiltrateAttack: null }),

  pendingDiplomaticProposal: null,
  issueDiplomaticProposal: (p) => set({ pendingDiplomaticProposal: p }),
  clearPendingDiplomaticProposal: () => set({ pendingDiplomaticProposal: null }),

  pendingDiplomaticResponse: null,
  issueDiplomaticResponse: (proposalId, accept) =>
    set({ pendingDiplomaticResponse: { proposalId, accept } }),
  clearPendingDiplomaticResponse: () => set({ pendingDiplomaticResponse: null }),

  pendingSpell: null,
  setPendingSpell: (spell) => set({ pendingSpell: spell }),

  pendingIceBlast: null,
  issueIceBlast: (casterId, targetId) => set({ pendingIceBlast: { casterId, targetId }, pendingSpell: null }),
  clearPendingIceBlast: () => set({ pendingIceBlast: null }),

  pendingFieryExplosion: null,
  issueFieryExplosion: (casterId, targetPos) => set({ pendingFieryExplosion: { casterId, targetPos }, pendingSpell: null }),
  clearPendingFieryExplosion: () => set({ pendingFieryExplosion: null }),

  pendingEnlarge: null,
  issueEnlarge: (casterId, targetId) => set({ pendingEnlarge: { casterId, targetId }, pendingSpell: null }),
  clearPendingEnlarge: () => set({ pendingEnlarge: null }),

  pendingReduce: null,
  issueReduce: (casterId, targetId) => set({ pendingReduce: { casterId, targetId }, pendingSpell: null }),
  clearPendingReduce: () => set({ pendingReduce: null }),

  statsOpen: false,
  setStatsOpen: (open) => set({ statsOpen: open }),
}));
