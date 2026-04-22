import { describe, it, expect, beforeEach } from "vitest";
import { GameEngine } from "./GameEngine.js";
import { UnitEntity } from "./entities/UnitEntity.js";
import { BuildingEntity } from "./entities/BuildingEntity.js";
import {
  wizardUnitStats,
  robotUnitStats,
  wizardBuildingStats,
  robotBuildingStats,
} from "@neither/shared";

function makeEngine(): GameEngine {
  return new GameEngine({
    mapSize: "small",
    seed: 1,
    onTick: () => {},
  });
}

function spawnIllusionist(engine: GameEngine, pos = { x: 10, y: 10 }): UnitEntity {
  const stats = wizardUnitStats.illusionist!;
  const u = new UnitEntity({
    faction: "wizards",
    typeKey: "illusionist",
    position: pos,
    stats: {
      maxHp: stats.hp,
      damage: stats.damage,
      attackRange: stats.attackRange,
      sightRange: stats.sightRange,
      speed: stats.speed,
      charisma: stats.charisma,
      armor: stats.armor,
      capacity: stats.capacity,
    },
  });
  engine.entities.add(u);
  return u;
}

function spawnSubject(engine: GameEngine, pos = { x: 8, y: 8 }): UnitEntity {
  const stats = wizardUnitStats.subject!;
  const u = new UnitEntity({
    faction: "wizards",
    typeKey: "subject",
    position: pos,
    stats: {
      maxHp: stats.hp,
      damage: stats.damage,
      attackRange: stats.attackRange,
      sightRange: stats.sightRange,
      speed: stats.speed,
      charisma: stats.charisma,
      armor: stats.armor,
      capacity: stats.capacity,
    },
  });
  engine.entities.add(u);
  return u;
}

function findOpenTile(engine: GameEngine, start: { x: number; y: number }): { x: number; y: number } {
  for (let r = 0; r < 20; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const t = { x: start.x + dx, y: start.y + dy };
        if (engine.grid.isPassable(t.x, t.y)) return t;
      }
    }
  }
  return start;
}

function spawnCottage(engine: GameEngine, pos = { x: 20, y: 20 }): BuildingEntity {
  const bStats = wizardBuildingStats.cottage!;
  const b = new BuildingEntity({
    faction: "wizards",
    typeKey: "cottage",
    position: pos,
    stats: {
      maxHp: bStats.hp,
      damage: 0,
      attackRange: 0,
      sightRange: bStats.visionRange,
      speed: 0,
      charisma: 0,
      armor: 0,
      capacity: bStats.occupantCapacity,
    },
    constructionTicks: 0,
  });
  b.state = { kind: "operational" };
  engine.entities.add(b);
  return b;
}

function spawnRechargeStation(engine: GameEngine, pos = { x: 25, y: 25 }): BuildingEntity {
  const bStats = robotBuildingStats.rechargeStation!;
  const b = new BuildingEntity({
    faction: "robots",
    typeKey: "rechargeStation",
    position: pos,
    stats: {
      maxHp: bStats.hp,
      damage: 0,
      attackRange: 0,
      sightRange: bStats.visionRange,
      speed: 0,
      charisma: 0,
      armor: 0,
      capacity: bStats.occupantCapacity,
    },
    constructionTicks: 0,
  });
  b.state = { kind: "operational" };
  engine.entities.add(b);
  return b;
}

function spawnInfiltrator(engine: GameEngine, pos = { x: 12, y: 12 }): UnitEntity {
  const stats = robotUnitStats.infiltrationPlatform!;
  const u = new UnitEntity({
    faction: "robots",
    typeKey: "infiltrationPlatform",
    position: pos,
    stats: {
      maxHp: stats.hpWood,
      damage: stats.damage,
      attackRange: stats.attackRange,
      sightRange: stats.sightRange,
      speed: stats.speed,
      charisma: stats.charisma,
      armor: stats.armorWood,
      capacity: stats.capacity,
    },
  });
  engine.entities.add(u);
  return u;
}

// ── Invisibility toggle + drain ────────────────────────────────────────────────

