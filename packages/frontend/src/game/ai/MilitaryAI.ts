/**
 * Strategy-driven Military AI.
 *
 * Each reaction tick:
 *   1. Build a `Ctx` snapshot of the current game state for this faction.
 *   2. Track wave state (`inAttack`) and evaluate mode transitions.
 *   3. Run always-on tactics (base defense, wounded retreat).
 *   4. Run always-on economy maintenance (gatherers, pop support).
 *   5. Build defensive structures (everywhere except the pure economy mode).
 *   6. Run the mode-specific tick — combat composition production + rally/attack.
 *   7. Assign free Cores (robots) and garrison wizard towers (wizards).
 *   8. One-time scout dispatch after a delay.
 *
 * Modes: `economy` → `buildUp` → `push` → (return) `buildUp`, with `turtle`
 * as a panic override when the base is overrun.
 */

import type { Faction, FactionStats, Species, Vec2 } from "@neither/shared";
import {
  aiParameters,
  buildingProduction,
  buildingResearch,
  researchCosts,
  namedLeaders,
  robotBuildingCosts,
  robotBuildingStats,
  unitBuildingRequirements,
  wizardBuildingCosts,
  wizardBuildingStats,
  resourceDropoffBuildings,
  HIDING_CAPABLE_BUILDINGS,
  hidingBuildingConfig,
  diplomacy as diplomacyConfig,
  TICKS_PER_SEC,
} from "@neither/shared";
import type { DiplomaticProposal } from "@neither/shared";
import type { Entity } from "../entities/Entity.js";
import type { UnitEntity } from "../entities/UnitEntity.js";
import type { BuildingEntity } from "../entities/BuildingEntity.js";
import type { EntityManager } from "../entities/EntityManager.js";
import type { ResourceDeposit } from "../map/MapGenerator.js";
import type { Grid } from "../spatial/Grid.js";
import type { ResourcePool } from "../GameEngine.js";

export interface AIEngineInterface {
  entities: EntityManager;
  deposits: ResourceDeposit[];
  grid: Grid;
  getResources(faction: Faction): ResourcePool;
  getPopulation(faction: Faction): { count: number; cap: number };
  isValidBuildSite(faction: Faction, typeKey: string, pos: Vec2): boolean;
  issueGatherOrder(unitId: string, depositId: string): void;
  issueProductionOrder(buildingId: string, typeKey: string): boolean;
  issueBuildOrder(unitId: string, typeKey: string, pos: Vec2): void;
  issueMoveOrder(unitId: string, target: Vec2): void;
  issueGroupMoveOrder(ids: string[], target: Vec2): void;
  issueAttackOrder(unitId: string, targetId: string): void;
  issueAttachOrder(coreId: string, platformId: string): void;
  issueGarrisonOrder(unitId: string, towerId: string): void;
  issueEnterPlatformOrder(coreId: string, platformId: string): void;
  issueHideOrder(unitId: string, buildingId: string): void;
  issueResearchOrder(buildingId: string, researchKey: string): void;
  issueConvertOrder(casterId: string, targetId: string): void;
  issueRespondToProposal(proposalId: string, accept: boolean): void;
  issueProposeDiplomaticAction(
    sender: Faction,
    target: Faction,
    kind: "openBorders" | "nonCombat" | "resourceRequest" | "unitRequest",
    payload?: { resource?: { kind: "wood" | "water" | "mana"; amount: number }; unitId?: string },
  ): void;
  getAlignment(from: Faction, toward: Faction): number;
  bumpAlignment(from: Faction, toward: Faction, delta: number): void;
  getPendingProposals(): readonly DiplomaticProposal[];
  hasNonCombatTreaty(a: Faction, b: Faction): boolean;
  arePeaceful(a: Faction, b: Faction): boolean;
  getFactionStats(faction: Faction): FactionStats;
  getActiveFactions(): readonly Faction[];
  hasCompletedResearch(faction: Faction, researchKey: string): boolean;
}

// ── Faction roles ───────────────────────────────────────────────────────────

/**
 * Faction-specific typeKey roles. Centralising these here means renaming a unit
 * or building in the shared config only requires updating this table, not every
 * string literal scattered across the AI. Composition tables, combat-unit
 * detection, and the tech-unlock queue all derive from these plus `buildingProduction`
 * / `unitBuildingRequirements` at runtime.
 */
interface FactionRoles {
  /** Main base (castle / home). */
  home: string;
  /** Unit that can issueBuildOrder. */
  builder: string;
  /** Civilian typeKey (robots: core, wizards: subject — the un-armed unit). */
  civilian: string;
  /** Gatherer typeKeys. Wizards: [surf]. Robots: [waterCollectionPlatform, woodChopperPlatform]. */
  gatherers: readonly string[];
  /** Minimum of each gatherer type before economy → buildUp transition. */
  minPerGatherer: number;
  /** Building built when pop is near cap. */
  popSupport: string;
  /** Defensive building constructed outside economy mode. */
  defense: string;
  /** Unit dispatched as the one-time scout. */
  scout: string;
  /** Buildings auto-handled by maintenance/bootstrap logic — excluded from tech unlocks. */
  autoBuilt: readonly string[];
  /** Optional combat factory the AI ensures exists early (robots only). */
  bootstrapFactory: string | null;
  /** Optional wood-storage drop-off (logCabin / woodStorage). Built near far wood
   *  deposits so gatherers don't walk home every trip. */
  woodStorage: string | null;
  /** Research items the AI should prioritise (in order) once the relevant building
   *  is operational. Robots lean on material upgrades; wizards stack combat spells +
   *  Mana Shield. Order matters — earlier items are attempted first each tick. */
  researchPriority: readonly string[];
}

const SPECIES_ROLES: Record<Species, FactionRoles> = {
  wizards: {
    home: "castle",
    builder: "surf",
    civilian: "subject",
    gatherers: ["surf"],
    minPerGatherer: 3,
    popSupport: "cottage",
    defense: "wizardTower",
    scout: "surf",
    autoBuilt: ["castle"],
    bootstrapFactory: null,
    woodStorage: "logCabin",
    // Shield + AoE first (defensive backbone), then direct damage + buffs/debuffs.
    researchPriority: ["manaShield", "iceBlast", "fieryExplosion", "strengthenAlly", "weakenFoe"],
  },
  robots: {
    home: "home",
    builder: "movableBuildKitPlatform",
    civilian: "core",
    gatherers: ["waterCollectionPlatform", "woodChopperPlatform"],
    minPerGatherer: 3,
    popSupport: "rechargeStation",
    defense: "immobileCombatPlatform",
    scout: "probePlatform",
    autoBuilt: ["home", "combatFrameProduction"],
    bootstrapFactory: "combatFrameProduction",
    woodStorage: "woodStorage",
    // Material upgrade is the only home-level research today and the faction's
    // single biggest power spike, so it's the whole list for now.
    researchPriority: ["woodToMetal"],
  },
};

/** Enemy leader typeKeys — target priority when launching a wave.
 *  Derived from the shared `namedLeaders` record so adding a new faction's leader
 *  automatically extends the set. */
const LEADER_TYPES = new Set<string>(
  Object.values(namedLeaders).map((l) => l.typeKey),
);

// ── Tuning ──────────────────────────────────────────────────────────────────

/** Minimum gatherers maintained by each faction's economy layer. */
/** Attack-wave threshold at game start, ramping up over the first several minutes. */
const BASE_ATTACK_ARMY = 3;
const MAX_ATTACK_ARMY = 12;
const ATTACK_RAMP_SECONDS = 60 * 6;
/** Max items queued per production building (active + queued). */
const PROD_QUEUE_DEPTH = 3;
/** Build a pop-support building when count is within this many slots of the cap. */
const POP_HEADROOM = 2;
/** Tiles from the rally point used for rally eligibility + visual clustering. */
const RALLY_RADIUS = 12;
/** Tiles from own home within which enemy units count as threats. */
const THREAT_RADIUS = 15;
/** Tiles from own home — idle combat units beyond this cannot intercept a threat. */
const DEFENDER_RADIUS = 30;
/** Cap on built defensive structures per faction. */
const MAX_DEFENSIVE_BUILDINGS = 3;
/** Defensive reserves sized to cover one tower (wizardTower 60/20, ICP 70/10) + buffer. */
const DEFENSE_WOOD_RESERVE = 80;
const DEFENSE_WATER_RESERVE = 30;
/** Minimum resources to keep on hand AFTER paying a research cost, so combat
 *  production isn't starved the moment the AI commits to an upgrade. */
