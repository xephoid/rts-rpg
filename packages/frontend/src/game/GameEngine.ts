// Game simulation engine — pure TypeScript, no imports from /renderer, /ui, /store.
// Pushes GameStateSnapshot to the store bridge after each tick via onTick callback.

import type { Faction, FactionStats, GameStateSnapshot, Vec2, DepositSnapshot, AttackEvent, SpellEvent } from "@neither/shared";
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
  unitPopulationBonus,
  robotUnitCosts,
  wizardUnitCosts,
  robotBuildingCosts,
  wizardBuildingCosts,
  gatherRates,
  GATHER_INTERVAL_TICKS,
  gatherXpPerTrip,
  TICKS_PER_SEC,
  autoCollectionRates,
  AUTO_COLLECTION_INTERVAL_TICKS,
  BUILDER_UNIT_TYPES,
  SINGLE_USE_BUILDERS,
  unitBuildingRequirements,
  resourceDropoffBuildings,
  buildingRequiresAdjacentWater,
  buildingResearch,
  researchCosts,
  xpRates,
  manaGen,
  spellCosts,
  illusionistInvisibilityResearchKey,
  illusionistTempControlDurationTicks,
  spellEffects,
  clericConfig,
  manaConfig,
  amphitheatreXpBoost,
  wizardTowerConfig,
  immobileCombatPlatformConfig,
  MILITARY_ROLES,
  CIVILIAN_UNIT_TYPES,
  DEFENSIVE_BUILDING_TYPES,
  HIDING_CAPABLE_BUILDINGS,
  HIDEABLE_UNIT_TYPES,
  hidingBuildingConfig,
  uiText,
} from "@neither/shared";
import { GameLoop, TICK_MS } from "./loop/GameLoop.js";
import { EntityManager } from "./entities/EntityManager.js";
import { EventBus } from "./events/EventBus.js";
import { Grid } from "./spatial/Grid.js";
import { SpatialIndex } from "./spatial/SpatialIndex.js";
import { generateMap, type ResourceDeposit, type MapSize } from "./map/MapGenerator.js";
import { FogOfWar } from "./fog/FogOfWar.js";
import { LastSeenMap } from "./fog/LastSeenMap.js";
import { Entity } from "./entities/Entity.js";
import { UnitEntity } from "./entities/UnitEntity.js";
import { BuildingEntity } from "./entities/BuildingEntity.js";
import { findPath } from "./spatial/Pathfinder.js";
import { MilitaryAI } from "./ai/MilitaryAI.js";

export type GameEngineConfig = {
  mapSize?: MapSize;
  seed?: number | undefined;
  playerFaction?: Faction;
  onTick: (state: GameStateSnapshot) => void;
  onAlert?: (message: string) => void;
};

export type ResourcePool = { wood: number; water: number; mana: number };

const FACTIONS: Faction[] = ["wizards", "robots"];
/** Ticks a unit waits on a blocked waypoint before replanning (~167ms at 60 ticks/s). */
const REPLAN_THRESHOLD = 10;
/** Ticks a unit waits behind a moving blocker before replanning — handles head-on deadlocks (~333ms). */
const DEADLOCK_THRESHOLD = 20;
/** Ticks a gatherer/dropoff unit waits before retrying pathfinding when no route is found (~1.5s). */
const GATHER_RETRY_DELAY_TICKS = 90;
/**
 * Unit types allowed to issue gather orders. Leaders + basic civilian units only.
 * TODO(capabilities): make this data-driven once a unit capability system exists.
 */
const GATHERER_TYPES = new Set(["archmage", "surf", "waterCollectionPlatform", "woodChopperPlatform"]);
/** Each robot platform that gathers may only harvest its specific resource kind. */
const PLATFORM_RESOURCE_RESTRICTION: Record<string, "wood" | "water"> = {
  woodChopperPlatform: "wood",
  waterCollectionPlatform: "water",
};
const ROBOT_PLATFORM_TYPES = new Set([
  "waterCollectionPlatform", "woodChopperPlatform", "movableBuildKitPlatform",
  "spinnerPlatform", "spitterPlatform", "infiltrationPlatform",
  "largeCombatPlatform", "probePlatform", "wallPlatform",
]);
const WIZARD_UNIT_TYPES = new Set(Object.keys(wizardUnitStats));
/**
 * Max tile radius a gatherer will search for the next deposit after exhausting one.
 * Initial guess: ~20 tiles (~1/3 of small map width). Adjust after playtesting.
 * TODO: ideally driven by unit vision range from FogOfWar once that API is stable.
 */
const GATHER_SEARCH_RADIUS = 20;
/** Vision radius for an unattached robot platform — low until a Core provides guidance. */
const UNATTACHED_PLATFORM_VISION_TILES = 2;

export class GameEngine {
  readonly entities: EntityManager;
  readonly events: EventBus;
  readonly grid: Grid;
  readonly spatialIndex: SpatialIndex;
  readonly deposits: ResourceDeposit[];
  readonly startingPositions: { x: number; y: number }[];

  private readonly loop: GameLoop;
  private readonly onTick: (state: GameStateSnapshot) => void;
  private readonly onAlert: ((message: string) => void) | undefined;
  private readonly fog: Record<Faction, FogOfWar>;
  private readonly lastSeen: Record<Faction, LastSeenMap>;

  private readonly resources: Record<Faction, ResourcePool> = {
    wizards: { ...startingResources },
    robots: { ...startingResources },
  };

  /** depositId → unitId currently harvesting that deposit (one gatherer per tile). */
  private readonly depositOccupants = new Map<string, string>();

  /** Attacks that fired this tick — included in snapshot, cleared after each tick. */
  private _attackEvents: AttackEvent[] = [];
  /** Spells cast this tick — included in snapshot, cleared after each tick. */
  private _spellEvents: SpellEvent[] = [];

  /** Research items permanently unlocked per faction. */
  private readonly _completedResearch = new Map<Faction, Set<string>>([
    ["wizards", new Set<string>()],
    ["robots",  new Set<string>()],
  ]);

  private readonly _ai: MilitaryAI | null;

  constructor({ mapSize = "medium", seed, playerFaction, onTick, onAlert }: GameEngineConfig) {
    this.onTick = onTick;
    this.onAlert = onAlert;
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

    if (playerFaction) {
      const aiFaction: Faction = playerFaction === "wizards" ? "robots" : "wizards";
      this._ai = new MilitaryAI(aiFaction);
    } else {
      this._ai = null;
    }
  }

  getResources(faction: Faction): ResourcePool {
    return this.resources[faction];
  }

  getPopulation(faction: Faction): { count: number; cap: number } {
    return this._computePopulation()[faction];
  }

  isValidBuildSite(faction: Faction, typeKey: string, pos: Vec2): boolean {
    return this._isValidBuildSite(faction, typeKey, pos);
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
        attackRange: 0,
        sightRange: wizardBuildingStats.castle!.visionRange,
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

    // Named archmage leader — add before finding next tile so _findSpawnTile skips this position
    const archmageStats = wizardUnitStats[namedLeaders.wizards.typeKey]!;
    const archmage = new UnitEntity({
      faction: "wizards",
      typeKey: namedLeaders.wizards.typeKey,
      position: this._findSpawnTile(wizCastle) ?? { x: wizPos.x, y: wizPos.y + 4 },
      stats: {
        maxHp: archmageStats.hp,
        damage: archmageStats.damage,
        attackRange: archmageStats.attackRange,
        sightRange: archmageStats.sightRange,
        speed: archmageStats.speed,
        charisma: archmageStats.charisma,
        armor: archmageStats.armor,
        capacity: archmageStats.capacity,
      },
      isNamed: true,
      name: namedLeaders.wizards.name,
      cannotBeConverted: archmageStats.cannotBeConverted ?? false,
    });
    this.entities.add(archmage);

    // 2 surfs flanking
    const surfStats = wizardUnitStats.surf!;
    for (let i = 0; i < 2; i++) {
      const surf = new UnitEntity({
        faction: "wizards",
        typeKey: "surf",
        position: this._findSpawnTile(wizCastle) ?? { x: wizPos.x + (i === 0 ? -1 : 1), y: wizPos.y + 4 },
        stats: {
          maxHp: surfStats.hp,
          damage: surfStats.damage,
          attackRange: surfStats.attackRange,
          sightRange: surfStats.sightRange,
          speed: surfStats.speed,
          charisma: surfStats.charisma,
          armor: surfStats.armor,
          capacity: surfStats.capacity,
        },
      });
      this.entities.add(surf);
    }

    // Robot home
    const robHome = new BuildingEntity({
      faction: "robots",
      typeKey: "home",
      position: { x: robPos.x, y: robPos.y },
      stats: {
        maxHp: robotBuildingStats.home!.hp,
        damage: 0,
        attackRange: 0,
        sightRange: robotBuildingStats.home!.visionRange,
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

    // Named Motherboard leader — add before finding next tile
    const motherboardStats = robotUnitStats.motherboard!;
    const motherboard = new UnitEntity({
      faction: "robots",
      typeKey: namedLeaders.robots.typeKey,
      position: this._findSpawnTile(robHome) ?? { x: robPos.x, y: robPos.y + 4 },
      stats: {
        maxHp: motherboardStats.hpWood,
        damage: motherboardStats.damage,
        attackRange: motherboardStats.attackRange,
        sightRange: motherboardStats.sightRange,
        speed: motherboardStats.speed,
        charisma: motherboardStats.charisma,
        armor: motherboardStats.armorWood,
        capacity: motherboardStats.capacity,
      },
      isNamed: true,
      name: namedLeaders.robots.name,
      cannotBeConverted: motherboardStats.cannotBeConverted ?? false,
    });
    motherboard.materialType = "wood";
    this.entities.add(motherboard);

    // 2 regular cores flanking
    const coreStats = robotUnitStats.core!;
    for (let i = 0; i < 2; i++) {
      const core = new UnitEntity({
        faction: "robots",
        typeKey: "core",
        position: this._findSpawnTile(robHome) ?? { x: robPos.x + (i === 0 ? -1 : 1), y: robPos.y + 4 },
        stats: {
          maxHp: coreStats.hpWood,
          damage: coreStats.damage,
          attackRange: coreStats.attackRange,
          sightRange: coreStats.sightRange,
          speed: coreStats.speed,
          charisma: coreStats.charisma,
          armor: coreStats.armorWood,
          capacity: coreStats.capacity,
        },
      });
      core.materialType = "wood";
      this.entities.add(core);
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
    if (ROBOT_PLATFORM_TYPES.has(unit.typeKey) && !unit.attachedCoreId) return; // unattached platforms can't self-move
    this._releaseDepositOccupancy(unit);
    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };

    const goal = this._nearestGoalForUnit(unit, { x: Math.floor(target.x), y: Math.floor(target.y) });
    const path = goal ? this._findPathForUnit(unit, start, goal) : null;

    if (!path) return;
    unit.state = { kind: "moving", targetPosition: goal!, path, yieldTicks: 0 };
  }

  issueGroupMoveOrder(entityIds: string[], target: Vec2): void {
    if (entityIds.length === 0) return;
    if (entityIds.length === 1) { this.issueMoveOrder(entityIds[0]!, target); return; }

    const tgt = { x: Math.floor(target.x), y: Math.floor(target.y) };

    // Gather eligible units, sorted closest-to-target first
    const units: UnitEntity[] = [];
    for (const id of entityIds) {
      const e = this.entities.get(id);
      if (!e || e.kind !== "unit") continue;
      const u = e as UnitEntity;
      if (ROBOT_PLATFORM_TYPES.has(u.typeKey) && !u.attachedCoreId) continue;
      units.push(u);
    }
    units.sort((a, b) =>
      Math.hypot(a.position.x - tgt.x, a.position.y - tgt.y) -
      Math.hypot(b.position.x - tgt.x, b.position.y - tgt.y)
    );

    // Generate candidate tiles spiralling outward from target
    const R = Math.ceil(Math.sqrt(units.length)) + 3;
    const candidates: Vec2[] = [];
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        candidates.push({ x: tgt.x + dx, y: tgt.y + dy });
      }
    }
    candidates.sort(
      (a, b) => (a.x - tgt.x) ** 2 + (a.y - tgt.y) ** 2 - ((b.x - tgt.x) ** 2 + (b.y - tgt.y) ** 2)
    );

    // All group members are excluded from each other's obstacle sets
    const groupIds = new Set(units.map((u) => u.id));

    // Assign each unit a unique destination
    const claimed = new Set<string>();
    for (const unit of units) {
      this._releaseDepositOccupancy(unit);
      const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
      let assigned = false;
      for (const pos of candidates) {
        const goal = this._nearestGoalForUnit(unit, pos);
        if (!goal) continue;
        const gk = `${goal.x},${goal.y}`;
        if (claimed.has(gk)) continue;
        const path = this._findPathForUnit(unit, start, goal, groupIds);
        if (!path) continue;
        claimed.add(gk);
        unit.state = { kind: "moving", targetPosition: goal, path, yieldTicks: 0 };
        assigned = true;
        break;
      }
      if (!assigned) unit.state = { kind: "idle" };
    }
  }

  issueFollowOrder(unitId: string, targetId: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (ROBOT_PLATFORM_TYPES.has(unit.typeKey) && !unit.attachedCoreId) return;
    if (unit.id === targetId) return;
    this._releaseDepositOccupancy(unit);
    unit.state = { kind: "following", targetId, path: [], yieldTicks: 0 };
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
    if (ROBOT_PLATFORM_TYPES.has(unit.typeKey) && !unit.attachedCoreId) return;
    this._releaseDepositOccupancy(unit);
    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const goal = this._nearestGoalForUnit(unit, { x: Math.floor(pointB.x), y: Math.floor(pointB.y) });
    const path = goal ? this._findPathForUnit(unit, start, goal) : null;
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
    if (!GATHERER_TYPES.has(unit.typeKey)) {
      // Non-gatherers move toward the deposit instead
      const deposit = this.deposits.find((d) => d.id === depositId);
      if (deposit) this.issueMoveOrder(entityId, deposit.position);
      return;
    }

    // Release any current deposit occupancy before reassigning
    this._releaseDepositOccupancy(unit);

    const deposit = this.deposits.find((d) => d.id === depositId);
    if (!deposit || deposit.quantity <= 0) return;

    // Robot platform types can only harvest their designated resource kind
    const restriction = PLATFORM_RESOURCE_RESTRICTION[unit.typeKey];
    if (restriction && deposit.kind !== restriction) return;

    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };

    const goal = this._nearestGoalForUnit(unit, { x: Math.floor(deposit.position.x), y: Math.floor(deposit.position.y) });
    // Terrain-only pathfinding — other units are not obstacles here; the movement
    // system handles yielding at runtime, so blocking unit positions causes false
    // "no path" failures for deposits near congested starting areas.
    const path = goal ? findPath(this.grid, start, goal) : null;

    if (!path) return;
    unit.state = { kind: "gatherMove", depositId, path, yieldTicks: 0 };
  }

