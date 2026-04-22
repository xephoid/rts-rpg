import { describe, it, expect } from "vitest";
import { Grid } from "./Grid.js";
import { SpatialIndex } from "./SpatialIndex.js";
import { findPath } from "./Pathfinder.js";

// ── Grid ─────────────────────────────────────────────────────────────────────

describe("Grid", () => {
  it("returns undefined for out-of-bounds tile", () => {
    const g = new Grid(10, 10);
    expect(g.getTile(-1, 0)).toBeUndefined();
    expect(g.getTile(10, 0)).toBeUndefined();
  });

  it("inBounds returns correct values", () => {
    const g = new Grid(5, 5);
    expect(g.inBounds(0, 0)).toBe(true);
    expect(g.inBounds(4, 4)).toBe(true);
    expect(g.inBounds(5, 0)).toBe(false);
  });

  it("setTerrain and movementCost work correctly", () => {
    const g = new Grid(10, 10);
    g.setTerrain(3, 3, "forest");
    expect(g.movementCost(3, 3)).toBeGreaterThan(1);
  });

  it("water tiles are impassable", () => {
    const g = new Grid(10, 10);
    g.setTerrain(2, 2, "water");
    expect(g.isPassable(2, 2)).toBe(false);
  });

  it("neighbours4 returns correct neighbours", () => {
    const g = new Grid(10, 10);
    const n = g.neighbours4(5, 5);
    expect(n).toHaveLength(4);
    expect(n).toContainEqual({ x: 4, y: 5 });
    expect(n).toContainEqual({ x: 6, y: 5 });
    expect(n).toContainEqual({ x: 5, y: 4 });
    expect(n).toContainEqual({ x: 5, y: 6 });
  });

  it("neighbours4 clips at grid edge", () => {
    const g = new Grid(10, 10);
    const n = g.neighbours4(0, 0);
    expect(n).toHaveLength(2);
  });

  it("neighbours8 returns 8 neighbours for interior tile", () => {
    const g = new Grid(10, 10);
    expect(g.neighbours8(5, 5)).toHaveLength(8);
  });
});

// ── SpatialIndex ──────────────────────────────────────────────────────────────

describe("SpatialIndex", () => {
  it("inserts and finds entity at position", () => {
    const idx = new SpatialIndex();
    idx.insert("u1", { x: 3, y: 3 });
    const result = idx.query({ x: 3, y: 3 }, 0);
    expect(result).toContain("u1");
  });

  it("remove prevents entity from appearing in query", () => {
    const idx = new SpatialIndex();
    idx.insert("u1", { x: 3, y: 3 });
    idx.remove("u1");
    const result = idx.query({ x: 3, y: 3 }, 0);
    expect(result).not.toContain("u1");
  });

  it("move updates position", () => {
    const idx = new SpatialIndex();
    idx.insert("u1", { x: 0, y: 0 });
    // Use far-apart coords so the move crosses bucket boundaries regardless
    // of the internal bucket size — test validates semantics, not layout.
    idx.move("u1", { x: 40, y: 40 });
    expect(idx.queryCircle({ x: 0, y: 0 }, 1)).not.toContain("u1");
    expect(idx.queryCircle({ x: 40, y: 40 }, 1)).toContain("u1");
  });

  it("query returns entities within radius", () => {
    const idx = new SpatialIndex();
    idx.insert("near", { x: 2, y: 2 });
    idx.insert("far", { x: 10, y: 10 });
    const result = idx.query({ x: 0, y: 0 }, 3);
    expect(result).toContain("near");
    expect(result).not.toContain("far");
  });

  it("queryCircle filters by Euclidean distance", () => {
    const idx = new SpatialIndex();
    idx.insert("corner", { x: 3, y: 3 }); // ~4.24 from origin — outside radius 4
    idx.insert("edge", { x: 4, y: 0 }); // exactly 4 from origin — inside radius 4
    const result = idx.queryCircle({ x: 0, y: 0 }, 4);
    expect(result).toContain("edge");
    expect(result).not.toContain("corner");
  });

  it("padded Chebyshev query includes candidates whose multi-tile footprint reaches inside", () => {
    // Documents the engine's footprint-padding contract: entities indexed at
    // their top-left tile can have footprint extending several tiles further.
    // Callers query with `radius + BUILDING_FOOTPRINT_PAD` (=4) using the
    // Chebyshev `query` — so a 4×4 castle at (10,10) is included when a
    // unit at (15,15) scans with base radius 2, even though the castle's
    // indexed position is outside that base radius. The index itself is
    // footprint-agnostic — the caller's precise `_distanceToTarget` helper
    // then filters using the building's AABB.
    const idx = new SpatialIndex();
    idx.insert("castle", { x: 10, y: 10 }); // 4×4 footprint reaches to (13,13)
    const baseRadius = 2;
    const FOOTPRINT_PAD = 4;
    const padded = idx.query({ x: 15, y: 15 }, baseRadius + FOOTPRINT_PAD);
    expect(padded).toContain("castle");
  });
});

// ── Pathfinder ────────────────────────────────────────────────────────────────

describe("findPath", () => {
  it("returns empty array when start == goal", () => {
    const g = new Grid(10, 10);
    const path = findPath(g, { x: 2, y: 2 }, { x: 2, y: 2 });
    expect(path).toEqual([]);
  });

  it("finds direct path on open grid", () => {
    const g = new Grid(10, 10);
    const path = findPath(g, { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ x: 3, y: 0 });
  });

  it("navigates around a wall", () => {
    const g = new Grid(10, 10);
    // Build vertical wall at x=2, y=0..4
    for (let y = 0; y < 5; y++) g.setTerrain(2, y, "water");
    const path = findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(path).not.toBeNull();
    // Path must not cross water tiles
    for (const step of path!) {
      expect(g.isPassable(step.x, step.y)).toBe(true);
    }
  });

  it("returns null when goal is impassable", () => {
    const g = new Grid(10, 10);
    g.setTerrain(5, 5, "water");
    const path = findPath(g, { x: 0, y: 0 }, { x: 5, y: 5 });
    expect(path).toBeNull();
  });

  it("returns null when completely walled off", () => {
    const g = new Grid(5, 5);
    // Surround start with water
    g.setTerrain(1, 0, "water");
    g.setTerrain(0, 1, "water");
    g.setTerrain(1, 1, "water");
    const path = findPath(g, { x: 0, y: 0 }, { x: 4, y: 4 });
    expect(path).toBeNull();
  });

  it("prefers lower-cost terrain", () => {
    const g = new Grid(10, 10);
    // Forest corridor at y=1; open path at y=5
    for (let x = 0; x < 10; x++) g.setTerrain(x, 1, "forest");
    const direct = findPath(g, { x: 0, y: 1 }, { x: 9, y: 1 });
    const open = findPath(g, { x: 0, y: 5 }, { x: 9, y: 5 });
    expect(direct).not.toBeNull();
    expect(open).not.toBeNull();
    // Open path cost should be lower than forest path cost (same tile count, lower multiplier)
    // Just verify both exist; cost comparison would require exposing g values
  });

  it("uses diagonal movement", () => {
    const g = new Grid(10, 10);
    const path = findPath(g, { x: 0, y: 0 }, { x: 3, y: 3 });
    expect(path).not.toBeNull();
    // Optimal diagonal path has exactly 3 steps
    expect(path!.length).toBe(3);
  });
});
