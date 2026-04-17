import type { Faction, Vec2 } from "@neither/shared";

// All game events. Sync events are dispatched and resolved in the same tick.
// Post-tick events are queued and processed after the tick completes.

export type GameEventMap = {
  // Combat
  UnitAttacked: { attackerId: string; targetId: string; damage: number; remainingHp: number };
  UnitDied: { unitId: string; killedById: string; position: Vec2 };

  // Construction / destruction
  BuildingConstructed: { buildingId: string; typeKey: string; faction: Faction; position: Vec2 };
  BuildingDestroyed: { buildingId: string; destroyedById: string };

  // Resources
  ResourceCollected: { collectorId: string; resourceType: "wood" | "water"; amount: number };
  ResourceLow: { faction: Faction; resourceType: "wood" | "water" | "mana"; current: number };

  // Progression
  LevelUp: { entityId: string; newLevel: number };
  XpGained: { entityId: string; amount: number; source: string };

  // Diplomacy / conversion
  DiplomacyChanged: { fromFaction: string; toFaction: string; delta: number; newScore: number };
  ConversionAttempt: { converterId: string; targetId: string; success: boolean };

  // Narrative
  NarrativeTrigger: { type: "dialogue" | "quest" | "namedCharacter"; context: string };

  // Victory
  VictoryAlert: { faction: Faction; condition: "military" | "cultural" | "technological"; pct: number };
  VictoryAchieved: { faction: Faction; condition: "military" | "cultural" | "technological" };
};

export type GameEventName = keyof GameEventMap;
export type GameEventPayload<T extends GameEventName> = GameEventMap[T];
