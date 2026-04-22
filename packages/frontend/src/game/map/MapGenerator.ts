// Procedural map generator using simplex noise.
// Produces terrain, resource deposits, and faction starting positions.

import { createNoise2D } from "simplex-noise";
import type { TerrainType, Vec2 } from "@neither/shared";
import { woodDeposit, waterDeposit, mapSizes, spawnWoodGuarantee } from "@neither/shared";

// Every forest tile is a wood resource; every water tile is a water resource.
// Quantities are fixed per tile — see resourceCosts.ts for values.
import type { Grid } from "../spatial/Grid.js";
import { findPath } from "../spatial/Pathfinder.js";

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

/** Tiles inside this radius around each spawn are reset to open + stripped of
 *  deposits so the 4×4 castle/home footprint can land. Referenced by the wood-
 *  guarantee bias so the counted forest tiles are in the ring that actually
 *  survives the clear pass. */
const STARTING_CLEAR_RADIUS = 6;

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

  // ── Clear resources near starting positions ──────────────────────────────────
  // Castle/home footprint is 4×4; sp is top-left corner — center at sp+1.5
  for (const sp of startingPositions) {
    const cx = sp.x + 1.5;
    const cy = sp.y + 1.5;
    for (let dy = -STARTING_CLEAR_RADIUS; dy <= STARTING_CLEAR_RADIUS; dy++) {
      for (let dx = -STARTING_CLEAR_RADIUS; dx <= STARTING_CLEAR_RADIUS; dx++) {
        const fdx = (sp.x + dx + 0.5) - cx;
        const fdy = (sp.y + dy + 0.5) - cy;
        if (fdx * fdx + fdy * fdy > STARTING_CLEAR_RADIUS * STARTING_CLEAR_RADIUS) continue;
        const tx = sp.x + dx;
        const ty = sp.y + dy;
        if (!grid.inBounds(tx, ty)) continue;
        const tile = grid.getTile(tx, ty);
        if (tile?.terrain === "forest" || tile?.terrain === "water") grid.setTerrain(tx, ty, "open");
        const idx = deposits.findIndex((d) => d.position.x === tx && d.position.y === ty);
        if (idx !== -1) deposits.splice(idx, 1);
      }
    }
  }

  // ── Guarantee ground connectivity between bases ─────────────────────────────
  ensureGroundConnectivity(grid, startingPositions, deposits);

  // ── Guarantee nearby wood for every spawn ───────────────────────────────────
  // Runs AFTER connectivity carving so the carve can't accidentally cut through
  // a newly planted grove (the carve converts any non-open tile it traverses to
  // open, which would silently delete a planted deposit).
  ensureSpawnWood(grid, startingPositions, deposits);

  return { deposits, startingPositions };
}

/**
 * After the clear + connectivity passes, any spawn with fewer than
 * `spawnWoodGuarantee.minDeposits` wood deposits inside
 * `spawnWoodGuarantee.radiusTiles` gets a small planted grove in the ring
 * between the clear radius and the guarantee radius. Tiles are flipped to
 * `forest` terrain + a new `ResourceDeposit` is appended so the planted wood
 * reads identically to noise-generated wood everywhere else in the engine.
 */
function ensureSpawnWood(
  grid: Grid,
  startingPositions: Vec2[],
  deposits: ResourceDeposit[],
): void {
  const { radiusTiles, minDeposits } = spawnWoodGuarantee;
  const radiusSq = radiusTiles * radiusTiles;
  const clearSq = STARTING_CLEAR_RADIUS * STARTING_CLEAR_RADIUS;

  for (const sp of startingPositions) {
    const cx = sp.x + 1.5;
    const cy = sp.y + 1.5;
    const existing = deposits.filter(
      (d) =>
        d.kind === "wood" &&
        (d.position.x + 0.5 - cx) ** 2 + (d.position.y + 0.5 - cy) ** 2 <= radiusSq,
    );
    if (existing.length >= minDeposits) continue;
    const needed = minDeposits - existing.length;

    // Collect passable `open` tiles in the survive-clear ring, nearest first.
    // Fallback radius 1.5× handles edge cases where the nominal ring is mostly
    // water or out of bounds.
    const ringLimit = Math.ceil(radiusTiles * 1.5);
    const candidates: Array<{ x: number; y: number; distSq: number }> = [];
    for (let dy = -ringLimit; dy <= ringLimit; dy++) {
      for (let dx = -ringLimit; dx <= ringLimit; dx++) {
        const tx = sp.x + dx;
        const ty = sp.y + dy;
        if (!grid.inBounds(tx, ty)) continue;
        const fdx = tx + 0.5 - cx;
        const fdy = ty + 0.5 - cy;
        const distSq = fdx * fdx + fdy * fdy;
        if (distSq <= clearSq) continue; // inside clear — would be wiped
        const tile = grid.getTile(tx, ty);
        if (!tile || tile.terrain !== "open") continue;
        if (deposits.some((d) => d.position.x === tx && d.position.y === ty)) continue;
        candidates.push({ x: tx, y: ty, distSq });
      }
    }
    if (candidates.length === 0) continue; // genuinely no room; rare edge case

    candidates.sort((a, b) => a.distSq - b.distSq);

    // Pick the closest candidate, then cluster: prefer subsequent tiles within
    // 2 tiles of an already-picked tile so the planted patch reads as one grove
    // rather than scattered lone trees.
    const picked: Array<{ x: number; y: number }> = [];
    while (picked.length < needed) {
      let next: { x: number; y: number; distSq: number } | null = null;
      if (picked.length === 0) {
        next = candidates[0] ?? null;
      } else {
        for (const c of candidates) {
          if (picked.some((p) => p.x === c.x && p.y === c.y)) continue;
          const near = picked.some((p) => {
            const ddx = p.x - c.x;
            const ddy = p.y - c.y;
            return ddx * ddx + ddy * ddy <= 4; // within 2 tiles
          });
          if (near) { next = c; break; }
        }
        // No clustered option left — take the overall-nearest that isn't already picked.
        if (!next) {
          next = candidates.find((c) => !picked.some((p) => p.x === c.x && p.y === c.y)) ?? null;
        }
      }
      if (!next) break;
      picked.push({ x: next.x, y: next.y });
    }

    for (const p of picked) {
      grid.setTerrain(p.x, p.y, "forest", woodDeposit.quantity);
      deposits.push({
        id: `deposit_wood_planted_${deposits.length}`,
        kind: "wood",
        position: { x: p.x, y: p.y },
        quantity: woodDeposit.quantity,
      });
    }
  }
}

