import { describe, it, expect } from "vitest";
import { GameEngine } from "../GameEngine.js";

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
