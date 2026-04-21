import type { Faction, Vec2 } from "@neither/shared";
import { Entity } from "./Entity.js";
import type { StatBlockInit } from "./StatBlock.js";

export type BuildingState =
  | { kind: "underConstruction"; progressTicks: number; totalTicks: number }
  | { kind: "operational" }
  | { kind: "producing"; unitTypeKey: string; progressTicks: number; totalTicks: number }
  | { kind: "researching"; researchKey: string; progressTicks: number; totalTicks: number };

export class BuildingEntity extends Entity {
  state: BuildingState;
  readonly occupantIds: Set<string> = new Set();
  /** Set when a wizard unit (Evoker/Archmage) is garrisoned inside this Tower. */
  garrisonedUnitId: string | null = null;
  /** Queued unit typeKeys — processed FIFO after active production completes. Max 5 total items (active + queue). */
  readonly productionQueue: string[] = [];
  /** Ticks remaining until this building can attack again (Immobile Combat Platform). */
  attackCooldownTicks = 0;

  constructor(params: {
    id?: string;
    faction: Faction;
    typeKey: string;
    position: Vec2;
    stats: StatBlockInit;
    constructionTicks: number;
  }) {
    super({ ...params, kind: "building" });
    this.state = {
      kind: "underConstruction",
      progressTicks: 0,
      totalTicks: params.constructionTicks,
    };
  }

  get isOperational(): boolean {
    return this.state.kind !== "underConstruction";
  }

  override toSnapshot() {
    const base = super.toSnapshot();
    return {
      ...base,
      productionProgress:
        this.state.kind === "producing"
          ? {
              unitTypeKey: this.state.unitTypeKey,
              progressTicks: this.state.progressTicks,
              totalTicks: this.state.totalTicks,
            }
          : null,
      productionQueue: [...this.productionQueue],
      buildingState: (
        this.state.kind === "underConstruction" ? "underConstruction"
        : this.state.kind === "producing" ? "producing"
        : this.state.kind === "researching" ? "researching"
        : "operational"
      ) as "underConstruction" | "operational" | "producing" | "researching",
      constructionProgress:
        this.state.kind === "underConstruction"
          ? { progressTicks: this.state.progressTicks, totalTicks: this.state.totalTicks }
          : null,
      researchProgress:
        this.state.kind === "researching"
          ? {
              researchKey: this.state.researchKey,
              progressTicks: this.state.progressTicks,
              totalTicks: this.state.totalTicks,
            }
          : null,
      garrisonedUnitId: this.garrisonedUnitId ?? undefined,
      occupantCount: this.occupantIds.size || undefined,
      // hiddenOccupantCount is distinct from `occupantCount` semantically — both use the
      // same `occupantIds` Set physically. GameEngine fills in this field on snapshot
      // emission because the building alone can't tell which occupants are in
      // `hidingInBuilding` state vs `inPlatform`.
    };
  }

  advanceConstruction(): boolean {
    if (this.state.kind !== "underConstruction") return false;
    this.state.progressTicks++;
    if (this.state.progressTicks >= this.state.totalTicks) {
      this.state = { kind: "operational" };
      return true;
    }
    return false;
  }

  advanceResearch(): boolean {
    if (this.state.kind !== "researching") return false;
    this.state.progressTicks++;
    if (this.state.progressTicks >= this.state.totalTicks) {
      this.state = { kind: "operational" };
      return true;
    }
    return false;
  }
}