const RESEARCH_WOOD_BUFFER = 60;
const RESEARCH_WATER_BUFFER = 30;
/** Enter turtle when enemy units near home exceed own army by this factor. */
const TURTLE_THREAT_MULT = 1.5;
/** Retreat combat units whose HP fraction drops below this. */
const RETREAT_HP_PCT = 0.3;
/** First scout is dispatched no earlier than this many ticks in. */
const SCOUT_DELAY_TICKS = TICKS_PER_SEC * 30;
/** Robots only: pause combat production once this many platforms sit unattached. */
const MAX_UNATTACHED_COMBAT_PLATFORMS = 2;
/** Robots only: stop queuing Cores once this many free (unattached, non-shell) Cores
 *  exist. Prevents the base from silting up with idle Cores when combat factory or
 *  ICPs can't consume them fast enough. */
const CORE_RESERVE = 3;
/** Build a wood-storage drop-off once the farthest wood deposit is this many tiles
 *  or more from the nearest existing drop-off building. */
const WOOD_STORAGE_MIN_DIST = 15;
/** Hard cap on wood-storage buildings to prevent the AI from carpeting the map. */
const MAX_WOOD_STORAGE = 2;
/** Max one-way distance a gatherer will accept from deposit to its nearest drop-off.
 *  Farther deposits are deferred until a drop-off (home or woodStorage) lands nearby —
 *  `_maybeBuildWoodStorage` handles the placement. Prevents the AI from silting its
 *  entire economy on a single 40-tile commute. */
const GATHERER_MAX_DROPOFF_DIST = 25;

// ── Composition tables ──────────────────────────────────────────────────────

type CompEntry = { typeKey: string; weight: number };

/**
 * Army mix during buildUp / push. Illusionist (wizards), Infiltration Platform and
 * Probe Platform (robots) are intentionally excluded — they're special-use utility
 * units rather than main-line combat. Advanced picks become producible only once the
 * AI has built the relevant unlock (enchantress → libraryOfEnchantment, cleric →
 * temple, dragon → dragonHoard, largeCombatPlatform → combatFrameProduction,
 * wallPlatform → defenseFrameProduction). _queueCombatComposition filters the
 * composition to what can actually be produced right now, so early waves are
 * Evoker-only / Spinner+Spitter-only and waves grow richer as tech comes online.
 */
const WIZARD_ARMY_COMPOSITION: readonly CompEntry[] = [
  { typeKey: "evoker", weight: 60 },
  { typeKey: "enchantress", weight: 15 },
  { typeKey: "cleric", weight: 15 },
  { typeKey: "dragon", weight: 10 },
];

const WIZARD_TURTLE_COMPOSITION: readonly CompEntry[] = [
  { typeKey: "evoker", weight: 50 },
  { typeKey: "cleric", weight: 30 },
  { typeKey: "enchantress", weight: 20 },
];

const ROBOT_ARMY_COMPOSITION: readonly CompEntry[] = [
  { typeKey: "spitterPlatform", weight: 60 },
  { typeKey: "spinnerPlatform", weight: 10 },
  { typeKey: "largeCombatPlatform", weight: 15 },
  // Low-weight anti-air / mobility pick. Produced at Aerial Frame Production,
  // gated behind a separate tech building from the main combat platforms.
  { typeKey: "stingerPlatform", weight: 15 },
];

const ROBOT_TURTLE_COMPOSITION: readonly CompEntry[] = [
  { typeKey: "spinnerPlatform", weight: 40 },
  { typeKey: "spitterPlatform", weight: 35 },
  { typeKey: "wallPlatform", weight: 15 },
  { typeKey: "largeCombatPlatform", weight: 10 },
];

// Tech unlocks are now derived from the compositions + `unitBuildingRequirements`
// / `buildingProduction` via `_techPriorityList()`. Renaming or adding a prereq in
// shared config is picked up automatically.

// ── Context ─────────────────────────────────────────────────────────────────

type AIMode = "economy" | "buildUp" | "push" | "turtle";

interface Ctx {
  tick: number;
  units: UnitEntity[];
  buildings: BuildingEntity[];
  resources: ResourcePool;
  pop: { count: number; cap: number };
  enemies: Entity[];
  home: BuildingEntity | null;
  homeCenter: Vec2;
  /** All living combat units of this faction (idle or not). */
  army: UnitEntity[];
  /** Idle combat units only — captured BEFORE any rally order so mode handlers see a consistent army size. */
  idleArmy: UnitEntity[];
  /** Enemy units within THREAT_RADIUS of our home center. */
  threats: UnitEntity[];
  /** Union of all typeKeys across the faction's army + turtle compositions. Derived once per tick. */
  combatTypes: Set<string>;
}

// ── MilitaryAI ──────────────────────────────────────────────────────────────

/**
 * Global toggle. `console.log` with an `[AI:<faction>]` prefix makes it easy to filter
 * in devtools (set a filter on `[AI:` to see everything the AI does, or `[AI:robots]`
 * for one faction). Flip to `false` to silence.
 */
const AI_LOG = true;

export class MilitaryAI {
  private readonly faction: Faction;
  private readonly species: Species;
  private mode: AIMode = "economy";
  private lastTickProcessed = -9999;
  private rallyPoint: Vec2 | null = null;
  private inAttack = false;
  private hasScouted = false;

  constructor(faction: Faction, species: Species) {
    this.faction = faction;
    this.species = species;
  }

  private _log(msg: string): void {
    if (!AI_LOG) return;
    // eslint-disable-next-line no-console
    console.log(`[AI:${this.faction}] ${msg}`);
  }

  tick(tick: number, engine: AIEngineInterface): void {
    if (tick - this.lastTickProcessed < aiParameters.reactionIntervalTicks) return;
    this.lastTickProcessed = tick;

    const ctx = this._buildContext(engine, tick);
    const rallyChanged = !this.rallyPoint;
    this._ensureRallyPoint(engine, ctx.buildings);
    if (rallyChanged && this.rallyPoint) {
      this._log(`rally point set to (${this.rallyPoint.x}, ${this.rallyPoint.y})`);
    }
    const wasInAttack = this.inAttack;
    this._trackWaveState(ctx);
    if (wasInAttack && !this.inAttack) this._log(`wave ended (army now ${ctx.army.length})`);

    const nextMode = this._evaluateMode(ctx);
    if (nextMode !== this.mode) {
      this._log(`mode: ${this.mode} → ${nextMode} (army=${ctx.army.length}, threats=${ctx.threats.length}, pop=${ctx.pop.count}/${ctx.pop.cap})`);
      this.mode = nextMode;
    }

    // Always-on tactics.
    this._defendBase(engine, ctx);
    this._retreatWounded(engine, ctx);

    // Always-on economy.
    this._maintainEconomy(engine, ctx);

    // Defensive buildings + tech unlocks — outside pure economy.
    if (this.mode !== "economy") {
      this._buildDefenses(engine, ctx);
      this._buildTechUnlocks(engine, ctx);
    }
    // Research-item priority runs in every mode — items are cheap relative to the
    // whole-match payoff (woodToMetal doubles HP; Mana Shield halves damage), so
    // delaying them until post-economy is a net DPS loss on the AI side.
    this._advanceResearchPriority(engine, ctx);

    // Combat production + rally/attack.
    switch (this.mode) {
      case "economy": break;                           // no combat production while bootstrapping
      case "buildUp": this._buildUpMode(engine, ctx); break;
      case "push": this._pushMode(engine, ctx); break;
      case "turtle": this._turtleMode(engine, ctx); break;
    }

    if (this.species === "robots") {
      this._robotAssignCores(engine, ctx);
    } else {
      this._garrisonWizardTowers(engine, ctx);
    }

    // Always-on: keep the named leader safely tucked inside a hiding-capable
    // building. Cheap insurance against assassination / Military Victory loss —
    // the leader contributes population + charisma either way, no real downside.
    this._hideLeader(engine, ctx);

    // Diplomacy (Phase 14): appeasement — bump alignment toward any faction
    // militarily dominant over us. Runs BEFORE the proposal response pass so
    // a fresh bump can tip a borderline alignment over the accept threshold in
    // the same tick the proposal arrives.
    this._appeaseStrongerFactions(engine);

    // Auto-respond to any pending proposals addressed at this AI faction.
    // Military archetype is conservative — accepts only when alignment toward
    // the sender has climbed above the configured gate.
    this._respondToProposals(engine);

    if (!this.hasScouted && tick >= SCOUT_DELAY_TICKS) {
      this._scout(engine, ctx);
    }
  }

  // ── Context builder ───────────────────────────────────────────────────────

