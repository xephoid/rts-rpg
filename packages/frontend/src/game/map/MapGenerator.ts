// Procedural map generator using simplex noise.
// Produces terrain, resource deposits, and faction starting positions.

import { createNoise2D } from "simplex-noise";
import type { TerrainType, Vec2 } from "@neither/shared";
import { woodDeposit, waterDeposit, mapSizes } from "@neither/shared";

// Every forest tile is a wood resource; every water tile is a water resource.
// Quantities are fixed per tile — see resourceCosts.ts for values.
import type { Grid } from "../spatial/Grid.js";

export type MapSize = "small" | "medium" | "large";

export type ResourceDeposit = {
  id: string;
  kind: "wood" | "water";
  position: Vec2;
  quantity: number;
};

export type GeneratedMap = {
  grid: Grid;
  deposits: ResourceDeposit[];
  /** Starting positions — one per playable faction slot (index 0 = faction A, 1 = faction B). */
  startingPositions: Vec2[];
};

export type MapGeneratorOptions = {
  size: MapSize;
  seed?: number | undefined;
  /** Number of playable factions needing starting positions (default 2). */
  factionCount?: number | undefined;
};

// Terrain thresholds — tuned so ~60% open, ~25% forest, ~15% water
const WATER_THRESHOLD = -0.35;
const FOREST_THRESHOLD = 0.25;
const MOUNTAIN_THRESHOLD = 0.72;

/** Seeded RNG (xorshift32) — deterministic map generation from a seed. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 0xdeadbeef;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

export function generateMap(grid: Grid, options: MapGeneratorOptions): Omit<GeneratedMap, "grid"> {
  const { size, seed = Date.now(), factionCount = 2 } = options;
  const rng = makeRng(seed);

  const noise = createNoise2D(() => rng());
  // Second noise layer for detail variation
  const noiseDetail = createNoise2D(() => rng());

  const { widthTiles: W, heightTiles: H } = mapSizes[size];

  // ── Terrain pass ────────────────────────────────────────────────────────────
  const forestTiles: Vec2[] = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = x / W;
      const ny = y / H;

      // Layered noise: coarse base + fine detail
      const elevation =
        noise(nx * 3, ny * 3) * 0.7 +
        noiseDetail(nx * 8, ny * 8) * 0.3;

      // Distance from center — fade edges toward water to create island-like shape
      const cx = nx - 0.5;
      const cy = ny - 0.5;
      const distFromCenter = Math.sqrt(cx * cx + cy * cy) * 2;
      const adjusted = elevation - distFromCenter * 0.45;

      let terrain: TerrainType;
      if (adjusted < WATER_THRESHOLD) {
        terrain = "water";
      } else if (adjusted > MOUNTAIN_THRESHOLD) {
        // Mountains are impassable — treat as water for pathfinding
        terrain = "water";
      } else if (adjusted > FOREST_THRESHOLD) {
        terrain = "forest";
        forestTiles.push({ x, y });
      } else {
        terrain = "open";
      }

      grid.setTerrain(x, y, terrain);
    }
  }

  // ── Resource deposit pass ───────────────────────────────────────────────────
  // One deposit per terrain tile: forest → wood, water → water.
  // Units right-click a tile to gather from it. For water tiles (impassable)
  // the engine paths the unit to the nearest adjacent passable tile.
  const deposits: ResourceDeposit[] = [];
  let depositIndex = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = grid.getTile(x, y);
      if (tile?.terrain === "forest") {
        deposits.push({
          id: `deposit_wood_${depositIndex++}`,
          kind: "wood",
          position: { x, y },
          quantity: woodDeposit.quantity,
        });
        grid.setTerrain(x, y, "forest", woodDeposit.quantity);
      } else if (tile?.terrain === "water") {
        deposits.push({
          id: `deposit_water_${depositIndex++}`,
          kind: "water",
          position: { x, y },
          quantity: waterDeposit.quantity,
        });
      }
    }
  }

  // ── Starting position pass ──────────────────────────────────────────────────
  const startingPositions = placeStartingPositions(grid, W, H, factionCount, rng);

  return { deposits, startingPositions };
}

/**
 * Place faction starting positions:
 * - On passable open terrain
 * - Maximally spread apart (factions start on opposite sides)
 * - At least 20% map width from map edge
 */
function placeStartingPositions(
  grid: Grid,
  W: number,
  H: number,
  count: number,
  rng: () => number,
): Vec2[] {
  const margin = Math.floor(Math.min(W, H) * 0.15);
  const candidates: Vec2[] = [];

  // Collect all valid open tiles not too close to edge
  for (let y = margin; y < H - margin; y++) {
    for (let x = margin; x < W - margin; x++) {
      if (grid.getTile(x, y)?.terrain === "open") {
        candidates.push({ x, y });
      }
    }
  }

  if (candidates.length === 0) {
    // Fallback: use corners
    return [
      { x: margin, y: margin },
      { x: W - margin - 1, y: H - margin - 1 },
    ].slice(0, count);
  }

  if (count === 1) {
    return [candidates[Math.floor(rng() * candidates.length)]!];
  }

  // For 2 factions: pick first randomly, then pick the candidate farthest from it
  const positions: Vec2[] = [];
  const first = candidates[Math.floor(rng() * candidates.length)]!;
  positions.push(first);

  for (let i = 1; i < count; i++) {
    let best: Vec2 = candidates[0]!;
    let bestMinDist = -1;

    for (const c of candidates) {
      let minDist = Infinity;
      for (const p of positions) {
        const dx = c.x - p.x;
        const dy = c.y - p.y;
        minDist = Math.min(minDist, dx * dx + dy * dy);
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        best = c;
      }
    }

    positions.push(best);
  }

  return positions;
}