describe("Illusionist invisibility", () => {
  let engine: GameEngine;
  let illusionist: UnitEntity;

  beforeEach(() => {
    engine = makeEngine();
    illusionist = spawnIllusionist(engine);
    engine.grantResearch("wizards", "invisibility");
    engine.getResources("wizards").mana = 100;
  });

  it("spawns with invisibility off and concealed off", () => {
    expect(illusionist.invisibilityActive).toBe(false);
    expect(illusionist.concealed).toBe(false);
  });

  it("does not toggle when research missing", () => {
    const e2 = makeEngine();
    const il2 = spawnIllusionist(e2);
    e2.getResources("wizards").mana = 100;
    e2.issueInvisibilityToggle(il2.id);
    expect(il2.invisibilityActive).toBe(false);
  });

  it("does not toggle when unit is not an Illusionist", () => {
    const stats = wizardUnitStats.evoker!;
    const evoker = new UnitEntity({
      faction: "wizards",
      typeKey: "evoker",
      position: { x: 5, y: 5 },
      stats: {
        maxHp: stats.hp,
        damage: stats.damage,
        attackRange: stats.attackRange,
        sightRange: stats.sightRange,
        speed: stats.speed,
        charisma: stats.charisma,
        armor: stats.armor,
        capacity: stats.capacity,
      },
    });
    engine.entities.add(evoker);
    engine.issueInvisibilityToggle(evoker.id);
    expect(evoker.invisibilityActive).toBe(false);
  });

  it("toggles on with research + mana; keeps vision contribution intact", () => {
    engine.issueInvisibilityToggle(illusionist.id);
    expect(illusionist.invisibilityActive).toBe(true);
    // Intentionally NOT mirrored into `concealed` — otherwise FogOfWar would drop the
    // Illusionist as a vision source and the owner would go blind on the tile.
    expect(illusionist.concealed).toBe(false);
  });

  it("refuses to toggle on when mana is zero", () => {
    engine.getResources("wizards").mana = 0;
    engine.issueInvisibilityToggle(illusionist.id);
    expect(illusionist.invisibilityActive).toBe(false);
  });

  it("toggles off regardless of mana level", () => {
    engine.issueInvisibilityToggle(illusionist.id); // on
    engine.getResources("wizards").mana = 0;
    engine.issueInvisibilityToggle(illusionist.id); // off
    expect(illusionist.invisibilityActive).toBe(false);
  });

  it("snapshot exposes invisible field when active", () => {
    engine.issueInvisibilityToggle(illusionist.id);
    const snap = illusionist.toSnapshot();
    expect(snap.invisible).toBe(true);
  });

  it("drains mana while active — fewer mana gained per tick vs. inactive baseline", () => {
    // Inactive baseline: run a tick with invisibility off.
    const baselineEngine = makeEngine();
    const baselineIl = spawnIllusionist(baselineEngine);
    void baselineIl;
    const manaBefore = baselineEngine.getResources("wizards").mana;
    baselineEngine.stepTick(0, 0);
    const baselineDelta = baselineEngine.getResources("wizards").mana - manaBefore;

    // Active: one illusionist with invisibility toggled on.
    engine.issueInvisibilityToggle(illusionist.id);
    const activeBefore = engine.getResources("wizards").mana;
    engine.stepTick(0, 0);
    const activeDelta = engine.getResources("wizards").mana - activeBefore;

    expect(activeDelta).toBeLessThan(baselineDelta);
  });

});

// ── Disguise toggle ────────────────────────────────────────────────────────────

describe("Infiltration Platform disguise", () => {
  let engine: GameEngine;
  let inf: UnitEntity;

  beforeEach(() => {
    engine = makeEngine();
    inf = spawnInfiltrator(engine);
  });

  it("spawns with disguise off", () => {
    expect(inf.disguiseActive).toBe(false);
    expect(inf.disguiseTargetTypeKey).toBeNull();
  });

  it("accepts an enemy-roster typeKey", () => {
    engine.issueDisguise(inf.id, "evoker");
    expect(inf.disguiseActive).toBe(true);
    expect(inf.disguiseTargetTypeKey).toBe("evoker");
  });

  it("rejects a friendly-roster typeKey", () => {
    engine.issueDisguise(inf.id, "spitterPlatform"); // same-faction robot unit
    expect(inf.disguiseActive).toBe(false);
    expect(inf.disguiseTargetTypeKey).toBeNull();
  });

  it("rejects an unknown typeKey", () => {
    engine.issueDisguise(inf.id, "spaghettiMonster");
    expect(inf.disguiseActive).toBe(false);
  });

  it("does nothing when called on a non-infiltration unit", () => {
    const illusionist = spawnIllusionist(engine);
    engine.issueDisguise(illusionist.id, "evoker");
    expect(illusionist.disguiseActive).toBe(false);
  });

  it("snapshot exposes displayFaction + displayTypeKey while disguised", () => {
    engine.issueDisguise(inf.id, "dragon");
    const snap = inf.toSnapshot();
    expect(snap.disguised).toBe(true);
    expect(snap.displayFaction).toBe("wizards");
    expect(snap.displayTypeKey).toBe("dragon");
  });

  it("clearDisguise returns to normal", () => {
    engine.issueDisguise(inf.id, "evoker");
    engine.issueClearDisguise(inf.id);
    expect(inf.disguiseActive).toBe(false);
    expect(inf.disguiseTargetTypeKey).toBeNull();
    const snap = inf.toSnapshot();
    expect(snap.disguised).toBeUndefined();
    expect(snap.displayFaction).toBeUndefined();
  });

  it("does not alter `concealed` (disguise stays in opponent rendering only)", () => {
    engine.issueDisguise(inf.id, "evoker");
    expect(inf.concealed).toBe(false);
  });
});