  private _buildContext(engine: AIEngineInterface, tick: number): Ctx {
    const units = engine.entities.unitsByFaction(this.faction);
    const buildings = engine.entities.buildingsByFaction(this.faction);
    const resources = engine.getResources(this.faction);
    const pop = engine.getPopulation(this.faction);
    const enemies = engine.entities.all().filter((e) => e.faction !== this.faction);

    const homeKey = SPECIES_ROLES[this.species].home;
    const home =
      buildings.find((b) => b.typeKey === homeKey && b.isOperational) ??
      buildings.find((b) => b.typeKey === homeKey) ??
      null;
    const homeCenter = home
      ? this._homeCenter(home)
      : { x: engine.grid.width / 2, y: engine.grid.height / 2 };

    const combatTypes = this._combatTypes();
    const army = units.filter((u) => this._isCombatReady(u, combatTypes));
    const idleArmy = army.filter((u) => u.state.kind === "idle");

    const threats: UnitEntity[] = [];
    for (const e of enemies) {
      if (e.kind !== "unit") continue;
      const u = e as UnitEntity;
      if (u.state.kind === "platformShell") continue;
      // Skip concealed / in-cover enemies — AI doesn't panic over ghosts it can't see.
      if (u.invisibilityActive || u.disguiseActive || u.concealed) continue;
      if (u.state.kind === "hidingInBuilding" || u.state.kind === "inEnemyBuilding") continue;
      // A temp-controlled leader still reads as a friendly to its original faction.
      // Skip here too — threat/defence logic would otherwise swarm the AI's own puppet.
      if (u.tempControlTicks > 0) continue;
      // Friendly partner (treaty OR alignment-peace) — engine rejects attack
      // orders against them anyway; filtering at threat-detection avoids
      // wasted AI cycles and keeps the AI from flagging friendlies as threats
      // just because they walked near the home.
      if (engine.arePeaceful(this.faction, u.faction)) continue;
      if (_distSq(u.position, homeCenter) < THREAT_RADIUS * THREAT_RADIUS) threats.push(u);
    }

    return {
      tick, units, buildings, resources, pop, enemies,
      home, homeCenter, army, idleArmy, threats, combatTypes,
    };
  }

  /** Union of army + turtle composition typeKeys for this faction. */
  private _combatTypes(): Set<string> {
    const set = new Set<string>();
    const comps = this.species === "wizards"
      ? [WIZARD_ARMY_COMPOSITION, WIZARD_TURTLE_COMPOSITION]
      : [ROBOT_ARMY_COMPOSITION, ROBOT_TURTLE_COMPOSITION];
    for (const comp of comps) for (const e of comp) set.add(e.typeKey);
    return set;
  }

  /** Robot combat platforms need an attached Core to act; wizards have no attach concept. */
  private _isCombatReady(u: UnitEntity, combatTypes: Set<string>): boolean {
    if (!combatTypes.has(u.typeKey)) return false;
    if (this.species === "robots" && !u.attachedCoreId) return false;
    return true;
  }

  // ── Mode evaluation ───────────────────────────────────────────────────────

  private _evaluateMode(ctx: Ctx): AIMode {
    // Panic override: our base is under real pressure.
    if (ctx.threats.length > Math.max(1, ctx.army.length) * TURTLE_THREAT_MULT) {
      return "turtle";
    }

    // Commit to / stay in push while a wave is active, or once the army is big enough.
    if (this.inAttack) return "push";
    if (ctx.army.length >= this._attackThreshold(ctx.tick)) return "push";

    // Bootstrap economy before any combat production.
    if (!this._hasMinGatherers(ctx)) return "economy";

    return "buildUp";
  }

  private _hasMinGatherers(ctx: Ctx): boolean {
    const roles = SPECIES_ROLES[this.species];
    for (const gt of roles.gatherers) {
      const count = ctx.units.filter((u) => {
        if (u.typeKey !== gt) return false;
        if (this.species === "robots" && !u.attachedCoreId) return false;
        return true;
      }).length;
      if (count < roles.minPerGatherer) return false;
    }
    return true;
  }

  // ── Always-on ────────────────────────────────────────────────────────────

  private _trackWaveState(ctx: Ctx): void {
    if (!this.inAttack) return;
    // Wave ends when no combat unit is still in attacking state.
    if (!ctx.army.some((u) => u.state.kind === "attacking")) this.inAttack = false;
  }

  private _defendBase(engine: AIEngineInterface, ctx: Ctx): void {
    if (ctx.threats.length === 0) return;
    const defenders = ctx.army.filter(
      (u) =>
        u.state.kind === "idle" &&
        _distSq(u.position, ctx.homeCenter) < DEFENDER_RADIUS * DEFENDER_RADIUS,
    );
    if (defenders.length > 0) {
      this._log(`defending base: ${defenders.length} defender(s) intercepting ${ctx.threats.length} threat(s)`);
    }
    for (const d of defenders) {
      let best = ctx.threats[0]!;
      let bd = _distSq(best.position, d.position);
      for (const t of ctx.threats) {
        const dd = _distSq(t.position, d.position);
        if (dd < bd) { best = t; bd = dd; }
      }
      engine.issueAttackOrder(d.id, best.id);
    }
  }

  /** Pull badly-wounded combat units back to the rally point so they don't die alone. */
  private _retreatWounded(engine: AIEngineInterface, ctx: Ctx): void {
    if (!this.rallyPoint) return;
    const rally = this.rallyPoint;
    const wounded: string[] = [];
    for (const u of ctx.army) {
      if (u.stats.hp / Math.max(1, u.stats.maxHp) >= RETREAT_HP_PCT) continue;
      if (_distSq(u.position, rally) < 5 * 5) continue;
      // Only retreat units that are currently away on a wave or otherwise active.
      if (u.state.kind === "idle" || u.state.kind === "attacking" || u.state.kind === "moving") {
        wounded.push(u.id);
      }
    }
    if (wounded.length > 0) {
      this._log(`retreating ${wounded.length} wounded unit(s) to rally`);
      engine.issueGroupMoveOrder(wounded, rally);
    }
  }

  // ── Economy ───────────────────────────────────────────────────────────────

  private _maintainEconomy(engine: AIEngineInterface, ctx: Ctx): void {
    if (this.species === "wizards") this._maintainWizardEconomy(engine, ctx);
    else this._maintainRobotEconomy(engine, ctx);

    if (ctx.pop.count >= ctx.pop.cap - POP_HEADROOM) this._buildPopSupport(engine, ctx);
    this._maybeBuildWoodStorage(engine, ctx);
  }

  /** Build a wood-storage drop-off to bring a distant wood deposit into efficient
   *  round-trip range. Only triggers when:
   *    1. A gatherer is currently working (or heading to) a deposit whose nearest
   *       existing drop-off is already past `WOOD_STORAGE_MIN_DIST`. Without this
   *       gate the AI places storage pre-emptively at the farthest deposit even
   *       when plenty of close wood remains — wasting build time + kit capacity.
   *    2. That far deposit still has meaningful quantity remaining.
   *  Capped at `MAX_WOOD_STORAGE` to prevent the AI from carpeting the map. */
  private _maybeBuildWoodStorage(engine: AIEngineInterface, ctx: Ctx): void {
    const roles = SPECIES_ROLES[this.species];
    const storageKey = roles.woodStorage;
    if (!storageKey) return;

    const existing = ctx.buildings.filter((b) => b.typeKey === storageKey).length;
    if (existing >= MAX_WOOD_STORAGE) return;
    // Don't stack: wait for the current storage under construction to finish.
    if (ctx.buildings.some((b) => b.typeKey === storageKey && !b.isOperational)) return;

    // Collect every operational wood drop-off (home + existing wood storages).
    const drops: Vec2[] = [];
    for (const b of ctx.buildings) {
      if (!b.isOperational) continue;
      if (b.typeKey === roles.home || b.typeKey === storageKey) drops.push(b.position);
    }
    if (drops.length === 0) return;

    // Collect deposit IDs that gatherers are currently committed to (gatherMove /
    // dropoffMove / gathering targeting a wood deposit). Storage placement only
    // triggers against one of these "actively-worked" deposits.
    const activeDepositIds = new Set<string>();
    for (const u of ctx.units) {
      if (u.state.kind === "gatherMove" || u.state.kind === "gathering") {
        activeDepositIds.add(u.state.depositId);
      } else if (u.state.kind === "dropoffMove") {
        activeDepositIds.add(u.state.depositId);
      }
    }
    if (activeDepositIds.size === 0) return;

    // Pick the wood deposit actually being worked whose nearest drop-off is farthest.
    let farDeposit: ResourceDeposit | null = null;
    let farDist = 0;
    for (const d of engine.deposits) {
      if (d.kind !== "wood" || d.quantity <= 0) continue;
      if (!activeDepositIds.has(d.id)) continue;
      let nearest = Infinity;
      for (const dr of drops) {
        const dist = Math.hypot(d.position.x - dr.x, d.position.y - dr.y);
        if (dist < nearest) nearest = dist;
      }
      if (nearest > farDist) {
        farDist = nearest;
        farDeposit = d;
      }
    }
    if (!farDeposit || farDist < WOOD_STORAGE_MIN_DIST) return;

    // Place the storage near the far deposit so gatherers drop off locally.
    if (this.species === "wizards") {
      this._wizardBuild(engine, ctx, storageKey, farDeposit.position);
    } else {
      this._robotBuild(engine, ctx, storageKey, farDeposit.position);
    }
  }

