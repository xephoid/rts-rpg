// Grid-bucket spatial index for O(1) insert/remove and O(k) proximity queries
// where k is the number of entities in nearby cells.
//
// Buckets are `BUCKET_TILES` on a side (power of two, chosen so each bucket
// holds a handful of entities at typical densities). Larger buckets reduce
// the number of Map lookups per query at the cost of slightly over-querying
// (more candidates per bucket that the Euclidean post-filter discards). At
// BUCKET_TILES = 8, a radius-8 query walks 9 buckets instead of 289 1-tile
// buckets — a 30× reduction in Map.get calls at sparse entity densities.

import type { Vec2 } from "@neither/shared";

/** Tile size per bucket edge. Power of two so `Math.floor(x / BUCKET_TILES)`
 *  can be replaced by bit-shift (`x >> BUCKET_SHIFT`) on the hot path. */
const BUCKET_SHIFT = 3; // 2^3 = 8 tiles per bucket edge
const BUCKET_TILES = 1 << BUCKET_SHIFT;

export class SpatialIndex {
  private readonly buckets = new Map<number, Set<string>>();
  private readonly entityPositions = new Map<string, Vec2>();

  /** 32-bit packed bucket key: `bucketY << 16 | bucketX`. Supports maps up to
   *  2^19 tiles per axis (way beyond anything we'd ship). Using numbers
   *  instead of string templating shaves an allocation per Map.get. */
  private key(x: number, y: number): number {
    const bx = Math.floor(x) >> BUCKET_SHIFT;
    const by = Math.floor(y) >> BUCKET_SHIFT;
    return (by << 16) | (bx & 0xffff);
  }

  insert(id: string, position: Vec2): void {
    const k = this.key(position.x, position.y);
    let bucket = this.buckets.get(k);
    if (!bucket) {
      bucket = new Set();
      this.buckets.set(k, bucket);
    }
    bucket.add(id);
    this.entityPositions.set(id, { ...position });
  }

  remove(id: string): void {
    const pos = this.entityPositions.get(id);
    if (!pos) return;
    const k = this.key(pos.x, pos.y);
    const bucket = this.buckets.get(k);
    if (bucket) {
      bucket.delete(id);
      if (bucket.size === 0) this.buckets.delete(k);
    }
    this.entityPositions.delete(id);
  }

  move(id: string, newPosition: Vec2): void {
    this.remove(id);
    this.insert(id, newPosition);
  }

  /** Return all entity IDs within Chebyshev distance `radius` tiles. */
  query(center: Vec2, radiusTiles: number): string[] {
    const result: string[] = [];
    // Compute the bucket-space bounds directly: floor(center ± r) in tile
    // space, then >> BUCKET_SHIFT to bucket space.
    const cx = Math.floor(center.x);
    const cy = Math.floor(center.y);
    const bx0 = (cx - radiusTiles) >> BUCKET_SHIFT;
    const bx1 = (cx + radiusTiles) >> BUCKET_SHIFT;
    const by0 = (cy - radiusTiles) >> BUCKET_SHIFT;
    const by1 = (cy + radiusTiles) >> BUCKET_SHIFT;
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const bucket = this.buckets.get((by << 16) | (bx & 0xffff));
        if (bucket) {
          for (const id of bucket) result.push(id);
        }
      }
    }
    return result;
  }

  /** Euclidean-distance query — subset of Chebyshev result filtered by actual distance. */
  queryCircle(center: Vec2, radiusTiles: number): string[] {
    const r2 = radiusTiles * radiusTiles;
    return this.query(center, radiusTiles).filter((id) => {
      const pos = this.entityPositions.get(id);
      if (!pos) return false;
      const dx = pos.x - center.x;
      const dy = pos.y - center.y;
      return dx * dx + dy * dy <= r2;
    });
  }

  getPosition(id: string): Vec2 | undefined {
    return this.entityPositions.get(id);
  }

  clear(): void {
    this.buckets.clear();
    this.entityPositions.clear();
  }
}
