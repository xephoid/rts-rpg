import { describe, it, expect } from "vitest";
import { GameEngine } from "./GameEngine.js";
import { UnitEntity } from "./entities/UnitEntity.js";
import {
  robotUnitStats,
  wizardUnitStats,
  namedLeaders,
  convertConfig,
} from "@neither/shared";

function spawnSubject(engine: GameEngine, faction: "wizards" | "robots", pos: { x: number; y: number }): UnitEntity {
  const s = wizardUnitStats.subject!;
  const u = new UnitEntity({
    faction,
    typeKey: "subject",
    position: pos,
    stats: {
      maxHp: s.hp, damage: s.damage,
      attackRange: s.attackRange, sightRange: s.sightRange,
      speed: s.speed, charisma: s.charisma * 10, // inflate so charisma check passes reliably
      armor: s.armor, capacity: s.capacity,
    },
  });
  engine.entities.add(u);
  return u;
}

function spawnCore(engine: GameEngine, faction: "wizards" | "robots", pos: { x: number; y: number }): UnitEntity {
  const c = robotUnitStats.core!;
  const u = new UnitEntity({
    faction,
    typeKey: "core",
    position: pos,
    stats: {
      maxHp: c.hpWood, damage: c.damage,
      attackRange: c.attackRange, sightRange: c.sightRange,
      speed: c.speed, charisma: c.charisma,
      armor: c.armorWood, capacity: c.capacity,
    },
  });
  engine.entities.add(u);
  return u;
}

describe("Convert action", () => {
  it("Subject adjacent to enemy Core flips target faction after baseDurationTicks", () => {
    const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });
    const subject = spawnSubject(engine, "wizards", { x: 30, y: 30 });
    const core = spawnCore(engine, "robots", { x: 31, y: 30 });

    engine.issueConvertOrder(subject.id, core.id);
    expect(subject.state.kind).toBe("converting");

    // Run enough ticks to elapse the full duration.
    for (let t = 0; t < convertConfig.baseDurationTicks + 5; t++) engine.stepTick(t, t * 16);

    expect(core.faction).toBe("wizards");
    expect(subject.state.kind).toBe("idle");
  });

  it("caster's originalFaction is preserved on the converted target for future revert", () => {
    const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });
    const subject = spawnSubject(engine, "wizards", { x: 30, y: 30 });
    const core = spawnCore(engine, "robots", { x: 31, y: 30 });

    engine.issueConvertOrder(subject.id, core.id);
    for (let t = 0; t < convertConfig.baseDurationTicks + 5; t++) engine.stepTick(t, t * 16);

    expect(core.originalFaction).toBe("robots");
  });

  it("convert is interrupted when caster moves — target stays on original faction", () => {
    const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });
    const subject = spawnSubject(engine, "wizards", { x: 30, y: 30 });
    const core = spawnCore(engine, "robots", { x: 31, y: 30 });

    engine.issueConvertOrder(subject.id, core.id);
    engine.stepTick(0, 0);
    // Move order — overwrites converting state cleanly.
    engine.issueMoveOrder(subject.id, { x: 40, y: 40 });

    for (let t = 1; t < convertConfig.baseDurationTicks + 5; t++) engine.stepTick(t, t * 16);

    expect(core.faction).toBe("robots");
    expect(subject.state.kind).not.toBe("converting");
  });

  it("leader targets are immune — issueConvertOrder rejects", () => {
    const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });
    const subject = spawnSubject(engine, "wizards", { x: 30, y: 30 });

    // Spawn the enemy leader adjacent.
    const motherboardStats = robotUnitStats[namedLeaders.robots.typeKey]!;
    const motherboard = new UnitEntity({
      faction: "robots",
      typeKey: namedLeaders.robots.typeKey,
      position: { x: 31, y: 30 },
      stats: {
        maxHp: motherboardStats.hpWood, damage: motherboardStats.damage,
        attackRange: motherboardStats.attackRange, sightRange: motherboardStats.sightRange,
        speed: motherboardStats.speed, charisma: motherboardStats.charisma,
        armor: motherboardStats.armorWood, capacity: motherboardStats.capacity,
      },
      isNamed: true,
      name: namedLeaders.robots.name,
      cannotBeConverted: motherboardStats.cannotBeConverted ?? true,
    });
    engine.entities.add(motherboard);

    engine.issueConvertOrder(subject.id, motherboard.id);
    expect(subject.state.kind).toBe("idle"); // order rejected
  });

  it("non-caster unit typeKeys cannot issue convert — rejects", () => {
    const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });

    // Evoker is combat, not in CONVERT_CASTER_TYPES.
    const eStats = wizardUnitStats.evoker!;
    const evoker = new UnitEntity({
      faction: "wizards",
      typeKey: "evoker",
      position: { x: 30, y: 30 },
      stats: {
        maxHp: eStats.hp, damage: eStats.damage,
        attackRange: eStats.attackRange, sightRange: eStats.sightRange,
        speed: eStats.speed, charisma: eStats.charisma,
        armor: eStats.armor, capacity: eStats.capacity,
      },
    });
    engine.entities.add(evoker);
    const core = spawnCore(engine, "robots", { x: 31, y: 30 });

    engine.issueConvertOrder(evoker.id, core.id);
    expect(evoker.state.kind).toBe("idle");
  });

  it("too-far caster cannot issue convert", () => {
    const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });
    const subject = spawnSubject(engine, "wizards", { x: 30, y: 30 });
    const core = spawnCore(engine, "robots", { x: 35, y: 30 }); // 5 tiles away — well past adjacencyRangeTiles

    engine.issueConvertOrder(subject.id, core.id);
    expect(subject.state.kind).toBe("idle");
  });

  it("target death during convert breaks the attempt — caster returns to idle", () => {
    const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });
    const subject = spawnSubject(engine, "wizards", { x: 30, y: 30 });
    const core = spawnCore(engine, "robots", { x: 31, y: 30 });

    engine.issueConvertOrder(subject.id, core.id);
    engine.stepTick(0, 0);
    core.stats.hp = 0;
    engine.stepTick(1, 16);

    expect(subject.state.kind).toBe("idle");
  });
});