// ── Hide flow ──────────────────────────────────────────────────────────────────

describe("Hide in friendly building", () => {
  let engine: GameEngine;
  let subject: UnitEntity;
  let cottage: BuildingEntity;

  beforeEach(() => {
    engine = makeEngine();
    const open = findOpenTile(engine, { x: 8, y: 8 });
    subject = spawnSubject(engine, open);
    const cottageAnchor = findOpenTile(engine, { x: open.x + 2, y: open.y + 2 });
    cottage = spawnCottage(engine, cottageAnchor);
  });

  it("transitions subject through hideMove to hidingInBuilding", () => {
    engine.issueHideOrder(subject.id, cottage.id);
    expect(subject.state.kind).toBe("hideMove");

    // Step simulation until arrival.
    for (let t = 0; t < 600 && subject.state.kind !== "hidingInBuilding"; t++) {
      engine.stepTick(t, t * 16);
    }
    expect(subject.state.kind).toBe("hidingInBuilding");
    expect(cottage.occupantIds.has(subject.id)).toBe(true);
    expect(subject.toSnapshot().hidden).toBe(true);
  });

  it("rejects hide order on enemy-faction building", () => {
    const rs = spawnRechargeStation(engine);
    engine.issueHideOrder(subject.id, rs.id);
    expect(subject.state.kind).toBe("idle");
  });

  it("rejects hide order on non-hiding-capable building", () => {
    const castle = new BuildingEntity({
      faction: "wizards",
      typeKey: "castle",
      position: { x: 30, y: 30 },
      stats: {
        maxHp: 1, damage: 0, attackRange: 0, sightRange: 5,
        speed: 0, charisma: 0, armor: 0, capacity: 0,
      },
      constructionTicks: 0,
    });
    castle.state = { kind: "operational" };
    engine.entities.add(castle);
    engine.issueHideOrder(subject.id, castle.id);
    expect(subject.state.kind).toBe("idle");
  });

  it("rejects hide order on non-hideable unit types", () => {
    const stats = wizardUnitStats.evoker!;
    const evoker = new UnitEntity({
      faction: "wizards",
      typeKey: "evoker",
      position: { x: 8, y: 8 },
      stats: {
        maxHp: stats.hp, damage: stats.damage,
        attackRange: stats.attackRange, sightRange: stats.sightRange,
        speed: stats.speed, charisma: stats.charisma,
        armor: stats.armor, capacity: stats.capacity,
      },
    });
    engine.entities.add(evoker);
    engine.issueHideOrder(evoker.id, cottage.id);
    expect(evoker.state.kind).toBe("idle");
  });

  it("leaveHiding exits subject to adjacent tile", () => {
    // Fast-track: directly mark the subject as hiding (skip pathfinding).
    cottage.occupantIds.add(subject.id);
    subject.state = { kind: "hidingInBuilding", buildingId: cottage.id };
    subject.position = { ...cottage.position };

    engine.issueLeaveHidingOrder(subject.id);
    expect(subject.state.kind).toBe("idle");
    expect(cottage.occupantIds.has(subject.id)).toBe(false);
    // Position should now differ from the cottage's footprint origin
    expect(
      subject.position.x !== cottage.position.x ||
      subject.position.y !== cottage.position.y,
    ).toBe(true);
  });

  it("eject command flushes hidden occupants", () => {
    cottage.occupantIds.add(subject.id);
    subject.state = { kind: "hidingInBuilding", buildingId: cottage.id };
    subject.position = { ...cottage.position };

    engine.issueEjectOccupantsOrder(cottage.id);
    expect(subject.state.kind).toBe("idle");
    expect(cottage.occupantIds.has(subject.id)).toBe(false);
  });

  it("destroying a Cottage evicts hidden occupants alive", () => {
    cottage.occupantIds.add(subject.id);
    subject.state = { kind: "hidingInBuilding", buildingId: cottage.id };
    subject.position = { ...cottage.position };

    // Simulate destruction by dropping the cottage HP to zero and letting the
    // engine's tick-end cleanup process it. Direct remove would short-circuit
    // the death handler; we want the real code path.
    cottage.stats.hp = 0;
    engine.stepTick(0, 0);

    expect(engine.entities.get(cottage.id)).toBeUndefined();
    const freed = engine.entities.get(subject.id) as UnitEntity | undefined;
    expect(freed).toBeDefined();
    expect(freed!.state.kind).toBe("idle");
    // Position must be somewhere non-trivial (ejected, not the old cottage tile).
  });
});

// ── Detection set ──────────────────────────────────────────────────────────────