  private _maintainWizardEconomy(engine: AIEngineInterface, ctx: Ctx): void {
    const roles = SPECIES_ROLES[this.species];
    const gatherer = roles.gatherers[0]!; // wizards have one gatherer type
    const castles = ctx.buildings.filter((b) => b.typeKey === roles.home && b.isOperational);

    const liveSurfs = ctx.units.filter((u) => u.typeKey === gatherer).length;
    const queuedSurfs = _queuedCount(castles, gatherer);
    if (liveSurfs + queuedSurfs < roles.minPerGatherer) {
      for (const c of castles) {
        if (_totalQueued(c) < PROD_QUEUE_DEPTH) {
          engine.issueProductionOrder(c.id, gatherer);
          break;
        }
      }
    }

    // Assign idle gatherers to the deposit with the shortest round-trip to its
    // nearest drop-off building. Gatherers prefer the scarcer resource, but fall back
    // to the other kind if no viable deposit exists in range.
    for (const surf of ctx.units) {
      if (surf.typeKey !== gatherer || surf.state.kind !== "idle") continue;
      const prefer: "wood" | "water" = ctx.resources.water >= ctx.resources.wood ? "wood" : "water";
      const other: "wood" | "water" = prefer === "wood" ? "water" : "wood";
      const preferDrops = _dropoffPositions(ctx.buildings, prefer);
      const otherDrops = _dropoffPositions(ctx.buildings, other);
      const deposit =
        _bestDepositForRoundTrip(engine.deposits, prefer, preferDrops, surf.position) ??
        _bestDepositForRoundTrip(engine.deposits, other, otherDrops, surf.position);
      if (deposit) engine.issueGatherOrder(surf.id, deposit.id);
    }
  }

  private _maintainRobotEconomy(engine: AIEngineInterface, ctx: Ctx): void {
    const roles = SPECIES_ROLES[this.species];
    const homes = ctx.buildings.filter((b) => b.typeKey === roles.home && b.isOperational);
    const gathererSet = new Set(roles.gatherers);
    const hasBuilder = ctx.units.some((u) => u.typeKey === roles.builder);
    // If a home-hosted research is queued to start this tick, pause non-critical
    // production so the home can drain its queue and transition to idle. Without
    // this, the home is perpetually in `producing` state and the engine rejects
    // the research request forever.
    const pendingResearchAtHome = this._hasPendingResearchAt(roles.home, ctx, engine);

    // Per-gatherer live counts (keyed by typeKey).
    const gathererCount: Record<string, number> = {};
    for (const g of roles.gatherers) gathererCount[g] = 0;
    for (const u of ctx.units) {
      if (gathererSet.has(u.typeKey)) gathererCount[u.typeKey]! += 1;
    }

    // Free-core throttle: if the AI already has a healthy reserve of idle Cores
    // (no platform, not in shell/inPlatform/attachMove/enterPlatformMove), stop
    // queuing more. Without this gate the base silts up with Cores that can't
    // attach because the combat factory is throttled / destroyed / yet-to-be-built.
    const freeCoreCount = ctx.units.filter(
      (u) =>
        u.typeKey === roles.civilian &&
        !u.attachedPlatformId &&
        u.state.kind !== "platformShell" &&
        u.state.kind !== "attachMove" &&
        u.state.kind !== "enterPlatformMove" &&
        u.state.kind !== "inPlatform",
    ).length;
    const coreQueueOk = freeCoreCount < CORE_RESERVE;

    for (const h of homes) {
      // 1. Gather platforms — one per type. Not gated by queue depth so a Core-filled
      //    queue can't starve gathering.
      for (const gt of roles.gatherers) {
        if ((gathererCount[gt] ?? 0) < roles.minPerGatherer && !_isQueuedIn(h, gt)) {
          engine.issueProductionOrder(h.id, gt);
        }
      }
      // 2. Build Kit — BEFORE cores. Allowed up to PROD_QUEUE_DEPTH so a steady Core
      //    pipeline can't permanently lock out the builder. Without a builder, nothing
      //    else in the base ever gets constructed.
      if (!hasBuilder &&
        !_isQueuedIn(h, roles.builder) &&
        _totalQueued(h) < PROD_QUEUE_DEPTH) {
        engine.issueProductionOrder(h.id, roles.builder);
      }
      // 3. Thin Core pipeline fills remaining slots up to PROD_QUEUE_DEPTH - 1,
      //    but only while the free-core reserve is low.
      if (!coreQueueOk) continue;
      // Pause Core topping-up when a home-hosted research is about to fire — the
      // engine rejects `issueResearchOrder` whenever the building isn't idle, so we
      // need the queue to actually drain before `_advanceResearchPriority` runs.
      if (pendingResearchAtHome) continue;
      for (let i = _totalQueued(h); i < PROD_QUEUE_DEPTH - 1; i++) {
        engine.issueProductionOrder(h.id, roles.civilian);
      }
    }

    // Combat factory must exist before combat platforms can be queued.
    if (roles.bootstrapFactory) {
      const hasCombatFactory = ctx.buildings.some((b) => b.typeKey === roles.bootstrapFactory);
      if (!hasCombatFactory) this._robotBuild(engine, ctx, roles.bootstrapFactory);
    }

    // Send idle attached gatherers to the deposit with the best round-trip to a
    // drop-off building (not just the one closest to the gatherer). Prevents the AI
    // from committing gatherers to a 40-tile one-way commute when no storage is in
    // range — `_maybeBuildWoodStorage` is what brings far deposits into play.
    for (const unit of ctx.units) {
      if (!gathererSet.has(unit.typeKey) || !unit.attachedCoreId) continue;
      if (unit.state.kind !== "idle") continue;
      const kind: "wood" | "water" =
        roles.gatherers.length >= 2 && unit.typeKey === roles.gatherers[0]
          ? "water"
          : "wood";
      const dropoffs = _dropoffPositions(ctx.buildings, kind);
      const deposit = _bestDepositForRoundTrip(engine.deposits, kind, dropoffs, unit.position);
      if (deposit) engine.issueGatherOrder(unit.id, deposit.id);
    }
  }

  private _buildPopSupport(engine: AIEngineInterface, ctx: Ctx): void {
    const roles = SPECIES_ROLES[this.species];
    const typeKey = roles.popSupport;
    if (ctx.buildings.some((b) => b.typeKey === typeKey && !b.isOperational)) return;

    if (this.species === "wizards") {
      this._wizardBuild(engine, ctx, typeKey);
      return;
    }
    const built = this._robotBuild(engine, ctx, typeKey);
    if (built) return;
    // Builder busy. Fall back to queuing a 2nd build kit — but ONLY if there's no
    // unattached kit already sitting around. Otherwise we just pile up more idle
    // hardware waiting for Cores that aren't coming.
    const anyUnattachedKit = ctx.units.some(
      (u) => u.typeKey === roles.builder && !u.attachedCoreId,
    );
    if (anyUnattachedKit) return;
    const homes = ctx.buildings.filter((b) => b.typeKey === roles.home && b.isOperational);
    if (homes.some((h) => _isQueuedIn(h, roles.builder))) return;
    for (const h of homes) {
      if (_totalQueued(h) < PROD_QUEUE_DEPTH) {
        engine.issueProductionOrder(h.id, roles.builder);
        break;
      }
    }
  }

  // ── Mode handlers ────────────────────────────────────────────────────────

  private _buildUpMode(engine: AIEngineInterface, ctx: Ctx): void {
    this._queueCombatComposition(engine, ctx, this._composition());
    this._rallyCombat(engine, ctx);
  }

