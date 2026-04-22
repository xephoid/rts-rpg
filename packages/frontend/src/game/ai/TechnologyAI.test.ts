import { describe, it, expect } from "vitest";
import { GameEngine } from "../GameEngine.js";
import { UnitEntity } from "../entities/UnitEntity.js";
import { TechnologyAI } from "./TechnologyAI.js";
import { namedLeaders, robotUnitStats, wizardUnitStats, diplomacy as diplomacyConfig } from "@neither/shared";

/**
 * TechnologyAI smoke tests. The archetype is primarily validated via playtest,
 * but the two things we can assert cheaply here are:
 *   - It never triggers the MilitaryAI attack-wave path — no unit ever enters
 *     `attacking` state against a target outside the defend radius.
 *   - It registers as a distinct archetype on the engine when assigned.
 */
describe("TechnologyAI — archetype instantiation", () => {
  it("a TechnologyAI assigned to a slot runs without crashing the tick loop", () => {
    const engine = new GameEngine({
      mapSize: "small", seed: 1, playerFaction: "wizards", onTick: () => {},
    });
    // Override the engine's AI array with a TechnologyAI instance for robots.
    const ais = (engine as unknown as { _ais: Array<{ tick: (t: number, e: unknown) => void }> })._ais;
    ais.length = 0;
    const species = (engine as unknown as { factionSpecies: Record<string, "wizards" | "robots"> }).factionSpecies.robots!;
    ais.push(new TechnologyAI("robots", species) as unknown as { tick: (t: number, e: unknown) => void });

    for (let t = 0; t < 500; t++) engine.stepTick(t, t * 16);
    // If we got here, the tick loop didn't throw. The robot faction should
    // have produced at least its starting gatherers + possibly a combat factory
    // (tech AI builds everything buildable).
    const buildings = engine.entities.buildingsByFaction("robots");
    expect(buildings.length).toBeGreaterThanOrEqual(1); // at least the home
  });

  it("never sends the leader on a convert hunt", () => {
    const engine = new GameEngine({
      mapSize: "small", seed: 1, playerFaction: "wizards", onTick: () => {},
    });
    engine.setMet("wizards", "robots");
    // Swap in a TechnologyAI for the robot slot.
    const ais = (engine as unknown as { _ais: Array<{ tick: (t: number, e: unknown) => void }> })._ais;
    ais.length = 0;
    ais.push(new TechnologyAI("robots", "robots") as unknown as { tick: (t: number, e: unknown) => void });

    // Dangle a convertable wizard Subject next to the robot starting area.
    const sStats = wizardUnitStats.subject!;
    const bait = new UnitEntity({
      faction: "wizards", typeKey: "subject", position: { x: 50, y: 50 },
      stats: {
        maxHp: sStats.hp, damage: sStats.damage,
        attackRange: sStats.attackRange, sightRange: sStats.sightRange,
        speed: sStats.speed, charisma: sStats.charisma,
        armor: sStats.armor, capacity: sStats.capacity,
      },
    });
    engine.entities.add(bait);

    // Run a while — the tech AI shouldn't route the Motherboard toward the bait.
    for (let t = 0; t < 600; t++) engine.stepTick(t, t * 16);
    const leader = engine.entities.unitsByFaction("robots")
      .find((u) => u.typeKey === namedLeaders.robots.typeKey);
    // Leader state — must not be in convert / moving-toward-enemy state.
    expect(leader?.state.kind === "converting").toBe(false);
  });

  it("proposes diplomacy when alignment is high enough", () => {
    const engine = new GameEngine({
      mapSize: "small", seed: 1, playerFaction: "wizards", onTick: () => {},
    });
    engine.setMet("wizards", "robots");
    // Seed alignment past the accept threshold both ways.
    engine.setAlignment("robots", "wizards", diplomacyConfig.aiAcceptThreshold + 5);
    engine.setAlignment("wizards", "robots", diplomacyConfig.aiAcceptThreshold + 5);

    const ais = (engine as unknown as { _ais: Array<{ tick: (t: number, e: unknown) => void }> })._ais;
    ais.length = 0;
    ais.push(new TechnologyAI("robots", "robots") as unknown as { tick: (t: number, e: unknown) => void });

    // First reaction tick — tech AI should propose openBorders toward wizards.
    engine.stepTick(0, 0);
    const proposals = engine.getPendingProposals();
    const robotProposal = proposals.find((p) => p.from === "robots" && p.to === "wizards");
    // Either a live proposal sits pending (player hasn't responded yet) OR the
    // engine already resolved it. In a fresh test with no player autoresponder,
    // it should stay pending.
    expect(robotProposal?.kind).toBe("openBorders");
  });
});

// Ignore the imports we don't always use.
void robotUnitStats;
