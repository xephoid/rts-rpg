import { describe, it, expect } from "vitest";
import { generateMap } from "./MapGenerator.js";
import { Grid } from "../spatial/Grid.js";
import { mapSizes } from "@neither/shared";

function makeGrid(size: "small" | "medium" | "large" = "small"): Grid {
  const { widthTiles: W, heightTiles: H } = mapSizes[size];
  return new Grid(W, H);
}

describe("generateMap", () => {
  it("produces a deterministic map from the same seed", () => {
    const g1 = makeGrid();
    const g2 = makeGrid();
    generateMap(g1, { size: "small", seed: 42 });
    generateMap(g2, { size: "small", seed: 42 });

    const s1 = g1.toSnapshots();
    const s2 = g2.toSnapshots();
    expect(s1).toEqual(s2);
  });

  it("produces different maps for different seeds", () => {
    const g1 = makeGrid();
    const g2 = makeGrid();
    generateMap(g1, { size: "small", seed: 1 });
    generateMap(g2, { size: "small", seed: 999 });

    const s1 = g1.toSnapshots();
    const s2 = g2.toSnapshots();
    const diff = s1.filter((t, i) => t.terrain !== s2[i]?.terrain);
    expect(diff.length).toBeGreaterThan(0);
  });

  it("all tiles are set to a valid terrain type", () => {
    const grid = makeGrid();
    generateMap(grid, { size: "small", seed: 7 });

    const valid = new Set(["open", "forest", "water"]);
    for (const tile of grid.toSnapshots()) {
      expect(valid.has(tile.terrain)).toBe(true);
    }
  });

  it("map has all three terrain types present", () => {
    const grid = makeGrid();
    generateMap(grid, { size: "small", seed: 12 });

    const types = new Set(grid.toSnapshots().map((t) => t.terrain));
    expect(types.has("open")).toBe(true);
    expect(types.has("forest")).toBe(true);
    expect(types.has("water")).toBe(true);
  });

  it("returns exactly factionCount starting positions", () => {
    const grid = makeGrid();
    const { startingPositions } = generateMap(grid, { size: "small", seed: 5, factionCount: 2 });
    expect(startingPositions).toHaveLength(2);
  });

  it("starting positions are on passable tiles", () => {
    const grid = makeGrid();
    const { startingPositions } = generateMap(grid, { size: "small", seed: 42 });
    for (const pos of startingPositions) {
      expect(grid.isPassable(pos.x, pos.y)).toBe(true);
    }
  });

  it("starting positions are distinct", () => {
    const grid = makeGrid();
    const { startingPositions } = generateMap(grid, { size: "small", seed: 42, factionCount: 2 });
    const [a, b] = startingPositions;
    expect(a!.x !== b!.x || a!.y !== b!.y).toBe(true);
  });

  it("starting positions are spread apart (distance > 20% of map width)", () => {
    const grid = makeGrid();
    const { widthTiles } = mapSizes["small"];
    const { startingPositions } = generateMap(grid, { size: "small", seed: 42, factionCount: 2 });
    const [a, b] = startingPositions;
    const dx = a!.x - b!.x;
    const dy = a!.y - b!.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeGreaterThan(widthTiles * 0.2);
  });

  it("wood deposits are placed on forest tiles", () => {
    const grid = makeGrid();
    const { deposits } = generateMap(grid, { size: "small", seed: 42 });
    const woodDeposits = deposits.filter((d) => d.kind === "wood");
    for (const dep of woodDeposits) {
      const tile = grid.getTile(dep.position.x, dep.position.y);
      expect(tile?.terrain).toBe("forest");
    }
  });

  it("wood deposits have the fixed configured quantity", () => {
    const grid = makeGrid();
    const { deposits } = generateMap(grid, { size: "small", seed: 42 });
    const woodDeposits = deposits.filter((d) => d.kind === "wood");
    expect(woodDeposits.length).toBeGreaterThan(0);
    for (const dep of woodDeposits) {
      expect(dep.quantity).toBe(250);
    }
  });

  it("every wood deposit is on a forest tile (one-per-tile model)", () => {
    const grid = makeGrid();
    const { deposits } = generateMap(grid, { size: "small", seed: 42 });
    const wood = deposits.filter((d) => d.kind === "wood");
    // All deposit positions are unique — one deposit per tile
    const positions = wood.map((d) => `${d.position.x},${d.position.y}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("all deposit IDs are unique", () => {
    const grid = makeGrid();
    const { deposits } = generateMap(grid, { size: "small", seed: 42 });
    const ids = deposits.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
