import { describe, it, expect } from "vitest";
import { GameEngine } from "../GameEngine.js";
import type { Faction } from "@neither/shared";

/**
 * End-to-end check that the AI's research-priority pass actually fires against
 * an operational home. The engine ticks with a playerFaction of "wizards" so the
 * opposing robot faction is handed to `MilitaryAI`.
 */
describe("MilitaryAI research priority", () => {
  it("robot AI starts researching woodToMetal once home + resources are ready", () => {
    let lastCompleted: string[] = [];
    const engine = new GameEngine({
      mapSize: "small",
      seed: 1,
      playerFaction: "wizards",
      onTick: (s) => { lastCompleted = s.completedResearch.robots; },
    });

    // Front-load the AI so cost + buffer passes immediately. Without this the AI
    // waits on gatherer output and the test has to run through minutes of ticks.
    engine.getResources("robots").wood = 500;
    engine.getResources("robots").water = 500;

    // AI needs the home to drain its production queue before it can kick off
    // research (engine gates research to `state.kind === "operational"`). Enough
    // ticks for a few production cycles + gaps.
    for (let t = 0; t < 3000; t++) engine.stepTick(t, t * 16);

    const researching = engine.entities.buildingsByFaction("robots").some(
      (b) => b.state.kind === "researching" && b.state.researchKey === "woodToMetal",
    );
    expect(researching || lastCompleted.includes("woodToMetal")).toBe(true);
  });
});

/**
 * Regression: f3-f6 AI slots used species-mismatched building stats during
 * build-site validation, so those factions could never place anything beyond
 * their starting home/castle. They gathered resources but otherwise stalled.
 * This test runs a 4-faction medium match and asserts every AI slot grows its
 * base past the single starting building within 3000 ticks.
 */
describe("MilitaryAI — N-faction expansion", () => {
  it("every AI faction in a medium match builds at least one new building", { timeout: 20_000 }, () => {
    let snapshot: { activeFactions: readonly Faction[] } | null = null;
    const engine = new GameEngine({
      mapSize: "medium",
      seed: 1,
      playerFaction: "wizards",
      onTick: (s) => { snapshot = s; },
    });

    // Front-load resources for every AI faction so build-site failures aren't
    // masked by "no wood" throttles.
    for (const f of ["robots", "f3", "f4"] as const) {
      engine.getResources(f).wood = 1000;
      engine.getResources(f).water = 1000;
    }

    // 5000 ticks (~83s sim time) is enough for Core production to drain + a
    // builder kit to attach + combatFrameProduction to land under construction.
    for (let t = 0; t < 5000; t++) engine.stepTick(t, t * 16);

    const active = (snapshot as { activeFactions: readonly Faction[] } | null)?.activeFactions ?? [];
    const aiSlots = active.filter((f) => f !== "wizards");
    expect(aiSlots.length).toBeGreaterThan(1); // sanity — medium should have 3 AI slots

    for (const f of aiSlots) {
      const buildings = engine.entities.buildingsByFaction(f);
      // Starting build-out gives 1 building (castle/home). If the AI ever
      // placed anything (under construction or finished), count is ≥ 2.
      expect(buildings.length, `faction ${f} never built past its starting base`).toBeGreaterThan(1);
    }
  });
});
