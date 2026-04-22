import { describe, it, expect } from "vitest";
import { GameEngine } from "./GameEngine.js";
import { UnitEntity } from "./entities/UnitEntity.js";
import { BuildingEntity } from "./entities/BuildingEntity.js";
import {
  robotUnitStats,
  wizardBuildingStats,
  wizardUnitStats,
  namedLeaders,
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

describe("faction elimination alert", () => {
  it("fires when a named leader dies — regardless of whose faction the leader belonged to", () => {
    const alerts: string[] = [];
    const engine = new GameEngine({
      mapSize: "small",
      seed: 1,
      // Player is wizards, so the robot leader's death below is NOT the
      // player's own-faction loss — the generic "destroyed" alert wouldn't
      // fire for it. The elimination alert must fire anyway.
      playerFaction: "wizards",
      onTick: () => {},
      onAlert: (msg) => { alerts.push(msg); },
    });

    // Spawn the robot leader at a separate position so the engine's starting
    // motherboard isn't the one we kill. Use the shared named-leader config.
    const mStats = robotUnitStats[namedLeaders.robots.typeKey]!;
    const motherboard = new UnitEntity({
      faction: "robots",
      typeKey: namedLeaders.robots.typeKey,
      position: { x: 40, y: 40 },
      stats: {
        maxHp: mStats.hpWood, damage: mStats.damage,
        attackRange: mStats.attackRange, sightRange: mStats.sightRange,
        speed: mStats.speed, charisma: mStats.charisma,
        armor: mStats.armorWood, capacity: mStats.capacity,
      },
      isNamed: true,
      name: namedLeaders.robots.name,
    });
    engine.entities.add(motherboard);

    // Drive HP to zero and step once so _handleEntityDeath runs.
    motherboard.stats.hp = 0;
    engine.stepTick(0, 0);

    expect(alerts.some((m) => m.includes("Robots eliminated"))).toBe(true);
    expect(alerts.some((m) => m.includes(namedLeaders.robots.name))).toBe(true);
  });

  it("fires for the player's OWN leader — so the player sees the end-of-match moment", () => {
    const alerts: string[] = [];
    const engine = new GameEngine({
      mapSize: "small",
      seed: 1,
      playerFaction: "wizards",
      onTick: () => {},
      onAlert: (msg) => { alerts.push(msg); },
    });

    const aStats = wizardUnitStats[namedLeaders.wizards.typeKey]!;
    const archmage = new UnitEntity({
      faction: "wizards",
      typeKey: namedLeaders.wizards.typeKey,
      position: { x: 40, y: 40 },
      stats: {
        maxHp: aStats.hp, damage: aStats.damage,
        attackRange: aStats.attackRange, sightRange: aStats.sightRange,
        speed: aStats.speed, charisma: aStats.charisma,
        armor: aStats.armor, capacity: aStats.capacity,
      },
      isNamed: true,
      name: namedLeaders.wizards.name,
    });
    engine.entities.add(archmage);

    archmage.stats.hp = 0;
    engine.stepTick(0, 0);

    expect(alerts.some((m) => m.includes("Wizards eliminated"))).toBe(true);
  });
});

describe("worker-task preservation vs nudge", () => {
  it("a constructing builder is not bumped off task when another unit tries to walk through", () => {
    const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });

    // Real under-construction building so `_processConstruction` leaves the
    // builder's state in `constructing` each tick — a fake state would get
    // reset by the processor and we'd lose the signal we're testing for.
    const bStats = wizardBuildingStats.cottage!;
    const cottage = new BuildingEntity({
      faction: "wizards",
      typeKey: "cottage",
      position: { x: 50, y: 50 },
      stats: {
        maxHp: bStats.hp, damage: 0, attackRange: 0,
        sightRange: bStats.visionRange, speed: 0, charisma: 0, armor: 0,
        capacity: bStats.occupantCapacity,
      },
      // Long construction window so the test doesn't race it.
      constructionTicks: 1000,
    });
    // BuildingEntity defaults to underConstruction state — leave it.
    engine.entities.add(cottage);

    const sStats = wizardUnitStats.surf!;
    const builder = new UnitEntity({
      faction: "wizards",
      typeKey: "surf",
      position: { x: 52, y: 50 }, // adjacent to footprint
      stats: {
        maxHp: sStats.hp, damage: sStats.damage,
        attackRange: sStats.attackRange, sightRange: sStats.sightRange,
        speed: sStats.speed, charisma: sStats.charisma,
        armor: sStats.armor, capacity: sStats.capacity,
      },
    });
    builder.state = { kind: "constructing", buildingId: cottage.id };
    engine.entities.add(builder);

    // Passerby on the other side tries to walk through the builder's tile.
    const passer = new UnitEntity({
      faction: "wizards",
      typeKey: "surf",
      position: { x: 54, y: 50 },
      stats: {
        maxHp: sStats.hp, damage: sStats.damage,
        attackRange: sStats.attackRange, sightRange: sStats.sightRange,
        speed: sStats.speed, charisma: sStats.charisma,
        armor: sStats.armor, capacity: sStats.capacity,
      },
    });
    engine.entities.add(passer);
    engine.issueMoveOrder(passer.id, { x: 48, y: 50 });

    for (let t = 0; t < 30; t++) engine.stepTick(t, t * 16);
    expect(builder.state.kind).toBe("constructing");
  });
});

describe("build site validation vs occupied tiles", () => {
  it("rejects issueBuildOrder when a unit is standing on the target footprint", () => {
    const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });

    // Builder at a known tile, and another unit sitting on the chosen site.
    const sStats = wizardUnitStats.surf!;
    const builder = new UnitEntity({
      faction: "wizards",
      typeKey: "surf",
      position: { x: 40, y: 40 },
      stats: {
        maxHp: sStats.hp, damage: sStats.damage,
        attackRange: sStats.attackRange, sightRange: sStats.sightRange,
        speed: sStats.speed, charisma: sStats.charisma,
        armor: sStats.armor, capacity: sStats.capacity,
      },
    });
    engine.entities.add(builder);

    const occupant = new UnitEntity({
      faction: "wizards",
      typeKey: "surf",
      position: { x: 45, y: 45 }, // will be on the cottage's 2×2 footprint
      stats: {
        maxHp: sStats.hp, damage: sStats.damage,
        attackRange: sStats.attackRange, sightRange: sStats.sightRange,
        speed: sStats.speed, charisma: sStats.charisma,
        armor: sStats.armor, capacity: sStats.capacity,
      },
    });
    engine.entities.add(occupant);

    const buildingsBefore = engine.entities.buildingsByFaction("wizards").length;
    // Cottage is 2×2, topLeft (45,45) → footprint (45..46, 45..46). Occupant
    // is on (45,45), so the build must be rejected.
    engine.issueBuildOrder(builder.id, "cottage", { x: 45, y: 45 });
    const buildingsAfter = engine.entities.buildingsByFaction("wizards").length;
    expect(buildingsAfter).toBe(buildingsBefore);
  });
});
