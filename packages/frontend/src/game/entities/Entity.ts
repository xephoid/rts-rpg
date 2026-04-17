import type { Faction, EntityKind, Vec2 } from "@neither/shared";
import { StatBlock, type StatBlockInit } from "./StatBlock.js";

let nextId = 1;

export function generateEntityId(prefix: string): string {
  return `${prefix}_${nextId++}`;
}

/** Reset ID counter — test use only. */
export function _resetEntityIdCounter(): void {
  nextId = 1;
}

export abstract class Entity {
  readonly id: string;
  readonly kind: EntityKind;
  readonly faction: Faction;
  readonly typeKey: string;
  position: Vec2;
  readonly stats: StatBlock;

  constructor(params: {
    id?: string;
    kind: EntityKind;
    faction: Faction;
    typeKey: string;
    position: Vec2;
    stats: StatBlockInit;
  }) {
    this.id = params.id ?? generateEntityId(params.typeKey);
    this.kind = params.kind;
    this.faction = params.faction;
    this.typeKey = params.typeKey;
    this.position = { ...params.position };
    this.stats = new StatBlock(params.stats);
  }

  get isDead(): boolean {
    return this.stats.isDead;
  }

  toSnapshot() {
    return {
      id: this.id,
      kind: this.kind,
      faction: this.faction,
      typeKey: this.typeKey,
      position: { ...this.position },
      stats: this.stats.toSnapshot(),
    };
  }
}