  private _pushMode(engine: AIEngineInterface, ctx: Ctx): void {
    this._queueCombatComposition(engine, ctx, this._composition());
    if (this.inAttack) return;
    if (ctx.idleArmy.length < this._attackThreshold(ctx.tick)) return;

    // Short-circuit if every active opposing faction is peaceful with us
    // (formal treaty OR alignment above `friendlyAlignmentThreshold`).
    // `_issueAttackWave` would filter them all out, find no targets, no
    // units would enter 'attacking', `inAttack` would flip back to false
    // next tick, and we'd burn every reaction loop re-launching empty waves.
    // Holding here lets the economy pass run normally and keeps combat units
    // at rally until diplomacy / alignment changes.
    const hasOpenEnemy = engine.getActiveFactions().some(
      (f) => f !== this.faction && !engine.arePeaceful(this.faction, f),
    );
    if (!hasOpenEnemy) {
      this._log(`push: all active enemies peaceful — holding (army=${ctx.idleArmy.length})`);
      return;
    }

    this.inAttack = true;
    const summary: Record<string, number> = {};
    for (const u of ctx.idleArmy) summary[u.typeKey] = (summary[u.typeKey] ?? 0) + 1;
    const composition = Object.entries(summary).map(([k, n]) => `${n}×${k}`).join(", ");
    this._log(`launching wave (${ctx.idleArmy.length} units: ${composition})`);
    _issueAttackWave(engine, ctx.idleArmy, ctx.enemies);
  }

  private _turtleMode(engine: AIEngineInterface, ctx: Ctx): void {
    this._queueCombatComposition(engine, ctx, this._composition());
    this._rallyCombat(engine, ctx);
  }

  private _composition(): readonly CompEntry[] {
    if (this.species === "wizards") {
      return this.mode === "turtle" ? WIZARD_TURTLE_COMPOSITION : WIZARD_ARMY_COMPOSITION;
    }
    return this.mode === "turtle" ? ROBOT_TURTLE_COMPOSITION : ROBOT_ARMY_COMPOSITION;
  }

  // ── Combat production ────────────────────────────────────────────────────

  /**
   * Queue up to PROD_QUEUE_DEPTH items across every combat factory the faction has,
   * filtered to unit types the factory can actually produce right now (factory built
   * + prereq unlocked). Each slot picks whichever producible type has the largest
   * target-vs-actual deficit.
   *
   * Robot throttle: if ≥ MAX_UNATTACHED_COMBAT_PLATFORMS platforms of any kind are
   * already built but have no Core attached, we pause combat production and let the
   * Core pipeline catch up. Without this gate, platforms don't consume population
   * while Cores do, so an unattended AI accumulates piles of inert hardware at the
   * base.
   */
  private _queueCombatComposition(
    engine: AIEngineInterface,
    ctx: Ctx,
    comp: readonly CompEntry[],
  ): void {
    if (this.species === "robots") {
      const roles = SPECIES_ROLES[this.species];
      const unattachedCombat = ctx.units.filter(
        (u) =>
          (ctx.combatTypes.has(u.typeKey) || u.typeKey === roles.builder) &&
          !u.attachedCoreId &&
          u.state.kind !== "platformShell",
      ).length;
      if (unattachedCombat >= MAX_UNATTACHED_COMBAT_PLATFORMS) return;
    }

    // Bucket composition entries by the factory that can produce them now.
    const buckets = new Map<string, { factory: BuildingEntity; entries: CompEntry[] }>();
    for (const entry of comp) {
      const factory = this._findFactoryFor(ctx, entry.typeKey);
      if (!factory) continue;
      const b = buckets.get(factory.id);
      if (b) b.entries.push(entry);
      else buckets.set(factory.id, { factory, entries: [entry] });
    }
    if (buckets.size === 0) return;

    // Running counts: live units + producing + queued. Used by the share calculator.
    const counts: Record<string, number> = {};
    for (const u of ctx.units) counts[u.typeKey] = (counts[u.typeKey] ?? 0) + 1;
    for (const { factory } of buckets.values()) {
      if (factory.state.kind === "producing") {
        counts[factory.state.unitTypeKey] = (counts[factory.state.unitTypeKey] ?? 0) + 1;
      }
      for (const q of factory.productionQueue) counts[q] = (counts[q] ?? 0) + 1;
    }

    for (const { factory, entries } of buckets.values()) {
      let queued = _totalQueued(factory);
      const queuedThisTick: string[] = [];
      // Track typeKeys the engine rejected this tick so we don't keep picking
      // them via `_pickCompositionUnit` (the composition picker is deterministic
      // for fixed counts, so a rejected type would be picked again and again
      // until the loop exited). Dropping the typeKey from the picker's
      // entry list forces the next-best choice. Happens when pop cap blocks
      // a wizard unit, a Dragon hits the Hoard limit, resources are tight,
      // etc. — reject on one unit type should NOT stop queuing the others.
      const rejected = new Set<string>();
      while (queued < PROD_QUEUE_DEPTH) {
        const available = entries.filter((e) => !rejected.has(e.typeKey));
        if (available.length === 0) break;
        const pick = _pickCompositionUnit(available, counts);
        if (!pick) break;
        if (!engine.issueProductionOrder(factory.id, pick)) {
          rejected.add(pick);
          continue;
        }
        counts[pick] = (counts[pick] ?? 0) + 1;
        queuedThisTick.push(pick);
        queued++;
      }
      if (queuedThisTick.length > 0) {
        this._log(`queue @ ${factory.typeKey}: ${queuedThisTick.join(", ")}`);
      }
    }
  }

  /**
   * Returns the operational building that can produce `typeKey` right now, or null.
   *
   * Looks up the producing building in the shared `buildingProduction` map and — if
   * the unit has a prereq in `unitBuildingRequirements` (wizard tech gate) — also
   * requires that prereq to be built and operational. Renaming or moving a unit's
   * production between buildings in config is picked up automatically.
   */
  private _findFactoryFor(ctx: Ctx, typeKey: string): BuildingEntity | null {
    const prereq = unitBuildingRequirements[typeKey];
    if (prereq && !ctx.buildings.some((b) => b.typeKey === prereq && b.isOperational)) {
      return null;
    }
    for (const bType of Object.keys(buildingProduction)) {
      const produced = buildingProduction[bType]!;
      if (!produced.includes(typeKey)) continue;
      const factory = ctx.buildings.find(
        (b) => b.typeKey === bType && b.isOperational,
      );
      if (factory) return factory;
    }
    return null;
  }

  // ── Defensive buildings ──────────────────────────────────────────────────

  private _buildDefenses(engine: AIEngineInterface, ctx: Ctx): void {
    const typeKey = SPECIES_ROLES[this.species].defense;
    const existing = ctx.buildings.filter((b) => b.typeKey === typeKey).length;

    // Tower count grows with army size — prevents the AI from spending all early wood
    // on towers before it has a wave of combat units.
    const cap = Math.min(MAX_DEFENSIVE_BUILDINGS, 1 + Math.floor(ctx.army.length / 3));
    if (existing >= cap) return;

    if (ctx.buildings.some((b) => b.typeKey === typeKey && !b.isOperational)) return;
    if (ctx.resources.wood < DEFENSE_WOOD_RESERVE || ctx.resources.water < DEFENSE_WATER_RESERVE) return;

    if (this.species === "wizards") {
      this._wizardBuild(engine, ctx, typeKey);
    } else {
      this._robotBuild(engine, ctx, typeKey);
    }
  }

  /** True when `_advanceResearchPriority` *would* fire against a building of the
   *  given host typeKey this tick — used by maintenance logic to pause non-critical
   *  queueing on that host so its queue drains and research can actually start. */
  private _hasPendingResearchAt(hostTypeKey: string, ctx: Ctx, engine: AIEngineInterface): boolean {
    const roles = SPECIES_ROLES[this.species];
    for (const researchKey of roles.researchPriority) {
      // Items already permanently unlocked shouldn't keep gating the maintenance
      // queue — without this check, `pendingResearchAtHome` stays true forever
      // after a single item completes (the old logic only treated "in progress"
      // as done) and the Core-topping-up pipeline seizes.
      if (engine.hasCompletedResearch(this.faction, researchKey)) continue;
      const cost = researchCosts[researchKey as keyof typeof researchCosts];
      if (!cost) continue;
      const hostForItem = Object.keys(buildingResearch).find(
        (btk) => buildingResearch[btk]!.includes(researchKey),
      );
      if (hostForItem !== hostTypeKey) continue;
      const alreadyHave = ctx.buildings.some(
        (b) =>
          b.typeKey === hostTypeKey &&
          (b.state.kind === "researching" && b.state.researchKey === researchKey),
      );
      if (alreadyHave) return false;
      if (ctx.resources.wood < cost.wood + RESEARCH_WOOD_BUFFER) continue;
      if (ctx.resources.water < cost.water + RESEARCH_WATER_BUFFER) continue;
      return true;
    }
    return false;
  }

