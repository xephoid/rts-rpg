import type { Faction, Vec2 } from "@neither/shared";
import { Entity } from "./Entity.js";
import type { StatBlockInit } from "./StatBlock.js";

export type BuildingState =
  | { kind: "underConstruction"; progressTicks: number; totalTicks: number }
  | { kind: "operational" }
  | { kind: "producing"; unitTypeKey: string; progressTicks: number; totalTicks: number };

export class BuildingEntity extends Entity {
  state: BuildingState;
  readonly occupantIds: Set<string> = new Set();

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
    return this.state.kind === "operational";
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
}
