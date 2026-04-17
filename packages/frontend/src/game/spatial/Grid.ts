import type { TerrainType, Vec2 } from "@neither/shared";
import { terrainMovementCosts } from "@neither/shared";

export type Tile = {
  x: number;
  y: number;
  terrain: TerrainType;
  woodRemaining: number;
};

export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly tiles: Tile[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tiles = Array.from({ length: width * height }, (_, i) => ({
      x: i % width,
      y: Math.floor(i / width),
      terrain: "open" as TerrainType,
      woodRemaining: 0,
    }));
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  getTile(x: number, y: number): Tile | undefined {
    if (!this.inBounds(x, y)) return undefined;
    return this.tiles[this.index(x, y)];
  }

  setTerrain(x: number, y: number, terrain: TerrainType, woodRemaining = 0): void {
    const tile = this.getTile(x, y);
    if (!tile) return;
    tile.terrain = terrain;
    tile.woodRemaining = woodRemaining;
  }

  /** Movement cost multiplier for a tile (impassable = Infinity). */
  movementCost(x: number, y: number): number {
    const tile = this.getTile(x, y);
    if (!tile) return Infinity;
    const cost = terrainMovementCosts[tile.terrain];
    return cost >= 9999 ? Infinity : cost;
  }

  isPassable(x: number, y: number): boolean {
    return this.movementCost(x, y) < Infinity;
  }

  /** 4-directional neighbours that are in-bounds. */
  neighbours4(x: number, y: number): Vec2[] {
    return [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    ].filter(({ x: nx, y: ny }) => this.inBounds(nx, ny));
  }

  /** 8-directional neighbours (diagonals included). */
  neighbours8(x: number, y: number): Vec2[] {
    const result: Vec2[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny)) result.push({ x: nx, y: ny });
      }
    }
    return result;
  }

  toSnapshots() {
    return this.tiles.map((t) => ({
      x: t.x,
      y: t.y,
      terrain: t.terrain,
      woodRemaining: t.woodRemaining > 0 ? t.woodRemaining : undefined,
    }));
  }
}