  /**
   * Walk `FACTION_ROLES.researchPriority` and kick off the first item whose host
   * building is operational, not already researching, and whose cost fits our
   * resource buffers. Issues at most one research per tick so combat production
   * isn't repeatedly stalled by research spending. Items already completed or
   * mid-research are skipped automatically by the engine's `issueResearchOrder`.
   */
  private _advanceResearchPriority(engine: AIEngineInterface, ctx: Ctx): void {
    const roles = SPECIES_ROLES[this.species];
    for (const researchKey of roles.researchPriority) {
      const cost = researchCosts[researchKey as keyof typeof researchCosts];
      if (!cost) continue;
      // Skip items already completed (the engine would no-op anyway; skip here to
      // avoid iterating the building list unnecessarily).
      const hostTypeKey = Object.keys(buildingResearch).find(
        (btk) => buildingResearch[btk]!.includes(researchKey),
      );
      if (!hostTypeKey) continue;

      const host = ctx.buildings.find(
        (b) => b.typeKey === hostTypeKey && b.isOperational && b.state.kind === "operational",
      );
      if (!host) continue;

      if (ctx.resources.wood < cost.wood + RESEARCH_WOOD_BUFFER) continue;
      if (ctx.resources.water < cost.water + RESEARCH_WATER_BUFFER) continue;

      engine.issueResearchOrder(host.id, researchKey);
      this._log(`research ${researchKey} at ${hostTypeKey} ${host.id}`);
      return; // one research per tick
    }
  }

  /**
   * Build tech-unlock buildings one at a time in priority order, so composition ratios
   * gradually become richer (enables enchantress → cleric → dragon for wizards; large-
   * combat → wall for robots). Each build gate leaves a small buffer above the cost so
   * combat queue can still make progress.
   */
  private _buildTechUnlocks(engine: AIEngineInterface, ctx: Ctx): void {
    const priority = this._techPriorityList();
    const costs = this.species === "wizards" ? wizardBuildingCosts : robotBuildingCosts;

    for (const typeKey of priority) {
      if (ctx.buildings.some((b) => b.typeKey === typeKey)) continue; // live or under construction
      const cost = costs[typeKey];
      if (!cost) continue;
      if (ctx.resources.wood < cost.wood + 30 || ctx.resources.water < cost.water + 15) return;
      if (this.species === "wizards") this._wizardBuild(engine, ctx, typeKey);
      else this._robotBuild(engine, ctx, typeKey);
      return; // one tech build per tick
    }
  }

  /**
   * Derive the tech-unlock queue from the compositions + shared config. For every
   * army/turtle unit that has a prereq building (wizard gate) or a producing
   * building (robot research station), add it to the list in composition order.
   * Auto-built buildings listed in `FACTION_ROLES.autoBuilt` are excluded because
   * economy/maintenance logic already handles them.
   */
  private _techPriorityList(): string[] {
    const roles = SPECIES_ROLES[this.species];
    const autoBuilt = new Set(roles.autoBuilt);
    const comps = this.species === "wizards"
      ? [WIZARD_ARMY_COMPOSITION, WIZARD_TURTLE_COMPOSITION]
      : [ROBOT_ARMY_COMPOSITION, ROBOT_TURTLE_COMPOSITION];

    const seen = new Set<string>();
    const result: string[] = [];
    const add = (building: string): void => {
      if (autoBuilt.has(building) || seen.has(building)) return;
      seen.add(building);
      result.push(building);
    };

    for (const comp of comps) {
      for (const { typeKey } of comp) {
        const req = unitBuildingRequirements[typeKey];
        if (req) add(req);
        for (const bType of Object.keys(buildingProduction)) {
          if (buildingProduction[bType]!.includes(typeKey)) add(bType);
        }
      }
    }
    return result;
  }

  // ── Build helpers ────────────────────────────────────────────────────────

  /**
   * Issue a build order as a wizard. The original guard only looked at idle Surfs,
   * but Surfs spend nearly all their time gathering — meaning tower/cottage orders
   * were silently dropped forever. Broadened to pull a busy gatherer when ≥2 Surfs
   * remain active so at least one keeps supplying resources.
   */
  private _wizardBuild(engine: AIEngineInterface, ctx: Ctx, typeKey: string, near?: Vec2): void {
    const roles = SPECIES_ROLES[this.species];
    const surfs = ctx.units.filter((u) => u.typeKey === roles.builder);
    const activeGatherers = surfs.filter(
      (u) =>
        u.state.kind === "gathering" ||
        u.state.kind === "gatherMove" ||
        u.state.kind === "dropoffMove",
    );
    let builder = surfs.find((u) => u.state.kind === "idle") ?? null;
    if (!builder && activeGatherers.length >= 2) builder = activeGatherers[0] ?? null;
    if (!builder) return;

    const castle = ctx.buildings.find((b) => b.typeKey === roles.home);
    if (!castle) return;
    const anchor = near ?? this._homeCenter(castle);
    const site = _findBuildSite(engine, this.faction, typeKey, anchor, ctx.buildings);
    if (site) {
      engine.issueBuildOrder(builder.id, typeKey, site);
      this._log(`build ${typeKey} at (${site.x}, ${site.y}) by ${builder.id}`);
    }
  }

  /** Returns true if a build order was successfully issued. */
  private _robotBuild(engine: AIEngineInterface, ctx: Ctx, typeKey: string, near?: Vec2): boolean {
    const roles = SPECIES_ROLES[this.species];
    const builder = ctx.units.find(
      (u) => u.typeKey === roles.builder && u.attachedCoreId && u.state.kind === "idle",
    );
    if (!builder) return false;
    const home = ctx.buildings.find((b) => b.typeKey === roles.home);
    if (!home) return false;
    const anchor = near ?? this._homeCenter(home);
    const site = _findBuildSite(engine, this.faction, typeKey, anchor, ctx.buildings);
    if (!site) return false;
    engine.issueBuildOrder(builder.id, typeKey, site);
    this._log(`build ${typeKey} at (${site.x}, ${site.y}) by ${builder.id}`);
    return true;
  }

  // ── Rally / scout ────────────────────────────────────────────────────────

  private _rallyCombat(engine: AIEngineInterface, ctx: Ctx): void {
    if (!this.rallyPoint || this.inAttack) return;
    const rally = this.rallyPoint;
    const toRally = ctx.idleArmy.filter(
      (u) =>
        _distSq(u.position, ctx.homeCenter) < RALLY_RADIUS * RALLY_RADIUS &&
        _distSq(u.position, rally) > 3 * 3,
    );
    if (toRally.length > 0) engine.issueGroupMoveOrder(toRally.map((u) => u.id), rally);
  }

  private _scout(engine: AIEngineInterface, ctx: Ctx): void {
    const scoutType = SPECIES_ROLES[this.species].scout;
    const scout = ctx.units.find((u) => {
      if (u.typeKey !== scoutType || u.state.kind !== "idle") return false;
      if (this.species === "robots" && !u.attachedCoreId) return false;
      return true;
    });
    if (!scout) return;
    const target = { x: engine.grid.width / 2, y: engine.grid.height / 2 };
    engine.issueMoveOrder(scout.id, target);
    this._log(`scout ${scout.id} dispatched to map center (${target.x}, ${target.y})`);
    this.hasScouted = true;
  }

  // ── Wizard tower garrison ────────────────────────────────────────────────

  /** Send the named leader into a friendly hiding-capable building whenever it's
   *  outside and idle. Ignores leaders that are already on the move, mid-action, or
   *  already hidden. If no building has capacity the leader just stays put. */
  /** Process any pending diplomatic proposals addressed at this AI faction.
   *  Military archetype accepts only when alignment toward the sender clears
   *  `diplomacy.aiAcceptThreshold` — a conservative gate that forces the
   *  proposer to invest in good-faith actions first (accepted smaller
   *  requests, avoiding attacks). Declined proposals are resolved the same
   *  tick so the pending queue doesn't grow unbounded. */
  private _respondToProposals(engine: AIEngineInterface): void {
    const pending = engine.getPendingProposals();
    for (const p of pending) {
      if (p.to !== this.faction) continue;
      const align = engine.getAlignment(this.faction, p.from);
      const accept = align >= diplomacyConfig.aiAcceptThreshold;
      engine.issueRespondToProposal(p.id, accept);
      this._log(`proposal ${p.kind} from ${p.from} → ${accept ? "ACCEPT" : "DECLINE"} (align=${align.toFixed(0)})`);
    }
  }

  /**
   * Appeasement rule — each reaction tick, for every opposing faction whose
   * militaryStrength > self × `appeasementRatio`, bump alignment toward them
   * by `appeasementPerTick`. Guards against divide-by-zero when self has no
   * combat units yet (very early game). Capped by the engine's alignment
   * clamp so this can't overflow the scale.
   */
  private _appeaseStrongerFactions(engine: AIEngineInterface): void {
    const mine = engine.getFactionStats(this.faction).militaryStrength;
    if (mine <= 0) return;
    const ratio = diplomacyConfig.appeasementRatio;
    const delta = diplomacyConfig.appeasementPerTick;
    for (const other of engine.getActiveFactions()) {
      if (other === this.faction) continue;
      const theirs = engine.getFactionStats(other).militaryStrength;
      if (theirs / mine > ratio) {
        engine.bumpAlignment(this.faction, other, delta);
      }
    }
  }

