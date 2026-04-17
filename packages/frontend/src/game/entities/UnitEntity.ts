import type { Faction, Vec2 } from "@neither/shared";
import { Entity } from "./Entity.js";
import type { StatBlockInit } from "./StatBlock.js";

export type UnitState =
  | { kind: "idle" }
  | { kind: "moving"; targetPosition: Vec2; path: Vec2[] }
  | { kind: "attacking"; targetId: string }
  | { kind: "gathering"; depositId: string }
  | { kind: "constructing"; buildingId: string }
  | { kind: "converting"; targetId: string; ticksElapsed: number };

/** Unit types that can conceal themselves from standard vision. */
const CONCEALED_TYPES = new Set(["infiltrationPlatform", "illusionist"]);
/** Unit types that reveal concealed enemies within range. */
const DETECTOR_TYPES = new Set(["probePlatform", "enchantress"]);

export class UnitEntity extends Entity {
  state: UnitState = { kind: "idle" };
  carrying: { resource: "wood" | "water"; amount: number } | null = null;

  /** True while this unit is actively concealing itself. */
  concealed = false;

  /** True if this unit type can detect concealed enemies. */
  readonly isDetector: boolean;

  constructor(params: {
    id?: string | undefined;
    faction: Faction;
    typeKey: string;
    position: Vec2;
    stats: StatBlockInit;
  }) {
    super({ ...params, kind: "unit" });
    this.isDetector = DETECTOR_TYPES.has(params.typeKey);
    // Concealment-capable units start concealed by default
    if (CONCEALED_TYPES.has(params.typeKey)) this.concealed = true;
  }
}
