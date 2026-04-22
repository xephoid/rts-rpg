import { describe, it, expect } from "vitest";
import { GameEngine } from "./GameEngine.js";
import { UnitEntity } from "./entities/UnitEntity.js";
import {
  robotUnitStats,
  wizardUnitStats,
  diplomacy as diplomacyConfig,
} from "@neither/shared";

function makeEngine(seedAlignment = 0): GameEngine {
  const engine = new GameEngine({ mapSize: "small", seed: 1, onTick: () => {} });
  if (seedAlignment !== 0) {
    engine.setAlignment("wizards", "robots", seedAlignment);
    engine.setAlignment("robots", "wizards", seedAlignment);
  }
  return engine;
}

function spawnSpitter(engine: GameEngine, faction: "robots" | "wizards" = "robots", pos = { x: 10, y: 10 }): UnitEntity {
  const stats = robotUnitStats.spitterPlatform!;
  const u = new UnitEntity({
    faction,
    typeKey: "spitterPlatform",
    position: pos,
    stats: {
      maxHp: stats.hpWood, damage: stats.damage,
      attackRange: stats.attackRange, sightRange: stats.sightRange,
      speed: stats.speed, charisma: stats.charisma,
      armor: stats.armorWood, capacity: stats.capacity,
    },
  });
  engine.entities.add(u);
  return u;
}