  issueAttackOrder(unitId: string, targetId: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (ROBOT_PLATFORM_TYPES.has(unit.typeKey) && !unit.attachedCoreId) return;
    // Non-combatants (workers, civilians, Cleric, Enchantress, Surf…) can't attack.
    // Reject the order outright so the unit doesn't chase a target it can never hit.
    if (unit.stats.damage <= 0) return;
    const targetEntity = this.entities.get(targetId);
    if (!targetEntity) return;
    if (targetEntity.kind === "unit") {
      const t = targetEntity as UnitEntity;
      if (t.isFlying && !unit.canAttackAir) return;
      // Hidden occupants of towers / platforms / ICPs are unreachable — damage must
      // go through the containing building.
      if (t.state.kind === "platformShell" || t.state.kind === "garrisoned" || t.state.kind === "inPlatform") return;
    }
    this._releaseDepositOccupancy(unit);
    unit.state = { kind: "attacking", targetId, path: [], yieldTicks: 0 };
  }

  issueTalkOrder(unitId: string, targetId: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const target = this.entities.get(targetId);
    if (target?.kind === "unit" && (target as UnitEntity).cannotBeConverted) return;
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
    if (building.state.kind === "researching") return;

    // Queue cap: max 5 items total (active + queued)
    const activeCount = building.state.kind === "producing" ? 1 : 0;
    if (activeCount + building.productionQueue.length >= 5) return;

    // Gate: require prerequisite building to be operational
    const reqBuildingType = unitBuildingRequirements[unitTypeKey];
    if (reqBuildingType) {
      const hasReq = this.entities.buildingsByFaction(building.faction)
        .some((b) => b.typeKey === reqBuildingType && b.isOperational);
      if (!hasReq) return;
    }

    const costs = building.faction === "wizards" ? wizardUnitCosts : robotUnitCosts;
    const cost = costs[unitTypeKey];
    if (!cost) return;

    const res = this.resources[building.faction];
    if (res.wood < cost.wood || res.water < cost.water) return;

    const pop = this._computePopulation();
    const { count, cap } = pop[building.faction];
    // Count units already pending in all buildings' queues so we don't overshoot the cap.
    // Platforms are excluded (same rule as _computePopulation) so a full Core pop doesn't
    // block platform production.
    const consumesPop = (typeKey: string) => !ROBOT_PLATFORM_TYPES.has(typeKey);
    let pendingPop = 0;
    for (const b of this.entities.buildingsByFaction(building.faction)) {
      if (b.state.kind === "producing" && consumesPop(b.state.unitTypeKey)) pendingPop++;
      pendingPop += b.productionQueue.filter(consumesPop).length;
    }
    // Also skip the pop-cap check entirely when the unit being queued doesn't consume pop
    if (cap > 0 && consumesPop(unitTypeKey) && count + pendingPop >= cap) return;

    // Dragon Hoard gate: each operational Hoard supports exactly one Dragon
    if (unitTypeKey === "dragon" && building.faction === "wizards") {
      const hoardCount = this.entities.buildingsByFaction("wizards")
        .filter((b) => b.typeKey === "dragonHoard" && b.isOperational).length;
      const liveDragons = this.entities.unitsByFaction("wizards")
        .filter((u) => u.typeKey === "dragon").length;
      let queuedDragons = 0;
      for (const b of this.entities.buildingsByFaction("wizards")) {
        if (b.state.kind === "producing" && b.state.unitTypeKey === "dragon") queuedDragons++;
        queuedDragons += b.productionQueue.filter((k) => k === "dragon").length;
      }
      if (liveDragons + queuedDragons >= hoardCount) return;
    }

    // Deduct resources at enqueue time
    res.wood -= cost.wood;
    res.water -= cost.water;

    if (building.state.kind === "operational") {
      building.state = {
        kind: "producing",
        unitTypeKey,
        progressTicks: 0,
        totalTicks: Math.round(cost.productionTimeSec * TICKS_PER_SEC),
      };
    } else {
      // Already producing — enqueue
      building.productionQueue.push(unitTypeKey);
    }
  }

  issueCancelProduction(buildingId: string): void {
    const entity = this.entities.get(buildingId);
    if (!entity || entity.kind !== "building") return;
    const building = entity as BuildingEntity;

    const costs = building.faction === "wizards" ? wizardUnitCosts : robotUnitCosts;
    const res = this.resources[building.faction];

    if (building.state.kind === "producing") {
      // Refund current item
      const cost = costs[building.state.unitTypeKey];
      if (cost) {
        res.wood += cost.wood;
        res.water += cost.water;
      }
      // Promote next queued item if any
      if (building.productionQueue.length > 0) {
        const next = building.productionQueue.shift()!;
        const nextCost = costs[next];
        building.state = {
          kind: "producing",
          unitTypeKey: next,
          progressTicks: 0,
          totalTicks: nextCost ? Math.round(nextCost.productionTimeSec * TICKS_PER_SEC) : 0,
        };
      } else {
        building.state = { kind: "operational" };
      }
    } else if (building.productionQueue.length > 0) {
      // Cancel the last queued item (most recently added)
      const cancelled = building.productionQueue.pop()!;
      const cost = costs[cancelled];
      if (cost) {
        res.wood += cost.wood;
        res.water += cost.water;
      }
    }
  }

  issueResearchOrder(buildingId: string, researchKey: string): void {
    const entity = this.entities.get(buildingId);
    if (!entity || entity.kind !== "building") return;
    const building = entity as BuildingEntity;
    if (building.state.kind !== "operational") return;

    const cost = researchCosts[researchKey as keyof typeof researchCosts];
    if (!cost) return;

    if (this._completedResearch.get(building.faction)?.has(researchKey)) return;

    const res = this.resources[building.faction];
    if (res.wood < cost.wood || res.water < cost.water) return;

    res.wood -= cost.wood;
    res.water -= cost.water;
    building.state = {
      kind: "researching",
      researchKey,
      progressTicks: 0,
      totalTicks: Math.round(cost.durationSec * TICKS_PER_SEC),
    };
  }

  issueCancelResearchOrder(buildingId: string): void {
    const entity = this.entities.get(buildingId);
    if (!entity || entity.kind !== "building") return;
    const building = entity as BuildingEntity;
    if (building.state.kind !== "researching") return;

    const cost = researchCosts[building.state.researchKey as keyof typeof researchCosts];
    if (cost) {
      this.resources[building.faction].wood += cost.wood;
      this.resources[building.faction].water += cost.water;
    }
    building.state = { kind: "operational" };
  }

  issueAttachOrder(coreId: string, platformId: string): void {
    const coreEntity = this.entities.get(coreId);
    if (!coreEntity || coreEntity.kind !== "unit") return;
    const core = coreEntity as UnitEntity;
    if ((core.typeKey !== "core" && core.typeKey !== "motherboard") || core.faction !== "robots" || core.attachedPlatformTypeKey) return;

    const platformEntity = this.entities.get(platformId);
    if (!platformEntity || platformEntity.kind !== "unit") return;
    const platform = platformEntity as UnitEntity;
    if (!ROBOT_PLATFORM_TYPES.has(platform.typeKey) || platform.faction !== "robots" || platform.attachedCoreId !== null) return;

    const start = { x: Math.round(core.position.x), y: Math.round(core.position.y) };
    const goal = this._nearestAttachTile(platform.position, core.position);
    if (!goal) return;
    const path = findPath(this.grid, start, goal) ?? [];
    core.state = { kind: "attachMove", platformId, path, yieldTicks: 0 };
  }

  issueDetachOrder(platformId: string): void {
    const platformEntity = this.entities.get(platformId);
    if (!platformEntity || platformEntity.kind !== "unit") return;
    const platform = platformEntity as UnitEntity;
    if (!platform.attachedCoreId) return;

    const coreEntity = this.entities.get(platform.attachedCoreId);
    if (!coreEntity || coreEntity.kind !== "unit") return;
    const core = coreEntity as UnitEntity;

    // Eject Core to an adjacent tile, never the platform's own tile
    const px = Math.round(platform.position.x);
    const py = Math.round(platform.position.y);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
                  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];
    let ejectPos: Vec2 = platform.position;
    for (const d of dirs) {
      const tx = px + d.x;
      const ty = py + d.y;
      if (this.grid.isPassable(tx, ty) && !this._tileOccupiedByUnit(tx, ty, core.id, false)) {
        ejectPos = { x: tx, y: ty };
        break;
      }
    }

    core.position = { ...ejectPos };
    core.attachedPlatformId = null;
    core.attachedPlatformTypeKey = null;
    core.state = { kind: "idle" };