describe("Detector reveal", () => {
  function spawnEnchantress(engine: GameEngine, pos: { x: number; y: number }): UnitEntity {
    const stats = wizardUnitStats.enchantress!;
    const u = new UnitEntity({
      faction: "wizards",
      typeKey: "enchantress",
      position: pos,
      stats: {
        maxHp: stats.hp, damage: stats.damage,
        attackRange: stats.attackRange, sightRange: stats.sightRange,
        speed: stats.speed, charisma: stats.charisma,
        armor: stats.armor, capacity: stats.capacity,
      },
    });
    engine.entities.add(u);
    return u;
  }

  function spawnProbe(engine: GameEngine, pos: { x: number; y: number }): UnitEntity {
    const stats = robotUnitStats.probePlatform!;
    const u = new UnitEntity({
      faction: "robots",
      typeKey: "probePlatform",
      position: pos,
      stats: {
        maxHp: stats.hpWood, damage: stats.damage,
        attackRange: stats.attackRange, sightRange: stats.sightRange,
        speed: stats.speed, charisma: stats.charisma,
        armor: stats.armorWood, capacity: stats.capacity,
      },
      isFlying: stats.flying ?? false,
    });
    engine.entities.add(u);
    return u;
  }

  it("no detector → no revealed units", () => {
    let captured: Record<string, string[]> | null = null;
    const engine = new GameEngine({
      mapSize: "small",
      seed: 1,
      onTick: (s) => { captured = s.detectedIds; },
    });
    const il = spawnIllusionist(engine, { x: 10, y: 10 });
    engine.grantResearch("wizards", "invisibility");
    engine.getResources("wizards").mana = 50;
    engine.issueInvisibilityToggle(il.id);
    engine.stepTick(0, 0);
    expect(captured!.robots).not.toContain(il.id);
  });

  it("enemy detector within sightRange reveals invisible illusionist", () => {
    let captured: Record<string, string[]> | null = null;
    const engine = new GameEngine({
      mapSize: "small",
      seed: 1,
      onTick: (s) => { captured = s.detectedIds; },
    });
    const il = spawnIllusionist(engine, { x: 10, y: 10 });
    engine.grantResearch("wizards", "invisibility");
    engine.getResources("wizards").mana = 50;
    engine.issueInvisibilityToggle(il.id);
    // Probe Platform within illusionist's position; probePlatform sightRange is 10.
    spawnProbe(engine, { x: 12, y: 12 });
    engine.stepTick(0, 0);
    expect(captured!.robots).toContain(il.id);
  });

  it("detector out of sightRange does NOT reveal", () => {
    let captured: Record<string, string[]> | null = null;
    const engine = new GameEngine({
      mapSize: "small",
      seed: 1,
      onTick: (s) => { captured = s.detectedIds; },
    });
    const il = spawnIllusionist(engine, { x: 10, y: 10 });
    engine.grantResearch("wizards", "invisibility");
    engine.getResources("wizards").mana = 50;
    engine.issueInvisibilityToggle(il.id);
    // Probe far away — probePlatform sightRange=10, distance ~40.
    spawnProbe(engine, { x: 50, y: 50 });
    engine.stepTick(0, 0);
    expect(captured!.robots).not.toContain(il.id);
  });

  it("enchantress reveals a disguised infiltration platform", () => {
    let captured: Record<string, string[]> | null = null;
    const engine = new GameEngine({
      mapSize: "small",
      seed: 1,
      onTick: (s) => { captured = s.detectedIds; },
    });
    const inf = spawnInfiltrator(engine, { x: 14, y: 14 });
    engine.issueDisguise(inf.id, "evoker");
    spawnEnchantress(engine, { x: 15, y: 15 });
    engine.stepTick(0, 0);
    expect(captured!.wizards).toContain(inf.id);
  });
});

// ── Force-out ──────────────────────────────────────────────────────────────────

