// Fog of war — three-state per-tile visibility system.
// Computed each tick from all friendly unit/building vision ranges.

import type { Vec2 } from "@neither/shared";

export const enum Visibility {
  UNEXPLORED = 0,
  EXPLORED = 1,
  VISIBLE = 2,
}

export type FogSnapshot = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type VisionSource = {
  position: Vec2;
  rangeTiles: number;
  concealed?: boolean | undefined;
};

export class FogOfWar {
  private readonly width: number;
  private readonly height: number;
  private readonly current: Uint8Array;
  private readonly explored: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.current = new Uint8Array(width * height);
    this.explored = new Uint8Array(width * height);
  }

  private idx(x: number, y: number): number {
    return y * this.width + x;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  update(sources: VisionSource[]): void {
    for (let i = 0; i < this.current.length; i++) {
      this.current[i] = this.explored[i] === 1 ? Visibility.EXPLORED : Visibility.UNEXPLORED;
    }
    for (const src of sources) {
      if (src.concealed) continue;
      this._applyCircle(src.position, src.rangeTiles);
    }
  }

  private _applyCircle(center: Vec2, radius: number): void {
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(center.x - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(center.x + radius));
    const minY = Math.max(0, Math.floor(center.y - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(center.y + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - center.x;
        const dy = y - center.y;
        if (dx * dx + dy * dy <= r2) {
          const i = this.idx(x, y);
          this.current[i] = Visibility.VISIBLE;
          this.explored[i] = 1;
        }
      }
    }
  }

  getVisibility(x: number, y: number): Visibility {
    if (!this.inBounds(x, y)) return Visibility.UNEXPLORED;
    return this.current[this.idx(x, y)] as Visibility;
  }

  isVisible(x: number, y: number): boolean {
    return this.getVisibility(x, y) === Visibility.VISIBLE;
  }

  isExplored(x: number, y: number): boolean {
    return this.getVisibility(x, y) >= Visibility.EXPLORED;
  }

  snapshot(): FogSnapshot {
    return { width: this.width, height: this.height, data: this.current };
  }

  reset(): void {
    this.current.fill(0);
    this.explored.fill(0);
  }
}
