import { describe, it, expect, beforeEach } from "vitest";
import { FogOfWar, Visibility } from "./FogOfWar.js";

describe("FogOfWar", () => {
  let fog: FogOfWar;

  beforeEach(() => {
    fog = new FogOfWar(20, 20);
  });

  it("all tiles start UNEXPLORED", () => {
    expect(fog.getVisibility(0, 0)).toBe(Visibility.UNEXPLORED);
    expect(fog.getVisibility(10, 10)).toBe(Visibility.UNEXPLORED);
  });

  it("out-of-bounds returns UNEXPLORED", () => {
    expect(fog.getVisibility(-1, 0)).toBe(Visibility.UNEXPLORED);
    expect(fog.getVisibility(20, 20)).toBe(Visibility.UNEXPLORED);
  });

  it("tiles within source range become VISIBLE after update", () => {
    fog.update([{ position: { x: 10, y: 10 }, rangeTiles: 3 }]);
    expect(fog.getVisibility(10, 10)).toBe(Visibility.VISIBLE);
    expect(fog.getVisibility(12, 10)).toBe(Visibility.VISIBLE);
  });

  it("tiles outside source range remain UNEXPLORED on first tick", () => {
    fog.update([{ position: { x: 10, y: 10 }, rangeTiles: 3 }]);
    expect(fog.getVisibility(0, 0)).toBe(Visibility.UNEXPLORED);
  });

  it("VISIBLE tile becomes EXPLORED when source moves away", () => {
    fog.update([{ position: { x: 10, y: 10 }, rangeTiles: 3 }]);
    expect(fog.getVisibility(10, 10)).toBe(Visibility.VISIBLE);

    // Move source away
    fog.update([{ position: { x: 0, y: 0 }, rangeTiles: 3 }]);
    expect(fog.getVisibility(10, 10)).toBe(Visibility.EXPLORED);
  });

  it("EXPLORED tile never regresses to UNEXPLORED", () => {
    fog.update([{ position: { x: 5, y: 5 }, rangeTiles: 2 }]);
    fog.update([]); // no sources
    expect(fog.getVisibility(5, 5)).toBe(Visibility.EXPLORED);
    fog.update([]);
    expect(fog.getVisibility(5, 5)).toBe(Visibility.EXPLORED);
  });

  it("multiple sources combine vision", () => {
    fog.update([
      { position: { x: 2, y: 2 }, rangeTiles: 2 },
      { position: { x: 18, y: 18 }, rangeTiles: 2 },
    ]);
    expect(fog.getVisibility(2, 2)).toBe(Visibility.VISIBLE);
    expect(fog.getVisibility(18, 18)).toBe(Visibility.VISIBLE);
    expect(fog.getVisibility(10, 10)).toBe(Visibility.UNEXPLORED);
  });

  it("concealed sources contribute no vision", () => {
    fog.update([{ position: { x: 10, y: 10 }, rangeTiles: 5, concealed: true }]);
    expect(fog.getVisibility(10, 10)).toBe(Visibility.UNEXPLORED);
  });

  it("isVisible returns true only for VISIBLE tiles", () => {
    fog.update([{ position: { x: 5, y: 5 }, rangeTiles: 2 }]);
    expect(fog.isVisible(5, 5)).toBe(true);
    expect(fog.isVisible(0, 0)).toBe(false);
  });

  it("isExplored returns true for both VISIBLE and EXPLORED tiles", () => {
    fog.update([{ position: { x: 5, y: 5 }, rangeTiles: 2 }]);
    fog.update([]); // tile becomes EXPLORED
    expect(fog.isExplored(5, 5)).toBe(true);
    expect(fog.isExplored(0, 0)).toBe(false);
  });

  it("vision is circular, not square", () => {
    fog.update([{ position: { x: 10, y: 10 }, rangeTiles: 3 }]);
    // Corner of bounding box at distance sqrt(3²+3²) ≈ 4.24 — outside radius 3
    expect(fog.getVisibility(7, 7)).toBe(Visibility.UNEXPLORED);
    // Same-axis tile at exactly radius — inside
    expect(fog.getVisibility(13, 10)).toBe(Visibility.VISIBLE);
  });

  it("reset() clears all visibility back to UNEXPLORED", () => {
    fog.update([{ position: { x: 5, y: 5 }, rangeTiles: 3 }]);
    fog.reset();
    expect(fog.getVisibility(5, 5)).toBe(Visibility.UNEXPLORED);
    expect(fog.isExplored(5, 5)).toBe(false);
  });

  it("snapshot data length equals width * height", () => {
    const snap = fog.snapshot();
    expect(snap.data.length).toBe(snap.width * snap.height);
  });
});
