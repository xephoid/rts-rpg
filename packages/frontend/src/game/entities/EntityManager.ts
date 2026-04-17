import type { Faction, EntityKind } from "@neither/shared";
import type { Entity } from "./Entity.js";
import type { UnitEntity } from "./UnitEntity.js";
import type { BuildingEntity } from "./BuildingEntity.js";

export class EntityManager {
  private readonly entities = new Map<string, Entity>();

  add(entity: Entity): void {
    if (this.entities.has(entity.id)) {
      throw new Error(`Entity with id "${entity.id}" already registered.`);
    }
    this.entities.set(entity.id, entity);
  }

  remove(id: string): boolean {
    return this.entities.delete(id);
  }

  get(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  has(id: string): boolean {
    return this.entities.has(id);
  }

  get count(): number {
    return this.entities.size;
  }

  all(): Entity[] {
    return [...this.entities.values()];
  }

  byFaction(faction: Faction): Entity[] {
    return this.all().filter((e) => e.faction === faction);
  }

  byKind(kind: EntityKind): Entity[] {
    return this.all().filter((e) => e.kind === kind);
  }

  units(): UnitEntity[] {
    return this.byKind("unit") as UnitEntity[];
  }

  buildings(): BuildingEntity[] {
    return this.byKind("building") as BuildingEntity[];
  }

  unitsByFaction(faction: Faction): UnitEntity[] {
    return this.units().filter((u) => u.faction === faction);
  }

  buildingsByFaction(faction: Faction): BuildingEntity[] {
    return this.buildings().filter((b) => b.faction === faction);
  }

  /** Remove all dead entities. Returns array of removed IDs. */
  pruneDeadEntities(): string[] {
    const dead: string[] = [];
    for (const [id, entity] of this.entities) {
      if (entity.isDead) {
        dead.push(id);
        this.entities.delete(id);
      }
    }
    return dead;
  }

  clear(): void {
    this.entities.clear();
  }

  toSnapshots() {
    return this.all().map((e) => e.toSnapshot());
  }
}