    platform.attachedCoreId = null;
    platform.state = { kind: "idle" }; // cancel any in-flight movement
  }

  issueGarrisonOrder(unitId: string, towerId: string): void {
    const unitEntity = this.entities.get(unitId);
    if (!unitEntity || unitEntity.kind !== "unit") return;
    const unit = unitEntity as UnitEntity;
    if (unit.faction !== "wizards") return;
    if (unit.typeKey !== "evoker" && unit.typeKey !== "archmage") return;
    if (unit.garrisonedBuildingId) return;

    const towerEntity = this.entities.get(towerId);
    if (!towerEntity || towerEntity.kind !== "building") return;
    const tower = towerEntity as BuildingEntity;
    if (tower.typeKey !== "wizardTower" || !tower.isOperational || tower.garrisonedUnitId) return;

    this._releaseDepositOccupancy(unit);
    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const goal = this._nearestAttachTile(tower.position, unit.position);
    if (!goal) return;
    // null = no path found; don't allow empty path fallback or unit teleports to tower
    const path = this._findPathForUnit(unit, start, goal) ?? findPath(this.grid, start, goal);
    if (path === null) return;
    unit.state = { kind: "garrisonMove", buildingId: towerId, path, yieldTicks: 0 };
  }

  issueLeaveGarrisonOrder(unitId: string, minUnitHp = 0): void {
    const unitEntity = this.entities.get(unitId);
    if (!unitEntity || unitEntity.kind !== "unit") return;
    const unit = unitEntity as UnitEntity;
    if (unit.state.kind !== "garrisoned") return;

    const towerEntity = this.entities.get(unit.state.buildingId);
    const tower = towerEntity?.kind === "building" ? towerEntity as BuildingEntity : null;

    const px = Math.round(unit.position.x);
    const py = Math.round(unit.position.y);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
                  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];
    let ejectPos: Vec2 = { x: px + 1, y: py };
    for (const d of dirs) {
      const tx = px + d.x;
      const ty = py + d.y;
      if (this.grid.isPassable(tx, ty) && !this._tileOccupiedByUnit(tx, ty, unit.id, false)) {
        ejectPos = { x: tx, y: ty };
        break;
      }
    }

    if (tower) this._releaseFromBuilding(unit, tower, minUnitHp);
    unit.position = ejectPos;
    unit.garrisonedBuildingId = null;
    unit.state = { kind: "idle" };
    if (tower) tower.garrisonedUnitId = null;
  }

  /** Send a free Core to enter an Immobile Combat Platform. */
  issueEnterPlatformOrder(coreId: string, platformId: string): void {
    const coreEntity = this.entities.get(coreId);
    if (!coreEntity || coreEntity.kind !== "unit") return;
    const core = coreEntity as UnitEntity;
    if (core.typeKey !== "core") return;
    if (core.state.kind === "platformShell" || core.attachedPlatformId) return;

    const platformEntity = this.entities.get(platformId);
    if (!platformEntity || platformEntity.kind !== "building") return;
    const platform = platformEntity as BuildingEntity;
    if (platform.typeKey !== "immobileCombatPlatform" || !platform.isOperational) return;
    if (platform.faction !== core.faction) return;

    const factionStats = robotBuildingStats;
    const cap = factionStats[platform.typeKey]?.occupantCapacity ?? 1;
    if (platform.occupantIds.size >= cap) return;
    if (platform.occupantIds.has(core.id)) return;

    this._releaseDepositOccupancy(core);
    const start = { x: Math.round(core.position.x), y: Math.round(core.position.y) };
    const goal = this._nearestAttachTile(platform.position, core.position);
    if (!goal) return;
    const path = this._findPathForUnit(core, start, goal) ?? findPath(this.grid, start, goal);
    if (path === null) return;
    core.state = { kind: "enterPlatformMove", platformId, path, yieldTicks: 0 };
  }

  /** Eject a Core from the Immobile Combat Platform it currently occupies. */
  issueLeavePlatformOrder(coreId: string, minUnitHp = 0): void {
    const coreEntity = this.entities.get(coreId);
    if (!coreEntity || coreEntity.kind !== "unit") return;
    const core = coreEntity as UnitEntity;
    if (core.state.kind !== "inPlatform") return;

    const platformEntity = this.entities.get(core.state.platformId);
    const platform = platformEntity?.kind === "building" ? (platformEntity as BuildingEntity) : null;

    const anchor = platform ? platform.position : core.position;
    const px = Math.round(anchor.x);
    const py = Math.round(anchor.y);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
                  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];
    let ejectPos: Vec2 = { x: px + 1, y: py };
    for (const d of dirs) {
      const tx = px + d.x;
      const ty = py + d.y;
      if (this.grid.isPassable(tx, ty) && !this._tileOccupiedByUnit(tx, ty, core.id, false)) {
        ejectPos = { x: tx, y: ty };
        break;
      }
    }

    if (platform) this._releaseFromBuilding(core, platform, minUnitHp);
    core.position = ejectPos;
    core.state = { kind: "idle" };
    if (platform) platform.occupantIds.delete(core.id);
  }

  /** Building-side eject: the garrisoned unit (wizardTower) or all occupant Cores
   *  (immobileCombatPlatform) exit, and any units hiding in a Cottage/Recharge Station
   *  leave their cover. Called from the building's commands panel since the occupants
   *  are invisible on the map and can't be right-clicked. */
  issueEjectOccupantsOrder(buildingId: string): void {
    const entity = this.entities.get(buildingId);
    if (!entity || entity.kind !== "building") return;
    const building = entity as BuildingEntity;
    if (building.garrisonedUnitId) {
      this.issueLeaveGarrisonOrder(building.garrisonedUnitId);
    }
    if (building.occupantIds.size > 0) {
      for (const id of [...building.occupantIds]) {
        const occupantEntity = this.entities.get(id);
        if (!occupantEntity || occupantEntity.kind !== "unit") continue;
        const occupant = occupantEntity as UnitEntity;
        if (occupant.state.kind === "hidingInBuilding") {
          this.issueLeaveHidingOrder(id);
        } else if (occupant.state.kind === "inPlatform") {
          this.issueLeavePlatformOrder(id);
        }
      }
    }
  }

  /** Civilian / leader enters a friendly Cottage or Recharge Station to hide from
   *  opposing vision. Unit stays inside until ordered out or forced out by a spy. */
  issueHideOrder(unitId: string, buildingId: string): void {
    const unitEntity = this.entities.get(unitId);
    if (!unitEntity || unitEntity.kind !== "unit") return;
    const unit = unitEntity as UnitEntity;
    if (!HIDEABLE_UNIT_TYPES.has(unit.typeKey)) return;
    if (unit.state.kind === "platformShell" || unit.state.kind === "hidingInBuilding") return;

    const buildingEntity = this.entities.get(buildingId);
    if (!buildingEntity || buildingEntity.kind !== "building") return;
    const building = buildingEntity as BuildingEntity;
    if (!HIDING_CAPABLE_BUILDINGS.has(building.typeKey)) return;
    if (!building.isOperational) return;
    if (building.faction !== unit.faction) return;
    if (building.occupantIds.size >= hidingBuildingConfig.hiddenCapacityOverride) return;

    this._releaseDepositOccupancy(unit);
    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const goal = this._nearestAttachTile(building.position, unit.position);
    if (!goal) return;
    const path = this._findPathForUnit(unit, start, goal) ?? findPath(this.grid, start, goal);
    if (path === null) return;
    unit.state = { kind: "hideMove", buildingId: building.id, path, yieldTicks: 0 };
  }

  /** Exit a hiding-in-building unit onto an adjacent tile. */
  issueLeaveHidingOrder(unitId: string): void {
    const unitEntity = this.entities.get(unitId);
    if (!unitEntity || unitEntity.kind !== "unit") return;
    const unit = unitEntity as UnitEntity;
    if (unit.state.kind !== "hidingInBuilding") return;

    const buildingEntity = this.entities.get(unit.state.buildingId);
    const building = buildingEntity?.kind === "building" ? (buildingEntity as BuildingEntity) : null;
    const anchor = building?.position ?? unit.position;

    const eject = this._findEjectTile(anchor, unit.id) ?? { x: Math.round(anchor.x) + 1, y: Math.round(anchor.y) };
    unit.position = eject;
    unit.state = { kind: "idle" };
    if (building) {
      building.occupantIds.delete(unit.id);
      this._releaseFromBuilding(unit, building, 0);
    }
  }

  /** Spy infiltrates an enemy Cottage / Recharge Station. On arrival the force-out
   *  handler runs: Illusionist converts + ejects all hidden occupants; Infiltration
   *  Platform enters and waits for player-issued attacks on occupants. */
  issueInfiltrateOrder(spyId: string, buildingId: string): void {
    const unitEntity = this.entities.get(spyId);
    if (!unitEntity || unitEntity.kind !== "unit") return;
    const unit = unitEntity as UnitEntity;
    if (unit.typeKey !== "illusionist" && unit.typeKey !== "infiltrationPlatform") return;

    const buildingEntity = this.entities.get(buildingId);
    if (!buildingEntity || buildingEntity.kind !== "building") return;
    const building = buildingEntity as BuildingEntity;
    if (!HIDING_CAPABLE_BUILDINGS.has(building.typeKey)) return;
    if (!building.isOperational) return;
    if (building.faction === unit.faction) return;

    this._releaseDepositOccupancy(unit);
    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const goal = this._nearestAttachTile(building.position, unit.position);
    if (!goal) return;
    const path = this._findPathForUnit(unit, start, goal) ?? findPath(this.grid, start, goal);
    if (path === null) return;
    unit.state = { kind: "infiltrateBuilding", buildingId: building.id, path, yieldTicks: 0 };
  }

  /**
   * Infiltration Platform attack-from-inside. The platform must be in `inEnemyBuilding`
   * state and the target must be a hiding occupant of the same building. On hit the
   * occupant is ejected to an adjacent tile still hostile; if HP drops to 0 the
   * standard death handler runs.
   */
  issueInfiltrateAttack(platformId: string, occupantId: string): void {
    const platformEntity = this.entities.get(platformId);
    if (!platformEntity || platformEntity.kind !== "unit") return;
    const platform = platformEntity as UnitEntity;
    if (platform.typeKey !== "infiltrationPlatform") return;
    if (platform.state.kind !== "inEnemyBuilding") return;
    if (platform.attackCooldownTicks > 0) return;

    const occupantEntity = this.entities.get(occupantId);
    if (!occupantEntity || occupantEntity.kind !== "unit") return;
    const occupant = occupantEntity as UnitEntity;
    if (occupant.state.kind !== "hidingInBuilding") return;
    if (occupant.state.buildingId !== platform.state.buildingId) return;

    const buildingEntity = this.entities.get(platform.state.buildingId);
    if (!buildingEntity || buildingEntity.kind !== "building") return;
    const building = buildingEntity as BuildingEntity;

    const dmg = Math.max(1, platform.stats.damage - occupant.stats.armor);
    occupant.stats.hp -= dmg;

    // Always eject on hit — forces the target out of cover regardless of survival.
    const eject = this._findEjectTile(building.position, occupant.id);
    if (eject) occupant.position = eject;
    building.occupantIds.delete(occupant.id);
    occupant.state = { kind: "idle" };

    this._attackEvents.push({
      attackerId: platform.id,
      targetId: occupant.id,
      attackerPos: { ...platform.position },
      targetPos: { ...occupant.position },
      ranged: false,
    });
    this.onAlert?.(uiText.spy.alertForcedOut(occupant.name ?? occupant.typeKey));

    const platformStats = robotUnitStats[platform.typeKey];
    platform.attackCooldownTicks = Math.round((platformStats?.attackIntervalSec ?? 1.0) * TICKS_PER_SEC);

    if (occupant.stats.hp <= 0) this._handleEntityDeath(occupant, platform.id);
  }

  issueBuildOrder(unitId: string, buildingTypeKey: string, topLeft: Vec2): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (!BUILDER_UNIT_TYPES.has(unit.typeKey)) return;
    // Robot build kits need a Core attached — without one they can't self-move, so
    // they can't walk to the site either. Matches the issueMoveOrder rule.
    if (ROBOT_PLATFORM_TYPES.has(unit.typeKey) && !unit.attachedCoreId) return;

    if (!this._isValidBuildSite(unit.faction, buildingTypeKey, topLeft)) return;

    const costs = unit.faction === "wizards" ? wizardBuildingCosts : robotBuildingCosts;
    const cost = costs[buildingTypeKey];
    if (!cost) return;

    const res = this.resources[unit.faction];
    if (res.wood < cost.wood || res.water < cost.water) return;
    res.wood -= cost.wood;
    res.water -= cost.water;

    const factionStats = unit.faction === "wizards" ? wizardBuildingStats : robotBuildingStats;
    const bStats = factionStats[buildingTypeKey];
    if (!bStats) return;

    const building = new BuildingEntity({
      faction: unit.faction,
      typeKey: buildingTypeKey,
      position: topLeft,
      stats: {
        maxHp: bStats.hp,
        damage: 0,
        attackRange: 0,
        sightRange: bStats.visionRange,
        speed: 0,
        charisma: 0,
        armor: 0,
        capacity: bStats.occupantCapacity,
      },
      constructionTicks: Math.round(cost.constructionTimeSec * TICKS_PER_SEC),
    });
    this.entities.add(building);
    this._blockBuildingTiles(building);

    const entry = this._nearestBuildingEntryPoint(building, unit.position);
    if (!entry) { unit.state = { kind: "constructing", buildingId: building.id }; return; }

    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const path = findPath(this.grid, start, entry);
    if (path && path.length > 0) {
      unit.state = { kind: "buildMove", buildingId: building.id, path, yieldTicks: 0 };
    } else {
      unit.state = { kind: "constructing", buildingId: building.id };
    }
  }

  private _isValidBuildSite(faction: Faction, buildingTypeKey: string, topLeft: Vec2): boolean {
    const factionStats = faction === "wizards" ? wizardBuildingStats : robotBuildingStats;
    const fp = factionStats[buildingTypeKey]?.footprintTiles ?? 1;
    for (let dy = 0; dy < fp; dy++) {
      for (let dx = 0; dx < fp; dx++) {
        const tx = topLeft.x + dx;
        const ty = topLeft.y + dy;
        if (!this.grid.inBounds(tx, ty)) return false;
        const tile = this.grid.getTile(tx, ty);
        if (tile?.terrain === "water") return false;
        if (this.grid.isBlocked(tx, ty)) return false;
        // Prevent building on active resource deposits
        const hasDeposit = this.deposits.some(
          (d) => d.position.x === tx && d.position.y === ty && d.quantity > 0
        );
        if (hasDeposit) return false;
      }
    }
    // Water-adjacent buildings must touch at least one water tile
    if (buildingRequiresAdjacentWater.has(buildingTypeKey)) {
      if (!this._isAdjacentToWater(topLeft, fp)) return false;
    }
    return true;
  }

  private _isAdjacentToWater(topLeft: Vec2, footprintTiles: number): boolean {
    for (let dy = 0; dy < footprintTiles; dy++) {
      for (let dx = 0; dx < footprintTiles; dx++) {
        const tx = topLeft.x + dx;
        const ty = topLeft.y + dy;
        for (const nb of this.grid.neighbours4(tx, ty)) {
          if (this.grid.getTile(nb.x, nb.y)?.terrain === "water") return true;
        }
      }
    }
    return false;
  }

  private _processConstruction(): void {
    for (const unit of this.entities.units()) {
      if (unit.state.kind !== "constructing") continue;
      // Robot build kits that had their Core detached mid-construction can no longer
      // work. Snap them back to idle — without a Core they can't operate at all.
      if (ROBOT_PLATFORM_TYPES.has(unit.typeKey) && !unit.attachedCoreId) {
        unit.state = { kind: "idle" };
        continue;
      }
      const { buildingId } = unit.state;
      const bEntity = this.entities.get(buildingId);
      if (!bEntity || bEntity.kind !== "building") { unit.state = { kind: "idle" }; continue; }
      const building = bEntity as BuildingEntity;
      if (building.state.kind !== "underConstruction") { unit.state = { kind: "idle" }; continue; }
      const done = building.advanceConstruction();
      if (done) {
        if (SINGLE_USE_BUILDERS.has(unit.typeKey)) {
          // Eject any attached Core before removing the platform
          if (unit.attachedCoreId) this.issueDetachOrder(unit.id);
          this.entities.remove(unit.id);
        } else {
          unit.state = { kind: "idle" };
        }
      }
    }
  }

  issueResumeConstructionOrder(unitId: string, buildingId: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (!BUILDER_UNIT_TYPES.has(unit.typeKey)) return;
    if (ROBOT_PLATFORM_TYPES.has(unit.typeKey) && !unit.attachedCoreId) return;

    const bEntity = this.entities.get(buildingId);
    if (!bEntity || bEntity.kind !== "building") return;
    const building = bEntity as BuildingEntity;
    if (building.state.kind !== "underConstruction") return;
    if (building.faction !== unit.faction) return;

    const entry = this._nearestBuildingEntryPoint(building, unit.position);
    if (!entry) { unit.state = { kind: "constructing", buildingId }; return; }

    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const path = findPath(this.grid, start, entry);
    if (path && path.length > 0) {
      unit.state = { kind: "buildMove", buildingId, path, yieldTicks: 0 };
    } else {
      unit.state = { kind: "constructing", buildingId };
    }
  }

  issueDemolishOrder(buildingId: string): void {
    const entity = this.entities.get(buildingId);
    if (!entity || entity.kind !== "building") return;
    const building = entity as BuildingEntity;

    // No resource refund — spec: "Removing a building permanently destroys it with no resource refund."
    // Release any builders working on this building
    for (const unit of this.entities.unitsByFaction(building.faction)) {
      if (
        (unit.state.kind === "constructing" || unit.state.kind === "buildMove") &&
        unit.state.buildingId === buildingId
      ) {
        unit.state = { kind: "idle" };
      }
    }

    this._unblockBuildingTiles(building);
    this.entities.remove(buildingId);
  }

  private _unblockBuildingTiles(building: BuildingEntity): void {
    const factionStats = building.faction === "wizards" ? wizardBuildingStats : robotBuildingStats;
    const fp = factionStats[building.typeKey]?.footprintTiles ?? 2;
    const bx = Math.floor(building.position.x);
    const by = Math.floor(building.position.y);
    for (let dy = 0; dy < fp; dy++) {
      for (let dx = 0; dx < fp; dx++) {
        this.grid.unblockTile(bx + dx, by + dy);
      }
    }
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

  private _syncGarrisonedPositions(): void {
    for (const unit of this.entities.units()) {
      if (unit.state.kind === "garrisoned") {
        const tower = this.entities.get(unit.state.buildingId);
        if (tower) unit.position = { ...tower.position };
        else { unit.garrisonedBuildingId = null; unit.state = { kind: "idle" }; }
      } else if (unit.state.kind === "inPlatform") {
        const platform = this.entities.get(unit.state.platformId) as BuildingEntity | undefined;
        if (platform) unit.position = { ...platform.position };
        else unit.state = { kind: "idle" };
      }
    }
  }

  private _processFollowing(): void {
    for (const unit of this.entities.units()) {
      if (unit.stats.hp <= 0 || !this.entities.has(unit.id)) continue;
      if (unit.state.kind !== "following") continue;
      const { targetId } = unit.state;
      const target = this.entities.get(targetId);
      if (!target || target.stats.hp <= 0) { unit.state = { kind: "idle" }; continue; }

      const dist = Math.hypot(unit.position.x - target.position.x, unit.position.y - target.position.y);
      if (dist <= 1.5) {
        unit.state = { ...unit.state, path: [], yieldTicks: 0 };
        continue;
      }

      if (unit.state.path.length === 0) {
        const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
        const goal = this._nearestGoalForUnit(unit, { x: Math.round(target.position.x), y: Math.round(target.position.y) });
        const path = goal ? this._findPathForUnit(unit, start, goal) : null;
        if (path && path.length > 0) unit.state = { ...unit.state, path, yieldTicks: 0 };
      }
    }
  }

  private _processMovement(): void {
    for (const unit of this.entities.units()) {
      const kind = unit.state.kind;
      if (kind === "moving" || kind === "patrolling" || kind === "gatherMove" || kind === "dropoffMove" || kind === "buildMove" || kind === "attacking" || kind === "attachMove" || kind === "following" || kind === "garrisonMove" || kind === "enterPlatformMove" || kind === "hideMove" || kind === "infiltrateBuilding") {
        this._advanceUnit(unit, TICK_MS / 1000);
      }
    }
  }

  private _processGarrisonedAttacks(): void {
    for (const unit of this.entities.units()) {
      if (unit.state.kind !== "garrisoned") continue;
      if (!this.entities.has(unit.id) || unit.stats.hp <= 0) continue;
      if (unit.attackCooldownTicks > 0) { unit.attackCooldownTicks--; continue; }

      const effectiveRange = unit.stats.attackRange + wizardTowerConfig.rangeBonus;
      let bestTarget: Entity | null = null;
      let bestDist = Infinity;
      for (const e of this.entities.all()) {
        if (e.faction === unit.faction) continue;
        if (e.stats.hp <= 0) continue;
        if (e.kind === "unit") {
          const eu = e as UnitEntity;
          if (eu.state.kind === "platformShell" || eu.state.kind === "garrisoned" || eu.state.kind === "inPlatform") continue;
        }
        if (e.kind === "unit" && (e as UnitEntity).isFlying && !unit.canAttackAir) continue;
        if (!this._isTargetableBy(e, unit.faction)) continue;
        const d = Math.hypot(e.position.x - unit.position.x, e.position.y - unit.position.y);
        if (d <= effectiveRange + this._targetSizeRangeBonus(e) && d < bestDist) { bestDist = d; bestTarget = e; }
      }
      if (!bestTarget) continue;

      let dmg = Math.max(0, unit.stats.damage + wizardTowerConfig.damageBonus - bestTarget.stats.armor);
      if (bestTarget.kind === "unit" && (bestTarget as UnitEntity).manaShielded)
        dmg = Math.floor(dmg * (1 - spellCosts.manaShieldDamageReduction));
      bestTarget.stats.hp -= dmg;

      this._attackEvents.push({
        attackerId: unit.id,
        targetId: bestTarget.id,
        attackerPos: { ...unit.position },
        targetPos: { ...bestTarget.position },
        ranged: effectiveRange > 1,
      });

      const statConfig = wizardUnitStats[unit.typeKey];
      unit.attackCooldownTicks = Math.round((statConfig?.attackIntervalSec ?? 1.0) * TICKS_PER_SEC);

      if (bestTarget.stats.hp <= 0) this._handleEntityDeath(bestTarget, unit.id);
    }
  }

  /**
   * Immobile Combat Platform fire loop.
   *
   * Shell model. Zero Cores → no attack. 1+ Cores → platform fires with fixed
   * `baseDamage` and `baseAttackRange`; each additional Core linearly scales the
   * attack rate by shortening the cooldown (interval = baseInterval / occupants).
   * Sight range is separately boosted per-Core in `_buildingVisionRange`. The
   * platform can target air — a turret with a stack of Cores pointing up is
   * plausibly anti-air, and wizards/robots need *something* cheap that shoots
   * flyers without tech-tree gating.
   */
  private _processImmobileCombatPlatformAttacks(): void {
    for (const platform of this.entities.buildings()) {
      if (platform.typeKey !== "immobileCombatPlatform" || !platform.isOperational) continue;
      if (platform.stats.hp <= 0 || !this.entities.has(platform.id)) continue;

      // Sweep stale occupant refs — a Core removed through a non-standard path would
      // inflate `occupantIds.size` and mis-report the turret's firing rate. A valid
      // occupant is still in the entity map, still a unit, and still in `inPlatform`
      // state pointing at *this* platform.
      for (const id of [...platform.occupantIds]) {
        const occ = this.entities.get(id);
        if (!occ || occ.kind !== "unit") { platform.occupantIds.delete(id); continue; }
        const ou = occ as UnitEntity;
        if (ou.state.kind !== "inPlatform" || ou.state.platformId !== platform.id) {
          platform.occupantIds.delete(id);
        }
      }

      const occupants = platform.occupantIds.size;
      if (occupants === 0) continue;

      if (platform.attackCooldownTicks > 0) { platform.attackCooldownTicks--; continue; }

      const damage = immobileCombatPlatformConfig.baseDamage;
      const attackRange = immobileCombatPlatformConfig.baseAttackRange;
      const intervalSec = immobileCombatPlatformConfig.baseAttackIntervalSec / occupants;

      let bestTarget: Entity | null = null;
      let bestDist = Infinity;
      for (const e of this.entities.all()) {
        if (e.faction === platform.faction) continue;
        if (e.stats.hp <= 0) continue;
        if (e.kind === "unit") {
          const eu = e as UnitEntity;
          if (eu.state.kind === "platformShell" || eu.state.kind === "garrisoned" || eu.state.kind === "inPlatform") continue;
        }
        if (!this._isTargetableBy(e, platform.faction)) continue;
        const d = Math.hypot(e.position.x - platform.position.x, e.position.y - platform.position.y);
        if (d <= attackRange + this._targetSizeRangeBonus(e) && d < bestDist) { bestDist = d; bestTarget = e; }
      }
      if (!bestTarget) continue;

      let dmg = Math.max(0, damage - bestTarget.stats.armor);
      if (bestTarget.kind === "unit" && (bestTarget as UnitEntity).manaShielded) {
        dmg = Math.floor(dmg * (1 - spellCosts.manaShieldDamageReduction));
      }
      bestTarget.stats.hp -= dmg;

      this._attackEvents.push({
        attackerId: platform.id,
        targetId: bestTarget.id,
        attackerPos: { ...platform.position },
        targetPos: { ...bestTarget.position },
        ranged: true,
      });

      platform.attackCooldownTicks = Math.round(intervalSec * TICKS_PER_SEC);

      if (bestTarget.stats.hp <= 0) this._handleEntityDeath(bestTarget, platform.id);
    }
  }

  private _advanceUnit(unit: UnitEntity, stepSecs: number): void {
    if (unit.stats.hp <= 0 || !this.entities.has(unit.id)) return;
    const state = unit.state;
    if (
      state.kind !== "moving" &&
      state.kind !== "patrolling" &&
      state.kind !== "gatherMove" &&
      state.kind !== "dropoffMove" &&
      state.kind !== "buildMove" &&
      state.kind !== "attacking" &&
      state.kind !== "attachMove" &&
      state.kind !== "following" &&
      state.kind !== "garrisonMove" &&
      state.kind !== "enterPlatformMove" &&
      state.kind !== "hideMove" &&
      state.kind !== "infiltrateBuilding"
    ) return;
    if (state.kind === "attacking" && state.path.length === 0) return;
    if (state.kind === "following" && state.path.length === 0) return;

    let remaining = unit.stats.speed * stepSecs;

    while (remaining > 0 && state.path.length > 0) {
      const next = state.path[0]!;

      // Yield if next tile is occupied by another unit of the same layer (flying vs ground)
      if (this._tileOccupiedByUnit(next.x, next.y, unit.id, unit.isFlying)) {
        const blocker = this._unitAt(next.x, next.y, unit.id, unit.isFlying);
        const blockerMoving = blocker && blocker.state.kind !== "idle" && blocker.state.kind !== "gathering" && blocker.state.kind !== "constructing" && blocker.state.kind !== "converting" && blocker.state.kind !== "platformShell" && blocker.state.kind !== "garrisoned" && blocker.state.kind !== "inPlatform";

        const isApproach = state.kind === "gatherMove" || state.kind === "dropoffMove" ||
          state.kind === "garrisonMove" || state.kind === "attachMove" || state.kind === "buildMove" ||
          state.kind === "enterPlatformMove";
        const isFinalTile = state.path.length === 1;

        if (!blockerMoving) {
          // Stationary blocker: on first block attempt, try to find a detour around idle units.
          if (state.yieldTicks === 0 && !isFinalTile) {
            const finalGoal = state.path[state.path.length - 1]!;
            const cur = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
            const detour = this._findPathAroundIdleUnits(unit, cur, finalGoal);
            if (detour && detour.length > 0) {
              state.path = detour;
              state.yieldTicks = 0;
              break; // retry on next tick with the detour path
            }
          }
          // Nudge idle friendly blocker (for any movement type, not just gather)
          if (state.yieldTicks === 0 && blocker && blocker.faction === unit.faction) {
            this._nudgeUnit(blocker);
          }
        } else if (blocker && !isFinalTile) {
          // Moving blocker: detect head-on swap (blocker's next tile is our current tile).
          // Without intervention, both units sit in the moving-blocker wait and re-path to
          // the same terrain-only route on deadlock, causing a permanent stall.
          const cur = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
          const blockerNext =
            (blocker.state.kind === "moving" || blocker.state.kind === "patrolling" ||
             blocker.state.kind === "gatherMove" || blocker.state.kind === "dropoffMove" ||
             blocker.state.kind === "buildMove" || blocker.state.kind === "attacking" ||
             blocker.state.kind === "attachMove" || blocker.state.kind === "following" ||
             blocker.state.kind === "garrisonMove" || blocker.state.kind === "enterPlatformMove" ||
             blocker.state.kind === "hideMove" || blocker.state.kind === "infiltrateBuilding")
              ? blocker.state.path[0]
              : undefined;
          const headOn = blockerNext && blockerNext.x === cur.x && blockerNext.y === cur.y;
          if (headOn && state.yieldTicks === 0) {
            // Try to route around the blocker's current tile immediately.
            const blockerTile = { x: Math.round(blocker.position.x), y: Math.round(blocker.position.y) };
            const finalGoal = state.path[state.path.length - 1]!;
            const wasBlocked = this.grid.isBlocked(blockerTile.x, blockerTile.y);
            if (!wasBlocked) this.grid.blockTile(blockerTile.x, blockerTile.y);
            const detour = this._findPathAroundIdleUnits(unit, cur, finalGoal);
            if (!wasBlocked) this.grid.unblockTile(blockerTile.x, blockerTile.y);
            if (detour && detour.length > 0 &&
                !(detour[0]!.x === next.x && detour[0]!.y === next.y)) {
              state.path = detour;
              state.yieldTicks = 0;
              break;
            }
          }
        }

        state.yieldTicks++;
        const threshold = blockerMoving ? DEADLOCK_THRESHOLD : REPLAN_THRESHOLD;
        if (state.yieldTicks >= threshold) {
          if (isApproach && isFinalTile) {
            // Proximity arrival: close enough — trigger arrival and let handler resolve occupancy
            state.path.shift();
            this._onUnitArrived(unit);
          } else {
            // If a moving same-layer unit is still in the way, route around its current tile.
            const avoid = blockerMoving && blocker
              ? { x: Math.round(blocker.position.x), y: Math.round(blocker.position.y) }
              : null;
            this._replanUnit(unit, avoid);
            // If replan still left us blocked on the same next tile (narrow corridor),
            // nudge ourselves aside so the other unit can pass.
            const ns = unit.state;
            const stillStuck = (ns.kind === state.kind) &&
              "path" in ns && Array.isArray(ns.path) && ns.path[0] &&
              ns.path[0].x === next.x && ns.path[0].y === next.y;
            if (stillStuck) this._nudgeUnit(unit);
          }
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
      // Approach moves with yieldTicks > 0 are in a retry-wait after a failed replan
      const isApproach = state.kind === "gatherMove" || state.kind === "dropoffMove" ||
        state.kind === "garrisonMove" || state.kind === "attachMove" || state.kind === "buildMove" ||
        state.kind === "enterPlatformMove" || state.kind === "hideMove" ||
        state.kind === "infiltrateBuilding";
      if (isApproach && state.yieldTicks > 0) {
        state.yieldTicks--;
        if (state.yieldTicks === 0) this._replanUnit(unit);
      } else {
        this._onUnitArrived(unit);
      }
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
        const deposit = this.deposits.find((d) => d.id === depositId);
        const existing = this.depositOccupants.get(depositId);
        if (existing && existing !== unit.id) {
          // Deposit occupied — redirect to nearest free same-kind deposit
          const alt = deposit ? this._findNearestUnoccupiedDeposit(deposit.kind, unit.position, GATHER_SEARCH_RADIUS) : null;
          unit.state = { kind: "idle" };
          if (alt) this.issueGatherOrder(unit.id, alt.id);
        } else if (!deposit || deposit.quantity <= 0) {
          // Deposit exhausted while en route — find alternative
          if (deposit) this._clearDepositTerrain(deposit);
          const kind = deposit?.kind ?? "wood";
          const alt = this._findNearestUnoccupiedDeposit(kind, unit.position, GATHER_SEARCH_RADIUS);
          unit.state = { kind: "idle" };
          if (alt) this.issueGatherOrder(unit.id, alt.id);
        } else {
          this.depositOccupants.set(depositId, unit.id);
          unit.state = { kind: "gathering", depositId };
        }
        break;
      }

      case "dropoffMove":
        this._doDropoff(unit);
        break;

      case "buildMove":
        unit.state = { kind: "constructing", buildingId: state.buildingId };
        break;

      case "attacking":
        // Path exhausted — stay in attacking state; _processAttacks will fire immediately or replan
        unit.state = { kind: "attacking", targetId: state.targetId, path: [], yieldTicks: 0 };
        break;

      case "patrolling":
        this._replanPatrol(unit);
        break;

      case "attachMove": {
        const platform = this.entities.get(state.platformId) as UnitEntity | undefined;
        if (!platform || !ROBOT_PLATFORM_TYPES.has(platform.typeKey) || platform.attachedCoreId) {
          unit.state = { kind: "idle" };
          break;
        }
        // Core becomes a hidden passenger inside the platform
        unit.attachedPlatformId = platform.id;
        unit.attachedPlatformTypeKey = platform.typeKey;
        unit.position = { ...platform.position };
        unit.state = { kind: "platformShell" };
        // Platform is now the active combined unit — no stat changes needed
        platform.attachedCoreId = unit.id;
        break;
      }

      case "following":
        // Path exhausted — _processFollowing will replan next tick if still out of range
        break;

      case "garrisonMove": {
        const tower = this.entities.get(state.buildingId) as BuildingEntity | undefined;
        if (!tower || tower.typeKey !== "wizardTower" || !tower.isOperational || tower.garrisonedUnitId) {
          unit.state = { kind: "idle" }; break;
        }
        unit.position = { ...tower.position };
        unit.garrisonedBuildingId = tower.id;
        unit.state = { kind: "garrisoned", buildingId: tower.id };
        tower.garrisonedUnitId = unit.id;
        // Unit's HP rolls into the tower while garrisoned: tower absorbs damage on the
        // unit's behalf. The unit's own HP becomes moot until it exits.
        this._absorbIntoBuilding(unit, tower);
        break;
      }

      case "enterPlatformMove": {
        const platform = this.entities.get(state.platformId) as BuildingEntity | undefined;
        const cap =
          robotBuildingStats[platform?.typeKey ?? ""]?.occupantCapacity ?? 1;
        if (
          !platform ||
          platform.typeKey !== "immobileCombatPlatform" ||
          !platform.isOperational ||
          platform.occupantIds.size >= cap
        ) {
          unit.state = { kind: "idle" };
          break;
        }
        unit.position = { ...platform.position };
        platform.occupantIds.add(unit.id);
        unit.state = { kind: "inPlatform", platformId: platform.id };
        this._absorbIntoBuilding(unit, platform);
        break;
      }

      case "hideMove": {
        const building = this.entities.get(state.buildingId) as BuildingEntity | undefined;
        if (
          !building ||
          !HIDING_CAPABLE_BUILDINGS.has(building.typeKey) ||
          !building.isOperational ||
          building.faction !== unit.faction ||
          building.occupantIds.size >= hidingBuildingConfig.hiddenCapacityOverride
        ) {
          unit.state = { kind: "idle" };
          break;
        }
        unit.position = { ...building.position };
        building.occupantIds.add(unit.id);
        unit.state = { kind: "hidingInBuilding", buildingId: building.id };
        this._absorbIntoBuilding(unit, building);
        break;
      }

      case "infiltrateBuilding": {
        const building = this.entities.get(state.buildingId) as BuildingEntity | undefined;
        if (
          !building ||
          !HIDING_CAPABLE_BUILDINGS.has(building.typeKey) ||
          !building.isOperational ||
          building.faction === unit.faction
        ) {
          unit.state = { kind: "idle" };
          break;
        }
        this._onSpyArrivedAtEnemyBuilding(unit, building);
        break;
      }
    }
  }

  /**
   * Spy arrived at an enemy hiding-capable building. Illusionist converts all hidden
   * occupants on the spot and then stands idle adjacent; Infiltration Platform enters
   * the building and waits for the player to target occupants via `issueInfiltrateAttack`.
   */
  private _onSpyArrivedAtEnemyBuilding(unit: UnitEntity, building: BuildingEntity): void {
    if (unit.typeKey === "illusionist") {
      for (const occupantId of [...building.occupantIds]) {
        const occupantEntity = this.entities.get(occupantId);
        if (!occupantEntity || occupantEntity.kind !== "unit") continue;
        const occupant = occupantEntity as UnitEntity;
        if (occupant.state.kind !== "hidingInBuilding") continue;
        const eject = this._findEjectTile(building.position, occupant.id);
        if (eject) occupant.position = eject;
        building.occupantIds.delete(occupant.id);
        if (!occupant.cannotBeConverted) {
          // Permanent conversion for civilians.
          occupant.faction = unit.faction;
          this.onAlert?.(uiText.spy.alertConverted(occupant.name ?? occupant.typeKey));
        } else {
          // Leaders can't be permanently converted — but the Illusionist can
          // *temporarily* puppet them. Flip faction for `illusionistTempControlDurationTicks`
          // and remember where to revert.
          if (occupant.tempControlTicks === 0) occupant.originalFaction = occupant.faction;
          occupant.faction = unit.faction;
          occupant.tempControlTicks = illusionistTempControlDurationTicks;
          this.onAlert?.(uiText.spy.alertTempControlled(occupant.name ?? occupant.typeKey));
        }
        occupant.state = { kind: "idle" };
      }
      // Illusionist lands idle adjacent to the building footprint.
      const land = this._findEjectTile(building.position, unit.id);
      if (land) unit.position = land;
      unit.state = { kind: "idle" };
      return;
    }

    if (unit.typeKey === "infiltrationPlatform") {
      unit.position = { ...building.position };
      unit.state = { kind: "inEnemyBuilding", buildingId: building.id };
      this._absorbIntoBuilding(unit, building);
      return;
    }

    unit.state = { kind: "idle" };
  }

  /** Scan the 8-neighborhood of `buildingPos` for a passable tile that is not already
   *  occupied by `excludeUnitId`. Returns null if no such tile exists within the
   *  immediate ring. Used by hide-exit and spy-forced-eject paths. */
  private _findEjectTile(buildingPos: Vec2, excludeUnitId: string): Vec2 | null {
    const px = Math.round(buildingPos.x);
    const py = Math.round(buildingPos.y);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
                  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];
    for (const d of dirs) {
      const tx = px + d.x;
      const ty = py + d.y;
      if (this.grid.isPassable(tx, ty) && !this._tileOccupiedByUnit(tx, ty, excludeUnitId, false)) {
        return { x: tx, y: ty };
      }
    }
    return null;
  }

  /** Garrison semantics: the building acts as a pure shell. Damage goes to the
   *  building's HP; the occupant's HP is frozen until they leave or the building
   *  is destroyed. No HP manipulation on entry/exit — the unit pops back out with
   *  whatever HP they walked in with. */
  private _absorbIntoBuilding(_unit: UnitEntity, _building: BuildingEntity): void {
    // Intentionally empty — shell model. The occupant tracking happens in the
    // arrival handlers (set `garrisonedUnitId` or add to `occupantIds`); HP is
    // preserved verbatim on both sides.
  }

  /** Just clears the bookkeeping; HP is preserved. Kept as a hook for symmetry
   *  and in case we later want to add per-leave side effects. */
  private _releaseFromBuilding(
    _unit: UnitEntity,
    _building: BuildingEntity,
    _minUnitHp: number,
  ): void {
    // No-op with the shell model.
  }

  private _doDropoff(unit: UnitEntity): void {
    if (unit.state.kind !== "dropoffMove") return;
    const { depositId } = unit.state;

    if (unit.carrying) {
      this.resources[unit.faction][unit.carrying.resource] += unit.carrying.amount;
      unit.carrying = null;
      this.giveXp(unit.id, gatherXpPerTrip);
    }

    // Re-gather from same deposit if available and unoccupied
    const deposit = this.deposits.find((d) => d.id === depositId);
    const resourceKind = deposit?.kind ?? (unit.state.kind === "dropoffMove" ? unit.state.resource : "wood");
    unit.state = { kind: "idle" }; // default — overridden below if gather succeeds
    if (deposit && deposit.quantity > 0 && !this.depositOccupants.has(depositId)) {
      this.issueGatherOrder(unit.id, depositId);
    } else if (deposit && deposit.quantity > 0) {
      // Deposit occupied — find nearest unoccupied same-kind within search radius
      const alt = this._findNearestUnoccupiedDeposit(deposit.kind, unit.position, GATHER_SEARCH_RADIUS);
      if (alt) this.issueGatherOrder(unit.id, alt.id);
    } else {
      // Original deposit exhausted — find nearest same-kind within search radius
      const alt = this._findNearestUnoccupiedDeposit(resourceKind, unit.position, GATHER_SEARCH_RADIUS);
      if (alt) this.issueGatherOrder(unit.id, alt.id);
    }
  }

  private _replanUnit(unit: UnitEntity, avoidTile: Vec2 | null = null): void {
    const state = unit.state;
    if (
      state.kind !== "moving" &&
      state.kind !== "patrolling" &&
      state.kind !== "gatherMove" &&
      state.kind !== "dropoffMove" &&
      state.kind !== "buildMove" &&
      state.kind !== "attacking" &&
      state.kind !== "attachMove" &&
      state.kind !== "garrisonMove" &&
      state.kind !== "enterPlatformMove" &&
      state.kind !== "hideMove" &&
      state.kind !== "infiltrateBuilding"
    ) return;

    let targetPosition: Vec2;
    if (state.kind === "moving") {
      targetPosition = state.targetPosition;
    } else if (state.kind === "gatherMove") {
      const deposit = this.deposits.find((d) => d.id === state.depositId);
      if (!deposit || deposit.quantity <= 0) {
        if (deposit) this._clearDepositTerrain(deposit);
        const kind = deposit?.kind ?? "wood";
        const alt = this._findNearestUnoccupiedDeposit(kind, unit.position, GATHER_SEARCH_RADIUS);
        unit.state = { kind: "idle" };
        if (alt) this.issueGatherOrder(unit.id, alt.id);
        return;
      }
      targetPosition = deposit.position;
    } else if (state.kind === "dropoffMove") {
      const building = this.entities.get(state.dropoffId);
      if (!building || building.kind !== "building") { unit.state = { kind: "idle" }; return; }
      const entry = this._nearestBuildingEntryPoint(building as BuildingEntity, unit.position);
      if (!entry) { unit.state = { kind: "idle" }; return; }
      targetPosition = entry;
    } else if (state.kind === "buildMove") {
      const building = this.entities.get(state.buildingId);
      if (!building || building.kind !== "building") { unit.state = { kind: "idle" }; return; }
      const entry = this._nearestBuildingEntryPoint(building as BuildingEntity, unit.position);
      if (!entry) { unit.state = { kind: "idle" }; return; }
      targetPosition = entry;
    } else if (state.kind === "attacking") {
      const target = this.entities.get(state.targetId);
      if (!target) { unit.state = { kind: "idle" }; return; }
      const goal = this._nearestGoalForUnit(unit, { x: Math.floor(target.position.x), y: Math.floor(target.position.y) });
      if (!goal) { unit.state = { kind: "idle" }; return; }
      targetPosition = goal;
    } else if (state.kind === "attachMove") {
      const platform = this.entities.get(state.platformId);
      if (!platform) { unit.state = { kind: "idle" }; return; }
      const goal = this._nearestAttachTile(platform.position, unit.position);
      if (!goal) { unit.state = { kind: "idle" }; return; }
      targetPosition = goal;
    } else if (state.kind === "garrisonMove") {
      const tower = this.entities.get(state.buildingId) as BuildingEntity | undefined;
      if (!tower || tower.typeKey !== "wizardTower" || !tower.isOperational || tower.garrisonedUnitId) {
        unit.state = { kind: "idle" }; return;
      }
      const goal = this._nearestAttachTile(tower.position, unit.position);
      if (!goal) { unit.state = { kind: "idle" }; return; }
      targetPosition = goal;
    } else if (state.kind === "enterPlatformMove") {
      const platform = this.entities.get(state.platformId) as BuildingEntity | undefined;
      const cap = robotBuildingStats[platform?.typeKey ?? ""]?.occupantCapacity ?? 1;
      if (
        !platform ||
        platform.typeKey !== "immobileCombatPlatform" ||
        !platform.isOperational ||
        platform.occupantIds.size >= cap
      ) {
        unit.state = { kind: "idle" }; return;
      }
      const goal = this._nearestAttachTile(platform.position, unit.position);
      if (!goal) { unit.state = { kind: "idle" }; return; }
      targetPosition = goal;
    } else if (state.kind === "hideMove" || state.kind === "infiltrateBuilding") {
      const building = this.entities.get(state.buildingId) as BuildingEntity | undefined;
      if (!building || !HIDING_CAPABLE_BUILDINGS.has(building.typeKey) || !building.isOperational) {
        unit.state = { kind: "idle" }; return;
      }
      // Hide needs own-faction building; infiltrate needs opposing-faction building.
      const factionOk = state.kind === "hideMove"
        ? building.faction === unit.faction
        : building.faction !== unit.faction;
      if (!factionOk) { unit.state = { kind: "idle" }; return; }
      const goal = this._nearestAttachTile(building.position, unit.position);
      if (!goal) { unit.state = { kind: "idle" }; return; }
      targetPosition = goal;
    } else {
      targetPosition = state.heading === "toB" ? state.pointB : state.pointA;
    }

    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const goal = this._nearestGoalForUnit(unit, targetPosition);
    // For gather/dropoff, fall back to terrain-only path if unit-aware pathfinding fails —
    const isApproach = state.kind === "gatherMove" || state.kind === "dropoffMove" ||
      state.kind === "garrisonMove" || state.kind === "attachMove" || state.kind === "buildMove" ||
      state.kind === "enterPlatformMove" || state.kind === "hideMove" ||
      state.kind === "infiltrateBuilding";

    // avoidTile: temporarily treat the given tile as blocked so we route around it.
    // Used by the block-resolution code to escape head-on collisions with a moving unit.
    let tempBlocked = false;
    if (
      avoidTile &&
      !unit.isFlying &&
      this.grid.inBounds(avoidTile.x, avoidTile.y) &&
      !this.grid.isBlocked(avoidTile.x, avoidTile.y) &&
      !(avoidTile.x === goal?.x && avoidTile.y === goal?.y)
    ) {
      this.grid.blockTile(avoidTile.x, avoidTile.y);
      tempBlocked = true;
    }
    const path = goal ? this._findPathForUnit(unit, start, goal) : null;
    if (tempBlocked && avoidTile) this.grid.unblockTile(avoidTile.x, avoidTile.y);

    if (path !== null && path.length > 0) {
      if (state.kind === "moving") {
        unit.state = { kind: "moving", targetPosition, path, yieldTicks: 0 };
      } else {
        unit.state = { ...state, path, yieldTicks: 0 };
      }
    } else if (path !== null) {
      // Empty path — already at goal; trigger arrival.
      this._onUnitArrived(unit);
    } else {
      // No terrain path found — approach moves retry; others give up.
      if (isApproach) {
        unit.state = { ...state, path: [], yieldTicks: GATHER_RETRY_DELAY_TICKS };
      } else {
        unit.state = { kind: "idle" };
      }
    }
  }

  private _replanPatrol(unit: UnitEntity): void {
    if (unit.state.kind !== "patrolling") return;
    const { pointA, pointB, heading } = unit.state;
    const newHeading = heading === "toB" ? "toA" : "toB";
    const target = newHeading === "toB" ? pointB : pointA;
    const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const path = this._findPathForUnit(unit, start, target);
    if (path && path.length > 0) {
      unit.state = { kind: "patrolling", pointA, pointB, path, heading: newHeading, yieldTicks: 0 };
    } else {
      unit.state = { kind: "patrolling", pointA, pointB, path: [], heading: newHeading, yieldTicks: 0 };
    }
  }

  // ── Gathering ─────────────────────────────────────────────────────────────────

  private _processGathering(tick: number): void {
    for (const unit of this.entities.units()) {
      if (unit.state.kind !== "gathering") continue;
      // Only harvest every GATHER_INTERVAL_TICKS ticks to throttle collection speed
      if (tick % GATHER_INTERVAL_TICKS !== 0) continue;
      const { depositId } = unit.state;
      const deposit = this.deposits.find((d) => d.id === depositId);

      if (!deposit || deposit.quantity <= 0) {
        this.depositOccupants.delete(depositId);
        if (deposit) this._clearDepositTerrain(deposit);
        if (unit.carrying && unit.carrying.amount > 0) {
          // Still carrying something — drop it off, then auto-find next deposit
          this._sendToDropoff(unit, depositId);
        } else {
          // Nothing carrying — find next same-kind deposit within search radius
          const kind = deposit?.kind ?? "wood";
          const alt = this._findNearestUnoccupiedDeposit(kind, unit.position, GATHER_SEARCH_RADIUS);
          unit.state = { kind: "idle" };
          if (alt) this.issueGatherOrder(unit.id, alt.id);
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

      // Clear terrain when deposit exhausted (tile becomes open/passable for both wood and water)
      if (deposit.quantity <= 0) {
        this._clearDepositTerrain(deposit);
      }

      // Full load or deposit just exhausted → head to dropoff
      if (unit.carrying.amount >= unit.stats.capacity || deposit.quantity <= 0) {
        this.depositOccupants.delete(depositId);
        this._sendToDropoff(unit, depositId);
      }
    }
  }

  private _sendToDropoff(unit: UnitEntity, depositId: string): void {
    const resource = unit.carrying?.resource ?? "wood";
    const validDropoffTypes = resourceDropoffBuildings[resource];
    const buildings = this.entities.buildingsByFaction(unit.faction)
      .filter((b) => b.isOperational && validDropoffTypes.includes(b.typeKey));
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

  /** Change tile to open when a deposit is exhausted so the terrain clears visually. Idempotent. */
  private _clearDepositTerrain(deposit: ResourceDeposit): void {
    if (deposit.quantity > 0) return;
    this.grid.setTerrain(deposit.position.x, deposit.position.y, "open");
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

  /** Release deposit occupancy and garrison state before issuing a new order. */
  private _releaseDepositOccupancy(unit: UnitEntity): void {
    if (unit.state.kind === "gathering" || unit.state.kind === "gatherMove") {
      const occupant = this.depositOccupants.get(unit.state.depositId);
      if (occupant === unit.id) this.depositOccupants.delete(unit.state.depositId);
    }
    if (unit.garrisonedBuildingId) {
      const tower = this.entities.get(unit.garrisonedBuildingId) as BuildingEntity | undefined;
      if (tower) tower.garrisonedUnitId = null;
      unit.garrisonedBuildingId = null;
    }
  }

  // ── Production ────────────────────────────────────────────────────────────────

  private _processProduction(): void {
    const costs = { wizards: wizardUnitCosts, robots: robotUnitCosts };
    for (const building of this.entities.buildings()) {
      if (building.state.kind !== "producing") continue;
      building.state.progressTicks++;
      if (building.state.progressTicks >= building.state.totalTicks) {
        const { unitTypeKey } = building.state;
        // Dequeue next item before spawning so state is consistent
        if (building.productionQueue.length > 0) {
          const next = building.productionQueue.shift()!;
          const nextCost = costs[building.faction][next];
          building.state = {
            kind: "producing",
            unitTypeKey: next,
            progressTicks: 0,
            totalTicks: nextCost ? Math.round(nextCost.productionTimeSec * TICKS_PER_SEC) : 0,
          };
        } else {
          building.state = { kind: "operational" };
        }
        this._spawnProducedUnit(building, unitTypeKey);
      }
    }
  }

  private _spawnProducedUnit(building: BuildingEntity, unitTypeKey: string): void {
    let stats: { maxHp: number; damage: number; attackRange: number; sightRange: number; speed: number; charisma: number; armor: number; capacity: number } | null = null;
    let isFlying = false;
    let canAttackAir = false;
    let cannotBeConverted = false;

    if (building.faction === "wizards") {
      const ws = wizardUnitStats[unitTypeKey];
      if (ws) {
        stats = { maxHp: ws.hp, damage: ws.damage, attackRange: ws.attackRange, sightRange: ws.sightRange, speed: ws.speed, charisma: ws.charisma, armor: ws.armor, capacity: ws.capacity };
        isFlying = ws.flying ?? false;
        canAttackAir = ws.canAttackAir ?? false;
        cannotBeConverted = ws.cannotBeConverted ?? false;
      }
    } else {
      const rs = robotUnitStats[unitTypeKey];
      if (rs) {
        const metalUnlocked = this._completedResearch.get("robots")?.has("woodToMetal") ?? false;
        stats = {
          maxHp: metalUnlocked ? rs.hpMetal : rs.hpWood,
          damage: rs.damage,
          attackRange: rs.attackRange,
          sightRange: rs.sightRange,
          speed: rs.speed,
          charisma: rs.charisma,
          armor: metalUnlocked ? rs.armorMetal : rs.armorWood,
          capacity: rs.capacity,
        };
        isFlying = rs.flying ?? false;
        canAttackAir = rs.canAttackAir ?? false;
        cannotBeConverted = rs.cannotBeConverted ?? false;
      }
    }

    if (!stats) return;

    const spawnPos = this._findSpawnTile(building);
    if (!spawnPos) return;

    const unit = new UnitEntity({
      faction: building.faction,
      typeKey: unitTypeKey,
      position: spawnPos,
      stats,
      isFlying,
      canAttackAir,
      cannotBeConverted,
    });
    if (building.faction === "robots") {
      const metalUnlocked = this._completedResearch.get("robots")?.has("woodToMetal") ?? false;
      unit.materialType = metalUnlocked ? "metal" : "wood";
    }
    this.entities.add(unit);
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
          if (this.grid.isPassable(tx, ty) && !this._tileOccupiedByUnit(tx, ty, "", false)) {
            return { x: tx, y: ty };
          }
        }
      }
    }
    return null;
  }

  private _processResearch(): void {
    for (const building of this.entities.buildings()) {
      if (building.state.kind !== "researching") continue;
      const { researchKey, faction } = { researchKey: building.state.researchKey, faction: building.faction };
      const done = building.advanceResearch();
      if (done) {
        this._completedResearch.get(faction)?.add(researchKey);
        this.onAlert?.(`Research complete: ${researchKey}`);
      }
    }
  }

  // ── Combat ───────────────────────────────────────────────────────────────────

  private _processAttacks(): void {
    for (const unit of this.entities.units()) {
      // Skip phantom attackers: `entities.units()` returns a snapshot copy, so a unit
      // that died earlier in this pass would otherwise keep swinging from the grave.
      if (unit.stats.hp <= 0 || !this.entities.has(unit.id)) continue;
      if (unit.state.kind !== "attacking") continue;
      // Non-combatants can't be in `attacking` via `issueAttackOrder` (blocked there),
      // but a level-down or future debuff could drop damage to 0 mid-engagement —
      // drop the state instead of chasing forever at 0 output.
      if (unit.stats.damage <= 0) { unit.state = { kind: "idle" }; continue; }
      const state = unit.state;

      if (unit.attackCooldownTicks > 0) unit.attackCooldownTicks--;

      const target = this.entities.get(state.targetId);
      if (!target || target.stats.hp <= 0) { unit.state = { kind: "idle" }; continue; }
      if (target.kind === "unit") {
        const tUnit = target as UnitEntity;
        if (tUnit.isFlying && !unit.canAttackAir) { unit.state = { kind: "idle" }; continue; }
        // If the target ducked into a shell/tower/platform mid-chase, give up — the
        // containing building is the only valid damage sink now.
        if (tUnit.state.kind === "platformShell" ||
            tUnit.state.kind === "garrisoned" ||
            tUnit.state.kind === "inPlatform") {
          unit.state = { kind: "idle" }; continue;
        }
      }
      // Concealment check: target may have gone invisible / disguised / into cover
      // between the order being issued and the attack resolving. Drop the chase if
      // the attacker's faction can no longer legitimately see it.
      if (!this._isTargetableBy(target, unit.faction)) {
        unit.state = { kind: "idle" }; continue;
      }

      const dx = target.position.x - unit.position.x;
      const dy = target.position.y - unit.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const effectiveRange = unit.stats.attackRange + this._targetSizeRangeBonus(target);

      if (dist > effectiveRange) {
        // Not in range — compute chase path if not already chasing
        if (state.path.length === 0) {
          const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
          const goal = this._nearestGoalForUnit(unit, { x: Math.floor(target.position.x), y: Math.floor(target.position.y) });
          if (goal) {
            // Exclude co-attackers from obstacle set — they're heading out of the way too
            const coAttackers = new Set<string>();
            for (const u of this.entities.units()) {
              if (u.id !== unit.id && u.state.kind === "attacking" && u.state.targetId === state.targetId)
                coAttackers.add(u.id);
            }
            let path = this._findPathForUnit(unit, start, goal, coAttackers);
            if (!path) path = findPath(this.grid, start, goal); // terrain-only fallback
            state.path = path ?? [];
            state.yieldTicks = 0;
          }
        }
        continue;
      }

      // In range — stop chasing and attack if cooldown allows
      state.path = [];
      if (unit.attackCooldownTicks > 0) continue;

      let dmg = Math.max(0, unit.stats.damage - target.stats.armor);
      if (target.kind === "unit" && (target as UnitEntity).manaShielded)
        dmg = Math.floor(dmg * (1 - spellCosts.manaShieldDamageReduction));
      if (unit.damageBonusMultiplier !== 1.0)
        dmg = Math.round(dmg * unit.damageBonusMultiplier);
      target.stats.hp -= dmg;

      this._attackEvents.push({
        attackerId: unit.id,
        targetId: target.id,
        attackerPos: { ...unit.position },
        targetPos: { ...target.position },
        ranged: unit.stats.attackRange > 1,
      });

      const statConfig = unit.faction === "wizards"
        ? wizardUnitStats[unit.typeKey]
        : robotUnitStats[unit.typeKey];
      unit.attackCooldownTicks = Math.round((statConfig?.attackIntervalSec ?? 1.0) * TICKS_PER_SEC);

      if (target.stats.hp <= 0) {
        this._handleEntityDeath(target, unit.id);
      }
    }
  }

  private _processAutoAggro(tick: number): void {
    if (tick % 10 !== 0) return;
    for (const unit of this.entities.units()) {
      if (unit.stats.hp <= 0 || !this.entities.has(unit.id)) continue;
      if (unit.state.kind !== "idle") continue;
      if (unit.stats.damage <= 0) continue; // workers, civilians, healers — not combat
      if (ROBOT_PLATFORM_TYPES.has(unit.typeKey) && !unit.attachedCoreId) continue; // unattached platforms don't auto-aggro
      for (const entity of this.entities.all()) {
        if (entity.faction === unit.faction) continue;
        if (entity.stats.hp <= 0) continue;
        if (entity.kind === "unit") {
          const eu = entity as UnitEntity;
          if (eu.state.kind === "platformShell" || eu.state.kind === "garrisoned" || eu.state.kind === "inPlatform") continue;
          if (eu.isFlying && !unit.canAttackAir) continue;
        }
        if (!this._isTargetableBy(entity, unit.faction)) continue;
        const dx = entity.position.x - unit.position.x;
        const dy = entity.position.y - unit.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= unit.stats.attackRange + this._targetSizeRangeBonus(entity)) {
          unit.state = { kind: "attacking", targetId: entity.id, path: [], yieldTicks: 0 };
          break;
        }
      }
    }
  }

  /** Safety net: sweep any entity whose HP hit 0 without triggering `_handleEntityDeath`
   *  through a normal damage path. Runs every tick right before `onTick` so the
   *  snapshot the UI + AI see is always free of corpses. */
  private _cleanupDeadEntities(): void {
    // Snapshot ids first — `_handleEntityDeath` mutates the map.
    const deadIds: string[] = [];
    for (const e of this.entities.all()) {
      if (e.stats.hp <= 0) deadIds.push(e.id);
    }
    for (const id of deadIds) {
      const e = this.entities.get(id);
      if (e) this._handleEntityDeath(e);
    }
  }

  private _handleEntityDeath(entity: Entity, killerId?: string): void {
    // Idempotency guard — multiple damage paths can land on the same tick, or a unit
    // can phantom-attack a target that was already killed earlier in this pass. Without
    // this check, the side effects (XP, ejection, alert) fire twice.
    if (!this.entities.has(entity.id)) return;

    if (entity.kind === "unit") {
      const unit = this.entities.get(entity.id) as UnitEntity | undefined;
      if (unit) {
        this._releaseDepositOccupancy(unit);
        // If this unit was inside an Immobile Combat Platform, remove from occupants.
        if (unit.state.kind === "inPlatform") {
          const platform = this.entities.get(unit.state.platformId) as BuildingEntity | undefined;
          platform?.occupantIds.delete(unit.id);
        }
        // If this is a robot platform with an attached Core, the Core is tucked inside
        // as a `platformShell`. Without cleanup it would linger in the entity map —
        // still counted toward population, still reachable by id — after its host
        // platform is gone. Eject the Core to an adjacent tile in `idle` state so it
        // survives with its XP intact (the Core was insulated from damage while the
        // platform absorbed hits).
        if (ROBOT_PLATFORM_TYPES.has(unit.typeKey) && unit.attachedCoreId) {
          const coreEntity = this.entities.get(unit.attachedCoreId);
          if (coreEntity && coreEntity.kind === "unit") {
            const core = coreEntity as UnitEntity;
            const px = Math.round(unit.position.x);
            const py = Math.round(unit.position.y);
            const dirs = [
              { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
              { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
            ];
            let ejectPos: Vec2 = { x: px, y: py };
            for (const d of dirs) {
              const tx = px + d.x;
              const ty = py + d.y;
              if (this.grid.isPassable(tx, ty) && !this._tileOccupiedByUnit(tx, ty, core.id, false)) {
                ejectPos = { x: tx, y: ty };
                break;
              }
            }
            core.position = ejectPos;
            core.attachedPlatformId = null;
            core.attachedPlatformTypeKey = null;
            core.state = { kind: "idle" };
            unit.attachedCoreId = null;
          }
        }
      }
      if (killerId) this.giveXp(killerId, xpRates.killEnemy);
      this.entities.remove(entity.id);
      this.onAlert?.(`${entity.typeKey} destroyed`);
      if (entity.isNamed) {
        // Determine killer's faction for victory credit
        const killer = killerId ? this.entities.get(killerId) : null;
        const winFaction: Faction = killer ? killer.faction : (entity.faction === "wizards" ? "robots" : "wizards");
        this.events.queue("VictoryAlert", { faction: winFaction, condition: "military", pct: 100 });
      }
    } else if (entity.kind === "building") {
      const building = this.entities.get(entity.id) as BuildingEntity | undefined;
      if (building) {
        this._unblockBuildingTiles(building);
        // Spec: when the building is destroyed, the occupying unit exits alive.
        // Pass minUnitHp = 1 so the proportional-HP calculation can't drop them
        // to zero (the building HP is 0 here, so without the floor they'd die too).
        if (building.garrisonedUnitId) {
          this.issueLeaveGarrisonOrder(building.garrisonedUnitId, 1);
        }
        if (building.occupantIds.size > 0) {
          for (const occupantId of [...building.occupantIds]) {
            this.issueLeavePlatformOrder(occupantId, 1);
          }
        }
      }
      this.entities.remove(entity.id);
      this.onAlert?.(`${entity.typeKey} destroyed`);
    }
  }

  // ── Auto-collection ───────────────────────────────────────────────────────────

  private _processAutoCollection(tick: number): void {
    if (tick % AUTO_COLLECTION_INTERVAL_TICKS !== 0) return;
    for (const building of this.entities.buildings()) {
      if (!building.isOperational) continue;
      if (building.typeKey === "waterExtractor") {
        this.resources[building.faction].water += autoCollectionRates.waterExtractorPerInterval;
      } else if (building.typeKey === "watermill") {
        this.resources[building.faction].water += autoCollectionRates.watermillPerInterval;
      }
    }
  }

  // ── Mana ─────────────────────────────────────────────────────────────────────

  private _processMana(): void {
    const res = this.resources.wizards;
    const wizardUnits = this.entities.unitsByFaction("wizards").filter(
      (u) => WIZARD_UNIT_TYPES.has(u.typeKey) && u.state.kind !== "platformShell",
    );
    const reservoirs = this.entities.buildingsByFaction("wizards").filter(
      (b) => b.typeKey === "manaReservoir" && b.isOperational,
    );

    for (const unit of wizardUnits) {
      const nearReservoir = reservoirs.some((r) => {
        const dx = r.position.x - unit.position.x;
        const dy = r.position.y - unit.position.y;
        return Math.sqrt(dx * dx + dy * dy) <= manaGen.reservoirProximityRadiusTiles;
      });
      res.mana += manaGen.perWizardUnitPerTick * (nearReservoir ? manaGen.reservoirProximityMultiplier : 1);
    }

    res.mana += reservoirs.length * manaGen.reservoirBaseTick;
    res.mana = Math.min(res.mana, manaConfig.manaMax);

    const activeShields = wizardUnits.filter((u) => u.manaShielded).length;
    if (activeShields > 0) {
      res.mana -= spellCosts.manaShieldDrainPerSec * (TICK_MS / 1000) * activeShields;
      if (res.mana <= 0) {
        res.mana = 0;
        for (const u of wizardUnits) u.manaShielded = false;
      }
    }

    const invisibleIllusionists = wizardUnits.filter((u) => u.invisibilityActive);
    if (invisibleIllusionists.length > 0) {
      res.mana -= spellCosts.illusionistInvisibilityDrainPerSec * (TICK_MS / 1000) * invisibleIllusionists.length;
      if (res.mana <= 0) {
        res.mana = 0;
        for (const u of invisibleIllusionists) u.invisibilityActive = false;
      }
    }
  }

  /** Test/dev hook: mark a research item completed without going through a building.
   *  Keeps /game free of test-only branches while still allowing integration-style unit
   *  tests that need research-gated abilities unlocked. */
  grantResearch(faction: Faction, researchKey: string): void {
    this._completedResearch.get(faction)?.add(researchKey);
  }

  /** Test/dev hook: advance simulation by one tick synchronously. Bypasses GameLoop's
   *  real-time scheduler so tests can assert deterministic post-tick state. */
  stepTick(tickNumber = 0, elapsedMs = 0): void {
    this.tick(tickNumber, elapsedMs);
  }

  issueManaShieldToggle(unitId: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (!WIZARD_UNIT_TYPES.has(unit.typeKey)) return;
    if (!this._completedResearch.get("wizards")?.has("manaShield")) return;
    if (!unit.manaShielded && this.resources.wizards.mana <= 0) return;
    unit.manaShielded = !unit.manaShielded;
  }

  issueInvisibilityToggle(unitId: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (unit.typeKey !== "illusionist") return;
    if (!this._completedResearch.get("wizards")?.has(illusionistInvisibilityResearchKey)) return;
    if (!unit.invisibilityActive && this.resources.wizards.mana <= 0) return;
    unit.invisibilityActive = !unit.invisibilityActive;
    // Deliberately do NOT mirror into `concealed`: an invisible Illusionist must still
    // contribute its sight range to the owner's fog of war. `invisibilityActive` alone
    // is what the renderer + detector scan check.
  }

  /** Infiltration Platform disguise — renders to opponents as the picked enemy typeKey.
   *  Does NOT set `concealed` (disguised unit still contributes to own fog). */
  issueDisguise(unitId: string, targetTypeKey: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (unit.typeKey !== "infiltrationPlatform") return;
    // Target typeKey must belong to the opposing faction's unit roster.
    const enemyRoster = unit.faction === "robots" ? wizardUnitStats : robotUnitStats;
    if (!(targetTypeKey in enemyRoster)) return;
    unit.disguiseActive = true;
    unit.disguiseTargetTypeKey = targetTypeKey;
  }

  issueClearDisguise(unitId: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (unit.typeKey !== "infiltrationPlatform") return;
    unit.disguiseActive = false;
    unit.disguiseTargetTypeKey = null;
  }

  issueIceBlastOrder(casterId: string, targetId: string): void {
    const caster = this.entities.get(casterId) as UnitEntity | undefined;
    if (!caster || caster.kind !== "unit" || caster.typeKey !== "evoker") return;
    if (!this._completedResearch.get("wizards")?.has("iceBlast")) return;
    if (this.resources.wizards.mana < spellCosts.iceBlastMana) return;
    const target = this.entities.get(targetId);
    if (!target || target.faction === "wizards") return;
    const dx = target.position.x - caster.position.x;
    const dy = target.position.y - caster.position.y;
    if (Math.sqrt(dx * dx + dy * dy) > caster.stats.attackRange) return;

    this.resources.wizards.mana -= spellCosts.iceBlastMana;
    this._spellEvents.push({ kind: "iceBlast", casterId, casterPos: { ...caster.position }, targetId, targetPos: { ...target.position } });
    const t = target as UnitEntity;
    if (t.slowTicksRemaining === 0) t.baseSpeed = t.stats.speed;
    t.stats.speed = t.baseSpeed * (1 - spellEffects.iceBlast.speedReductionPct / 100);
    t.slowTicksRemaining = spellEffects.iceBlast.slowDurationTicks;
  }

  issueFieryExplosionOrder(casterId: string, targetPos: Vec2): void {
    const caster = this.entities.get(casterId) as UnitEntity | undefined;
    if (!caster || caster.kind !== "unit" || caster.typeKey !== "evoker") return;
    if (!this._completedResearch.get("wizards")?.has("fieryExplosion")) return;
    if (this.resources.wizards.mana < spellCosts.fieryExplosionMana) return;
    const dx = targetPos.x - caster.position.x;
    const dy = targetPos.y - caster.position.y;
    if (Math.sqrt(dx * dx + dy * dy) > caster.stats.attackRange) return;

    this.resources.wizards.mana -= spellCosts.fieryExplosionMana;
    this._spellEvents.push({ kind: "fieryExplosion", casterId, casterPos: { ...caster.position }, targetPos: { ...targetPos } });
    const radiusSq = spellEffects.fieryExplosion.radiusTiles ** 2;
    for (const entity of [...this.entities.all()]) {
      if (entity.faction === "wizards") continue;
      const ex = entity.position.x - targetPos.x;
      const ey = entity.position.y - targetPos.y;
      if (ex * ex + ey * ey > radiusSq) continue;
      const dmg = Math.max(0, spellEffects.fieryExplosion.damage - entity.stats.armor);
      entity.stats.hp -= dmg;
      if (entity.stats.hp <= 0) this._handleEntityDeath(entity, casterId);
    }
  }

  issueEnlargeOrder(casterId: string, targetId: string): void {
    const caster = this.entities.get(casterId) as UnitEntity | undefined;
    if (!caster || caster.kind !== "unit" || caster.typeKey !== "enchantress") return;
    if (!this._completedResearch.get("wizards")?.has("strengthenAlly")) return;
    if (this.resources.wizards.mana < spellCosts.enlargeMana) return;
    const target = this.entities.get(targetId);
    if (!target || target.kind !== "unit" || target.faction !== "wizards") return;
    const dx = target.position.x - caster.position.x;
    const dy = target.position.y - caster.position.y;
    if (Math.sqrt(dx * dx + dy * dy) > caster.stats.attackRange) return;

    this.resources.wizards.mana -= spellCosts.enlargeMana;
    this._spellEvents.push({ kind: "enlarge", casterId, casterPos: { ...caster.position }, targetId, targetPos: { ...target.position } });
    const t = target as UnitEntity;
    t.damageBonusMultiplier = 1 + spellEffects.enlarge.damageBonusPct / 100;
    t.damageBonusTicks = spellEffects.enlarge.durationTicks;
  }

  issueReduceOrder(casterId: string, targetId: string): void {
    const caster = this.entities.get(casterId) as UnitEntity | undefined;
    if (!caster || caster.kind !== "unit" || caster.typeKey !== "enchantress") return;
    if (!this._completedResearch.get("wizards")?.has("weakenFoe")) return;
    if (this.resources.wizards.mana < spellCosts.reduceMana) return;
    const target = this.entities.get(targetId);
    if (!target || target.faction === "wizards") return;
    const dx = target.position.x - caster.position.x;
    const dy = target.position.y - caster.position.y;
    if (Math.sqrt(dx * dx + dy * dy) > caster.stats.attackRange) return;

    this.resources.wizards.mana -= spellCosts.reduceMana;
    this._spellEvents.push({ kind: "reduce", casterId, casterPos: { ...caster.position }, targetId, targetPos: { ...target.position } });
    const t = target as UnitEntity;
    t.damageBonusMultiplier = 1 - spellEffects.reduce.damagePenaltyPct / 100;
    t.damageBonusTicks = spellEffects.reduce.durationTicks;
  }

  private _processSlows(): void {
    for (const unit of this.entities.units()) {
      if (unit.slowTicksRemaining <= 0) continue;
      unit.slowTicksRemaining--;
      if (unit.slowTicksRemaining === 0) unit.stats.speed = unit.baseSpeed;
    }
  }

  private _processBuffExpiry(): void {
    for (const unit of this.entities.units()) {
      if (unit.damageBonusTicks <= 0) continue;
      unit.damageBonusTicks--;
      if (unit.damageBonusTicks === 0) unit.damageBonusMultiplier = 1.0;
    }
  }

  /** Temporary Illusionist control of a `cannotBeConverted` leader: decrement timer
   *  each tick, revert faction + clear state when it expires. */
  private _processTempControlExpiry(): void {
    for (const unit of this.entities.units()) {
      if (unit.tempControlTicks <= 0) continue;
      unit.tempControlTicks--;
      if (unit.tempControlTicks === 0) {
        if (unit.originalFaction) {
          unit.faction = unit.originalFaction;
          unit.originalFaction = null;
        }
        // Break any pending orders that only made sense under the puppeteer.
        unit.state = { kind: "idle" };
        this.onAlert?.(uiText.spy.alertTempControlExpired(unit.name ?? unit.typeKey));
      }
    }
  }

  private _processClericHealing(tick: number): void {
    if (tick % clericConfig.healIntervalTicks !== 0) return;
    const clerics = this.entities.unitsByFaction("wizards").filter(
      (u) => u.typeKey === "cleric" && u.state.kind !== "platformShell" && u.stats.hp > 0,
    );
    if (clerics.length === 0) return;
    const radiusSq = clericConfig.healRadiusTiles ** 2;
    for (const cleric of clerics) {
      for (const unit of this.entities.unitsByFaction("wizards")) {
        if (unit.id === cleric.id) continue;
        if (unit.stats.hp <= 0 || unit.stats.hp >= unit.stats.maxHp) continue;
        const dx = unit.position.x - cleric.position.x;
        const dy = unit.position.y - cleric.position.y;
        if (dx * dx + dy * dy > radiusSq) continue;
        const before = unit.stats.hp;
        unit.stats.hp = Math.min(unit.stats.maxHp, unit.stats.hp + clericConfig.healPerInterval);
        const healed = unit.stats.hp - before;
        if (healed > 0) this.giveXp(cleric.id, healed * clericConfig.healXpPerHp);
      }
    }
  }

  private _processAmphitheatreXp(tick: number): void {
    if (tick % AUTO_COLLECTION_INTERVAL_TICKS !== 0) return;
    const amphitheatres = this.entities.buildingsByFaction("wizards").filter(
      (b) => b.typeKey === "amphitheatre" && b.isOperational,
    );
    if (amphitheatres.length === 0) return;
    const radiusSq = amphitheatreXpBoost.radiusTiles ** 2;
    for (const unit of this.entities.unitsByFaction("wizards")) {
      if (!WIZARD_UNIT_TYPES.has(unit.typeKey)) continue;
      if (amphitheatres.some((b) => {
        const dx = b.position.x - unit.position.x;
        const dy = b.position.y - unit.position.y;
        return dx * dx + dy * dy <= radiusSq;
      })) {
        this.giveXp(unit.id, amphitheatreXpBoost.xpPerSec);
      }
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────────────

  /** Nearest passable tile adjacent to platformPos, preferring the tile closest to fromPos. */
  private _nearestAttachTile(platformPos: Vec2, fromPos: Vec2): Vec2 | null {
    const px = Math.round(platformPos.x);
    const py = Math.round(platformPos.y);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
                  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];
    let best: Vec2 | null = null;
    let bestDist = Infinity;
    for (const d of dirs) {
      const tx = px + d.x;
      const ty = py + d.y;
      if (!this.grid.isPassable(tx, ty)) continue;
      const dx = tx - fromPos.x;
      const dy = ty - fromPos.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; best = { x: tx, y: ty }; }
    }
    return best;
  }

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

  /** Replan around stationary (idle/gathering/constructing) ground units to find a detour.
   *  The goal tile is never blocked so proximity arrival still works. Returns null if no detour. */
  private _findPathAroundIdleUnits(unit: UnitEntity, start: Vec2, goal: Vec2): Vec2[] | null {
    if (unit.isFlying) return findPath(this.grid, start, goal);
    const STATIONARY = new Set<string>(["idle", "gathering", "constructing", "converting", "garrisoned", "inPlatform", "platformShell"]);
    const blocked: Vec2[] = [];
    for (const u of this.entities.units()) {
      if (u.id === unit.id || u.isFlying) continue;
      if (!STATIONARY.has(u.state.kind)) continue;
      const tx = Math.round(u.position.x);
      const ty = Math.round(u.position.y);
      if (tx === goal.x && ty === goal.y) continue; // never block goal tile
      if (!this.grid.isBlocked(tx, ty)) {
        this.grid.blockTile(tx, ty);
        blocked.push({ x: tx, y: ty });
      }
    }
    const path = findPath(this.grid, start, goal);
    for (const pos of blocked) this.grid.unblockTile(pos.x, pos.y);
    return path;
  }

  /** Returns the goal tile for a unit: any in-bounds tile for flyers, nearest passable for ground. */
  private _nearestGoalForUnit(unit: UnitEntity, pos: Vec2): Vec2 | null {
    if (unit.isFlying) {
      if (this.grid.inBounds(pos.x, pos.y)) return pos;
      // Clamp to map bounds
      const clamped = {
        x: Math.max(0, Math.min(this.grid.width - 1, pos.x)),
        y: Math.max(0, Math.min(this.grid.height - 1, pos.y)),
      };
      return this.grid.inBounds(clamped.x, clamped.y) ? clamped : null;
    }
    return this._nearestPassable(pos);
  }

  /** Find a path for a unit, respecting flying vs. ground movement rules.
   *  Ground units use terrain-only pathfinding — runtime yield/nudge handles unit avoidance.
   *  Flying units still avoid other flyers. excludeIds unused for ground but kept for API compat. */
  private _findPathForUnit(unit: UnitEntity, start: Vec2, goal: Vec2, excludeIds?: Set<string>): Vec2[] | null {
    if (unit.isFlying) {
      const occupied = new Set<string>();
      for (const u of this.entities.units()) {
        if (u.id === unit.id || !u.isFlying || u.state.kind === "platformShell") continue;
        if (excludeIds?.has(u.id)) continue;
        occupied.add(`${Math.round(u.position.x)},${Math.round(u.position.y)}`);
      }
      return findPath(this.grid, start, goal, {
        isPassable: (x, y) => this.grid.inBounds(x, y) && !occupied.has(`${x},${y}`),
      });
    }
    // Ground: terrain-only. Unit positions are not obstacles for planning.
    return findPath(this.grid, start, goal);
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

  private _tileOccupiedByUnit(x: number, y: number, excludeId: string, isFlying: boolean): boolean {
    for (const u of this.entities.units()) {
      if (u.id === excludeId) continue;
      if (u.state.kind === "platformShell") continue; // passengers don't occupy tiles
      if (u.isFlying !== isFlying) continue; // flying and ground don't block each other
      if (Math.round(u.position.x) === x && Math.round(u.position.y) === y) return true;
    }
    return false;
  }

  private _unitAt(x: number, y: number, excludeId: string, isFlying: boolean): UnitEntity | null {
    for (const u of this.entities.units()) {
      if (u.id === excludeId) continue;
      if (u.state.kind === "platformShell") continue;
      if (u.isFlying !== isFlying) continue;
      if (Math.round(u.position.x) === x && Math.round(u.position.y) === y) return u;
    }
    return null;
  }

  private _nudgeUnit(unit: UnitEntity): void {
    const cx = Math.round(unit.position.x);
    const cy = Math.round(unit.position.y);
    const dirs = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
    ];
    for (const d of dirs) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (this.grid.isPassable(nx, ny) && !this._tileOccupiedByUnit(nx, ny, unit.id, unit.isFlying)) {
        unit.state = { kind: "moving", targetPosition: { x: nx, y: ny }, path: [{ x: nx, y: ny }], yieldTicks: 0 };
        return;
      }
    }
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
    for (const unit of this.entities.units()) {
      if (ROBOT_PLATFORM_TYPES.has(unit.typeKey)) continue; // platforms don't consume population
      result[unit.faction].count++;
      result[unit.faction].cap += unitPopulationBonus[unit.typeKey] ?? 0;
    }
    for (const building of this.entities.buildings()) {
      if (!building.isOperational) continue;
      const factionStats = building.faction === "wizards" ? wizardBuildingStats : robotBuildingStats;
      const support = factionStats[building.typeKey]?.populationSupport ?? 0;
      result[building.faction].cap += support;
    }
    return result;
  }

  private _computeFactionStats(): Record<Faction, FactionStats> {
    const mk = (): FactionStats => ({
      militaryStrength: 0, culture: 0, defense: 0, intelligence: 0, footprint: 0,
      alignment: { wizards: 0, robots: 0 },
      openBorders: { wizards: false, robots: false },
    });
    const result: Record<Faction, FactionStats> = { wizards: mk(), robots: mk() };
    for (const unit of this.entities.units()) {
      if (unit.state.kind === "platformShell") continue;
      const role = unitRoles[unit.typeKey];
      const fs = result[unit.faction];
      fs.intelligence += unit.stats.xp;
      if (role && MILITARY_ROLES.has(role)) fs.militaryStrength += unit.stats.damage;
      if (CIVILIAN_UNIT_TYPES.has(unit.typeKey)) fs.culture += unit.stats.xp;
    }
    for (const building of this.entities.buildings()) {
      if (!building.isOperational) continue;
      const bStats = building.faction === "wizards" ? wizardBuildingStats : robotBuildingStats;
      const bs = bStats[building.typeKey];
      if (!bs) continue;
      const fs = result[building.faction];
      fs.footprint += bs.footprintTiles * bs.footprintTiles;
      if (DEFENSIVE_BUILDING_TYPES.has(building.typeKey)) fs.defense += building.stats.hp;
    }
    return result;
  }

  private _buildDepositSnapshots(): DepositSnapshot[] {
    return this.deposits
      .filter((d) => d.quantity > 0)
      .map((d) => ({ id: d.id, kind: d.kind, position: d.position, quantity: d.quantity }));
  }

  private _syncPassengerPositions(): void {
    for (const unit of this.entities.units()) {
      if (unit.state.kind !== "platformShell" || !unit.attachedPlatformId) continue;
      const platform = this.entities.get(unit.attachedPlatformId) as UnitEntity | undefined;
      if (platform) unit.position = { ...platform.position };
    }
  }

  // ── Fog ───────────────────────────────────────────────────────────────────────

  private tick(tick: number, elapsedMs: number): void {
    this._ai?.tick(tick, this);
    this._syncPassengerPositions();
    this._syncGarrisonedPositions();
    this._processFollowing();
    this._processMovement();
    this._processConstruction();
    this._processGathering(tick);
    this._processProduction();
    this._processResearch();
    // Detector reveal must be computed BEFORE any combat routines so invisible/
    // disguised/hidden targets are filtered consistently for attackers + AI.
    this._refreshDetectedIds();
    this._processAttacks();
    this._processGarrisonedAttacks();
    this._processImmobileCombatPlatformAttacks();
    this._processAutoAggro(tick);
    this._processAutoCollection(tick);
    this._processMana();
    this._processSlows();
    this._processBuffExpiry();
    this._processTempControlExpiry();
    this._processAmphitheatreXp(tick);
    this._processClericHealing(tick);
    this._updateFog(tick);
    this.events.flushDeferred();

    // Final safety net — remove any entities whose HP reached 0 this tick without the
    // damage-site death handler being hit (e.g. buffs expiring on already-fatal wounds).
    this._cleanupDeadEntities();

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
      completedResearch: {
        wizards: [...(this._completedResearch.get("wizards") ?? [])],
        robots:  [...(this._completedResearch.get("robots")  ?? [])],
      },
      attacks: this._attackEvents.splice(0),
      spells: this._spellEvents.splice(0),
      factionStats: this._computeFactionStats(),
      detectedIds: this._computeDetectedIds(),
    });
  }

  /** Cached per-viewer reveal set populated by `_refreshDetectedIds` each tick. */
  private _detectedIdsThisTick: Record<Faction, Set<string>> = { wizards: new Set(), robots: new Set() };
  /** Per-unit last-tick detection state — used to fire an alert on the transition
   *  from hidden → revealed so the owning player knows their spy was spotted
   *  without spamming the alert log every tick the detector stays in range. */
  private _previousDetectedIds: Record<Faction, Set<string>> = { wizards: new Set(), robots: new Set() };

  /**
   * For each faction F, every F-owned detector unit scans opposing-faction units
   * within `detector.stats.sightRange`. Any opposing unit that would otherwise be
   * concealed / invisible / disguised / hiding is added to F's revealed set. The
   * renderer consumes this via the snapshot; the combat + auto-aggro loops consume
   * the cached Set directly so they don't have to re-scan every tick.
   *
   * Detectors themselves must be on the map surface (not in shell/garrison/platform).
   */
  private _refreshDetectedIds(): void {
    const active = (u: UnitEntity) =>
      u.state.kind !== "platformShell" &&
      u.state.kind !== "garrisoned" &&
      u.state.kind !== "inPlatform";

    for (const viewer of FACTIONS) {
      const set = new Set<string>();
      const detectors = this.entities
        .unitsByFaction(viewer)
        .filter((u) => u.isDetector && active(u));
      if (detectors.length > 0) {
        const enemyFaction: Faction = viewer === "wizards" ? "robots" : "wizards";
        for (const t of this.entities.unitsByFaction(enemyFaction)) {
          if (!active(t)) continue;
          const concealedLike =
            t.concealed ||
            t.invisibilityActive ||
            t.disguiseActive ||
            t.state.kind === "hidingInBuilding" ||
            t.state.kind === "inEnemyBuilding";
          if (!concealedLike) continue;
          for (const d of detectors) {
            const dx = t.position.x - d.position.x;
            const dy = t.position.y - d.position.y;
            const dSq = dx * dx + dy * dy;
            if (dSq <= d.stats.sightRange * d.stats.sightRange) {
              set.add(t.id);
              // Dev diagnostic: log detector + target + distance so balance-tuning
              // playtesters can verify the detection radius matches config. Fires
              // only on the transition (matches the owner-alert below).
              if (!this._previousDetectedIds[viewer].has(t.id)) {
                // eslint-disable-next-line no-console
                console.warn(
                  `[detect] ${d.typeKey}(${d.id}) @ (${d.position.x.toFixed(1)},${d.position.y.toFixed(1)}) ` +
                  `sightRange=${d.stats.sightRange} revealed ${t.typeKey}(${t.id}) ` +
                  `@ (${t.position.x.toFixed(1)},${t.position.y.toFixed(1)}) — dist=${Math.sqrt(dSq).toFixed(2)}`,
                );
              }
              break;
            }
          }
        }
      }
      this._detectedIdsThisTick[viewer] = set;
    }

    // Fire a one-shot alert whenever a previously-hidden spy enters a detector's
    // range. Only alerts for new additions this tick — staying revealed stays quiet.
    // Alert is sent to the SPY's owning faction so they know the disguise was blown.
    for (const viewer of FACTIONS) {
      const prev = this._previousDetectedIds[viewer];
      const curr = this._detectedIdsThisTick[viewer];
      for (const id of curr) {
        if (prev.has(id)) continue;
        const e = this.entities.get(id);
        if (!e || e.kind !== "unit") continue;
        const u = e as UnitEntity;
        // Re-scan for the detector that caught this target so the in-game alert
        // includes the same diagnostic the console.warn emits. Without this the
        // player has no way to know which enemy unit blew their cover.
        const detectors = this.entities
          .unitsByFaction(viewer)
          .filter((d) => d.isDetector && active(d));
        let culprit: UnitEntity | null = null;
        let culpritDist = Infinity;
        for (const d of detectors) {
          const dx = u.position.x - d.position.x;
          const dy = u.position.y - d.position.y;
          const dSq = dx * dx + dy * dy;
          if (dSq <= d.stats.sightRange * d.stats.sightRange && dSq < culpritDist) {
            culprit = d;
            culpritDist = dSq;
          }
        }
        const base = uiText.spy.alertDetected(u.name ?? u.typeKey);
        const detail = culprit
          ? ` (${culprit.typeKey} at dist ${Math.sqrt(culpritDist).toFixed(1)})`
          : "";
        this.onAlert?.(base + detail);
      }
      this._previousDetectedIds[viewer] = new Set(curr);
    }
  }

  private _computeDetectedIds(): Record<Faction, string[]> {
    return {
      wizards: [...this._detectedIdsThisTick.wizards],
      robots: [...this._detectedIdsThisTick.robots],
    };
  }

  /**
   * Can a unit of `attackerFaction` legitimately acquire `target` as a combat target
   * this tick? Blocks targeting of:
   *   - Hidden / in-enemy-building units (they're physically inside a building).
   *   - Invisible or disguised enemy units unless a friendly detector revealed them.
   *
   * Own-faction targets (e.g. healing) pass through; buildings aren't hideable.
   */
  private _isTargetableBy(target: Entity, attackerFaction: Faction): boolean {
    if (target.kind !== "unit") return true;
    const u = target as UnitEntity;
    if (u.state.kind === "hidingInBuilding" || u.state.kind === "inEnemyBuilding") return false;
    // Puppeted leaders under Illusionist temp-control are "invisible" to both sides'
    // auto-aggro: robots still see their own leader and don't fire; wizards don't
    // auto-attack their own faction either. Manual attack orders (issueAttackOrder)
    // skip this helper and can still connect — so a wizard player can finish the
    // puppet off once it's lured away.
    if (u.tempControlTicks > 0) return false;
    if (u.faction === attackerFaction) return true;
    if (u.invisibilityActive || u.disguiseActive || u.concealed) {
      return this._detectedIdsThisTick[attackerFaction].has(u.id);
    }
    return true;
  }

  /** A large (>1 footprint) unit extends past its collision tile. Attackers get a
   *  range bonus equal to half the target's footprint-minus-one so the effective
   *  engagement edge matches the rendered sprite edge. Buildings use their own
   *  `footprintTiles` in the same way. */
  private _targetSizeRangeBonus(target: Entity): number {
    if (target.kind === "unit") {
      const t = target as UnitEntity;
      const stats = t.faction === "wizards"
        ? wizardUnitStats[t.typeKey]
        : robotUnitStats[t.typeKey];
      const fp = stats?.footprintTiles ?? 1;
      return Math.max(0, (fp - 1) * 0.5);
    }
    const b = target as BuildingEntity;
    const stats = b.faction === "wizards"
      ? wizardBuildingStats[b.typeKey]
      : robotBuildingStats[b.typeKey];
    const fp = stats?.footprintTiles ?? 1;
    return Math.max(0, (fp - 1) * 0.5);
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
      if (unit.state.kind === "platformShell") continue; // passengers provide no vision
      if (unit.state.kind === "inPlatform") continue; // Core vision is rolled into the platform's own vision
      const isUnattachedPlatform = ROBOT_PLATFORM_TYPES.has(unit.typeKey) && !unit.attachedCoreId;
      sources.push({
        position: unit.position,
        rangeTiles: isUnattachedPlatform
          ? UNATTACHED_PLATFORM_VISION_TILES
          : unit.stats.sightRange,
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
    const base = factionStats[building.typeKey]?.visionRange ?? 3;
    if (building.typeKey === "immobileCombatPlatform") {
      return base + building.occupantIds.size * immobileCombatPlatformConfig.perCoreVision;
    }
    return base;
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
