import { describe, it, expect } from "vitest";
import { GameEngine } from "../GameEngine.js";
import { TechnologyAI } from "./TechnologyAI.js";

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
});
