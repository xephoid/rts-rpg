import type { Faction, Vec2 } from "@neither/shared";
import { Entity } from "./Entity.js";
import type { StatBlockInit } from "./StatBlock.js";

export type UnitState =
  | { kind: "idle" }
  | { kind: "moving"; targetPosition: Vec2; path: Vec2[]; yieldTicks: number }
  | { kind: "patrolling"; pointA: Vec2; pointB: Vec2; path: Vec2[]; heading: "toB" | "toA"; yieldTicks: number }
  | { kind: "gatherMove"; depositId: string; path: Vec2[]; yieldTicks: number }
  | { kind: "dropoffMove"; resource: "wood" | "water"; depositId: string; dropoffId: string; path: Vec2[]; yieldTicks: number }
  | { kind: "attacking"; targetId: string; path: Vec2[]; yieldTicks: number }
  | { kind: "gathering"; depositId: string }
  | { kind: "buildMove"; buildingId: string; path: Vec2[]; yieldTicks: number }
  | { kind: "constructing"; buildingId: string }
  | { kind: "converting"; targetId: string; ticksElapsed: number }
  | { kind: "attachMove"; platformId: string; path: Vec2[]; yieldTicks: number }
  | { kind: "platformShell" };

/** Unit types that can conceal themselves from standard vision. */
const CONCEALED_TYPES = new Set(["infiltrationPlatform", "illusionist"]);
/** Unit types that reveal concealed enemies within range. */
const DETECTOR_TYPES = new Set(["probePlatform", "enchantress"]);

export class UnitEntity extends Entity {
  state: UnitState = { kind: "idle" };
  carrying: { resource: "wood" | "water"; amount: number } | null = null;
  attackCooldownTicks: number = 0;
  materialType: "wood" | "metal" | null = null;

  /** Set on Core when it is a passenger inside a platform. */
  attachedPlatformId: string | null = null;
  /** Set on Core for display/reference — the typeKey of the platform it's inside. */
  attachedPlatformTypeKey: string | null = null;
  /** Set on a platform entity when a Core is riding inside it. */
  attachedCoreId: string | null = null;

  /** True while this unit is actively concealing itself. */
  concealed = false;

  /** True while this wizard unit has Mana Shield active. */
  manaShielded = false;

  /** True if this unit type can detect concealed enemies. */
  readonly isDetector: boolean;

  constructor(params: {
    id?: string | undefined;
    faction: Faction;
    typeKey: string;
    position: Vec2;
    stats: StatBlockInit;
    isNamed?: boolean;
    name?: string | null;
  }) {
    super({ ...params, kind: "unit" });
    this.isDetector = DETECTOR_TYPES.has(params.typeKey);
    // Concealment-capable units start concealed by default
    if (CONCEALED_TYPES.has(params.typeKey)) this.concealed = true;
  }

  override toSnapshot() {
    return {
      ...super.toSnapshot(),
      carrying: this.carrying,
      attachedPlatformTypeKey: this.attachedPlatformTypeKey,
      attachedCoreId: this.attachedCoreId,
      materialType: this.materialType,
      isShell: this.state.kind === "platformShell",
      manaShielded: this.manaShielded || undefined,
    };
  }
}
