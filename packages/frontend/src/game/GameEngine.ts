// Game simulation engine — pure TypeScript, no imports from /renderer, /ui, /store.
// Pushes GameStateSnapshot to the store bridge after each tick via onTick callback.

import type { Faction, GameStateSnapshot } from "@neither/shared";
import { startingResources, mapSizes, robotBuildingStats, wizardBuildingStats } from "@neither/shared";
import { GameLoop } from "./loop/GameLoop.js";
import { EntityManager } from "./entities/EntityManager.js";
import { EventBus } from "./events/EventBus.js";
import { Grid } from "./spatial/Grid.js";
import { SpatialIndex } from "./spatial/SpatialIndex.js";
import { generateMap, type ResourceDeposit, type MapSize } from "./map/MapGenerator.js";
import { FogOfWar } from "./fog/FogOfWar.js";
import { LastSeenMap } from "./fog/LastSeenMap.js";
import type { UnitEntity } from "./entities/UnitEntity.js";
import type { BuildingEntity } from "./entities/BuildingEntity.js";

export type GameEngineConfig = {
  mapSize?: MapSize;
  seed?: number | undefined;
  onTick: (state: GameStateSnapshot) => void;
};

export type ResourcePool = { wood: number; water: number; mana: number };

const FACTIONS: Faction[] = ["wizards", "robots"];

export class GameEngine {
  readonly entities: EntityManager;
  readonly events: EventBus;
  readonly grid: Grid;
  readonly spatialIndex: SpatialIndex;
  readonly deposits: ResourceDeposit[];
  readonly startingPositions: { x: number; y: number }[];

  private readonly loop: GameLoop;
  private readonly onTick: (state: GameStateSnapshot) => void;
  private readonly fog: Record<Faction, FogOfWar>;
  private readonly lastSeen: Record<Faction, LastSeenMap>;

  private readonly resources: Record<Faction, ResourcePool> = {
    wizards: { ...startingResources },
    robots: { ...startingResources },
  };

  constructor({ mapSize = "medium", seed, onTick }: GameEngineConfig) {
    this.onTick = onTick;
    this.entities = new EntityManager();
    this.events = new EventBus();
    const size = mapSizes[mapSize];
    this.grid = new Grid(size.widthTiles, size.heightTiles);
    this.spatialIndex = new SpatialIndex();

    const { deposits, startingPositions } = generateMap(this.grid, {
      size: mapSize,
      seed,
      factionCount: 2,
    });
    this.deposits = deposits;
    this.startingPositions = startingPositions;

    this.fog = {
      wizards: new FogOfWar(size.widthTiles, size.heightTiles),
      robots: new FogOfWar(size.widthTiles, size.heightTiles),
    };
    this.lastSeen = {
      wizards: new LastSeenMap(),
      robots: new LastSeenMap(),
    };

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
    // Tick processing order: input → AI → movement → combat → resources → fog → narrative → render
    // TODO: Phase 5+ — implement movement, combat, resources

    this._updateFog(tick);
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
      fog: {
        wizards: this.fog.wizards.snapshot(),
        robots: this.fog.robots.snapshot(),
      },
    });
  }

  private _updateFog(tick: number): void {
    for (const faction of FACTIONS) {
      const fog = this.fog[faction];
      const sources = this._collectVisionSources(faction);
      fog.update(sources);
      this._updateLastSeen(faction, fog, tick);
    }
  }

  private _collectVisionSources(faction: Faction) {
    const sources: { position: { x: number; y: number }; rangeTiles: number; concealed?: boolean }[] = [];

    for (const unit of this.entities.unitsByFaction(faction)) {
      sources.push({
        position: unit.position,
        rangeTiles: unit.stats.range,
        concealed: unit.concealed,
      });
    }

    for (const building of this.entities.buildingsByFaction(faction)) {
      if (!building.isOperational) continue;
      const bStats = this._buildingVisionRange(building);
      sources.push({ position: building.position, rangeTiles: bStats });
    }

    return sources;
  }

  private _buildingVisionRange(building: BuildingEntity): number {
    const factionStats = building.faction === "wizards" ? wizardBuildingStats : robotBuildingStats;
    return factionStats[building.typeKey]?.visionRange ?? 3;
  }

  private _updateLastSeen(faction: Faction, fog: FogOfWar, tick: number): void {
    const ls = this.lastSeen[faction];
    for (const snapshot of this.entities.toSnapshots()) {
      if (fog.isVisible(snapshot.position.x, snapshot.position.y)) {
        ls.record(snapshot, tick);
      }
    }
  }

  /** Expose last-seen map for renderer — shows ghost units in explored areas. */
  getLastSeen(faction: Faction): LastSeenMap {
    return this.lastSeen[faction];
  }
}
