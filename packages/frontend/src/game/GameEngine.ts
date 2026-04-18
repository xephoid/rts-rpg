// Game simulation engine — pure TypeScript, no imports from /renderer, /ui, /store.
// Pushes GameStateSnapshot to the store bridge after each tick via onTick callback.

import type { Faction, GameStateSnapshot, Vec2, DepositSnapshot } from "@neither/shared";
import {
  startingResources,
  mapSizes,
  robotBuildingStats,
  wizardBuildingStats,
  robotUnitStats,
  wizardUnitStats,
  levelUpBonuses,
  unitRoles,
  namedLeaders,
  robotUnitCosts,
  wizardUnitCosts,
  gatherRates,
  TICKS_PER_SEC,
  autoCollectionRates,
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
/** Ticks a unit waits on a blocked waypoint before replanning (~167ms at 60 ticks/s). */
const REPLAN_THRESHOLD = 10;
/**
 * Unit types allowed to issue gather orders. Leaders + basic civilian units only.
 * TODO(capabilities): make this data-driven once a unit capability system exists.
 */
const GATHERER_TYPES = new Set(["archmage", "surf", "core", "subject"]);
/**
 * Max tile radius a gatherer will search for the next deposit after exhausting one.
 * Initial guess: ~20 tiles (~1/3 of small map width). Adjust after playtesting.
 * TODO: ideally driven by unit vision range from FogOfWar once that API is stable.
 */
const GATHER_SEARCH_RADIUS = 20;

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

  /** depositId → unitId currently harvesting that deposit (one gatherer per tile). */
  private readonly depositOccupants = new Map<string, string>();

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

    // Wizard castle
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

    // Named archmage leader
    const archmageStats = wizardUnitStats[namedLeaders.wizards.typeKey]!;
    this.entities.add(
      new UnitEntity({
        faction: "wizards",
        typeKey: namedLeaders.wizards.typeKey,
        position: { x: wizPos.x, y: wizPos.y + 4 },
        stats: {
          maxHp: archmageStats.hp,
          damage: archmageStats.damage,
          range: archmageStats.range,
          speed: archmageStats.speed,
          charisma: archmageStats.charisma,
          armor: archmageStats.armor,
          capacity: archmageStats.capacity,
        },
        isNamed: true,
        name: namedLeaders.wizards.name,
      }),
    );

    // 2 surfs flanking
    const surfStats = wizardUnitStats.surf!;
    for (let i = 0; i < 2; i++) {
      this.entities.add(
        new UnitEntity({
          faction: "wizards",
          typeKey: "surf",
          position: { x: wizPos.x + (i === 0 ? -1 : 1), y: wizPos.y + 4 },
          stats: {
            maxHp: surfStats.hp,
            damage: surfStats.damage,
            range: surfStats.range,
            speed: surfStats.speed,
            charisma: surfStats.charisma,
            armor: surfStats.armor,
            capacity: surfStats.capacity,
          },
        }),
      );
    }

    // Robot home
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

    // Named Motherboard leader
    const coreStats = robotUnitStats.core!;
    this.entities.add(
      new UnitEntity({
        faction: "robots",
        typeKey: namedLeaders.robots.typeKey,
        position: { x: robPos.x, y: robPos.y + 4 },
        stats: {
          maxHp: coreStats.hpWood,
          damage: coreStats.damage,
          range: coreStats.range,
          speed: coreStats.speed,
          charisma: coreStats.charisma,
          armor: coreStats.armorWood,
          capacity: coreStats.capacity,
        },
        isNamed: true,
        name: namedLeaders.robots.name,
      }),
    );

    // 2 regular cores flanking
    for (let i = 0; i < 2; i++) {
      this.entities.add(
        new UnitEntity({
          faction: "robots",
          typeKey: "core",
          position: { x: robPos.x + (i === 0 ? -1 : 1), y: robPos.y + 4 },
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

  // ── Public controls ──────────────────────────────────────────────────────────

  start(): void { this.loop.start(); }
  stop(): void { this.loop.stop(); }
  pause(): void { this.loop.pause(); }
  resume(): void { this.loop.resume(); }

  // ── Orders ───────────────────────────────────────────────────────────────────

  issueMoveOrder(entityId: string, target: Vec2): void {
    const entity = this.entities.get(entityId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    this._releaseDepositOccupancy(unit);
    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };

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

    const goal = this._nearestPassable({ x: Math.floor(target.x), y: Math.floor(target.y) });
    const path = goal ? findPath(this.grid, start, goal) : null;

    for (const pos of blockedByUnits) this.grid.unblockTile(pos.x, pos.y);

    if (!path) return;
    unit.state = { kind: "moving", targetPosition: goal!, path, yieldTicks: 0 };
  }

  issueStopOrder(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    this._releaseDepositOccupancy(unit);
    unit.state = { kind: "idle" };
  }

  issuePatrolOrder(entityId: string, pointA: Vec2, pointB: Vec2): void {
    const entity = this.entities.get(entityId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    this._releaseDepositOccupancy(unit);
    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const goal = this._nearestPassable({ x: Math.floor(pointB.x), y: Math.floor(pointB.y) });
    const path = goal ? findPath(this.grid, start, goal) : null;
    if (!path || path.length === 0) return;
    unit.state = {
      kind: "patrolling",
      pointA: { x: Math.round(pointA.x), y: Math.round(pointA.y) },
      pointB: goal!,
      path,
      heading: "toB",
      yieldTicks: 0,
    };
  }

  issueGatherOrder(entityId: string, depositId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (!GATHERER_TYPES.has(unit.typeKey)) return;

    // Release any current deposit occupancy before reassigning
    this._releaseDepositOccupancy(unit);

    const deposit = this.deposits.find((d) => d.id === depositId);
    if (!deposit || deposit.quantity <= 0) return;

    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };

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

    const goal = this._nearestPassable({ x: Math.floor(deposit.position.x), y: Math.floor(deposit.position.y) });
    const path = goal ? findPath(this.grid, start, goal) : null;

    for (const pos of blockedByUnits) this.grid.unblockTile(pos.x, pos.y);

    if (!path) return;
    unit.state = { kind: "gatherMove", depositId, path, yieldTicks: 0 };
  }

  issueAttackOrder(unitId: string, targetId: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    this._releaseDepositOccupancy(unit);
    // TODO(phase-combat): _processAttacks() not yet implemented — sets state only.
    // When combat phase lands: range-check target, path into range, then deal damage each tick.
    unit.state = { kind: "attacking", targetId };
  }

  issueTalkOrder(unitId: string, targetId: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    // TODO(phase-diplomacy): talk/conversion logic not yet implemented.
    // When diplomacy phase lands: check unit has charisma capability, path to target,
    // then transition to converting state and run charisma checks each tick.
    void targetId;
  }

  issueProductionOrder(buildingId: string, unitTypeKey: string): void {
    const entity = this.entities.get(buildingId);
    if (!entity || entity.kind !== "building") return;
    const building = entity as BuildingEntity;
    if (!building.isOperational) return;

    const costs = building.faction === "wizards" ? wizardUnitCosts : robotUnitCosts;
    const cost = costs[unitTypeKey];
    if (!cost) return;

    const res = this.resources[building.faction];
    if (res.wood < cost.wood || res.water < cost.water) return;

    const pop = this._computePopulation();
    const { count, cap } = pop[building.faction];
    if (cap > 0 && count >= cap) return;

    res.wood -= cost.wood;
    res.water -= cost.water;

    building.state = {
      kind: "producing",
      unitTypeKey,
      progressTicks: 0,
      totalTicks: Math.round(cost.productionTimeSec * TICKS_PER_SEC),
    };
  }

  /** Give XP to a unit. Applies level-up bonus if threshold crossed. */
  giveXp(entityId: string, amount: number): void {
    const entity = this.entities.get(entityId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (unit.stats.addXp(amount)) {
      this._applyLevelUpBonus(unit);
    }
  }

  // ── Movement ─────────────────────────────────────────────────────────────────

  private _processMovement(): void {
    for (const unit of this.entities.units()) {
      const kind = unit.state.kind;
      if (kind === "moving" || kind === "patrolling" || kind === "gatherMove" || kind === "dropoffMove") {
        this._advanceUnit(unit, TICK_MS / 1000);
      }
    }
  }

  private _advanceUnit(unit: UnitEntity, stepSecs: number): void {
    const state = unit.state;
    if (
      state.kind !== "moving" &&
      state.kind !== "patrolling" &&
      state.kind !== "gatherMove" &&
      state.kind !== "dropoffMove"
    ) return;

    let remaining = unit.stats.speed * stepSecs;

    while (remaining > 0 && state.path.length > 0) {
      const next = state.path[0]!;

      // Yield if next tile is occupied by another unit
      if (this._tileOccupiedByUnit(next.x, next.y, unit.id)) {
        state.yieldTicks++;
        if (state.yieldTicks >= REPLAN_THRESHOLD) {
          this._replanUnit(unit);
          return;
        }
        break;
      }

      state.yieldTicks = 0;

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
      this._onUnitArrived(unit);
    }
  }

  private _onUnitArrived(unit: UnitEntity): void {
    const state = unit.state;
    switch (state.kind) {
      case "moving":
        unit.state = { kind: "idle" };
        break;

      case "gatherMove": {
        const { depositId } = state;
        const existing = this.depositOccupants.get(depositId);
        if (existing && existing !== unit.id) {
          // Deposit occupied — redirect to nearest free same-kind deposit
          const deposit = this.deposits.find((d) => d.id === depositId);
          const alt = deposit ? this._findNearestUnoccupiedDeposit(deposit.kind, unit.position, GATHER_SEARCH_RADIUS) : null;
          if (alt) {
            this.issueGatherOrder(unit.id, alt.id);
          } else {
            unit.state = { kind: "idle" };
          }
        } else {
          this.depositOccupants.set(depositId, unit.id);
          unit.state = { kind: "gathering", depositId };
        }
        break;
      }

      case "dropoffMove":
        this._doDropoff(unit);
        break;

      case "patrolling":
        this._replanPatrol(unit);
        break;
    }
  }

  private _doDropoff(unit: UnitEntity): void {
    if (unit.state.kind !== "dropoffMove") return;
    const { depositId } = unit.state;

    if (unit.carrying) {
      this.resources[unit.faction][unit.carrying.resource] += unit.carrying.amount;
      unit.carrying = null;
    }

    // Re-gather from same deposit if available and unoccupied
    const deposit = this.deposits.find((d) => d.id === depositId);
    if (deposit && deposit.quantity > 0 && !this.depositOccupants.has(depositId)) {
      this.issueGatherOrder(unit.id, depositId);
    } else if (deposit && deposit.quantity > 0) {
      // Deposit occupied — find nearest unoccupied same-kind within search radius
      const alt = this._findNearestUnoccupiedDeposit(deposit.kind, unit.position, GATHER_SEARCH_RADIUS);
      if (alt) this.issueGatherOrder(unit.id, alt.id);
      else unit.state = { kind: "idle" };
    } else {
      // Original deposit exhausted — find nearest same-kind within search radius
      const kind = deposit?.kind ?? unit.state.resource;
      const alt = this._findNearestUnoccupiedDeposit(kind, unit.position, GATHER_SEARCH_RADIUS);
      if (alt) this.issueGatherOrder(unit.id, alt.id);
      else unit.state = { kind: "idle" };
    }
  }

  private _replanUnit(unit: UnitEntity): void {
    const state = unit.state;
    if (
      state.kind !== "moving" &&
      state.kind !== "patrolling" &&
      state.kind !== "gatherMove" &&
      state.kind !== "dropoffMove"
    ) return;

    let targetPosition: Vec2;
    if (state.kind === "moving") {
      targetPosition = state.targetPosition;
    } else if (state.kind === "gatherMove") {
      const deposit = this.deposits.find((d) => d.id === state.depositId);
      if (!deposit) { unit.state = { kind: "idle" }; return; }
      targetPosition = deposit.position;
    } else if (state.kind === "dropoffMove") {
      const building = this.entities.get(state.dropoffId);
      if (!building || building.kind !== "building") { unit.state = { kind: "idle" }; return; }
      const entry = this._nearestBuildingEntryPoint(building as BuildingEntity, unit.position);
      if (!entry) { unit.state = { kind: "idle" }; return; }
      targetPosition = entry;
    } else {
      targetPosition = state.heading === "toB" ? state.pointB : state.pointA;
    }

    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };

    const blockedByUnits: Vec2[] = [];
    for (const u of this.entities.units()) {
      if (u.id === unit.id) continue;
      const tx = Math.round(u.position.x);
      const ty = Math.round(u.position.y);
      if (!this.grid.isBlocked(tx, ty)) {
        this.grid.blockTile(tx, ty);
        blockedByUnits.push({ x: tx, y: ty });
      }
    }

    const goal = this._nearestPassable(targetPosition);
    const path = goal ? findPath(this.grid, start, goal) : null;

    for (const pos of blockedByUnits) this.grid.unblockTile(pos.x, pos.y);

    if (path !== null && path.length > 0) {
      if (state.kind === "moving") {
        unit.state = { kind: "moving", targetPosition, path, yieldTicks: 0 };
      } else {
        unit.state = { ...state, path, yieldTicks: 0 };
      }
    } else if (path !== null) {
      // Empty path — unit is already at the target tile after rounding; trigger arrival.
      this._onUnitArrived(unit);
    } else {
      unit.state = { kind: "idle" };
    }
  }

  private _replanPatrol(unit: UnitEntity): void {
    if (unit.state.kind !== "patrolling") return;
    const { pointA, pointB, heading } = unit.state;
    const newHeading = heading === "toB" ? "toA" : "toB";
    const target = newHeading === "toB" ? pointB : pointA;
    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const path = findPath(this.grid, start, target);
    if (path && path.length > 0) {
      unit.state = { kind: "patrolling", pointA, pointB, path, heading: newHeading, yieldTicks: 0 };
    } else {
      unit.state = { kind: "patrolling", pointA, pointB, path: [], heading: newHeading, yieldTicks: 0 };
    }
  }

  // ── Gathering ─────────────────────────────────────────────────────────────────

  private _processGathering(): void {
    for (const unit of this.entities.units()) {
      if (unit.state.kind !== "gathering") continue;
      const { depositId } = unit.state;
      const deposit = this.deposits.find((d) => d.id === depositId);

      if (!deposit || deposit.quantity <= 0) {
        this.depositOccupants.delete(depositId);
        if (unit.carrying && unit.carrying.amount > 0) {
          // Still carrying something — drop it off, then auto-find next deposit
          this._sendToDropoff(unit, depositId);
        } else {
          // Nothing carrying — find next same-kind deposit within search radius
          const kind = deposit?.kind ?? "wood";
          const alt = this._findNearestUnoccupiedDeposit(kind, unit.position, GATHER_SEARCH_RADIUS);
          if (alt) this.issueGatherOrder(unit.id, alt.id);
          else unit.state = { kind: "idle" };
        }
        continue;
      }

      const rateKey = deposit.kind === "wood" ? "woodPerTick" : "waterPerTick";
      const carrying = unit.carrying?.amount ?? 0;
      const harvest = Math.min(
        gatherRates[rateKey],
        deposit.quantity,
        unit.stats.capacity - carrying,
      );
      deposit.quantity -= harvest;
      unit.carrying = { resource: deposit.kind, amount: carrying + harvest };

      // Full load or deposit just exhausted → head to dropoff
      if (unit.carrying.amount >= unit.stats.capacity || deposit.quantity <= 0) {
        this.depositOccupants.delete(depositId);
        this._sendToDropoff(unit, depositId);
      }
    }
  }

  private _sendToDropoff(unit: UnitEntity, depositId: string): void {
    const buildings = this.entities.buildingsByFaction(unit.faction).filter((b) => b.isOperational);
    if (buildings.length === 0) { unit.state = { kind: "idle" }; return; }

    // Find nearest building, measured to its closest entry point from the unit
    let nearest = buildings[0]!;
    let nearestDist = Infinity;
    for (const b of buildings) {
      const entry = this._nearestBuildingEntryPoint(b, unit.position);
      if (!entry) continue;
      const dx = entry.x - unit.position.x;
      const dy = entry.y - unit.position.y;
      const d = dx * dx + dy * dy;
      if (d < nearestDist) { nearestDist = d; nearest = b; }
    }

    const goal = this._nearestBuildingEntryPoint(nearest, unit.position);
    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const path = goal ? findPath(this.grid, start, goal) : null;

    if (path) {
      const resource = unit.carrying?.resource ?? "wood";
      unit.state = { kind: "dropoffMove", resource, depositId, dropoffId: nearest.id, path, yieldTicks: 0 };
    } else {
      unit.state = { kind: "idle" };
    }
  }

  /**
   * Returns the passable tile adjacent to the building footprint perimeter closest to
   * `fromPos`. Used for dropoff pathing so units don't always beeline to the top-left corner.
   */
  private _nearestBuildingEntryPoint(building: BuildingEntity, fromPos: Vec2): Vec2 | null {
    const factionStats = building.faction === "wizards" ? wizardBuildingStats : robotBuildingStats;
    const fp = factionStats[building.typeKey]?.footprintTiles ?? 2;
    const bx = Math.floor(building.position.x);
    const by = Math.floor(building.position.y);

    let best: Vec2 | null = null;
    let bestDist = Infinity;

    for (let dy = -1; dy <= fp; dy++) {
      for (let dx = -1; dx <= fp; dx++) {
        const onEdge = dx === -1 || dx === fp || dy === -1 || dy === fp;
        if (!onEdge) continue;
        const tx = bx + dx;
        const ty = by + dy;
        if (!this.grid.isPassable(tx, ty)) continue;
        const d = (tx - fromPos.x) ** 2 + (ty - fromPos.y) ** 2;
        if (d < bestDist) { bestDist = d; best = { x: tx, y: ty }; }
      }
    }
    return best;
  }

  private _findNearestUnoccupiedDeposit(
    kind: "wood" | "water",
    fromPos: Vec2,
    maxDistTiles?: number,
  ): ResourceDeposit | null {
    const maxDistSq = maxDistTiles !== undefined ? maxDistTiles * maxDistTiles : Infinity;
    const available = this.deposits.filter((d) => {
      if (d.kind !== kind || d.quantity <= 0 || this.depositOccupants.has(d.id)) return false;
      if (maxDistSq < Infinity) {
        const dx = d.position.x - fromPos.x;
        const dy = d.position.y - fromPos.y;
        if (dx * dx + dy * dy > maxDistSq) return false;
      }
      return true;
    });
    if (available.length === 0) return null;
    available.sort((a, b) => {
      const da = (a.position.x - fromPos.x) ** 2 + (a.position.y - fromPos.y) ** 2;
      const db = (b.position.x - fromPos.x) ** 2 + (b.position.y - fromPos.y) ** 2;
      return da - db;
    });
    return available[0]!;
  }

  /** Release deposit occupancy if the unit is currently gathering or in dropoffMove. */
  private _releaseDepositOccupancy(unit: UnitEntity): void {
    if (unit.state.kind === "gathering" || unit.state.kind === "gatherMove") {
      const occupant = this.depositOccupants.get(unit.state.depositId);
      if (occupant === unit.id) this.depositOccupants.delete(unit.state.depositId);
    }
  }

  // ── Production ────────────────────────────────────────────────────────────────

  private _processProduction(): void {
    for (const building of this.entities.buildings()) {
      if (building.state.kind !== "producing") continue;
      building.state.progressTicks++;
      if (building.state.progressTicks >= building.state.totalTicks) {
        const { unitTypeKey } = building.state;
        building.state = { kind: "operational" };
        this._spawnProducedUnit(building, unitTypeKey);
      }
    }
  }

  private _spawnProducedUnit(building: BuildingEntity, unitTypeKey: string): void {
    let stats: { maxHp: number; damage: number; range: number; speed: number; charisma: number; armor: number; capacity: number } | null = null;

    if (building.faction === "wizards") {
      const ws = wizardUnitStats[unitTypeKey];
      if (ws) stats = { maxHp: ws.hp, damage: ws.damage, range: ws.range, speed: ws.speed, charisma: ws.charisma, armor: ws.armor, capacity: ws.capacity };
    } else {
      const rs = robotUnitStats[unitTypeKey];
      if (rs) stats = { maxHp: rs.hpWood, damage: rs.damage, range: rs.range, speed: rs.speed, charisma: rs.charisma, armor: rs.armorWood, capacity: rs.capacity };
    }

    if (!stats) return;

    const spawnPos = this._findSpawnTile(building);
    if (!spawnPos) return;

    this.entities.add(
      new UnitEntity({
        faction: building.faction,
        typeKey: unitTypeKey,
        position: spawnPos,
        stats,
      }),
    );
  }

  private _findSpawnTile(building: BuildingEntity): Vec2 | null {
    const factionStats = building.faction === "wizards" ? wizardBuildingStats : robotBuildingStats;
    const fp = factionStats[building.typeKey]?.footprintTiles ?? 2;
    const bx = Math.floor(building.position.x);
    const by = Math.floor(building.position.y);

    // Check tiles in an expanding ring just outside the building footprint
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy < fp + r; dy++) {
        for (let dx = -r; dx < fp + r; dx++) {
          // Only check the perimeter of the expanded footprint at distance r
          const onPerimeter = dx === -r || dx === fp + r - 1 || dy === -r || dy === fp + r - 1;
          if (!onPerimeter) continue;
          const tx = bx + dx;
          const ty = by + dy;
          if (this.grid.isPassable(tx, ty) && !this._tileOccupiedByUnit(tx, ty, "")) {
            return { x: tx, y: ty };
          }
        }
      }
    }
    return null;
  }

  // ── Auto-collection ───────────────────────────────────────────────────────────

  private _processAutoCollection(): void {
    for (const building of this.entities.buildings()) {
      if (!building.isOperational) continue;
      if (building.typeKey === "waterExtractor") {
        this.resources[building.faction].water += autoCollectionRates.waterExtractorPerTick;
      } else if (building.typeKey === "watermill") {
        this.resources[building.faction].water += autoCollectionRates.watermillPerTick;
      }
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────────────

  private _nearestPassable(goal: Vec2): Vec2 | null {
    if (this.grid.isPassable(goal.x, goal.y)) return goal;

    const visited = new Set<string>();
    const queue: Vec2[] = [goal];
    visited.add(`${goal.x},${goal.y}`);

    while (queue.length > 0) {
      if (visited.size > 512) break;
      const cur = queue.shift()!;
      for (const nb of this.grid.neighbours8(cur.x, cur.y)) {
        const key = `${nb.x},${nb.y}`;
        if (visited.has(key)) continue;
        visited.add(key);
        if (this.grid.isPassable(nb.x, nb.y)) return nb;
        queue.push(nb);
      }
    }
    return null;
  }

  private _blockBuildingTiles(building: BuildingEntity): void {
    const factionStats = building.faction === "wizards" ? wizardBuildingStats : robotBuildingStats;
    const fp = factionStats[building.typeKey]?.footprintTiles ?? 2;
    const bx = Math.floor(building.position.x);
    const by = Math.floor(building.position.y);
    for (let dy = 0; dy < fp; dy++) {
      for (let dx = 0; dx < fp; dx++) {
        const tx = bx + dx;
        const ty = by + dy;
        this.grid.blockTile(tx, ty);
        // Clear any forest/resource tiles under the footprint — trees are removed when
        // a building is placed on them.
        // TODO(building-placement): validate that buildings cannot be placed on water tiles.
        const tile = this.grid.getTile(tx, ty);
        if (tile?.terrain === "forest") {
          this.grid.setTerrain(tx, ty, "open");
          const idx = this.deposits.findIndex((d) => d.position.x === tx && d.position.y === ty);
          if (idx !== -1) this.deposits.splice(idx, 1);
        }
      }
    }
  }

  private _tileOccupiedByUnit(x: number, y: number, excludeId: string): boolean {
    for (const u of this.entities.units()) {
      if (u.id === excludeId) continue;
      if (Math.round(u.position.x) === x && Math.round(u.position.y) === y) return true;
    }
    return false;
  }

  private _applyLevelUpBonus(unit: UnitEntity): void {
    const role = unitRoles[unit.typeKey] ?? "combat";
    const bonus = levelUpBonuses[role];
    unit.stats.applyLevelUp(bonus);
  }

  private _computePopulation(): Record<Faction, { count: number; cap: number }> {
    const result: Record<Faction, { count: number; cap: number }> = {
      wizards: { count: 0, cap: 0 },
      robots: { count: 0, cap: 0 },
    };
    for (const unit of this.entities.units()) result[unit.faction].count++;
    for (const building of this.entities.buildings()) {
      if (!building.isOperational) continue;
      const factionStats = building.faction === "wizards" ? wizardBuildingStats : robotBuildingStats;
      const support = factionStats[building.typeKey]?.populationSupport ?? 0;
      result[building.faction].cap += support;
    }
    return result;
  }

  private _buildDepositSnapshots(): DepositSnapshot[] {
    return this.deposits
      .filter((d) => d.quantity > 0)
      .map((d) => ({ id: d.id, kind: d.kind, position: d.position, quantity: d.quantity }));
  }

  // ── Fog ───────────────────────────────────────────────────────────────────────

  private tick(tick: number, elapsedMs: number): void {
    this._processMovement();
    this._processGathering();
    this._processProduction();
    this._processAutoCollection();
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
      population: this._computePopulation(),
      deposits: this._buildDepositSnapshots(),
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
      if (snapshot.kind !== "building") continue;
      if (fog.isVisible(snapshot.position.x, snapshot.position.y)) {
        ls.record(snapshot, tick);
      }
    }
  }

  getLastSeen(faction: Faction): LastSeenMap {
    return this.lastSeen[faction];
  }
}
