// Game simulation engine — pure TypeScript, no imports from /renderer, /ui, /store.
// Pushes GameStateSnapshot to the store bridge after each tick via onTick callback.

import type { Faction, GameStateSnapshot } from "@neither/shared";
import { startingResources } from "@neither/shared";
import { GameLoop } from "./loop/GameLoop.js";
import { EntityManager } from "./entities/EntityManager.js";
import { EventBus } from "./events/EventBus.js";
import { Grid } from "./spatial/Grid.js";
import { SpatialIndex } from "./spatial/SpatialIndex.js";
import { mapSizes } from "@neither/shared";

export type GameEngineConfig = {
  mapSize?: "small" | "medium" | "large";
  onTick: (state: GameStateSnapshot) => void;
};

export type ResourcePool = { wood: number; water: number; mana: number };

export class GameEngine {
  readonly entities: EntityManager;
  readonly events: EventBus;
  readonly grid: Grid;
  readonly spatialIndex: SpatialIndex;

  private readonly loop: GameLoop;
  private readonly onTick: (state: GameStateSnapshot) => void;

  private readonly resources: Record<Faction, ResourcePool> = {
    wizards: { ...startingResources },
    robots: { ...startingResources },
  };

  constructor({ mapSize = "medium", onTick }: GameEngineConfig) {
    this.onTick = onTick;
    this.entities = new EntityManager();
    this.events = new EventBus();
    const size = mapSizes[mapSize];
    this.grid = new Grid(size.widthTiles, size.heightTiles);
    this.spatialIndex = new SpatialIndex();

    this.loop = new GameLoop(this.tick.bind(this));
  }

  start(): void {
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  pause(): void {
    this.loop.pause();
  }

  resume(): void {
    this.loop.resume();
  }

  private tick(tick: number, elapsedMs: number): void {
    // Tick processing order per CLAUDE.md:
    // input → AI → movement → combat → resources → narrative events → render
    // TODO: Phase 3+ — implement each step

    this.events.flushDeferred();

    this.onTick({
      tick,
      elapsedMs,
      resources: {
        wizards: { ...this.resources.wizards },
        robots: { ...this.resources.robots },
      },
      entities: this.entities.toSnapshots(),
      tiles: this.grid.toSnapshots(),
    });
  }
}
