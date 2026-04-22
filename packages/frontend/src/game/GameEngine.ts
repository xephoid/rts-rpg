// Game simulation engine — pure TypeScript, no imports from /renderer, /ui, /store.
// Pushes GameStateSnapshot to the store bridge after each tick via onTick callback.

import type { Faction, FactionStats, FogSnapshot, GameStateSnapshot, Vec2, DepositSnapshot, AttackEvent, SpellEvent, DiplomaticProposal, DiplomaticProposalKind, Species } from "@neither/shared";
import {
  startingResources,
  mapSizes,
  factionCountBySize,
  FACTION_IDS,
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
  ROBOT_PLATFORM_TYPES,
  uiText,
  diplomacy as diplomacyConfig,
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

/**
 * All 6 possible faction slots. Every `Record<Faction, X>` is declared with all
 * six keys; slots beyond the active faction count carry zeroed defaults so the
 * legacy 2-faction iteration patterns continue to work verbatim. Engine methods
 * that should only touch active factions use `this.activeFactions` instead.
 */
const FACTIONS: Faction[] = ["wizards", "robots", "f3", "f4", "f5", "f6"];

/** Build a `Record<Faction, T>` with a single default value for every slot. */
function fullFactionRecord<T>(make: () => T): Record<Faction, T> {
  return {
    wizards: make(),
    robots:  make(),
    f3: make(),
    f4: make(),
    f5: make(),
    f6: make(),
  };
}

/** Shared empty buffer used by stub fog snapshots for non-viewing factions.
 *  Kept module-level so every tick emission reuses the same zero-length array
 *  instead of allocating a fresh one per inactive slot. */
const EMPTY_FOG_DATA: Uint8Array = new Uint8Array(0);

/** Seeded xorshift32 — mirrors MapGenerator's RNG so species rolls are reproducible
 *  from the same seed. Falls back to Date.now() if no seed supplied. */
function seededRng(seed?: number): () => number {
  let s = ((seed ?? Date.now()) >>> 0) || 0xdeadbeef;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

/** Ticks a unit waits on a blocked waypoint before replanning (~167ms at 60 ticks/s). */
const REPLAN_THRESHOLD = 10;
/** Ticks a unit waits behind a moving blocker before replanning — handles head-on deadlocks (~333ms). */
const DEADLOCK_THRESHOLD = 20;
/** Ticks a gatherer/dropoff unit waits before retrying pathfinding when no route is found (~1.5s). */
const GATHER_RETRY_DELAY_TICKS = 90;
/**
 * Padding added to every `spatialIndex.query` radius when the caller may
 * care about targeting a building. Buildings are indexed only at their
 * top-left tile, so a building whose footprint extends into range can miss
 * the raw (Chebyshev) query — padding by the max footprint size - 1
 * (castle/home: 4) ensures any candidate whose footprint touches the
 * search radius shows up in the result. Callers still use the precise
 * `_distanceToTarget` helper (which handles building AABB) to filter out
 * over-queried candidates. Stays in lock-step with the largest
 * `footprintTiles` in `wizardBuildingStats` / `robotBuildingStats`.
 */
const BUILDING_FOOTPRINT_PAD = 4;
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

  private readonly resources: Record<Faction, ResourcePool> = fullFactionRecord(() => ({ ...startingResources }));

  /** depositId → unitId currently harvesting that deposit (one gatherer per tile). */
  private readonly depositOccupants = new Map<string, string>();

  /** Attacks that fired this tick — included in snapshot, cleared after each tick. */
  private _attackEvents: AttackEvent[] = [];
  /** Spells cast this tick — included in snapshot, cleared after each tick. */
  private _spellEvents: SpellEvent[] = [];

  /** Research items permanently unlocked per faction. */
  private readonly _completedResearch = new Map<Faction, Set<string>>(
    FACTIONS.map((f) => [f, new Set<string>()]),
  );

  /** One MilitaryAI per non-human active faction. Empty in headless mode (no
   *  `playerFaction`). Each tick every AI runs independently. */
  private readonly _ais: MilitaryAI[];

  // ── Phase 14 diplomacy state (persistent across ticks) ─────────────────────
  /** Bilateral alignment map. `_alignment[A][B]` is A's alignment toward B. Both
   *  directions are tracked so the spec's "how factions feel about each other"
   *  wording maps cleanly; combat + proposal adjustments touch both entries. */
  private _alignment: Record<Faction, Record<Faction, number>> = fullFactionRecord(() => fullFactionRecord(() => 0));
  /** Bilateral — both directions flip together when an agreement is accepted. */
  private _openBorders: Record<Faction, Record<Faction, boolean>> = fullFactionRecord(() => fullFactionRecord(() => false));
  /** Bilateral — both directions flip together. Attack-blocking checks read this. */
  private _nonCombatTreaties: Record<Faction, Record<Faction, boolean>> = fullFactionRecord(() => fullFactionRecord(() => false));
  private _pendingProposals: DiplomaticProposal[] = [];
  private _proposalIdCounter = 0;
  /** Discovery state — `_metFactions[A][B]` is true once A has sighted any B unit
   *  or building within one of A's own units' sightRange. Bilateral: both
   *  directions flip together on first contact. Self-diagonal is always true so
   *  the UI can safely list `metFactions[f].filter(other => other !== f)`. */
  private _metFactions: Record<Faction, Record<Faction, boolean>> = (() => {
    const r = fullFactionRecord(() => fullFactionRecord(() => false));
    for (const f of FACTIONS) r[f][f] = true;
    return r;
  })();
  /** Snapshot of previous-tick alignment per faction, used to fire cross-threshold
   *  alerts once on transition rather than every tick while past the bound. */
  private _prevAlignment: Record<Faction, Record<Faction, number>> = fullFactionRecord(() => fullFactionRecord(() => 0));
  /** Which faction the human player is controlling (null for headless AI-vs-AI).
   *  Used to gate per-faction alerts — the player shouldn't get a notification every
   *  time the opposing AI finishes a research item, for instance. */
  private readonly playerFaction: Faction | null;
  /** The factions actually participating in this match. Populated at construction
   *  from `factionCountBySize[mapSize]`. First entry is the human `playerFaction`
   *  (falls back to `"wizards"` for headless AI-vs-AI), remainder are AI slots. */
  private readonly activeFactions: Faction[];
  /** Species lookup per faction slot. Active slots get a random roll; inactive
   *  slots carry defaults so every `Record<Faction, X>` is fully populated. */
  private readonly factionSpecies: Record<Faction, Species>;

  constructor({ mapSize = "medium", seed, playerFaction, onTick, onAlert }: GameEngineConfig) {
    this.onTick = onTick;
    this.onAlert = onAlert;
    this.playerFaction = playerFaction ?? null;
    this.entities = new EntityManager();
    this.events = new EventBus();
    const size = mapSizes[mapSize];
    this.grid = new Grid(size.widthTiles, size.heightTiles);
    this.spatialIndex = new SpatialIndex();

    // Build the active-faction roster for this match. Player (if any) takes the
    // first slot; the rest are AI. All slots keep their `FACTION_IDS` ordering
    // so per-faction records iterate predictably.
    const factionCount = factionCountBySize[mapSize];
    const ordered: Faction[] = [];
    if (playerFaction) ordered.push(playerFaction);
    for (const f of FACTION_IDS) {
      if (ordered.length >= factionCount) break;
      if (!ordered.includes(f)) ordered.push(f);
    }
    this.activeFactions = ordered;

    // Species: the two legacy slots keep their historical 1:1 mapping
    // ("wizards" slot plays the wizard roster, "robots" plays the robot roster).
    // Extension slots (f3..f6) get a random roll. Inactive slots carry a default
    // so Record<Faction, X> iteration in legacy code stays safe.
    const rng = seededRng(seed);
    const species: Record<Faction, Species> = {
      wizards: "wizards", robots: "robots",
      f3: "wizards", f4: "wizards", f5: "wizards", f6: "wizards",
    };
    for (const f of this.activeFactions) {
      if (f === "wizards" || f === "robots") continue;
      species[f] = rng() < 0.5 ? "wizards" : "robots";
    }
    this.factionSpecies = species;

    const { deposits, startingPositions } = generateMap(this.grid, {
      size: mapSize,
      seed,
      factionCount,
    });
    this.deposits = deposits;
    this.startingPositions = startingPositions;

    this.fog = fullFactionRecord(() => new FogOfWar(size.widthTiles, size.heightTiles));
    this.lastSeen = fullFactionRecord(() => new LastSeenMap());

    this._spawnStartingEntities();
    this.loop = new GameLoop(this.tick.bind(this));

    // One MilitaryAI per non-human active faction. Headless runs (no player)
    // skip AI entirely so tests can control the simulation directly.
    this._ais = playerFaction
      ? this.activeFactions
          .filter((f) => f !== playerFaction)
          .map((f) => new MilitaryAI(f, this.factionSpecies[f]))
      : [];
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
    for (let i = 0; i < this.activeFactions.length; i++) {
      const faction = this.activeFactions[i]!;
      const pos = this.startingPositions[i];
      if (!pos) continue;
      if (this.factionSpecies[faction] === "wizards") {
        this._spawnWizardStart(faction, pos);
      } else {
        this._spawnRobotStart(faction, pos);
      }
    }
  }

  private _spawnWizardStart(faction: Faction, pos: Vec2): void {
    const castle = new BuildingEntity({
      faction,
      typeKey: "castle",
      position: { x: pos.x, y: pos.y },
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
    castle.state = { kind: "operational" };
    this.entities.add(castle);
    this._blockBuildingTiles(castle);

    const archmageStats = wizardUnitStats[namedLeaders.wizards.typeKey]!;
    const archmage = new UnitEntity({
      faction,
      typeKey: namedLeaders.wizards.typeKey,
      position: this._findSpawnTile(castle) ?? { x: pos.x, y: pos.y + 4 },
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
      isFlying: archmageStats.flying ?? false,
      canAttackAir: archmageStats.canAttackAir ?? false,
    });
    this.entities.add(archmage);

    const surfStats = wizardUnitStats.surf!;
    for (let i = 0; i < 2; i++) {
      const surf = new UnitEntity({
        faction,
        typeKey: "surf",
        position: this._findSpawnTile(castle) ?? { x: pos.x + (i === 0 ? -1 : 1), y: pos.y + 4 },
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
  }

  private _spawnRobotStart(faction: Faction, pos: Vec2): void {
    const home = new BuildingEntity({
      faction,
      typeKey: "home",
      position: { x: pos.x, y: pos.y },
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
    home.state = { kind: "operational" };
    this.entities.add(home);
    this._blockBuildingTiles(home);

    const motherboardStats = robotUnitStats.motherboard!;
    const motherboard = new UnitEntity({
      faction,
      typeKey: namedLeaders.robots.typeKey,
      position: this._findSpawnTile(home) ?? { x: pos.x, y: pos.y + 4 },
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
      isFlying: motherboardStats.flying ?? false,
      canAttackAir: motherboardStats.canAttackAir ?? false,
    });
    motherboard.materialType = "wood";
    this.entities.add(motherboard);

    const coreStats = robotUnitStats.core!;
    for (let i = 0; i < 2; i++) {
      const core = new UnitEntity({
        faction,
        typeKey: "core",
        position: this._findSpawnTile(home) ?? { x: pos.x + (i === 0 ? -1 : 1), y: pos.y + 4 },
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
    // Non-combat treaty blocks attack orders toward signatories (Phase 14).
    if (this._nonCombatTreaties[unit.faction][targetEntity.faction]) {
      if (this._isPlayerFaction(unit.faction)) {
        this.onAlert?.(`Attack blocked — non-combat treaty with ${targetEntity.faction}`);
      }
      return;
    }
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

    const costs = this._unitCostsFor(building.faction);
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

    // Dragon Hoard gate: each operational Hoard supports exactly one Dragon.
    // Count per-faction so a 4/6-player match with multiple wizard slots doesn't
    // share hoards across factions.
    if (unitTypeKey === "dragon" && this.factionSpecies[building.faction] === "wizards") {
      const hoardCount = this.entities.buildingsByFaction(building.faction)
        .filter((b) => b.typeKey === "dragonHoard" && b.isOperational).length;
      const liveDragons = this.entities.unitsByFaction(building.faction)
        .filter((u) => u.typeKey === "dragon").length;
      let queuedDragons = 0;
      for (const b of this.entities.buildingsByFaction(building.faction)) {
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

    const costs = this._unitCostsFor(building.faction);
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

    const costs = this._buildingCostsFor(unit.faction);
    const cost = costs[buildingTypeKey];
    if (!cost) return;

    const res = this.resources[unit.faction];
    if (res.wood < cost.wood || res.water < cost.water) return;
    res.wood -= cost.wood;
    res.water -= cost.water;

    const factionStats = this._buildingStatsFor(unit.faction);
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
    const factionStats = this._buildingStatsFor(faction);
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
    const factionStats = this._buildingStatsFor(building.faction);
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
      } else if (unit.state.kind === "hidingInBuilding" || unit.state.kind === "inEnemyBuilding") {
        // If the host building is gone (destroyed between the death handler and
        // now) the hidden unit silently reverts to idle. Belt-and-suspenders:
        // prevents a stale-pointer hide state from persisting.
        const host = this.entities.get(unit.state.buildingId);
        if (!host) unit.state = { kind: "idle" };
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
      const searchRadius = effectiveRange + BUILDING_FOOTPRINT_PAD;
      const candidateIds = this.spatialIndex.query(unit.position, searchRadius);
      for (const id of candidateIds) {
        if (id === unit.id) continue;
        const e = this.entities.get(id);
        if (!e || e.faction === unit.faction) continue;
        if (e.stats.hp <= 0) continue;
        if (e.kind === "unit") {
          const eu = e as UnitEntity;
          if (eu.state.kind === "platformShell" || eu.state.kind === "garrisoned" || eu.state.kind === "inPlatform") continue;
        }
        if (e.kind === "unit" && (e as UnitEntity).isFlying && !unit.canAttackAir) continue;
        if (!this._isTargetableBy(e, unit.faction)) continue;
        const d = this._distanceToTarget(unit.position, e);
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
      const searchRadius = attackRange + BUILDING_FOOTPRINT_PAD;
      const candidateIds = this.spatialIndex.query(platform.position, searchRadius);
      for (const id of candidateIds) {
        if (id === platform.id) continue;
        const e = this.entities.get(id);
        if (!e || e.faction === platform.faction) continue;
        if (e.stats.hp <= 0) continue;
        if (e.kind === "unit") {
          const eu = e as UnitEntity;
          if (eu.state.kind === "platformShell" || eu.state.kind === "garrisoned" || eu.state.kind === "inPlatform") continue;
        }
        if (!this._isTargetableBy(e, platform.faction)) continue;
        const d = this._distanceToTarget(platform.position, e);
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
    const factionStats = this._buildingStatsFor(building.faction);
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

  // ── Species dispatch helpers (N-faction support) ─────────────────────────────
  // Every per-faction balance table is keyed on species. Slots 3-6 may play
  // either species, so anywhere we used to do `faction === "wizards" ? wizX :
  // robX` we now route through these helpers so the correct table is chosen
  // regardless of slot ID.
  private _buildingStatsFor(faction: Faction) {
    return this.factionSpecies[faction] === "wizards" ? wizardBuildingStats : robotBuildingStats;
  }
  private _buildingCostsFor(faction: Faction) {
    return this.factionSpecies[faction] === "wizards" ? wizardBuildingCosts : robotBuildingCosts;
  }
  private _unitCostsFor(faction: Faction) {
    return this.factionSpecies[faction] === "wizards" ? wizardUnitCosts : robotUnitCosts;
  }
  private _unitStatsFor(faction: Faction) {
    return this.factionSpecies[faction] === "wizards" ? wizardUnitStats : robotUnitStats;
  }

  // ── Production ────────────────────────────────────────────────────────────────

  private _processProduction(): void {
    const costsBySpecies = { wizards: wizardUnitCosts, robots: robotUnitCosts };
    for (const building of this.entities.buildings()) {
      if (building.state.kind !== "producing") continue;
      building.state.progressTicks++;
      if (building.state.progressTicks >= building.state.totalTicks) {
        const { unitTypeKey } = building.state;
        const costs = costsBySpecies[this.factionSpecies[building.faction]];
        // Dequeue next item before spawning so state is consistent
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
        this._spawnProducedUnit(building, unitTypeKey);
      }
    }
  }

  private _spawnProducedUnit(building: BuildingEntity, unitTypeKey: string): void {
    let stats: { maxHp: number; damage: number; attackRange: number; sightRange: number; speed: number; charisma: number; armor: number; capacity: number } | null = null;
    let isFlying = false;
    let canAttackAir = false;
    let cannotBeConverted = false;

    if (this.factionSpecies[building.faction] === "wizards") {
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
        const metalUnlocked = this._completedResearch.get(building.faction)?.has("woodToMetal") ?? false;
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

    const spawnPos = this._findSpawnTile(building, isFlying);
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
    if (this.factionSpecies[building.faction] === "robots") {
      const metalUnlocked = this._completedResearch.get(building.faction)?.has("woodToMetal") ?? false;
      unit.materialType = metalUnlocked ? "metal" : "wood";
    }
    this.entities.add(unit);
  }

  private _findSpawnTile(building: BuildingEntity, isFlying = false): Vec2 | null {
    const factionStats = this._buildingStatsFor(building.faction);
    const fp = factionStats[building.typeKey]?.footprintTiles ?? 2;
    const bx = Math.floor(building.position.x);
    const by = Math.floor(building.position.y);

    // Check tiles in an expanding ring just outside the building footprint.
    // Flyers get the flying-layer occupancy check so newly spawned Stingers /
    // Probes don't stack on top of each other; ground units still only collide
    // with other ground units.
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy < fp + r; dy++) {
        for (let dx = -r; dx < fp + r; dx++) {
          // Only check the perimeter of the expanded footprint at distance r
          const onPerimeter = dx === -r || dx === fp + r - 1 || dy === -r || dy === fp + r - 1;
          if (!onPerimeter) continue;
          const tx = bx + dx;
          const ty = by + dy;
          // Flyers ignore terrain blockers (they can perch over water / forest).
          const terrainOk = isFlying ? this.grid.inBounds(tx, ty) : this.grid.isPassable(tx, ty);
          if (terrainOk && !this._tileOccupiedByUnit(tx, ty, "", isFlying)) {
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
        // Only notify the player about their OWN research completing. The opposing
        // AI's upgrades aren't the player's concern at the alert layer.
        if (this._isPlayerFaction(faction)) {
          this.onAlert?.(`Research complete: ${researchKey}`);
        }
      }
    }
  }

  /** True when `faction` matches the human player. In headless AI-vs-AI mode
   *  (playerFaction === null) every faction is effectively "the player" so alerts
   *  fire for all. */
  private _isPlayerFaction(faction: Faction): boolean {
    return this.playerFaction === null || this.playerFaction === faction;
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

      const dist = this._distanceToTarget(unit.position, target);
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

      // Phase 14 alignment: every hit moves the VICTIM's faction alignment
      // toward the attacker downward. Combat grudges stack over the match.
      if (target.faction !== unit.faction && dmg > 0) {
        this._adjustAlignment(target.faction, unit.faction, -diplomacyConfig.alignmentOnAttackDmgMult * dmg);
      }

      this._attackEvents.push({
        attackerId: unit.id,
        targetId: target.id,
        attackerPos: { ...unit.position },
        targetPos: { ...target.position },
        ranged: unit.stats.attackRange > 1,
      });

      const statConfig = this._unitStatsFor(unit.faction)[unit.typeKey];
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
      const searchRadius = unit.stats.attackRange + BUILDING_FOOTPRINT_PAD;
      const candidateIds = this.spatialIndex.query(unit.position, searchRadius);
      for (const id of candidateIds) {
        if (id === unit.id) continue;
        const entity = this.entities.get(id);
        if (!entity || entity.faction === unit.faction) continue;
        if (entity.stats.hp <= 0) continue;
        if (entity.kind === "unit") {
          const eu = entity as UnitEntity;
          if (eu.state.kind === "platformShell" || eu.state.kind === "garrisoned" || eu.state.kind === "inPlatform") continue;
          if (eu.isFlying && !unit.canAttackAir) continue;
        }
        if (!this._isTargetableBy(entity, unit.faction)) continue;
        const dist = this._distanceToTarget(unit.position, entity);
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
      if (this._isPlayerFaction(entity.faction)) {
        this.onAlert?.(`${entity.typeKey} destroyed`);
      }
      if (entity.isNamed) {
        // Determine killer's faction for victory credit
        const killer = killerId ? this.entities.get(killerId) : null;
        // Unattributed kills: credit the first other active faction as a
        // best-effort fallback. Named leaders normally die to a tracked attacker.
        const fallbackWinner = this.activeFactions.find((f) => f !== entity.faction) ?? entity.faction;
        const winFaction: Faction = killer ? killer.faction : fallbackWinner;
        this.events.queue("VictoryAlert", { faction: winFaction, condition: "military", pct: 100 });
        // Broadcast a faction-elimination alert to the viewing player — fires
        // regardless of whose leader died so every active game surfaces the
        // end-of-faction moment. `_isPlayerFaction`-gated alerts above are
        // only for own-faction unit losses; this is the louder global event.
        const leaderName = entity.name ?? entity.typeKey;
        const factionName = uiText.factions[entity.faction];
        this.onAlert?.(uiText.victory.alertFactionEliminated(factionName, leaderName));
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
            // Route by occupant state — ICP uses `inPlatform`, Cottage + Recharge
            // Station use `hidingInBuilding`. Calling the wrong helper leaves
            // the occupant stuck in the now-orphaned state (the old bug: an
            // Archmage hidden in a destroyed Cottage stayed invisible forever
            // because `issueLeavePlatformOrder` early-returns for non-inPlatform).
            const occupant = this.entities.get(occupantId);
            if (!occupant || occupant.kind !== "unit") continue;
            const u = occupant as UnitEntity;
            if (u.state.kind === "hidingInBuilding") {
              this.issueLeaveHidingOrder(occupantId);
            } else if (u.state.kind === "inPlatform") {
              this.issueLeavePlatformOrder(occupantId, 1);
            } else if (u.state.kind === "inEnemyBuilding") {
              // Infiltrator in a dying enemy Cottage — drop to idle on the spot.
              u.state = { kind: "idle" };
            }
          }
        }
      }
      this.entities.remove(entity.id);
      if (this._isPlayerFaction(entity.faction)) {
        this.onAlert?.(`${entity.typeKey} destroyed`);
      }
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
    // Run the mana economy per wizard-species faction slot so f3-f6 wizard
    // factions generate + spend mana on their own pool, not the legacy "wizards"
    // slot's pool.
    for (const faction of this.activeFactions) {
      if (this.factionSpecies[faction] !== "wizards") continue;
      this._processManaForFaction(faction);
    }
  }

  private _processManaForFaction(faction: Faction): void {
    const res = this.resources[faction];
    const wizardUnits = this.entities.unitsByFaction(faction).filter(
      (u) => WIZARD_UNIT_TYPES.has(u.typeKey) && u.state.kind !== "platformShell",
    );
    const reservoirs = this.entities.buildingsByFaction(faction).filter(
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

  // ── Diplomacy (Phase 14) ────────────────────────────────────────────────────

  /** Current alignment A → B (−100 .. +100). Primarily for tests / AI. */
  getAlignment(from: Faction, toward: Faction): number {
    return this._alignment[from][toward];
  }

  /** Test / dev hook: seed alignment directly. Used by tests to simulate a
   *  friendly opening state that would normally take several accepted proposals. */
  setAlignment(from: Faction, toward: Faction, value: number): void {
    this._alignment[from][toward] = this._clampAlignment(value);
  }

  /** All active proposals. UI filters by `to === activeFaction` for the
   *  incoming-request list. */
  getPendingProposals(): readonly DiplomaticProposal[] {
    return this._pendingProposals;
  }

  /** Snapshot-shape faction stats for a single faction. Recomputes — cheap,
   *  and lets AI archetypes read militaryStrength without a fresh tick. */
  getFactionStats(faction: Faction): FactionStats {
    return this._computeFactionStats()[faction];
  }

  /** The active-faction roster for this match (2/4/6 depending on map size). */
  getActiveFactions(): readonly Faction[] {
    return this.activeFactions;
  }

  /** True once `researchKey` has been permanently unlocked for `faction`. */
  hasCompletedResearch(faction: Faction, researchKey: string): boolean {
    return this._completedResearch.get(faction)?.has(researchKey) ?? false;
  }

  /** True while a non-combat treaty is active between two factions. */
  hasNonCombatTreaty(a: Faction, b: Faction): boolean {
    return this._nonCombatTreaties[a][b];
  }

  /** True once A and B have had mutual sight contact (see `_updateMetFactions`).
   *  Self-diagonal always returns true so UI code can uniformly iterate slots. */
  hasMet(a: Faction, b: Faction): boolean {
    return this._metFactions[a][b];
  }

  /** Test/debug helper — flip the bilateral met flag without requiring an actual
   *  sight-contact event. Does not fire the first-contact alert. */
  setMet(a: Faction, b: Faction): void {
    if (a === b) return;
    this._metFactions[a][b] = true;
    this._metFactions[b][a] = true;
  }

  /** Flat-list projection of `_metFactions` for snapshot emission. */
  private _buildMetFactionsSnapshot(): Record<Faction, Faction[]> {
    const out = fullFactionRecord<Faction[]>(() => []);
    for (const f of FACTIONS) {
      const list: Faction[] = [];
      for (const other of FACTIONS) {
        if (this._metFactions[f][other]) list.push(other);
      }
      out[f] = list;
    }
    return out;
  }

  /**
   * Push a new diplomatic proposal into the pending queue. Rejects silently
   * when:
   *   - the same sender→target already has a pending proposal of the same kind
   *     (avoids spam);
   *   - resource request payload is missing or the amount is non-positive;
   *   - unit request target doesn't exist or doesn't belong to `to`.
   *
   * Accepting is handled separately by `issueRespondToProposal` — the AI
   * responds via `MilitaryAI._respondToProposals`, and human players respond
   * through the UI.
   */
  issueProposeDiplomaticAction(
    sender: Faction,
    target: Faction,
    kind: DiplomaticProposalKind,
    payload?: { resource?: { kind: "wood" | "water" | "mana"; amount: number }; unitId?: string },
  ): void {
    if (sender === target) return;
    // Discovery gate: can't propose to a faction you haven't met. Silent reject
    // matches the UX contract the DiplomacyPanel enforces (row hidden) so the
    // engine stays defensive if something bypasses the UI.
    if (!this._metFactions[sender][target]) return;
    if (this._pendingProposals.some((p) => p.from === sender && p.to === target && p.kind === kind)) {
      return;
    }
    if (kind === "resourceRequest") {
      if (!payload?.resource || payload.resource.amount <= 0) return;
    }
    if (kind === "unitRequest") {
      if (!payload?.unitId) return;
      const u = this.entities.get(payload.unitId);
      if (!u || u.kind !== "unit" || u.faction !== target) return;
    }
    const proposal: DiplomaticProposal = {
      id: `prop_${this._proposalIdCounter++}`,
      kind,
      from: sender,
      to: target,
      createdTick: 0,
      ...(payload?.resource ? { resource: payload.resource } : {}),
      ...(payload?.unitId ? { unitId: payload.unitId } : {}),
    };
    this._pendingProposals.push(proposal);
  }

  /** Resolve a pending proposal. On accept, applies the effect + bumps
   *  alignment both sides; on decline, bumps alignment down both sides. */
  issueRespondToProposal(proposalId: string, accept: boolean): void {
    const idx = this._pendingProposals.findIndex((p) => p.id === proposalId);
    if (idx === -1) return;
    const p = this._pendingProposals[idx]!;
    this._pendingProposals.splice(idx, 1);

    if (!accept) {
      this._adjustAlignment(p.from, p.to, diplomacyConfig.alignmentOnDecline);
      this._adjustAlignment(p.to, p.from, diplomacyConfig.alignmentOnDecline);
      if (this._isPlayerFaction(p.from)) {
        this.onAlert?.(uiText.diplomacy.alertProposalDeclined(p.to, p.kind));
      }
      return;
    }

    switch (p.kind) {
      case "openBorders":
        this._openBorders[p.from][p.to] = true;
        this._openBorders[p.to][p.from] = true;
        this._adjustAlignment(p.from, p.to, diplomacyConfig.alignmentOnOpenBordersAccept);
        this._adjustAlignment(p.to, p.from, diplomacyConfig.alignmentOnOpenBordersAccept);
        if (this._isPlayerFaction(p.from) || this._isPlayerFaction(p.to)) {
          this.onAlert?.(uiText.diplomacy.alertOpenBorders(p.from === this.playerFaction ? p.to : p.from));
        }
        break;
      case "nonCombat":
        this._nonCombatTreaties[p.from][p.to] = true;
        this._nonCombatTreaties[p.to][p.from] = true;
        this._adjustAlignment(p.from, p.to, diplomacyConfig.alignmentOnNonCombatAccept);
        this._adjustAlignment(p.to, p.from, diplomacyConfig.alignmentOnNonCombatAccept);
        if (this._isPlayerFaction(p.from) || this._isPlayerFaction(p.to)) {
          this.onAlert?.(uiText.diplomacy.alertNonCombat(p.from === this.playerFaction ? p.to : p.from));
        }
        break;
      case "resourceRequest": {
        const r = p.resource;
        if (!r) return;
        const donor = this.resources[p.to];
        if (donor[r.kind] < r.amount) return; // silently drop if donor can't pay
        donor[r.kind] -= r.amount;
        this.resources[p.from][r.kind] += r.amount;
        this._adjustAlignment(p.from, p.to, diplomacyConfig.alignmentOnResourceAccept);
        this._adjustAlignment(p.to, p.from, diplomacyConfig.alignmentOnResourceAccept);
        if (this._isPlayerFaction(p.from)) {
          this.onAlert?.(uiText.diplomacy.alertResourceTransfer(p.to, r.amount, r.kind));
        }
        break;
      }
      case "unitRequest": {
        if (!p.unitId) return;
        const ent = this.entities.get(p.unitId);
        if (!ent || ent.kind !== "unit" || ent.faction !== p.to) return;
        ent.faction = p.from;
        this._adjustAlignment(p.from, p.to, diplomacyConfig.alignmentOnUnitRequestAccept);
        this._adjustAlignment(p.to, p.from, diplomacyConfig.alignmentOnUnitRequestAccept);
        if (this._isPlayerFaction(p.from)) {
          const u = ent as UnitEntity;
          this.onAlert?.(uiText.diplomacy.alertUnitTransfer(p.to, u.name ?? u.typeKey));
        }
        break;
      }
    }

    if (this._isPlayerFaction(p.from)) {
      // Already covered by the kind-specific alert above; no double-fire.
    }
  }

  private _clampAlignment(v: number): number {
    return Math.max(diplomacyConfig.alignmentMin, Math.min(diplomacyConfig.alignmentMax, v));
  }

  private _adjustAlignment(from: Faction, toward: Faction, delta: number): void {
    this._alignment[from][toward] = this._clampAlignment(this._alignment[from][toward] + delta);
  }

  /** Public alignment nudge used by AI archetypes (e.g. MilitaryAI appeasement).
   *  Clamped to the config's min/max. Unilateral — call twice for bilateral. */
  bumpAlignment(from: Faction, toward: Faction, delta: number): void {
    this._adjustAlignment(from, toward, delta);
  }

  /** Fire a one-shot alert when alignment crosses ±`alertThreshold` in either
   *  direction. Compares against `_prevAlignment` from the previous tick snapshot. */
  private _checkAlignmentTransitions(): void {
    if (this.playerFaction === null) return;
    const me = this.playerFaction;
    for (const other of FACTIONS) {
      if (other === me) continue;
      const prev = this._prevAlignment[other][me];
      const curr = this._alignment[other][me];
      const th = diplomacyConfig.alertThreshold;
      if (prev < th && curr >= th) {
        this.onAlert?.(uiText.diplomacy.alertAlignmentHigh(other));
      } else if (prev > -th && curr <= -th) {
        this.onAlert?.(uiText.diplomacy.alertAlignmentLow(other));
      }
    }
    // Cache for next tick's diff.
    for (const a of FACTIONS) for (const b of FACTIONS) this._prevAlignment[a][b] = this._alignment[a][b];
  }

  issueManaShieldToggle(unitId: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (!WIZARD_UNIT_TYPES.has(unit.typeKey)) return;
    if (!this._completedResearch.get(unit.faction)?.has("manaShield")) return;
    if (!unit.manaShielded && this.resources[unit.faction].mana <= 0) return;
    unit.manaShielded = !unit.manaShielded;
  }

  issueInvisibilityToggle(unitId: string): void {
    const entity = this.entities.get(unitId);
    if (!entity || entity.kind !== "unit") return;
    const unit = entity as UnitEntity;
    if (unit.typeKey !== "illusionist") return;
    if (!this._completedResearch.get(unit.faction)?.has(illusionistInvisibilityResearchKey)) return;
    if (!unit.invisibilityActive && this.resources[unit.faction].mana <= 0) return;
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
    const enemyRoster = this.factionSpecies[unit.faction] === "robots" ? wizardUnitStats : robotUnitStats;
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
    if (!this._completedResearch.get(caster.faction)?.has("iceBlast")) return;
    if (this.resources[caster.faction].mana < spellCosts.iceBlastMana) return;
    const target = this.entities.get(targetId);
    if (!target || target.faction === caster.faction) return;
    const dx = target.position.x - caster.position.x;
    const dy = target.position.y - caster.position.y;
    if (Math.sqrt(dx * dx + dy * dy) > caster.stats.attackRange) return;

    this.resources[caster.faction].mana -= spellCosts.iceBlastMana;
    this._spellEvents.push({ kind: "iceBlast", casterId, casterPos: { ...caster.position }, targetId, targetPos: { ...target.position } });
    const t = target as UnitEntity;
    if (t.slowTicksRemaining === 0) t.baseSpeed = t.stats.speed;
    t.stats.speed = t.baseSpeed * (1 - spellEffects.iceBlast.speedReductionPct / 100);
    t.slowTicksRemaining = spellEffects.iceBlast.slowDurationTicks;
  }

  issueFieryExplosionOrder(casterId: string, targetPos: Vec2): void {
    const caster = this.entities.get(casterId) as UnitEntity | undefined;
    if (!caster || caster.kind !== "unit" || caster.typeKey !== "evoker") return;
    if (!this._completedResearch.get(caster.faction)?.has("fieryExplosion")) return;
    if (this.resources[caster.faction].mana < spellCosts.fieryExplosionMana) return;
    const dx = targetPos.x - caster.position.x;
    const dy = targetPos.y - caster.position.y;
    if (Math.sqrt(dx * dx + dy * dy) > caster.stats.attackRange) return;

    this.resources[caster.faction].mana -= spellCosts.fieryExplosionMana;
    this._spellEvents.push({ kind: "fieryExplosion", casterId, casterPos: { ...caster.position }, targetPos: { ...targetPos } });
    const radius = spellEffects.fieryExplosion.radiusTiles;
    const radiusSq = radius * radius;
    // Pad the spatial query so a building whose footprint overlaps the blast
    // radius but whose top-left center sits just outside is still included;
    // precise AABB-vs-point distance would need a _distanceToTarget call,
    // but spell damage is point-radius (checks entity center), so we keep the
    // simple Euclidean post-filter and just widen the candidate pool.
    const candidateIds = this.spatialIndex.query(targetPos, radius + BUILDING_FOOTPRINT_PAD);
    for (const id of candidateIds) {
      const entity = this.entities.get(id);
      if (!entity || entity.faction === caster.faction) continue;
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
    if (!this._completedResearch.get(caster.faction)?.has("strengthenAlly")) return;
    if (this.resources[caster.faction].mana < spellCosts.enlargeMana) return;
    const target = this.entities.get(targetId);
    if (!target || target.kind !== "unit" || target.faction !== caster.faction) return;
    const dx = target.position.x - caster.position.x;
    const dy = target.position.y - caster.position.y;
    if (Math.sqrt(dx * dx + dy * dy) > caster.stats.attackRange) return;

    this.resources[caster.faction].mana -= spellCosts.enlargeMana;
    this._spellEvents.push({ kind: "enlarge", casterId, casterPos: { ...caster.position }, targetId, targetPos: { ...target.position } });
    const t = target as UnitEntity;
    t.damageBonusMultiplier = 1 + spellEffects.enlarge.damageBonusPct / 100;
    t.damageBonusTicks = spellEffects.enlarge.durationTicks;
  }

  issueReduceOrder(casterId: string, targetId: string): void {
    const caster = this.entities.get(casterId) as UnitEntity | undefined;
    if (!caster || caster.kind !== "unit" || caster.typeKey !== "enchantress") return;
    if (!this._completedResearch.get(caster.faction)?.has("weakenFoe")) return;
    if (this.resources[caster.faction].mana < spellCosts.reduceMana) return;
    const target = this.entities.get(targetId);
    if (!target || target.faction === caster.faction) return;
    const dx = target.position.x - caster.position.x;
    const dy = target.position.y - caster.position.y;
    if (Math.sqrt(dx * dx + dy * dy) > caster.stats.attackRange) return;

    this.resources[caster.faction].mana -= spellCosts.reduceMana;
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
    const factionStats = this._buildingStatsFor(building.faction);
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
    const result: Record<Faction, { count: number; cap: number }> = fullFactionRecord(() => ({ count: 0, cap: 0 }));
    for (const unit of this.entities.units()) {
      if (ROBOT_PLATFORM_TYPES.has(unit.typeKey)) continue; // platforms don't consume population
      result[unit.faction].count++;
      result[unit.faction].cap += unitPopulationBonus[unit.typeKey] ?? 0;
    }
    for (const building of this.entities.buildings()) {
      if (!building.isOperational) continue;
      const speciesStats = this._buildingStatsFor(building.faction);
      const support = speciesStats[building.typeKey]?.populationSupport ?? 0;
      result[building.faction].cap += support;
    }
    return result;
  }

  private _computeFactionStats(): Record<Faction, FactionStats> {
    const mk = (f: Faction): FactionStats => ({
      militaryStrength: 0, culture: 0, defense: 0, intelligence: 0, footprint: 0,
      alignment: { ...this._alignment[f] },
      openBorders: { ...this._openBorders[f] },
      nonCombatTreaties: { ...this._nonCombatTreaties[f] },
    });
    const result: Record<Faction, FactionStats> = fullFactionRecord<FactionStats>(() => mk("wizards"));
    for (const f of FACTIONS) result[f] = mk(f);
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
      const bStats = this.factionSpecies[building.faction] === "wizards" ? wizardBuildingStats : robotBuildingStats;
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

  /**
   * Clear and repopulate the spatial index with every live entity at its
   * current tile. Called once per tick from `tick()` so downstream scans
   * (auto-aggro, detector reveal, discovery, garrison/ICP fire, Fiery
   * Explosion) can use `spatialIndex.queryCircle` instead of iterating
   * every entity. Buildings are inserted at their top-left position (the
   * footprint can extend up to `BUILDING_FOOTPRINT_PAD` tiles further —
   * callers compensate by padding their query radius and post-filtering
   * with precise distance).
   */
  private _rebuildSpatialIndex(): void {
    this.spatialIndex.clear();
    for (const entity of this.entities.all()) {
      this.spatialIndex.insert(entity.id, entity.position);
    }
  }

  // ── Fog ───────────────────────────────────────────────────────────────────────

  private tick(tick: number, elapsedMs: number): void {
    for (const ai of this._ais) ai.tick(tick, this);
    this._syncPassengerPositions();
    this._syncGarrisonedPositions();
    this._processFollowing();
    this._processMovement();
    this._processConstruction();
    this._processGathering(tick);
    this._processProduction();
    this._processResearch();
    // Refresh the spatial index so every scan this tick (detector reveal,
    // combat, auto-aggro, garrison/ICP fire, met/discovery) can route through
    // a spatial query instead of iterating every entity. Rebuild happens after
    // production so newly-spawned units are included; happens before the first
    // consumer (detector reveal) so the index reflects final post-movement
    // positions for this tick.
    this._rebuildSpatialIndex();
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
    this._checkAlignmentTransitions();
    this._updateFog(tick);
    this._updateMetFactions();
    this.events.flushDeferred();

    // Final safety net — remove any entities whose HP reached 0 this tick without the
    // damage-site death handler being hit (e.g. buffs expiring on already-fatal wounds).
    this._cleanupDeadEntities();

    const resourcesSnap = fullFactionRecord<ResourcePool>(() => ({ wood: 0, water: 0, mana: 0 }));
    // Fog snapshots are consumed by the renderer, minimap, and headless tests —
    // all of which only read the viewing faction's entry. Emitting a real
    // snapshot for every slot allocates a full FogOfWar view per faction per
    // tick; on a 256×256 large map with 6 active slots that's wasted work
    // nobody reads. Only the viewer (playerFaction, or every active faction
    // when running headless for tests) gets the live snapshot; the rest get
    // an empty stub that satisfies the type without touching the grid.
    const emptyFog: FogSnapshot = { width: 0, height: 0, data: EMPTY_FOG_DATA };
    const fogSnap = fullFactionRecord<FogSnapshot>(() => emptyFog);
    const viewerFactions: readonly Faction[] =
      this.playerFaction ? [this.playerFaction] : this.activeFactions;
    for (const f of viewerFactions) {
      fogSnap[f] = this.fog[f].snapshot();
    }
    const completedSnap = fullFactionRecord<string[]>(() => []);
    const detectedSnap = fullFactionRecord<string[]>(() => []);
    const detectedIdsMap = this._computeDetectedIds();
    for (const f of FACTIONS) {
      resourcesSnap[f] = { ...this.resources[f] };
      completedSnap[f] = [...(this._completedResearch.get(f) ?? [])];
      detectedSnap[f] = detectedIdsMap[f];
    }

    this.onTick({
      tick,
      elapsedMs,
      resources: resourcesSnap,
      entities: this.entities.toSnapshots(),
      tiles: this.grid.toSnapshots(),
      fog: fogSnap,
      population: this._computePopulation(),
      deposits: this._buildDepositSnapshots(),
      completedResearch: completedSnap,
      attacks: this._attackEvents.splice(0),
      spells: this._spellEvents.splice(0),
      factionStats: this._computeFactionStats(),
      detectedIds: detectedSnap,
      diplomacy: {
        pendingProposals: [...this._pendingProposals],
        metFactions: this._buildMetFactionsSnapshot(),
      },
      factionSpecies: { ...this.factionSpecies },
      activeFactions: [...this.activeFactions],
    });
  }

  /** Cached per-viewer reveal set populated by `_refreshDetectedIds` each tick. */
  private _detectedIdsThisTick: Record<Faction, Set<string>> = fullFactionRecord(() => new Set<string>());
  /** Per-unit last-tick detection state — used to fire an alert on the transition
   *  from hidden → revealed so the owning player knows their spy was spotted
   *  without spamming the alert log every tick the detector stays in range. */
  private _previousDetectedIds: Record<Faction, Set<string>> = fullFactionRecord(() => new Set<string>());

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
      // Invert the scan: per detector, spatial-query within sightRange for any
      // concealed enemy. Previously did enemy × detector linear iteration,
      // which also baked in a 2-faction assumption (`viewer === "wizards" ?
      // "robots" : "wizards"`). The query-based path is N-faction-correct by
      // construction — it picks up candidates from every non-own faction.
      for (const d of detectors) {
        const rSq = d.stats.sightRange * d.stats.sightRange;
        const candidateIds = this.spatialIndex.query(d.position, d.stats.sightRange);
        for (const id of candidateIds) {
          if (set.has(id)) continue;
          const e = this.entities.get(id);
          if (!e || e.kind !== "unit" || e.faction === viewer) continue;
          const t = e as UnitEntity;
          if (!active(t)) continue;
          const concealedLike =
            t.concealed ||
            t.invisibilityActive ||
            t.disguiseActive ||
            t.state.kind === "hidingInBuilding" ||
            t.state.kind === "inEnemyBuilding";
          if (!concealedLike) continue;
          const dx = t.position.x - d.position.x;
          const dy = t.position.y - d.position.y;
          const dSq = dx * dx + dy * dy;
          if (dSq > rSq) continue;
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
        // Only the spy's owner needs "you were spotted" — the detector's owner can
        // already see the revealed unit on the map.
        if (this._isPlayerFaction(u.faction)) {
          const base = uiText.spy.alertDetected(u.name ?? u.typeKey);
          const detail = culprit
            ? ` (${culprit.typeKey} at dist ${Math.sqrt(culpritDist).toFixed(1)})`
            : "";
          this.onAlert?.(base + detail);
        }
      }
      this._previousDetectedIds[viewer] = new Set(curr);
    }
  }

  private _computeDetectedIds(): Record<Faction, string[]> {
    const out = fullFactionRecord<string[]>(() => []);
    for (const f of FACTIONS) out[f] = [...this._detectedIdsThisTick[f]];
    return out;
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
    if (target.kind !== "unit") {
      // Buildings follow the same non-combat-treaty rule as units — an allied
      // building can't be auto-aggroed or the mid-chase attack will keep landing.
      if (this._nonCombatTreaties[attackerFaction][target.faction]) return false;
      return true;
    }
    const u = target as UnitEntity;
    if (u.state.kind === "hidingInBuilding" || u.state.kind === "inEnemyBuilding") return false;
    // Puppeted leaders under Illusionist temp-control are "invisible" to both sides'
    // auto-aggro: robots still see their own leader and don't fire; wizards don't
    // auto-attack their own faction either. Manual attack orders (issueAttackOrder)
    // skip this helper and can still connect — so a wizard player can finish the
    // puppet off once it's lured away.
    if (u.tempControlTicks > 0) return false;
    if (u.faction === attackerFaction) return true;
    // Non-combat treaty — bilateral attack ban. Auto-aggro skips allied units.
    if (this._nonCombatTreaties[attackerFaction][u.faction]) return false;
    if (u.invisibilityActive || u.disguiseActive || u.concealed) {
      return this._detectedIdsThisTick[attackerFaction].has(u.id);
    }
    return true;
  }

  /** A large (>1 footprint) unit extends past its 1×1 collision tile — the visual
   *  sprite straddles the neighbours. Attackers against such a unit get a small
   *  range bonus so the engagement edge matches what the player sees rendered. */
  private _targetSizeRangeBonus(target: Entity): number {
    if (target.kind !== "unit") return 0; // building distance uses AABB, no bonus needed
    const t = target as UnitEntity;
    const stats = this._unitStatsFor(t.faction)[t.typeKey];
    const fp = stats?.footprintTiles ?? 1;
    return Math.max(0, (fp - 1) * 0.5);
  }

  /**
   * Distance from an attacker's tile centre to its target. For buildings this is
   * the shortest distance to the footprint bounding box (so an attacker adjacent
   * to any tile of a multi-tile building reads as in range). For units we use
   * the point-to-point distance between collision tile centres — a 2×2 unit
   * still only occupies its 1×1 collision tile, and the visual over-reach is
   * covered by `_targetSizeRangeBonus`.
   */
  private _distanceToTarget(attacker: Vec2, target: Entity): number {
    const ax = attacker.x + 0.5;
    const ay = attacker.y + 0.5;
    if (target.kind === "building") {
      const b = target as BuildingEntity;
      const stats = this._buildingStatsFor(b.faction)[b.typeKey];
      const fp = stats?.footprintTiles ?? 1;
      const bx1 = target.position.x;
      const by1 = target.position.y;
      const bx2 = target.position.x + fp;
      const by2 = target.position.y + fp;
      const dx = Math.max(0, Math.max(bx1 - ax, ax - bx2));
      const dy = Math.max(0, Math.max(by1 - ay, ay - by2));
      return Math.hypot(dx, dy);
    }
    const tx = target.position.x + 0.5;
    const ty = target.position.y + 0.5;
    return Math.hypot(ax - tx, ay - ty);
  }

  /**
   * Discovery / "met" scan. For every unmet pair (A, B) of active factions, scan
   * A's units; if any A-unit has any B-owned entity within its sightRange
   * (scaled by `metDetectionRadiusMult`), flip the bilateral flag and fire a
   * first-contact alert for the player side.
   *
   * Short-circuits aggressively: once the flag is set it's never cleared, so
   * the active pair set shrinks every match. Worst-case is still O(|active|²
   * · units · r²), which is fine at 6 factions × ~50 units × ~r=10.
   */
  private _updateMetFactions(): void {
    const active = this.activeFactions;
    if (active.length < 2) return;

    for (let i = 0; i < active.length; i++) {
      const a = active[i]!;
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j]!;
        if (this._metFactions[a][b]) continue;

        if (this._pairHasSightContact(a, b) || this._pairHasSightContact(b, a)) {
          this._metFactions[a][b] = true;
          this._metFactions[b][a] = true;
          // Alert the human player if either side is them.
          if (this._isPlayerFaction(a) || this._isPlayerFaction(b)) {
            const other = a === this.playerFaction ? b : a;
            this.onAlert?.(uiText.diplomacy.alertFirstContact(other));
          }
        }
      }
    }
  }

  /** True if any `scanner`-owned unit has a `target`-owned entity within its
   *  (scaled) sightRange. Passengers / garrisoned / shelled units don't see. */
  private _pairHasSightContact(scanner: Faction, target: Faction): boolean {
    const mult = diplomacyConfig.metDetectionRadiusMult;
    for (const scannerUnit of this.entities.unitsByFaction(scanner)) {
      const k = scannerUnit.state.kind;
      if (k === "platformShell" || k === "garrisoned" || k === "inPlatform") continue;
      const range = scannerUnit.stats.sightRange * mult;
      const rSq = range * range;
      const sx = scannerUnit.position.x + 0.5;
      const sy = scannerUnit.position.y + 0.5;
      const candidateIds = this.spatialIndex.query(scannerUnit.position, range + BUILDING_FOOTPRINT_PAD);
      for (const id of candidateIds) {
        const e = this.entities.get(id);
        if (!e || e.faction !== target) continue;
        const tx = e.position.x + 0.5;
        const ty = e.position.y + 0.5;
        const dx = sx - tx;
        const dy = sy - ty;
        if (dx * dx + dy * dy <= rSq) return true;
      }
    }
    return false;
  }

  private _updateFog(tick: number): void {
    for (const faction of FACTIONS) {
      const fog = this.fog[faction];
      // Own vision, plus any open-border ally's vision (Phase 14).
      const sources = this._collectVisionSources(faction);
      for (const other of FACTIONS) {
        if (other === faction) continue;
        if (this._openBorders[faction][other]) {
          sources.push(...this._collectVisionSources(other));
        }
      }
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
    const factionStats = this._buildingStatsFor(building.faction);
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