describe("Spy force-out", () => {
  it("Illusionist infiltrate: converts hidden subject + ejects", () => {
    const alerts: string[] = [];
    const engine = new GameEngine({
      mapSize: "small",
      seed: 1,
      onTick: () => {},
      onAlert: (m) => alerts.push(m),
    });
    const open = findOpenTile(engine, { x: 10, y: 10 });
    const illusionist = spawnIllusionist(engine, open);
    const cottageAnchor = findOpenTile(engine, { x: open.x + 3, y: open.y + 3 });
    // Cottage belongs to robots to make it an ENEMY building (wizards faction illusionist).
    const bStats = wizardBuildingStats.cottage!;
    const cottage = new BuildingEntity({
      faction: "robots", // enemy building
      typeKey: "cottage",
      position: cottageAnchor,
      stats: {
        maxHp: bStats.hp, damage: 0, attackRange: 0,
        sightRange: bStats.visionRange, speed: 0, charisma: 0, armor: 0,
        capacity: bStats.occupantCapacity,
      },
      constructionTicks: 0,
    });
    cottage.state = { kind: "operational" };
    engine.entities.add(cottage);

    // Hidden subject (also robots — matches enemy faction).
    const sStats = wizardUnitStats.subject!;
    const hidden = new UnitEntity({
      faction: "robots",
      typeKey: "subject",
      position: { ...cottage.position },
      stats: {
        maxHp: sStats.hp, damage: sStats.damage,
        attackRange: sStats.attackRange, sightRange: sStats.sightRange,
        speed: sStats.speed, charisma: sStats.charisma,
        armor: sStats.armor, capacity: sStats.capacity,
      },
    });
    engine.entities.add(hidden);
    cottage.occupantIds.add(hidden.id);
    hidden.state = { kind: "hidingInBuilding", buildingId: cottage.id };

    engine.issueInfiltrateOrder(illusionist.id, cottage.id);
    for (let t = 0; t < 600 && illusionist.state.kind !== "idle"; t++) {
      engine.stepTick(t, t * 16);
    }

    expect(hidden.faction).toBe("wizards");
    expect(hidden.state.kind).toBe("idle");
    expect(cottage.occupantIds.has(hidden.id)).toBe(false);
    expect(alerts.some((a) => a.includes("captured"))).toBe(true);
  });

  it("Illusionist infiltrate: leaders are temporarily controlled (not permanently converted)", () => {
    const alerts: string[] = [];
    const engine = new GameEngine({
      mapSize: "small",
      seed: 1,
      onTick: () => {},
      onAlert: (m) => alerts.push(m),
    });
    const open = findOpenTile(engine, { x: 10, y: 10 });
    const illusionist = spawnIllusionist(engine, open);
    const cottageAnchor = findOpenTile(engine, { x: open.x + 3, y: open.y + 3 });
    const bStats = wizardBuildingStats.cottage!;
    const cottage = new BuildingEntity({
      faction: "robots",
      typeKey: "cottage",
      position: cottageAnchor,
      stats: {
        maxHp: bStats.hp, damage: 0, attackRange: 0,
        sightRange: bStats.visionRange, speed: 0, charisma: 0, armor: 0,
        capacity: bStats.occupantCapacity,
      },
      constructionTicks: 0,
    });
    cottage.state = { kind: "operational" };
    engine.entities.add(cottage);

    const mStats = robotUnitStats.motherboard!;
    const leader = new UnitEntity({
      faction: "robots",
      typeKey: "motherboard",
      position: { ...cottage.position },
      stats: {
        maxHp: mStats.hpWood, damage: mStats.damage,
        attackRange: mStats.attackRange, sightRange: mStats.sightRange,
        speed: mStats.speed, charisma: mStats.charisma,
        armor: mStats.armorWood, capacity: mStats.capacity,
      },
      isNamed: true,
      name: "Motherboard",
      cannotBeConverted: true,
    });
    engine.entities.add(leader);
    cottage.occupantIds.add(leader.id);
    leader.state = { kind: "hidingInBuilding", buildingId: cottage.id };

    engine.issueInfiltrateOrder(illusionist.id, cottage.id);
    for (let t = 0; t < 600 && illusionist.state.kind !== "idle"; t++) {
      engine.stepTick(t, t * 16);
    }

    // Temporarily puppeted — faction flipped to wizards, tempControl active.
    expect(leader.faction).toBe("wizards");
    expect(leader.tempControlTicks).toBeGreaterThan(0);
    expect(leader.originalFaction).toBe("robots");
    expect(cottage.occupantIds.has(leader.id)).toBe(false);
    expect(alerts.some((a) => /temporary control/i.test(a))).toBe(true);
  });

  it("Temp-controlled leader renders + targets as original faction deception", () => {
    const engine = makeEngine();
    const mStats = robotUnitStats.motherboard!;
    const leader = new UnitEntity({
      faction: "wizards", // post-puppet — belongs to wizards now
      typeKey: "motherboard",
      position: { x: 15, y: 15 },
      stats: {
        maxHp: mStats.hpWood, damage: mStats.damage,
        attackRange: mStats.attackRange, sightRange: mStats.sightRange,
        speed: mStats.speed, charisma: mStats.charisma,
        armor: mStats.armorWood, capacity: mStats.capacity,
      },
      isNamed: true,
      name: "Motherboard",
      cannotBeConverted: true,
    });
    engine.entities.add(leader);
    leader.tempControlTicks = 500;
    leader.originalFaction = "robots";

    const snap = leader.toSnapshot();
    expect(snap.tempControlled).toBe(true);
    expect(snap.displayFaction).toBe("robots");
    expect(snap.displayTypeKey).toBe("motherboard");

    // Spawn a nearby robot attacker — auto-aggro should skip the puppet.
    const sStats = robotUnitStats.spitterPlatform!;
    const robotAttacker = new UnitEntity({
      faction: "robots",
      typeKey: "spitterPlatform",
      position: { x: 16, y: 15 },
      stats: {
        maxHp: sStats.hpWood, damage: sStats.damage,
        attackRange: sStats.attackRange, sightRange: sStats.sightRange,
        speed: sStats.speed, charisma: sStats.charisma,
        armor: sStats.armorWood, capacity: sStats.capacity,
      },
    });
    engine.entities.add(robotAttacker);

    for (let t = 0; t < 30; t++) engine.stepTick(t, t * 16);
    expect(robotAttacker.state.kind).toBe("idle");
    expect(leader.stats.hp).toBe(leader.stats.maxHp);
  });

  it("Temp control expires and leader reverts to original faction", () => {
    const alerts: string[] = [];
    const engine = new GameEngine({
      mapSize: "small",
      seed: 1,
      onTick: () => {},
      onAlert: (m) => alerts.push(m),
    });
    const mStats = robotUnitStats.motherboard!;
    const leader = new UnitEntity({
      faction: "wizards", // already under puppet control in this setup
      typeKey: "motherboard",
      position: { x: 20, y: 20 },
      stats: {
        maxHp: mStats.hpWood, damage: mStats.damage,
        attackRange: mStats.attackRange, sightRange: mStats.sightRange,
        speed: mStats.speed, charisma: mStats.charisma,
        armor: mStats.armorWood, capacity: mStats.capacity,
      },
      isNamed: true,
      name: "Motherboard",
      cannotBeConverted: true,
    });
    engine.entities.add(leader);
    leader.tempControlTicks = 3;
    leader.originalFaction = "robots";

    // Three ticks of decrement, then revert fires.
    engine.stepTick(0, 0);
    engine.stepTick(1, 16);
    engine.stepTick(2, 32);
    expect(leader.faction).toBe("robots");
    expect(leader.originalFaction).toBeNull();
    expect(leader.tempControlTicks).toBe(0);
    expect(alerts.some((a) => /no longer under control/i.test(a))).toBe(true);
  });

  it("Infiltration Platform: attack-from-inside ejects hidden occupant hostile", () => {
    const engine = makeEngine();
    const open = findOpenTile(engine, { x: 10, y: 10 });
    const inf = spawnInfiltrator(engine, open);
    const cottageAnchor = findOpenTile(engine, { x: open.x + 3, y: open.y + 3 });
    const bStats = wizardBuildingStats.cottage!;
    const cottage = new BuildingEntity({
      faction: "wizards", // enemy of infiltrator (robots)
      typeKey: "cottage",
      position: cottageAnchor,
      stats: {
        maxHp: bStats.hp, damage: 0, attackRange: 0,
        sightRange: bStats.visionRange, speed: 0, charisma: 0, armor: 0,
        capacity: bStats.occupantCapacity,
      },
      constructionTicks: 0,
    });
    cottage.state = { kind: "operational" };
    engine.entities.add(cottage);

    const sStats = wizardUnitStats.subject!;
    const hidden = new UnitEntity({
      faction: "wizards",
      typeKey: "subject",
      position: { ...cottage.position },
      stats: {
        maxHp: sStats.hp, damage: sStats.damage,
        attackRange: sStats.attackRange, sightRange: sStats.sightRange,
        speed: sStats.speed, charisma: sStats.charisma,
        armor: sStats.armor, capacity: sStats.capacity,
      },
    });
    engine.entities.add(hidden);
    cottage.occupantIds.add(hidden.id);
    hidden.state = { kind: "hidingInBuilding", buildingId: cottage.id };

    engine.issueInfiltrateOrder(inf.id, cottage.id);
    for (let t = 0; t < 600 && inf.state.kind !== "inEnemyBuilding"; t++) {
      engine.stepTick(t, t * 16);
    }
    expect(inf.state.kind).toBe("inEnemyBuilding");

    const hpBefore = hidden.stats.hp;
    engine.issueInfiltrateAttack(inf.id, hidden.id);
    expect(hidden.stats.hp).toBeLessThan(hpBefore);
    expect(hidden.faction).toBe("wizards"); // NOT converted
    expect(hidden.state.kind).toBe("idle");
    expect(cottage.occupantIds.has(hidden.id)).toBe(false);
  });

  it("Infiltration attack rejected when target not in same building", () => {
    const engine = makeEngine();
    const inf = spawnInfiltrator(engine);
    const stray = spawnSubject(engine);
    // inf not in `inEnemyBuilding` state → attack should no-op.
    const hpBefore = stray.stats.hp;
    engine.issueInfiltrateAttack(inf.id, stray.id);
    expect(stray.stats.hp).toBe(hpBefore);
  });
});

