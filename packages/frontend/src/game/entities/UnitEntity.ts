import type { Faction, Vec2 } from "@neither/shared";
import { CONCEALED_TYPES, DETECTOR_TYPES } from "@neither/shared";
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
  | { kind: "converting"; targetId: string; progressTicks: number; totalTicks: number }
  | { kind: "attachMove"; platformId: string; path: Vec2[]; yieldTicks: number }
  | { kind: "following"; targetId: string; path: Vec2[]; yieldTicks: number }
  | { kind: "garrisonMove"; buildingId: string; path: Vec2[]; yieldTicks: number }
  | { kind: "garrisoned"; buildingId: string }
  | { kind: "enterPlatformMove"; platformId: string; path: Vec2[]; yieldTicks: number }
  | { kind: "inPlatform"; platformId: string }
  | { kind: "hideMove"; buildingId: string; path: Vec2[]; yieldTicks: number }
  | { kind: "hidingInBuilding"; buildingId: string }
  | { kind: "infiltrateBuilding"; buildingId: string; path: Vec2[]; yieldTicks: number }
  | { kind: "inEnemyBuilding"; buildingId: string }
  | { kind: "platformShell" };

export class UnitEntity extends Entity {
  state: UnitState = { kind: "idle" };
  carrying: { resource: "wood" | "water"; amount: number } | null = null;
  attackCooldownTicks: number = 0;
  materialType: "wood" | "metal" | null = null;

  /** Set when this unit is garrisoned inside a Wizard Tower. */
  garrisonedBuildingId: string | null = null;

  /** Set on Core when it is a passenger inside a platform. */
  attachedPlatformId: string | null = null;
  /** Set on Core for display/reference — the typeKey of the platform it's inside. */
  attachedPlatformTypeKey: string | null = null;
  /** Set on a platform entity when a Core is riding inside it. */
  attachedCoreId: string | null = null;

  /** True while this unit is actively concealing itself. Mirrors `invisibilityActive`
   *  for Illusionist and `disguiseActive` for Infiltration Platform so FogOfWar sees
   *  a single flag to suppress vision contribution from cloaked units. */
  concealed = false;

  /** True while Illusionist invisibility is toggled on. Drains mana each tick. */
  invisibilityActive = false;

  /** True while Infiltration Platform disguise is toggled on. */
  disguiseActive = false;
  /** Enemy unit typeKey this Infiltration Platform is impersonating. */
  disguiseTargetTypeKey: string | null = null;

  /** True while this wizard unit has Mana Shield active. */
  manaShielded = false;

  /** Ticks remaining on Ice Blast slow. 0 = not slowed. */
  slowTicksRemaining: number = 0;
  /** Pre-slow speed for exact restoration when slow expires. */
  baseSpeed: number = 0;

  /** Ticks remaining on an Enlarge or Reduce effect. 0 = no buff/debuff. */
  damageBonusTicks: number = 0;
  /** Outgoing damage multiplier (Enlarge >1, Reduce <1, normal = 1.0). */
  damageBonusMultiplier: number = 1.0;

  /** Ticks remaining on temporary Illusionist control of an otherwise-unconvertible leader.
   *  0 = not under temp control. While > 0, `faction` is the puppeteer's faction and
   *  `originalFaction` holds the faction to revert to. */
  tempControlTicks: number = 0;
  /** The faction this unit will revert to when `tempControlTicks` reaches zero. */
  originalFaction: Faction | null = null;

  /** True if this unit type can detect concealed enemies. */
  readonly isDetector: boolean;

  /** True for flying units — ignores terrain + building tiles; collides only with other flyers. */
  readonly isFlying: boolean;
  /** True if this unit can target flying units in combat. */
  readonly canAttackAir: boolean;
  /** True if this unit cannot be converted by opposing faction Talk actions. */
  readonly cannotBeConverted: boolean;

  constructor(params: {
    id?: string | undefined;
    faction: Faction;
    typeKey: string;
    position: Vec2;
    stats: StatBlockInit;
    isNamed?: boolean;
    name?: string | null;
    isFlying?: boolean;
    canAttackAir?: boolean;
    cannotBeConverted?: boolean;
  }) {
    super({ ...params, kind: "unit" });
    this.isDetector = DETECTOR_TYPES.has(params.typeKey);
    this.isFlying = params.isFlying ?? false;
    this.canAttackAir = params.canAttackAir ?? false;
    this.cannotBeConverted = params.cannotBeConverted ?? false;
    this.baseSpeed = this.stats.speed;
    // Concealment is now explicitly toggled via abilities (Illusionist invisibility).
    // `CONCEALED_TYPES` is retained to gate which typeKeys may toggle concealment,
    // not to auto-apply it at spawn.
    void CONCEALED_TYPES; // referenced for side-effect import; actual gating lives in GameEngine.
  }

  private _actionLabel(): string {
    switch (this.state.kind) {
      case "idle":         return "Idle";
      case "moving":       return "Moving";
      case "patrolling":   return "Patrolling";
      case "gatherMove":
      case "gathering":    return "Gathering";
      case "dropoffMove":  return "Returning";
      case "attacking":    return "Attacking";
      case "buildMove":
      case "constructing": return "Constructing";
      case "converting":   {
        const pct = Math.round((this.state.progressTicks / this.state.totalTicks) * 100);
        return `Converting (${pct}%)`;
      }
      case "attachMove":   return "Boarding";
      case "following":    return "Following";
      case "garrisonMove": return "Moving to Tower";
      case "garrisoned":   return "Garrisoned";
      case "enterPlatformMove": return "Entering Platform";
      case "inPlatform":   return "Occupying Platform";
      case "hideMove":     return "Moving to Cover";
      case "hidingInBuilding": return "Hiding";
      case "infiltrateBuilding": return "Infiltrating";
      case "inEnemyBuilding":  return "Inside Enemy Building";
      default:             return "";
    }
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
      flying: this.isFlying || undefined,
      slowed: this.slowTicksRemaining > 0 || undefined,
      enlarged: (this.damageBonusTicks > 0 && this.damageBonusMultiplier > 1) || undefined,
      reduced: (this.damageBonusTicks > 0 && this.damageBonusMultiplier < 1) || undefined,
      garrisoned: this.state.kind === "garrisoned" || undefined,
      inPlatform: this.state.kind === "inPlatform" || undefined,
      invisible: this.invisibilityActive || undefined,
      disguised: this.disguiseActive || undefined,
      // Display overrides — used by the renderer to decide which sprite + faction
      // tint to draw. Disguise flips to opposing faction for opponent viewers;
      // temp-control keeps the puppet rendered as its ORIGINAL faction so every
      // viewer still recognises the leader (selling the illusion on the robot side
      // while the wizards actually command it).
      displayFaction: this.disguiseActive
        ? (this.faction === "wizards" ? "robots" : "wizards")
        : (this.tempControlTicks > 0 && this.originalFaction ? this.originalFaction : undefined),
      displayTypeKey: this.disguiseActive
        ? (this.disguiseTargetTypeKey ?? undefined)
        : (this.tempControlTicks > 0 ? this.typeKey : undefined),
      hidden: this.state.kind === "hidingInBuilding" || undefined,
      inEnemyBuilding: this.state.kind === "inEnemyBuilding" || undefined,
      containingBuildingId:
        this.state.kind === "hidingInBuilding" || this.state.kind === "inEnemyBuilding"
          ? this.state.buildingId
          : undefined,
      tempControlled: this.tempControlTicks > 0 || undefined,
      unitAction: this.state.kind !== "platformShell" ? this._actionLabel() : undefined,
    };
  }
}
