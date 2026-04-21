// A* pathfinding on a tile grid with terrain movement cost modifiers.
// Returns null if no path exists.

import type { Vec2 } from "@neither/shared";
import type { Grid } from "./Grid.js";

type Node = {
  pos: Vec2;
  g: number; // cost from start
  f: number; // g + h
  parent: Node | null;
};

function heuristic(a: Vec2, b: Vec2): number {
  // Octile distance — best heuristic for 8-directional grid
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

function posKey(pos: Vec2): string {
  return `${pos.x},${pos.y}`;
}

/** Find a path from `start` to `goal` on `grid`. Returns array of Vec2 tiles (excluding start).
 *  opts.isPassable overrides the default grid.isPassable check — use for flying units. */
export function findPath(
  grid: Grid,
  start: Vec2,
  goal: Vec2,
  opts?: { isPassable?: (x: number, y: number) => boolean },
): Vec2[] | null {
  const passable = opts?.isPassable ?? ((x, y) => grid.isPassable(x, y));

  if (!passable(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [];

  const open = new MinHeap<Node>((a, b) => a.f - b.f);
  const openKeys = new Set<string>();
  const closed = new Set<string>();
  const gScore = new Map<string, number>();

  const startKey = posKey(start);
  gScore.set(startKey, 0);

  const startNode: Node = {
    pos: start,
    g: 0,
    f: heuristic(start, goal),
    parent: null,
  };
  open.push(startNode);
  openKeys.add(startKey);

  while (!open.isEmpty()) {
    const current = open.pop()!;
    const currentKey = posKey(current.pos);
    openKeys.delete(currentKey);

    if (current.pos.x === goal.x && current.pos.y === goal.y) {
      return reconstructPath(current);
    }

    closed.add(currentKey);

    for (const neighbour of grid.neighbours8(current.pos.x, current.pos.y)) {
      if (!passable(neighbour.x, neighbour.y)) continue;
      const nKey = posKey(neighbour);
      if (closed.has(nKey)) continue;

      const isDiagonal = neighbour.x !== current.pos.x && neighbour.y !== current.pos.y;
      // Flying units use uniform cost 1; ground units use terrain cost.
      const moveCost = opts?.isPassable ? 1 : grid.movementCost(neighbour.x, neighbour.y);
      const stepCost = isDiagonal ? moveCost * Math.SQRT2 : moveCost;
      const tentativeG = current.g + stepCost;

      const existingG = gScore.get(nKey);
      if (existingG !== undefined && tentativeG >= existingG) continue;

      gScore.set(nKey, tentativeG);
      const node: Node = {
        pos: neighbour,
        g: tentativeG,
        f: tentativeG + heuristic(neighbour, goal),
        parent: current,
      };

      if (!openKeys.has(nKey)) {
        open.push(node);
        openKeys.add(nKey);
      }
    }
  }

  return null; // no path
}

function reconstructPath(node: Node): Vec2[] {
  const path: Vec2[] = [];
  let current: Node | null = node;
  while (current?.parent) {
    path.unshift({ ...current.pos });
    current = current.parent;
  }
  return path;
}

// ── Minimal binary min-heap ───────────────────────────────────────────────────

class MinHeap<T> {
  private readonly data: T[] = [];
  private readonly compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  isEmpty(): boolean {
    return this.data.length === 0;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.data[i]!, this.data[parent]!) < 0) {
        [this.data[i], this.data[parent]] = [this.data[parent]!, this.data[i]!];
        i = parent;
      } else break;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.compare(this.data[l]!, this.data[smallest]!) < 0) smallest = l;
      if (r < n && this.compare(this.data[r]!, this.data[smallest]!) < 0) smallest = r;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest]!, this.data[i]!];
      i = smallest;
    }
  }
}
