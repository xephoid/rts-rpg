import { describe, it, expect } from "vitest";
import { GameEngine } from "./GameEngine.js";
import { UnitEntity } from "./entities/UnitEntity.js";
import { BuildingEntity } from "./entities/BuildingEntity.js";
import {
  robotUnitStats,
  wizardBuildingStats,
} from "@neither/shared";

/**
 * Reproduces the playtest bug: Large Combat Platforms (2×2 footprint, range 1)
 * surrounding a Wizard Tower (1×1) did no damage. Distance was measured from
 * attacker-tile to building-corner instead of AABB-nearest-point, so the
 * attackers read as out of range even when adjacent.
 */
describe("combat range vs buildings", () => {
  it("melee attacker adjacent to a 1×1 building (wizard tower) deals damage", () => {
    const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });

    const bStats = wizardBuildingStats.wizardTower!;
    const tower = new BuildingEntity({
      faction: "wizards",
      typeKey: "wizardTower",
      position: { x: 20, y: 20 },
      stats: {
        maxHp: bStats.hp, damage: 0, attackRange: 0,
        sightRange: bStats.visionRange, speed: 0, charisma: 0, armor: 0,
        capacity: bStats.occupantCapacity,
      },
      constructionTicks: 0,
    });
    tower.state = { kind: "operational" };
    engine.entities.add(tower);

    // LCP one tile east of the tower — adjacent, range 1.
    const lcp = robotUnitStats.largeCombatPlatform!;
    const attacker = new UnitEntity({
      faction: "robots",
      typeKey: "largeCombatPlatform",
      position: { x: 21, y: 20 },
      stats: {
        maxHp: lcp.hpWood, damage: lcp.damage,
        attackRange: lcp.attackRange, sightRange: lcp.sightRange,
        speed: lcp.speed, charisma: lcp.charisma,
        armor: lcp.armorWood, capacity: lcp.capacity,
      },
      canAttackAir: lcp.canAttackAir ?? false,
    });
    // Give it an attached-core by faking the flag — `issueAttackOrder` gates on it.
    attacker.attachedCoreId = "fake";
    engine.entities.add(attacker);

    const hpBefore = tower.stats.hp;
    engine.issueAttackOrder(attacker.id, tower.id);
    expect(attacker.state.kind).toBe("attacking");

    for (let t = 0; t < 60; t++) engine.stepTick(t, t * 16);
    expect(tower.stats.hp).toBeLessThan(hpBefore);
  });

  it("diagonal attacker against a 2×2 building reaches it with range 1", () => {
    const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });

    // 2×2 cottage.
    const c = wizardBuildingStats.cottage!;
    const cottage = new BuildingEntity({
      faction: "wizards",
      typeKey: "cottage",
      position: { x: 30, y: 30 },
      stats: {
        maxHp: c.hp, damage: 0, attackRange: 0,
        sightRange: c.visionRange, speed: 0, charisma: 0, armor: 0,
        capacity: c.occupantCapacity,
      },
      constructionTicks: 0,
    });
    cottage.state = { kind: "operational" };
    engine.entities.add(cottage);

    // Spinner diagonally adjacent to the bottom-right cottage tile — distance 1.
    const s = robotUnitStats.spinnerPlatform!;
    const attacker = new UnitEntity({
      faction: "robots",
      typeKey: "spinnerPlatform",
      position: { x: 32, y: 32 },
      stats: {
        maxHp: s.hpWood, damage: s.damage,
        attackRange: s.attackRange, sightRange: s.sightRange,
        speed: s.speed, charisma: s.charisma,
        armor: s.armorWood, capacity: s.capacity,
      },
    });
    attacker.attachedCoreId = "fake";
    engine.entities.add(attacker);

    const hpBefore = cottage.stats.hp;
    engine.issueAttackOrder(attacker.id, cottage.id);
    for (let t = 0; t < 60; t++) engine.stepTick(t, t * 16);
    expect(cottage.stats.hp).toBeLessThan(hpBefore);
  });
});