  private _hideLeader(engine: AIEngineInterface, ctx: Ctx): void {
    const leaderTypeKey = namedLeaders[this.species].typeKey;
    const leader = ctx.units.find((u) => u.typeKey === leaderTypeKey);
    if (!leader) return;
    if (leader.state.kind !== "idle") return;
    // Skip if already in a container (hiding, garrisoned, attached to a platform, etc.)
    if (
      leader.state.kind !== "idle" ||
      (leader as unknown as { attachedPlatformId?: string | null }).attachedPlatformId
    ) return;

    const shelter = ctx.buildings.find(
      (b) =>
        HIDING_CAPABLE_BUILDINGS.has(b.typeKey) &&
        b.isOperational &&
        b.faction === this.faction &&
        b.occupantIds.size < hidingBuildingConfig.hiddenCapacityOverride,
    );
    if (!shelter) return;

    engine.issueHideOrder(leader.id, shelter.id);
    this._log(`hide leader ${leader.id} in ${shelter.typeKey} ${shelter.id}`);
  }

  private _garrisonWizardTowers(engine: AIEngineInterface, ctx: Ctx): void {
    const defenseKey = SPECIES_ROLES[this.species].defense;
    const empty = ctx.buildings.filter(
      (b) => b.typeKey === defenseKey && b.isOperational && !b.garrisonedUnitId,
    );
    if (empty.length === 0) return;
    // Garrison whenever at least one idle combat unit exists. Previously gated on
    // army > attackThreshold + 2, but the attack trigger fires at exactly
    // attackThreshold and drains idleArmy to 0, so the gate was almost never met
    // and towers sat empty forever.
    if (ctx.idleArmy.length === 0) return;
    const idleCombat = ctx.idleArmy.slice();
    for (const tower of empty) {
      const u = idleCombat.shift();
      if (!u) break;
      engine.issueGarrisonOrder(u.id, tower.id);
      this._log(`garrison ${u.id} into ${defenseKey} ${tower.id}`);
    }
  }

  // ── Robot Core assignment ────────────────────────────────────────────────

  /** Priority: gatherers → build kits → combat platforms → ICP occupant fill.
   *
   * `freeCores` excludes Cores already walking to a platform (`attachMove`) or an ICP
   * (`enterPlatformMove`). Without this filter the AI re-dispatches the same Core
   * every tick because `attachedPlatformId` isn't set until arrival. `pendingAttach`
   * also tracks which platform an en-route Core is already heading for so we don't
   * send TWO Cores to the same target (only the first to arrive actually attaches). */
  private _robotAssignCores(engine: AIEngineInterface, ctx: Ctx): void {
    const roles = SPECIES_ROLES[this.species];
    const gathererSet = new Set(roles.gatherers);
    const freeCores = ctx.units.filter(
      (u) =>
        u.typeKey === roles.civilian &&
        !u.attachedPlatformId &&
        u.state.kind !== "platformShell" &&
        u.state.kind !== "attachMove" &&
        u.state.kind !== "enterPlatformMove" &&
        u.state.kind !== "inPlatform",
    );
    if (freeCores.length === 0) return;

    // Platforms that already have a Core heading to them via attachMove.
    const pendingAttach = new Set<string>();
    for (const u of ctx.units) {
      if (u.state.kind === "attachMove") pendingAttach.add(u.state.platformId);
    }

    const attach = (platforms: UnitEntity[], label: string): void => {
      for (const p of platforms) {
        if (pendingAttach.has(p.id)) continue;
        const c = freeCores.shift();
        if (!c) return;
        engine.issueAttachOrder(c.id, p.id);
        pendingAttach.add(p.id);
        this._log(`attach Core ${c.id} → ${label} ${p.id}`);
      }
    };
    attach(ctx.units.filter(
      (u) => gathererSet.has(u.typeKey) && !u.attachedCoreId && u.state.kind === "idle",
    ), "gatherer");
    attach(ctx.units.filter(
      (u) => u.typeKey === roles.builder && !u.attachedCoreId && u.state.kind === "idle",
    ), "builder");
    attach(ctx.units.filter(
      (u) => ctx.combatTypes.has(u.typeKey) && !u.attachedCoreId && u.state.kind === "idle",
    ), "combat platform");

    // Fill Immobile Combat Platforms (the faction's defense building).
    const defenseKey = roles.defense;
    const icp = ctx.buildings.filter(
      (b) => b.typeKey === defenseKey && b.isOperational,
    );
    if (icp.length > 0 && freeCores.length > 0) {
      const cap = robotBuildingStats[defenseKey]?.occupantCapacity ?? 1;
      const enRoute = new Map<string, number>();
      for (const u of ctx.units) {
        if (u.state.kind === "enterPlatformMove") {
          enRoute.set(u.state.platformId, (enRoute.get(u.state.platformId) ?? 0) + 1);
        }
      }
      for (const p of icp) {
        let slots = cap - p.occupantIds.size - (enRoute.get(p.id) ?? 0);
        while (slots > 0) {
          const c = freeCores.shift();
          if (!c) return;
          engine.issueEnterPlatformOrder(c.id, p.id);
          this._log(`enter ${defenseKey} ${p.id} with Core ${c.id}`);
          slots--;
        }
      }
    }
  }

  // ── Rally point / shared math ────────────────────────────────────────────

  private _homeCenter(home: BuildingEntity): Vec2 {
    const stats = this.species === "wizards" ? wizardBuildingStats : robotBuildingStats;
    const fp = stats[home.typeKey]?.footprintTiles ?? 2;
    return { x: home.position.x + fp / 2, y: home.position.y + fp / 2 };
  }

  private _ensureRallyPoint(engine: AIEngineInterface, buildings: BuildingEntity[]): void {
    if (this.rallyPoint) return;
    const homeKey = SPECIES_ROLES[this.species].home;
    const home = buildings.find((b) => b.typeKey === homeKey);
    if (!home) return;

    const center = this._homeCenter(home);
    const mapCx = engine.grid.width / 2;
    const mapCy = engine.grid.height / 2;
    const dx = center.x - mapCx;
    const dy = center.y - mapCy;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const stats = this.species === "wizards" ? wizardBuildingStats : robotBuildingStats;
    const fp = stats[home.typeKey]?.footprintTiles ?? 2;
    const step = fp / 2 + 3;
    const ideal = {
      x: Math.round(center.x + ux * step),
      y: Math.round(center.y + uy * step),
    };
    for (let r = 0; r <= 12; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (r !== 0 && Math.abs(ox) !== r && Math.abs(oy) !== r) continue;
          const x = ideal.x + ox;
          const y = ideal.y + oy;
          if (engine.grid.isPassable(x, y)) {
            this.rallyPoint = { x, y };
            return;
          }
        }
      }
    }
  }

  private _attackThreshold(tick: number): number {
    const rampTicks = TICKS_PER_SEC * ATTACK_RAMP_SECONDS;
    const t = Math.min(1, tick / rampTicks);
    return BASE_ATTACK_ARMY + Math.floor(t * (MAX_ATTACK_ARMY - BASE_ATTACK_ARMY));
  }
}

// ── Free helpers ────────────────────────────────────────────────────────────