/**
 * Make sure every pair of starting positions has a walkable ground route between
 * them. If a pair is separated by water or mountain (both impassable), carve the
 * shortest crossing from one base to the other: run A* with all in-bounds tiles
 * treated as passable, then convert any water tile the returned path crosses to
 * open terrain (+ one perpendicular neighbour to widen the channel past 1 tile so
 * units don't deadlock in a single-file corridor).
 *
 * Only runs during map generation, so A* cost is negligible.
 */
function ensureGroundConnectivity(
  grid: Grid,
  startingPositions: Vec2[],
  deposits: ResourceDeposit[],
): void {
  if (startingPositions.length < 2) return;

  // Base footprint is 4×4; use its centre as each endpoint.
  const centreOf = (sp: Vec2): Vec2 => ({
    x: Math.round(sp.x + 1.5),
    y: Math.round(sp.y + 1.5),
  });

  for (let i = 1; i < startingPositions.length; i++) {
    const start = centreOf(startingPositions[0]!);
    const goal = centreOf(startingPositions[i]!);

    // Already connected by passable ground? Done.
    if (findPath(grid, start, goal) !== null) continue;

    // Find shortest route allowing any in-bounds tile. `isPassable` override
    // forces uniform cost, so A* minimises total tile count — which tends to
    // minimise the stretch of water we have to carve.
    const carvePath = findPath(grid, start, goal, {
      isPassable: (x, y) => grid.inBounds(x, y),
    });
    if (!carvePath) continue; // impossible (out-of-bounds endpoints); let it be

    for (const tile of carvePath) {
      carveTile(grid, deposits, tile.x, tile.y);
      // Widen to 2 tiles by opening one non-water-adjacent neighbour on each side.
      carveTile(grid, deposits, tile.x + 1, tile.y);
      carveTile(grid, deposits, tile.x, tile.y + 1);
    }
  }
}

/** Convert a water tile at (x, y) into open terrain and drop the water deposit
 *  that was there. No-op if the tile wasn't water. */
function carveTile(
  grid: Grid,
  deposits: ResourceDeposit[],
  x: number,
  y: number,
): void {
  if (!grid.inBounds(x, y)) return;
  const tile = grid.getTile(x, y);
  if (!tile || tile.terrain !== "water") return;
  grid.setTerrain(x, y, "open");
  const idx = deposits.findIndex((d) => d.position.x === x && d.position.y === y);
  if (idx !== -1) deposits.splice(idx, 1);
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

  // Soft bias toward wood: prefer candidates whose ring between the clear
  // radius and the guarantee radius already has enough forest tiles to satisfy
  // the minimum. The post-clear plant pass handles the rest — but letting the
  // greedy max-distance loop work on an already-wood-rich shortlist keeps maps
  // looking organic whenever possible. Falls back to the full list if the
  // shortlist is empty (very sparse-forest maps).
  const { radiusTiles, minDeposits } = spawnWoodGuarantee;
  const radiusSq = radiusTiles * radiusTiles;
  const clearSq = STARTING_CLEAR_RADIUS * STARTING_CLEAR_RADIUS;
  const forestRich = candidates.filter((c) => {
    let count = 0;
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        const tx = c.x + dx;
        const ty = c.y + dy;
        if (!grid.inBounds(tx, ty)) continue;
        const fdx = tx + 0.5 - (c.x + 1.5);
        const fdy = ty + 0.5 - (c.y + 1.5);
        const d2 = fdx * fdx + fdy * fdy;
        if (d2 <= clearSq) continue; // inside clear — about to be wiped
        if (d2 > radiusSq) continue;  // outside guarantee radius
        if (grid.getTile(tx, ty)?.terrain === "forest") count++;
      }
    }
    return count >= minDeposits;
  });
  const pool = forestRich.length > 0 ? forestRich : candidates;

  if (count === 1) {
    return [pool[Math.floor(rng() * pool.length)]!];
  }

  // For 2 factions: pick first randomly from the pool, then pick the candidate
  // farthest from it — still searching the biased pool where possible.
  const positions: Vec2[] = [];
  const first = pool[Math.floor(rng() * pool.length)]!;
  positions.push(first);

  for (let i = 1; i < count; i++) {
    let best: Vec2 = pool[0]!;
    let bestMinDist = -1;

    for (const c of pool) {
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
