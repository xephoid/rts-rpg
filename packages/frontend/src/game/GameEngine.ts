// Game simulation engine — pure TypeScript, no imports from /renderer, /ui, /store.
// Pushes GameStateSnapshot to the store bridge after each tick via onTick callback.

import type { Faction, GameStateSnapshot, Vec2 } from "@neither/shared";
import {
  startingResources,
  mapSizes,
  robotBuildingStats,
  wizardBuildingStats,
  robotUnitStats,
  wizardUnitStats,
} from "@neither/shared";
import { GameLoop, TICK_MS } from "./loop/GameLoop.js";
import { EntityManager } from "./entities/EntityManager.js";
import { EventBus } from "./events/EventBus.js";
import { Grid } from "./spatial/Grid.js";
import { SpatialIndex } from "./spatial/SpatialIndex.js";
import { generateMap, type ResourceDeposit, type MapSize } from "./map/MapGenerator.js";
import { FogOfWar } from "./fog/FogOfWar.js";
import { LastSeenMap } from "./fog/LastSeenMap.js";
import { UnitEntity } from "./entities/UnitEntity.js";
import { BuildingEntity } from "./entities/BuildingEntity.js";
import { findPath } from "./spatial/Pathfinder.js";

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

    this._spawnStartingEntities();
    this.loop = new GameLoop(this.tick.bind(this));
  }

  private _spawnStartingEntities(): void {
    const [wizPos, robPos] = this.startingPositions;
    if (!wizPos || !robPos) return;

    // Wizard castle + 3 evokers
    const wizCastle = new BuildingEntity({
      faction: "wizards",
      typeKey: "castle",
      position: { x: wizPos.x, y: wizPos.y },
      stats: {
        maxHp: wizardBuildingStats.castle!.hp,
        damage: 0,
        range: wizardBuildingStats.castle!.visionRange,
        speed: 0,
        charisma: 0,
        armor: 0,
        capacity: wizardBuildingStats.castle!.occupantCapacity,
      },
      constructionTicks: 0,
    });
    wizCastle.state = { kind: "operational" };
    this.entities.add(wizCastle);
    this._blockBuildingTiles(wizCastle);

    const evokerStats = wizardUnitStats.evoker!;
    for (let i = 0; i < 3; i++) {
      this.entities.add(
        new UnitEntity({
          faction: "wizards",
          typeKey: "evoker",
          position: { x: wizPos.x + i - 1, y: wizPos.y + 2 },
          stats: {
            maxHp: evokerStats.hp,
            damage: evokerStats.damage,
            range: evokerStats.range,
            speed: evokerStats.speed,
            charisma: evokerStats.charisma,
            armor: evokerStats.armor,
            capacity: evokerStats.capacity,
          },
        }),
      );
    }

    // Robot home + 3 cores
    const robHome = new BuildingEntity({
      faction: "robots",
      typeKey: "home",
      position: { x: robPos.x, y: robPos.y },
      stats: {
        maxHp: robotBuildingStats.home!.hp,
        damage: 0,
        range: robotBuildingStats.home!.visionRange,
        speed: 0,
        charisma: 0,
        armor: 0,
        capacity: robotBuildingStats.home!.occupantCapacity,
      },
      constructionTicks: 0,
    });
    robHome.state = { kind: "operational" };
    this.entities.add(robHome);
    this._blockBuildingTiles(robHome);

    const coreStats = robotUnitStats.core!;
    for (let i = 0; i < 3; i++) {
      this.entities.add(
        new UnitEntity({
          faction: "robots",
          typeKey: "core",
          position: { x: robPos.x + i - 1, y: robPos.y + 2 },
          stats: {
            maxHp: coreStats.hpWood,
            damage: coreStats.damage,
            range: coreStats.range,
            speed: coreStats.speed,
            charisma: coreStats.charisma,
            armor: coreStats.armorWood,
            capacity: coreStats.capacity,
          },
        }),
      );
    }
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

  issueMoveOrder(entityId: string, target: Vec2): void {
    const entity = this.entities.get(entityId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };

    // Temporarily block tiles occupied by other units so path routes around them
    const blockedByUnits: Vec2[] = [];
    for (const u of this.entities.units()) {
      if (u.id === entityId) continue;
      const tx = Math.round(u.position.x);
      const ty = Math.round(u.position.y);
      if (!this.grid.isBlocked(tx, ty)) {
        this.grid.blockTile(tx, ty);
        blockedByUnits.push({ x: tx, y: ty });
      }
    }

    const goal = this._nearestPassable({ x: Math.floor(target.x), y: Math.floor(target.y) }, start);
    const path = goal ? findPath(this.grid, start, goal) : null;

    for (const pos of blockedByUnits) this.grid.unblockTile(pos.x, pos.y);

    if (!path) return;
    unit.state = { kind: "moving", targetPosition: goal!, path };
  }

  /**
   * If `goal` is impassable, BFS-expand outward to find the nearest passable tile.
   * Returns null only if no passable tile exists at all (impossible in practice).
   */
  private _nearestPassable(goal: Vec2, from: Vec2): Vec2 | null {
    if (this.grid.isPassable(goal.x, goal.y)) return goal;

    const visited = new Set<string>();
    const queue: Vec2[] = [goal];
    visited.add(`${goal.x},${goal.y}`);
    let best: Vec2 | null = null;
    let bestDist = Infinity;

    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of this.grid.neighbours8(cur.x, cur.y)) {
        const key = `${nb.x},${nb.y}`;
        if (visited.has(key)) continue;
        visited.add(key);
        if (this.grid.isPassable(nb.x, nb.y)) {
          const dx = nb.x - from.x;
          const dy = nb.y - from.y;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) { bestDist = dist; best = nb; }
        }
        if (visited.size < 200) queue.push(nb); // limit search radius
      }
    }
    return best;
  }

  /** Block all tiles in a building's N×N footprint. */
  private _blockBuildingTiles(building: BuildingEntity): void {
    const factionStats = building.faction === "wizards" ? wizardBuildingStats : robotBuildingStats;
    const fp = factionStats[building.typeKey]?.footprintTiles ?? 2;
    const bx = Math.floor(building.position.x);
    const by = Math.floor(building.position.y);
    for (let dy = 0; dy < fp; dy++) {
      for (let dx = 0; dx < fp; dx++) {
        this.grid.blockTile(bx + dx, by + dy);
      }
    }
  }

  private _processMovement(): void {
    for (const unit of this.entities.units()) {
      if (unit.state.kind === "moving") {
        this._advanceUnit(unit, TICK_MS / 1000);
      }
    }
  }

  private _advanceUnit(unit: UnitEntity, stepSecs: number): void {
    if (unit.state.kind !== "moving") return;
    const state = unit.state;
    let remaining = unit.stats.speed * stepSecs;

    while (remaining > 0 && state.path.length > 0) {
      const next = state.path[0]!;

      // Yield if next tile is occupied by another unit — try again next tick
      if (this._tileOccupiedByUnit(next.x, next.y, unit.id)) break;

      const dx = next.x - unit.position.x;
      const dy = next.y - unit.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= remaining) {
        unit.position = { x: next.x, y: next.y };
        state.path.shift();
        remaining -= dist;
      } else {
        unit.position = {
          x: unit.position.x + (dx / dist) * remaining,
          y: unit.position.y + (dy / dist) * remaining,
        };
        remaining = 0;
      }
    }

    if (state.path.length === 0) {
      unit.state = { kind: "idle" };
    }
  }

  private _tileOccupiedByUnit(x: number, y: number, excludeId: string): boolean {
    for (const u of this.entities.units()) {
      if (u.id === excludeId) continue;
      if (Math.round(u.position.x) === x && Math.round(u.position.y) === y) return true;
    }
    return false;
  }

  private tick(tick: number, elapsedMs: number): void {
    // Tick processing order: input → AI → movement → combat → resources → fog → narrative → render
    this._processMovement();
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