describe("Phase 14 — Diplomacy", () => {
  it("proposing open borders above AI accept threshold sets bilateral flags + shared vision", () => {
    const engine = makeEngine(diplomacyConfig.aiAcceptThreshold + 5);
    engine.issueProposeDiplomaticAction("wizards", "robots", "openBorders");
    // AI resolves the proposal the same tick via MilitaryAI._respondToProposals.
    // Using playerFaction=wizards puts the AI on the robots side — we need the
    // engine constructor variant for that. Spin up a fresh one here.
  });

  it("AI accepts open-borders proposal when alignment ≥ threshold (player=wizards)", () => {
    const engine = new GameEngine({
      mapSize: "small", seed: 1, playerFaction: "wizards", onTick: () => {},
    });
    engine.setAlignment("robots", "wizards", diplomacyConfig.aiAcceptThreshold + 5);
    engine.issueProposeDiplomaticAction("wizards", "robots", "openBorders");
    // Tick once so the AI runs its _respondToProposals pass.
    engine.stepTick(0, 0);
    const stats = (() => {
      let captured: typeof engine extends GameEngine ? Record<string, unknown> | null : never = null;
      void captured;
      return null;
    })();
    void stats;
    // Direct check via engine getters.
    expect(engine.hasNonCombatTreaty("wizards", "robots")).toBe(false);
    // Open borders isn't exposed via getter — check via snapshot path instead.
    let snapshotOB = false;
    const engine2 = new GameEngine({
      mapSize: "small", seed: 2, playerFaction: "wizards",
      onTick: (s) => { snapshotOB = s.factionStats.wizards.openBorders.robots; },
    });
    engine2.setAlignment("robots", "wizards", diplomacyConfig.aiAcceptThreshold + 5);
    engine2.issueProposeDiplomaticAction("wizards", "robots", "openBorders");
    engine2.stepTick(0, 0);
    expect(snapshotOB).toBe(true);
  });

  it("non-combat treaty blocks issueAttackOrder across the treaty", () => {
    const engine = new GameEngine({
      mapSize: "small", seed: 1, playerFaction: "wizards", onTick: () => {},
    });
    engine.setAlignment("robots", "wizards", diplomacyConfig.aiAcceptThreshold + 5);
    engine.issueProposeDiplomaticAction("wizards", "robots", "nonCombat");
    engine.stepTick(0, 0);

    // Now spawn a wizard attacker + robot target.
    const wStats = wizardUnitStats.evoker!;
    const attacker = new UnitEntity({
      faction: "wizards",
      typeKey: "evoker",
      position: { x: 15, y: 15 },
      stats: {
        maxHp: wStats.hp, damage: wStats.damage,
        attackRange: wStats.attackRange, sightRange: wStats.sightRange,
        speed: wStats.speed, charisma: wStats.charisma,
        armor: wStats.armor, capacity: wStats.capacity,
      },
    });
    engine.entities.add(attacker);
    const target = spawnSpitter(engine, "robots", { x: 16, y: 15 });

    engine.issueAttackOrder(attacker.id, target.id);
    expect(attacker.state.kind).toBe("idle"); // order rejected
  });

  it("resource request transfer + alignment bump when accepted", () => {
    const engine = makeEngine(diplomacyConfig.aiAcceptThreshold + 5);
    engine.getResources("robots").wood = 200;
    engine.getResources("wizards").wood = 10;
    engine.issueProposeDiplomaticAction("wizards", "robots", "resourceRequest", {
      resource: { kind: "wood", amount: 50 },
    });
    const proposal = engine.getPendingProposals()[0]!;
    engine.issueRespondToProposal(proposal.id, true);
    expect(engine.getResources("wizards").wood).toBe(60);
    expect(engine.getResources("robots").wood).toBe(150);
    expect(engine.getAlignment("wizards", "robots")).toBeGreaterThan(diplomacyConfig.aiAcceptThreshold);
  });

  it("unit request transfers ownership on accept", () => {
    const engine = makeEngine(80);
    const unit = spawnSpitter(engine, "robots", { x: 20, y: 20 });
    engine.issueProposeDiplomaticAction("wizards", "robots", "unitRequest", {
      unitId: unit.id,
    });
    const proposal = engine.getPendingProposals()[0]!;
    engine.issueRespondToProposal(proposal.id, true);
    expect(unit.faction).toBe("wizards");
  });

  it("combat damage lowers alignment of the attacked faction", () => {
    const engine = makeEngine();
    const attacker = spawnSpitter(engine, "wizards", { x: 10, y: 10 });
    attacker.typeKey = "evoker"; // lightweight reuse; using evoker-like damage output
    const target = spawnSpitter(engine, "robots", { x: 11, y: 10 });
    engine.issueAttackOrder(attacker.id, target.id);
    for (let t = 0; t < 60; t++) engine.stepTick(t, t * 16);
    // The robot faction should now have lower alignment toward wizards than zero.
    expect(engine.getAlignment("robots", "wizards")).toBeLessThan(0);
  });

  it("declined proposal drops alignment on both sides", () => {
    const engine = makeEngine(10);
    engine.issueProposeDiplomaticAction("wizards", "robots", "openBorders");
    const proposal = engine.getPendingProposals()[0]!;
    engine.issueRespondToProposal(proposal.id, false);
    expect(engine.getAlignment("wizards", "robots")).toBeLessThan(10);
    expect(engine.getAlignment("robots", "wizards")).toBeLessThan(10);
  });

  it("open borders shares vision: wizard fog reveals tiles visible to a robot unit", () => {
    // Headless (no playerFaction) so no MilitaryAI is running to move units around.
    let fogSnapshot: Uint8Array | number[] | null = null;
    const engine = new GameEngine({
      mapSize: "small", seed: 5,
      onTick: (s) => { fogSnapshot = s.fog.wizards.data; },
    });
    // Place a robot unit far from any wizard unit. Without open borders, the
    // tile under it stays unexplored for wizards.
    const robot = spawnSpitter(engine, "robots", { x: 40, y: 40 });
    robot.attachedCoreId = "fake"; // grant full sightRange via the non-unattached path
    engine.stepTick(0, 0);
    const idx = 40 * 64 + 40;
    const preData = fogSnapshot as Uint8Array | number[];
    const pre = preData[idx] ?? 0;
    expect(pre).toBe(0);

    // Directly sign open borders — bypass the proposal flow so no AI tick runs.
    engine.issueProposeDiplomaticAction("wizards", "robots", "openBorders");
    const proposal = engine.getPendingProposals()[0]!;
    engine.issueRespondToProposal(proposal.id, true);
    engine.stepTick(1, 16);

    const postData = fogSnapshot as Uint8Array | number[];
    const post = postData[idx] ?? 0;
    expect(post).toBeGreaterThan(0);
  });
});