// ── Combat targeting respects concealment ─────────────────────────────────────

describe("Invisibility research → ability gating", () => {
  it("toggle blocked until invisibility research completes; unlocks after completion is in snapshot", () => {
    let lastSnapshot: { completedResearch: { wizards: string[] } } | null = null;
    const engine = new GameEngine({
      mapSize: "small",
      seed: 1,
      onTick: (s) => { lastSnapshot = s as unknown as typeof lastSnapshot; },
    });
    const il = spawnIllusionist(engine);
    engine.getResources("wizards").mana = 200;

    // Pre-research: toggle is a no-op.
    engine.issueInvisibilityToggle(il.id);
    expect(il.invisibilityActive).toBe(false);

    // Grant "invisibility" research (the same key `illusionistInvisibilityResearchKey`).
    engine.grantResearch("wizards", "invisibility");
    engine.stepTick(0, 0);
    expect(lastSnapshot!.completedResearch.wizards).toContain("invisibility");

    // Post-research: toggle now flips the flag.
    engine.issueInvisibilityToggle(il.id);
    expect(il.invisibilityActive).toBe(true);
  });
});

describe("Combat targeting filter", () => {
  it("auto-aggro skips an invisible enemy not in detector set", () => {
    const engine = makeEngine();
    engine.grantResearch("wizards", "invisibility");
    engine.getResources("wizards").mana = 200;

    // Invisible Illusionist sits next to a Spitter Platform. Without detection the
    // Spitter should NOT auto-aggro the Illusionist.
    const open = findOpenTile(engine, { x: 10, y: 10 });
    const il = spawnIllusionist(engine, open);
    engine.issueInvisibilityToggle(il.id);

    const sStats = robotUnitStats.spitterPlatform!;
    const spitter = new UnitEntity({
      faction: "robots",
      typeKey: "spitterPlatform",
      position: { x: open.x + 2, y: open.y },
      stats: {
        maxHp: sStats.hpWood, damage: sStats.damage,
        attackRange: sStats.attackRange, sightRange: sStats.sightRange,
        speed: sStats.speed, charisma: sStats.charisma,
        armor: sStats.armorWood, capacity: sStats.capacity,
      },
    });
    engine.entities.add(spitter);

    for (let t = 0; t < 30; t++) engine.stepTick(t, t * 16);
    expect(spitter.state.kind).toBe("idle");
    expect(il.stats.hp).toBe(il.stats.maxHp);
  });

  it("auto-aggro skips a disguised enemy not in detector set", () => {
    const engine = makeEngine();

    // Robot infiltration platform disguises as an evoker, parks next to a wizard
    // evoker. No detector on the wizard side — wizard auto-aggro must ignore.
    const open = findOpenTile(engine, { x: 10, y: 10 });
    const inf = spawnInfiltrator(engine, open);
    engine.issueDisguise(inf.id, "evoker");

    const eStats = wizardUnitStats.evoker!;
    const wizardShooter = new UnitEntity({
      faction: "wizards",
      typeKey: "evoker",
      position: { x: open.x + 2, y: open.y },
      stats: {
        maxHp: eStats.hp, damage: eStats.damage,
        attackRange: eStats.attackRange, sightRange: eStats.sightRange,
        speed: eStats.speed, charisma: eStats.charisma,
        armor: eStats.armor, capacity: eStats.capacity,
      },
    });
    engine.entities.add(wizardShooter);

    for (let t = 0; t < 30; t++) engine.stepTick(t, t * 16);
    expect(wizardShooter.state.kind).toBe("idle");
    expect(inf.stats.hp).toBe(inf.stats.maxHp);
  });

  it("Core attached to disguised Infiltrator does NOT leak through detection", () => {
    const engine = makeEngine();

    // Spawn infiltrator with a core "attached" (mirrors the live combined-unit state).
    const open = findOpenTile(engine, { x: 10, y: 10 });
    const inf = spawnInfiltrator(engine, open);

    const cStats = robotUnitStats.core!;
    const core = new UnitEntity({
      faction: "robots",
      typeKey: "core",
      position: { ...inf.position },
      stats: {
        maxHp: cStats.hpWood, damage: cStats.damage,
        attackRange: cStats.attackRange, sightRange: cStats.sightRange,
        speed: cStats.speed, charisma: cStats.charisma,
        armor: cStats.armorWood, capacity: cStats.capacity,
      },
    });
    engine.entities.add(core);
    core.state = { kind: "platformShell" };
    core.attachedPlatformId = inf.id;
    core.attachedPlatformTypeKey = inf.typeKey;
    inf.attachedCoreId = core.id;

    engine.issueDisguise(inf.id, "evoker");

    const eStats = wizardUnitStats.evoker!;
    const wizardShooter = new UnitEntity({
      faction: "wizards",
      typeKey: "evoker",
      position: { x: open.x + 2, y: open.y },
      stats: {
        maxHp: eStats.hp, damage: eStats.damage,
        attackRange: eStats.attackRange, sightRange: eStats.sightRange,
        speed: eStats.speed, charisma: eStats.charisma,
        armor: eStats.armor, capacity: eStats.capacity,
      },
    });
    engine.entities.add(wizardShooter);

    for (let t = 0; t < 30; t++) engine.stepTick(t, t * 16);
    expect(wizardShooter.state.kind).toBe("idle");
    expect(inf.stats.hp).toBe(inf.stats.maxHp);
    expect(core.stats.hp).toBe(core.stats.maxHp);
  });

  it("enchantress within range reveals the Core-driven disguise", () => {
    const engine = makeEngine();

    const open = findOpenTile(engine, { x: 10, y: 10 });
    const inf = spawnInfiltrator(engine, open);
    engine.issueDisguise(inf.id, "evoker");

    // Enchantress detector within sightRange.
    const enStats = wizardUnitStats.enchantress!;
    const enchantress = new UnitEntity({
      faction: "wizards",
      typeKey: "enchantress",
      position: { x: open.x + 3, y: open.y },
      stats: {
        maxHp: enStats.hp, damage: enStats.damage,
        attackRange: enStats.attackRange, sightRange: enStats.sightRange,
        speed: enStats.speed, charisma: enStats.charisma,
        armor: enStats.armor, capacity: enStats.capacity,
      },
    });
    engine.entities.add(enchantress);

    // Nearby Evoker that should now auto-aggro once the detector reveals the infiltrator.
    const eStats = wizardUnitStats.evoker!;
    const attacker = new UnitEntity({
      faction: "wizards",
      typeKey: "evoker",
      position: { x: open.x + 2, y: open.y },
      stats: {
        maxHp: eStats.hp, damage: eStats.damage,
        attackRange: eStats.attackRange, sightRange: eStats.sightRange,
        speed: eStats.speed, charisma: eStats.charisma,
        armor: eStats.armor, capacity: eStats.capacity,
      },
    });
    engine.entities.add(attacker);

    for (let t = 0; t < 30; t++) engine.stepTick(t, t * 16);
    // Attacker should have engaged once the enchantress's detector set kicked in.
    expect(inf.stats.hp).toBeLessThan(inf.stats.maxHp);
  });

  it("0-damage units (workers, civilians, healers) refuse attack orders + skip auto-aggro", () => {
    const engine = makeEngine();
    const cleric = wizardUnitStats.cleric!;
    const healer = new UnitEntity({
      faction: "wizards",
      typeKey: "cleric",
      position: { x: 10, y: 10 },
      stats: {
        maxHp: cleric.hp, damage: cleric.damage, // 0
        attackRange: cleric.attackRange, sightRange: cleric.sightRange,
        speed: cleric.speed, charisma: cleric.charisma,
        armor: cleric.armor, capacity: cleric.capacity,
      },
    });
    engine.entities.add(healer);

    const sStats = robotUnitStats.spitterPlatform!;
    const enemy = new UnitEntity({
      faction: "robots",
      typeKey: "spitterPlatform",
      position: { x: 11, y: 10 },
      stats: {
        maxHp: sStats.hpWood, damage: sStats.damage,
        attackRange: sStats.attackRange, sightRange: sStats.sightRange,
        speed: sStats.speed, charisma: sStats.charisma,
        armor: sStats.armorWood, capacity: sStats.capacity,
      },
    });
    engine.entities.add(enemy);

    // Manual attack order should be rejected outright.
    engine.issueAttackOrder(healer.id, enemy.id);
    expect(healer.state.kind).toBe("idle");

    // Auto-aggro also skips over the 0-damage unit.
    for (let t = 0; t < 30; t++) engine.stepTick(t, t * 16);
    expect(healer.state.kind === "attacking").toBe(false);
  });

  it("manually issued attack against invisible enemy drops to idle", () => {
    const engine = makeEngine();
    engine.grantResearch("wizards", "invisibility");
    engine.getResources("wizards").mana = 200;

    const open = findOpenTile(engine, { x: 10, y: 10 });
    const il = spawnIllusionist(engine, open);
    engine.issueInvisibilityToggle(il.id);

    const sStats = robotUnitStats.spitterPlatform!;
    const spitter = new UnitEntity({
      faction: "robots",
      typeKey: "spitterPlatform",
      position: { x: open.x + 1, y: open.y },
      stats: {
        maxHp: sStats.hpWood, damage: sStats.damage,
        attackRange: sStats.attackRange, sightRange: sStats.sightRange,
        speed: sStats.speed, charisma: sStats.charisma,
        armor: sStats.armorWood, capacity: sStats.capacity,
      },
    });
    engine.entities.add(spitter);

    engine.issueAttackOrder(spitter.id, il.id);
    engine.stepTick(0, 0);
    expect(spitter.state.kind).toBe("idle");
    expect(il.stats.hp).toBe(il.stats.maxHp);
  });
});
