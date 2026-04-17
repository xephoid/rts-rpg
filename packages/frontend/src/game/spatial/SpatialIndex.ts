// Grid-bucket spatial index for O(1) insert/remove and O(k) proximity queries
// where k is the number of entities in nearby cells.

import type { Vec2 } from "@neither/shared";

export class SpatialIndex {
  private readonly buckets = new Map<string, Set<string>>();
  private readonly entityPositions = new Map<string, Vec2>();

  private key(x: number, y: number): string {
    return `${Math.floor(x)},${Math.floor(y)}`;
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
    const cx = Math.floor(center.x);
    const cy = Math.floor(center.y);
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        const bucket = this.buckets.get(this.key(cx + dx, cy + dy));
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
