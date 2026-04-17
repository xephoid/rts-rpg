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

export class UnitEntity extends Entity {
  state: UnitState = { kind: "idle" };
  carrying: { resource: "wood" | "water"; amount: number } | null = null;

  constructor(params: {
    id?: string;
    faction: Faction;
    typeKey: string;
    position: Vec2;
    stats: StatBlockInit;
  }) {
    super({ ...params, kind: "unit" });
  }
}