export function _distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function _nearestDeposit(
  deposits: ResourceDeposit[],
  pos: Vec2,
  kind: "wood" | "water",
): ResourceDeposit | null {
  let best: ResourceDeposit | null = null;
  let bestDist = Infinity;
  for (const d of deposits) {
    if (d.kind !== kind || d.quantity <= 0) continue;
    const dx = d.position.x - pos.x;
    const dy = d.position.y - pos.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

/** Positions of operational drop-off buildings eligible for the given resource kind. */
function _dropoffPositions(buildings: BuildingEntity[], kind: "wood" | "water"): Vec2[] {
  const eligible = resourceDropoffBuildings[kind];
  const out: Vec2[] = [];
  for (const b of buildings) {
    if (!b.isOperational) continue;
    if (!eligible.includes(b.typeKey)) continue;
    out.push(b.position);
  }
  return out;
}

/**
 * Pick the deposit with the shortest round-trip: `dist(deposit, nearest drop-off) +
 * small weighting for dist(gatherer, deposit)`. Skips deposits whose nearest
 * drop-off is farther than `GATHERER_MAX_DROPOFF_DIST` — the AI should build a
 * wood-storage closer before working those.
 *
 * Fallback: if every deposit is over the distance cap (e.g. very early game with no
 * drop-off yet), return the overall-nearest-to-drop-off deposit so the AI doesn't
 * stall completely.
 */
function _bestDepositForRoundTrip(
  deposits: ResourceDeposit[],
  kind: "wood" | "water",
  dropoffs: Vec2[],
  gathererPos: Vec2,
): ResourceDeposit | null {
  if (dropoffs.length === 0) {
    // No drop-off yet — fall back to the plain nearest deposit.
    return _nearestDeposit(deposits, gathererPos, kind);
  }
  const cap = GATHERER_MAX_DROPOFF_DIST * GATHERER_MAX_DROPOFF_DIST;
  let bestInCap: ResourceDeposit | null = null;
  let bestInCapScore = Infinity;
  let bestOverall: ResourceDeposit | null = null;
  let bestOverallDropDist = Infinity;

  for (const d of deposits) {
    if (d.kind !== kind || d.quantity <= 0) continue;
    let nearestDropDistSq = Infinity;
    for (const drop of dropoffs) {
      const dx = d.position.x - drop.x;
      const dy = d.position.y - drop.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDropDistSq) nearestDropDistSq = distSq;
    }
    if (nearestDropDistSq < bestOverallDropDist) {
      bestOverallDropDist = nearestDropDistSq;
      bestOverall = d;
    }
    if (nearestDropDistSq > cap) continue;

    // Score = drop-distance dominates (round-trip after settling), plus a 25%
    // weight on gatherer-to-deposit so ties favour local picks.
    const gdx = d.position.x - gathererPos.x;
    const gdy = d.position.y - gathererPos.y;
    const score = nearestDropDistSq + 0.25 * (gdx * gdx + gdy * gdy);
    if (score < bestInCapScore) {
      bestInCapScore = score;
      bestInCap = d;
    }
  }
  return bestInCap ?? bestOverall;
}

/**
 * Spiral outward from `near` looking for a build site. Prefer sites that are:
 *   1. Not adjacent to another friendly building (avoids chokepoint clusters).
 *   2. "Open" — have ≥ 50% of their perimeter tiles passable (avoids placing in
 *      a narrow corridor that then blocks AI unit movement through it).
 *
 * If no site at any radius satisfies both preferences, the first valid site found is
 * returned as a fallback so the AI doesn't stall when the base is tightly packed.
 */
function _findBuildSite(
  engine: AIEngineInterface,
  faction: Faction,
  typeKey: string,
  near: Vec2,
  existingBuildings: BuildingEntity[] = [],
): Vec2 | null {
  // Building typeKeys are disjoint across the two species, so a union lookup
  // works for any faction slot (f3-f6 included) without threading species in.
  const fp = (wizardBuildingStats[typeKey] ?? robotBuildingStats[typeKey])?.footprintTiles ?? 2;
  let fallback: Vec2 | null = null;

  for (let radius = fp + 1; radius <= 30; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const pos = { x: Math.round(near.x) + dx, y: Math.round(near.y) + dy };
        if (!engine.isValidBuildSite(faction, typeKey, pos)) continue;
        if (!fallback) fallback = pos;

        if (_isTooCloseToBuilding(pos, fp, existingBuildings)) continue;
        if (!_hasOpenPerimeter(engine, pos, fp, 0.5)) continue;
        return pos;
      }
    }
  }
  return fallback;
}

/** Footprints of `pos` (size `fp`) and any existing building overlap if we inflate
 *  the existing building's bounds by `minGap`. Checks for same-faction only via the
 *  caller's `existingBuildings` list. */
function _isTooCloseToBuilding(
  pos: Vec2,
  fp: number,
  buildings: BuildingEntity[],
  minGap = 1,
): boolean {
  const ax1 = pos.x, ay1 = pos.y;
  const ax2 = pos.x + fp - 1, ay2 = pos.y + fp - 1;
  for (const b of buildings) {
    const bFp = (wizardBuildingStats[b.typeKey] ?? robotBuildingStats[b.typeKey])?.footprintTiles ?? 2;
    const bx1 = Math.floor(b.position.x);
    const by1 = Math.floor(b.position.y);
    const bx2 = bx1 + bFp - 1;
    const by2 = by1 + bFp - 1;
    if (
      ax1 <= bx2 + minGap && ax2 + minGap >= bx1 &&
      ay1 <= by2 + minGap && ay2 + minGap >= by1
    ) return true;
  }
  return false;
}

/** Fraction of the 8-neighborhood perimeter around the footprint that is passable. */
function _hasOpenPerimeter(
  engine: AIEngineInterface,
  pos: Vec2,
  fp: number,
  minFraction: number,
): boolean {
  let total = 0;
  let open = 0;
  for (let py = -1; py <= fp; py++) {
    for (let px = -1; px <= fp; px++) {
      if (px >= 0 && px < fp && py >= 0 && py < fp) continue; // inside the footprint
      total++;
      if (engine.grid.isPassable(pos.x + px, pos.y + py)) open++;
    }
  }
  return total > 0 && open / total >= minFraction;
}

function _issueAttackWave(
  engine: AIEngineInterface,
  attackers: UnitEntity[],
  enemies: Entity[],
): void {
  if (attackers.length === 0) return;

  let cx = 0, cy = 0;
  for (const a of attackers) { cx += a.position.x; cy += a.position.y; }
  cx /= attackers.length; cy /= attackers.length;
  const centroid: Vec2 = { x: cx, y: cy };

  const attackerFaction = attackers[0]!.faction;
  const enemyUnits = (enemies.filter((e) => e.kind === "unit") as UnitEntity[])
    .filter((e) =>
      e.state.kind !== "platformShell" &&
      // Concealed / in-cover enemies are off-limits: combat resolution would drop the
      // attack anyway, but filtering here keeps the AI from committing a whole wave
      // to a ghost it can't see.
      !e.invisibilityActive &&
      !e.disguiseActive &&
      !e.concealed &&
      e.state.kind !== "hidingInBuilding" &&
      e.state.kind !== "inEnemyBuilding" &&
      // Temp-controlled leaders read as friendly to the puppeteer; the rest of the
      // AI shouldn't waste a wave on them either.
      e.tempControlTicks <= 0 &&
      // Peaceful partners (treaty OR friendly alignment) are off-limits.
      !engine.arePeaceful(attackerFaction, e.faction),
    );
  const leaders = enemyUnits.filter((u) => LEADER_TYPES.has(u.typeKey));
  const nonLeaders = enemyUnits
    .filter((u) => !LEADER_TYPES.has(u.typeKey))
    .sort((a, b) => _distSq(centroid, a.position) - _distSq(centroid, b.position));
  const targets: Entity[] = [...leaders, ...nonLeaders];

  if (targets.length === 0) {
    let bldg: Entity | null = null;
    let bd = Infinity;
    for (const e of enemies) {
      if (e.kind !== "building") continue;
      // Skip peaceful-faction buildings too — `issueAttackOrder` would reject anyway.
      if (engine.arePeaceful(attackerFaction, e.faction)) continue;
      const d = _distSq(e.position, centroid);
      if (d < bd) { bd = d; bldg = e; }
    }
    if (!bldg) return;
    for (const a of attackers) engine.issueAttackOrder(a.id, bldg.id);
    return;
  }

  // Round-robin so losing a single target only frees one attacker, not the whole wave.
  attackers.forEach((a, i) => engine.issueAttackOrder(a.id, targets[i % targets.length]!.id));
}

/** Pick the composition type whose target ratio is most under-filled. */
function _pickCompositionUnit(
  comp: readonly CompEntry[],
  counts: Record<string, number>,
): string | null {
  const totalWeight = comp.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return null;
  const totalCount = comp.reduce((s, c) => s + (counts[c.typeKey] ?? 0), 0);

  let bestKey: string | null = null;
  let bestDeficit = -Infinity;
  for (const { typeKey, weight } of comp) {
    const target = totalCount * (weight / totalWeight);
    const actual = counts[typeKey] ?? 0;
    const deficit = target - actual;
    // Tie-breaker: first composition entry wins early game when all counts are 0.
    if (deficit > bestDeficit) { bestDeficit = deficit; bestKey = typeKey; }
  }
  return bestKey;
}

export function _totalQueued(b: BuildingEntity): number {
  return (b.state.kind === "producing" ? 1 : 0) + b.productionQueue.length;
}

function _queuedCount(bs: BuildingEntity[], typeKey: string): number {
  let n = 0;
  for (const b of bs) {
    if (b.state.kind === "producing" && b.state.unitTypeKey === typeKey) n++;
    n += b.productionQueue.filter((k) => k === typeKey).length;
  }
  return n;
}

export function _isQueuedIn(b: BuildingEntity, typeKey: string): boolean {
  if (b.state.kind === "producing" && b.state.unitTypeKey === typeKey) return true;
  return b.productionQueue.includes(typeKey);
}
