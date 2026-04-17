// Stores last-known entity state for EXPLORED tiles.
// When a tile transitions from VISIBLE → EXPLORED, entities on it are frozen here.
// Renderer draws these ghosts in explored-but-not-visible areas.

import type { EntitySnapshot } from "@neither/shared";

export type LastSeenEntry = {
  snapshot: EntitySnapshot;
  tick: number;
};

export class LastSeenMap {
  /** entityId → last seen snapshot */
  private readonly entries = new Map<string, LastSeenEntry>();

  record(snapshot: EntitySnapshot, tick: number): void {
    this.entries.set(snapshot.id, { snapshot, tick });
  }

  recordAll(snapshots: EntitySnapshot[], tick: number): void {
    for (const s of snapshots) this.record(s, tick);
  }

  get(id: string): LastSeenEntry | undefined {
    return this.entries.get(id);
  }

  remove(id: string): void {
    this.entries.delete(id);
  }

  all(): LastSeenEntry[] {
    return [...this.entries.values()];
  }

  clear(): void {
    this.entries.clear();
  }
}
