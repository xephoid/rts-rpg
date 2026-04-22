/**
 * Technology-focused AI archetype.
 *
 * Unlike `MilitaryAI`, this archetype never launches attack waves. Its tick
 * loop is a race to check off every entry in
 * `technologicalVictory.requiredItems`:
 *
 *   1. Keep economy alive (match MilitaryAI's gatherer/builder/core cadence).
 *   2. Build every tech-unlock building the species can construct.
 *   3. Queue research at every research host the moment resources permit.
 *   4. Produce one of every own-species unit typeKey at least once.
 *   5. Convert hunts — send a Subject / Core / leader adjacent to an
 *      opposing unit whose typeKey the faction hasn't yet unlocked, and
 *      fire `issueConvertOrder` so the type gets checked off permanently.
 *   6. Accept any diplomatic proposal eagerly (lower accept threshold than
 *      Military) — fewer enemies = more breathing room to tech.
 *
 * Defensive posture only — responds to units inside a threat radius of
 * home via `issueAttackOrder` on individual idle combat units, but never
 * groups them into a push. Towers + ICPs carry the defensive weight.
 */

import type { Faction, Species, Vec2 } from "@neither/shared";
import {
  aiParameters,
  buildingProduction,
  buildingResearch,
  researchCosts,
  factionBuildableBuildings,
  robotBuildingCosts,
  wizardBuildingCosts,
  robotUnitStats,
  wizardUnitStats,
  unitBuildingRequirements,
  CONVERT_CASTER_TYPES,
  convertConfig,
  technologicalVictory,
  ROBOT_PLATFORM_TYPES,
  diplomacy as diplomacyConfig,
  TICKS_PER_SEC,
  namedLeaders,
  robotBuildingStats,
  wizardBuildingStats,
} from "@neither/shared";
import type { UnitEntity } from "../entities/UnitEntity.js";
import type { BuildingEntity } from "../entities/BuildingEntity.js";
import {
  type AIEngineInterface,
  _isQueuedIn,
  _totalQueued,
  _distSq,
} from "./MilitaryAI.js";

/** Lower accept threshold than MilitaryAI — tech AI prefers peace to expand
 *  its tech tree uninterrupted. Initial guess. */
const TECH_AI_ACCEPT_BONUS = 30;
/** Radius around home where enemies count as "threats" the tech AI will
 *  directly engage (defensive posture, no push waves). Initial guess. */
const THREAT_RADIUS = 20;
/** Min wood/water buffer the tech AI keeps above building / research costs
 *  so the economy doesn't stall on a single big unlock. */
const COST_BUFFER = 40;

export class TechnologyAI {
  private readonly faction: Faction;
  private readonly species: Species;
  private lastTickProcessed = -9999;

  constructor(faction: Faction, species: Species) {
    this.faction = faction;
    this.species = species;
  }

  private _log(msg: string): void {
    // eslint-disable-next-line no-console
    console.log(`[TechAI:${this.faction}] ${msg}`);
  }

  tick(tick: number, engine: AIEngineInterface): void {
    if (tick - this.lastTickProcessed < aiParameters.reactionIntervalTicks) return;
    this.lastTickProcessed = tick;

    const units = engine.entities.unitsByFaction(this.faction);
    const buildings = engine.entities.buildingsByFaction(this.faction);
    const resources = engine.getResources(this.faction);

    this._maintainEconomy(engine, units, buildings, resources);
    this._buildMissingTechBuildings(engine, buildings, resources);
    this._queueAllResearch(engine, buildings, resources);
    this._produceMissingOwnSpeciesUnits(engine, units, buildings);
    this._defendBase(engine, units, buildings);
    this._proposeDiplomacy(engine);
    this._huntForConvert(engine, units);
    this._respondToProposals(engine);
  }

  // ── Economy ─────────────────────────────────────────────────────────────────

  private _maintainEconomy(
    engine: AIEngineInterface,
    units: UnitEntity[],
    buildings: BuildingEntity[],
    _resources: { wood: number; water: number; mana: number },
  ): void {
    if (this.species === "wizards") {
      this._maintainWizardEconomy(engine, units, buildings);
    } else {
      this._maintainRobotEconomy(engine, units, buildings);
    }
  }

  private _maintainWizardEconomy(
    engine: AIEngineInterface,
    units: UnitEntity[],
    buildings: BuildingEntity[],
  ): void {
    const castles = buildings.filter((b) => b.typeKey === "castle" && b.isOperational);
    // Keep 2 Surfs producing at minimum — same baseline as MilitaryAI's wizards.
    const surfs = units.filter((u) => u.typeKey === "surf").length;
    if (surfs < 2) {
      for (const c of castles) {
        if (!_isQueuedIn(c, "surf") && _totalQueued(c) < 3) {
          engine.issueProductionOrder(c.id, "surf");
          break;
        }
      }
    }
    // Assign idle Surfs to the nearest unoccupied deposit (alternate by resource).
    for (const surf of units) {
      if (surf.typeKey !== "surf" || surf.state.kind !== "idle") continue;
      // Use engine.deposits + a simple distance-sort; the tech AI doesn't need
      // MilitaryAI's round-trip optimization.
      const kind: "wood" | "water" = surfs % 2 === 0 ? "wood" : "water";
      const deposit = engine.deposits
        .filter((d) => d.kind === kind && d.quantity > 0)
        .sort((a, b) => _distSq(surf.position, a.position) - _distSq(surf.position, b.position))[0];
      if (deposit) engine.issueGatherOrder(surf.id, deposit.id);
    }
  }

  private _maintainRobotEconomy(
    engine: AIEngineInterface,
    units: UnitEntity[],
    buildings: BuildingEntity[],
  ): void {
    const homes = buildings.filter((b) => b.typeKey === "home" && b.isOperational);
    const hasBuilder = units.some((u) => u.typeKey === "movableBuildKitPlatform");
    const gatherers = ["waterCollectionPlatform", "woodChopperPlatform"] as const;

    for (const h of homes) {
      // One of each gatherer type at minimum.
      for (const gt of gatherers) {
        const count = units.filter((u) => u.typeKey === gt).length;
        if (count < 1 && !_isQueuedIn(h, gt)) {
          engine.issueProductionOrder(h.id, gt);
        }
      }
      // Builder kit.
      if (!hasBuilder && !_isQueuedIn(h, "movableBuildKitPlatform") && _totalQueued(h) < 3) {
        engine.issueProductionOrder(h.id, "movableBuildKitPlatform");
      }
      // Keep a couple of Cores in the pipeline — they feed platform attaches.
      const freeCores = units.filter(
        (u) =>
          u.typeKey === "core" &&
          !u.attachedPlatformId &&
          u.state.kind !== "attachMove" &&
          u.state.kind !== "inPlatform" &&
          u.state.kind !== "platformShell" &&
          u.state.kind !== "enterPlatformMove",
      ).length;
      if (freeCores < 3) {
        for (let i = _totalQueued(h); i < 3; i++) engine.issueProductionOrder(h.id, "core");
      }
    }

    // Attach free Cores to any unattached gatherer / builder / platform.
    const freeCoresList = units.filter(
      (u) =>
        u.typeKey === "core" &&
        !u.attachedPlatformId &&
        u.state.kind === "idle",
    );
    const attachTargets = units.filter(
      (u) => ROBOT_PLATFORM_TYPES.has(u.typeKey) && !u.attachedCoreId && u.state.kind === "idle",
    );
    for (const target of attachTargets) {
      const core = freeCoresList.shift();
      if (!core) break;
      engine.issueAttachOrder(core.id, target.id);
    }

    // Send idle attached gatherers to nearest deposit.
    for (const unit of units) {
      if (!gatherers.includes(unit.typeKey as typeof gatherers[number])) continue;
      if (!unit.attachedCoreId) continue;
      if (unit.state.kind !== "idle") continue;
      const kind: "wood" | "water" = unit.typeKey === "waterCollectionPlatform" ? "water" : "wood";
      const deposit = engine.deposits
        .filter((d) => d.kind === kind && d.quantity > 0)
        .sort((a, b) => _distSq(unit.position, a.position) - _distSq(unit.position, b.position))[0];
      if (deposit) engine.issueGatherOrder(unit.id, deposit.id);
    }
  }

  // ── Tech building sweep ────────────────────────────────────────────────────

  private _buildMissingTechBuildings(
    engine: AIEngineInterface,
    buildings: BuildingEntity[],
    resources: { wood: number; water: number },
  ): void {
    const buildable = factionBuildableBuildings[this.species];
    const costs = this.species === "wizards" ? wizardBuildingCosts : robotBuildingCosts;

    for (const typeKey of buildable) {
      // Skip if any instance (operational or under construction) exists.
      if (buildings.some((b) => b.typeKey === typeKey)) continue;
      const cost = costs[typeKey];
      if (!cost) continue;
      if (resources.wood < cost.wood + COST_BUFFER) continue;
      if (resources.water < cost.water + COST_BUFFER) continue;
      const placed = this._issueBuild(engine, typeKey);
      if (placed) {
        this._log(`build ${typeKey}`);
        return; // one build per tick — wait for construction to settle
      }
    }
  }

  /** Pick an available builder + a tile near the home and issue the build
   *  order. Returns true if the order landed. Keeps it deliberately simple:
   *  the engine's `isValidBuildSite` check rejects bad placements and we
   *  just try the next offset. */
  private _issueBuild(engine: AIEngineInterface, typeKey: string): boolean {
    const species = this.species;
    const builderTypeKey = species === "wizards" ? "surf" : "movableBuildKitPlatform";
    const homeTypeKey = species === "wizards" ? "castle" : "home";

    const buildings = engine.entities.buildingsByFaction(this.faction);
    const home = buildings.find((b) => b.typeKey === homeTypeKey);
    if (!home) return false;

    const builder = engine.entities.unitsByFaction(this.faction).find(
      (u) =>
        u.typeKey === builderTypeKey &&
        u.state.kind === "idle" &&
        (species !== "robots" || u.attachedCoreId),
    );
    if (!builder) return false;

    // Pick a site: ring-scan around the home in tile-offset steps.
    const fp = this._buildingFootprint(typeKey);
    const hx = Math.round(home.position.x);
    const hy = Math.round(home.position.y);
    for (let r = fp + 2; r <= 20; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const pos = { x: hx + dx, y: hy + dy };
          if (engine.isValidBuildSite(this.faction, typeKey, pos)) {
            engine.issueBuildOrder(builder.id, typeKey, pos);
            return true;
          }
        }
      }
    }
    return false;
  }

  private _buildingFootprint(typeKey: string): number {
    const s = this.species === "wizards" ? wizardBuildingStats : robotBuildingStats;
    return s[typeKey]?.footprintTiles ?? 2;
  }

  // ── Research sweep ─────────────────────────────────────────────────────────

  private _queueAllResearch(
    engine: AIEngineInterface,
    buildings: BuildingEntity[],
    resources: { wood: number; water: number },
  ): void {
    for (const [hostTypeKey, items] of Object.entries(buildingResearch)) {
      const host = buildings.find(
        (b) => b.typeKey === hostTypeKey && b.isOperational && b.state.kind === "operational",
      );
      if (!host) continue;
      for (const researchKey of items) {
        if (engine.hasCompletedResearch(this.faction, researchKey)) continue;
        const cost = researchCosts[researchKey as keyof typeof researchCosts];
        if (!cost) continue;
        if (resources.wood < cost.wood + COST_BUFFER) continue;
        if (resources.water < cost.water + COST_BUFFER) continue;
        engine.issueResearchOrder(host.id, researchKey);
        this._log(`research ${researchKey} at ${hostTypeKey}`);
        return; // one research per tick
      }
    }
  }

  // ── Unit-roster completion ─────────────────────────────────────────────────

  private _produceMissingOwnSpeciesUnits(
    engine: AIEngineInterface,
    units: UnitEntity[],
    buildings: BuildingEntity[],
  ): void {
    // Find every own-species unit in the tech-victory checklist we haven't
    // produced yet, and queue one at its production building.
    const ownStats = this.species === "wizards" ? wizardUnitStats : robotUnitStats;
    const ownUnitTypes = Object.keys(ownStats).filter((k) =>
      technologicalVictory.requiredItems.includes(k as (typeof technologicalVictory.requiredItems)[number]),
    );
    const liveTypeKeys = new Set(units.map((u) => u.typeKey));
    const leaderKey = namedLeaders[this.species].typeKey;

    for (const typeKey of ownUnitTypes) {
      if (liveTypeKeys.has(typeKey)) continue;
      if (typeKey === leaderKey) continue; // leaders spawn at match start
      const host = this._findProductionHost(typeKey, buildings);
      if (!host) continue;
      if (_isQueuedIn(host, typeKey) || _totalQueued(host) >= 3) continue;
      const ok = engine.issueProductionOrder(host.id, typeKey);
      if (ok) {
        this._log(`queue ${typeKey} @ ${host.typeKey}`);
        return;
      }
    }
  }

  private _findProductionHost(unitTypeKey: string, buildings: BuildingEntity[]): BuildingEntity | null {
    const prereq = unitBuildingRequirements[unitTypeKey];
    if (prereq && !buildings.some((b) => b.typeKey === prereq && b.isOperational)) return null;
    for (const [hostTypeKey, produced] of Object.entries(buildingProduction)) {
      if (!produced.includes(unitTypeKey)) continue;
      const host = buildings.find((b) => b.typeKey === hostTypeKey && b.isOperational);
      if (host) return host;
    }
    return null;
  }

  // ── Defense ────────────────────────────────────────────────────────────────

  private _defendBase(
    engine: AIEngineInterface,
    units: UnitEntity[],
    buildings: BuildingEntity[],
  ): void {
    const homeTypeKey = this.species === "wizards" ? "castle" : "home";
    const home = buildings.find((b) => b.typeKey === homeTypeKey);
    if (!home) return;
    const homeCenter = {
      x: home.position.x + this._buildingFootprint(home.typeKey) / 2,
      y: home.position.y + this._buildingFootprint(home.typeKey) / 2,
    };
    const threatRSq = THREAT_RADIUS * THREAT_RADIUS;

    // Enemies within threat radius — direct nearby combat units at them.
    // Skip peaceful-faction units (treaty OR friendly alignment) so the
    // tech AI doesn't pointlessly engage allies who wander near home.
    const threats: UnitEntity[] = [];
    for (const e of engine.entities.all()) {
      if (e.faction === this.faction) continue;
      if (e.kind !== "unit") continue;
      if (engine.arePeaceful(this.faction, e.faction)) continue;
      if (_distSq(e.position, homeCenter) > threatRSq) continue;
      threats.push(e as UnitEntity);
    }
    if (threats.length === 0) return;
    const t0 = threats[0]!;
    for (const u of units) {
      if (u.state.kind !== "idle") continue;
      if (u.stats.damage <= 0) continue;
      if (CONVERT_CASTER_TYPES.has(u.typeKey)) continue; // keep casters off combat duty
      if (ROBOT_PLATFORM_TYPES.has(u.typeKey) && !u.attachedCoreId) continue;
      engine.issueAttackOrder(u.id, t0.id);
    }
  }

  // ── Convert hunts ──────────────────────────────────────────────────────────

  private _huntForConvert(engine: AIEngineInterface, units: UnitEntity[]): void {
    // Leaders are OFF-LIMITS as convert casters. A leader death = immediate
    // Military Victory loss for this faction; sending the Archmage /
    // Motherboard into enemy territory for a convert gamble is a strictly
    // dominated play. Civilians (Subject / Core) only.
    const leaderKey = namedLeaders[this.species].typeKey;
    const casters = units.filter(
      (u) => CONVERT_CASTER_TYPES.has(u.typeKey)
        && u.typeKey !== leaderKey
        && u.state.kind === "idle",
    );
    if (casters.length === 0) return;

    // Items we still need from the opposing species.
    const ownStats = this.species === "wizards" ? wizardUnitStats : robotUnitStats;
    const ownUnitTypes = new Set(Object.keys(ownStats));
    const needed = technologicalVictory.requiredItems.filter(
      (it) => !ownUnitTypes.has(it) && !this._isResearchItem(it),
    );
    if (needed.length === 0) return;

    // Scan for an opposing unit of a needed type within reach. "Reach" here is
    // detector range (sightRange of any of our units) — we need a map-aware
    // target, not a spatial-index hit from a stale detector cache.
    const myPositions = units.map((u) => u.position);
    let bestTarget: UnitEntity | null = null;
    let bestDist = Infinity;
    for (const e of engine.entities.all()) {
      if (e.faction === this.faction) continue;
      if (e.kind !== "unit") continue;
      const ue = e as UnitEntity;
      if (!(needed as readonly string[]).includes(ue.typeKey)) continue;
      if (ue.cannotBeConverted) continue;
      if (ue.state.kind === "platformShell" || ue.state.kind === "garrisoned" ||
          ue.state.kind === "inPlatform" || ue.state.kind === "hidingInBuilding") continue;
      // Threat gate — don't send a civilian into a cluster of enemy
      // combat units. Scan within a threat radius around the candidate
      // target; if hostile damage-per-tick nearby exceeds a safe budget,
      // skip this target entirely. Keeps the tech AI from feeding its
      // Subjects / Cores to a standing army.
      if (this._targetIsUnsafe(engine, ue)) continue;
      // Closest approach from any of our units — proxy for "reachable".
      let d = Infinity;
      for (const p of myPositions) d = Math.min(d, _distSq(p, ue.position));
      if (d < bestDist) { bestDist = d; bestTarget = ue; }
    }
    if (!bestTarget) return;

    // Pick the caster closest to the target.
    let bestCaster: UnitEntity | null = null;
    let bestCasterDist = Infinity;
    for (const c of casters) {
      const d = _distSq(c.position, bestTarget.position);
      if (d < bestCasterDist) { bestCasterDist = d; bestCaster = c; }
    }
    if (!bestCaster) return;

    const adj = convertConfig.adjacencyRangeTiles;
    if (bestCasterDist <= adj * adj) {
      // Already adjacent — fire the convert.
      engine.issueConvertOrder(bestCaster.id, bestTarget.id);
      this._log(`convert attempt ${bestCaster.typeKey} → ${bestTarget.typeKey}`);
    } else {
      // Move toward the target. A move within 1 tile of the target is close
      // enough; next tick we'll re-evaluate and fire Convert.
      engine.issueMoveOrder(bestCaster.id, bestTarget.position);
    }
  }

  private _isResearchItem(item: string): boolean {
    for (const items of Object.values(buildingResearch)) {
      if (items.includes(item)) return true;
    }
    return false;
  }

  // ── Threat assessment for Convert hunts ───────────────────────────────────

  /**
   * Estimate whether a convert-hunt target is safe to approach. Scans a
   * small radius around the target for opposing combat units that could
   * interrupt the caster mid-convert (8s of sustained adjacency is a long
   * window for a solo civilian). If the summed enemy damage-per-interval
   * within the radius exceeds a safe budget, the target is classed as
   * unsafe and the hunt skips it. Combat units near our OWN side of the
   * map are still fair game — this filter only trips on targets deep in
   * enemy territory.
   */
  private _targetIsUnsafe(engine: AIEngineInterface, target: UnitEntity): boolean {
    // Radius — generous enough to include units that could cover the
    // 8-tile approach, not so large that any nearby patrol scares us off.
    const THREAT_SCAN_RADIUS = 6;
    const rSq = THREAT_SCAN_RADIUS * THREAT_SCAN_RADIUS;
    // Safe damage budget. A Subject has ~100 HP; one Spitter hit is ~20
    // damage, so 40 means "at most two attackers in range before we
    // abort". Initial guess; tune after playtest.
    const SAFE_DMG_BUDGET = 40;

    let hostileDmg = 0;
    for (const e of engine.entities.all()) {
      if (e.kind !== "unit") continue;
      if (e.faction === this.faction) continue;
      if (e.faction === target.faction) continue; // target's OWN escort isn't hostile to the target
      if (engine.arePeaceful(this.faction, e.faction)) continue;
      if (_distSq(e.position, target.position) > rSq) continue;
      if (e.stats.damage <= 0) continue;
      hostileDmg += e.stats.damage;
      if (hostileDmg > SAFE_DMG_BUDGET) return true;
    }
    // Also inspect units of the TARGET's faction — they'll defend. A target
    // standing in the middle of a standing army is unsafe even though the
    // army isn't "hostile" to us by faction-list logic (it's our convert
    // victim's protection). Same radius, same budget.
    let defenderDmg = 0;
    for (const e of engine.entities.all()) {
      if (e.kind !== "unit") continue;
      if (e.faction !== target.faction) continue;
      if (e.id === target.id) continue;
      if (_distSq(e.position, target.position) > rSq) continue;
      if (e.stats.damage <= 0) continue;
      defenderDmg += e.stats.damage;
      if (defenderDmg > SAFE_DMG_BUDGET) return true;
    }
    return false;
  }

  // ── Diplomacy ──────────────────────────────────────────────────────────────

  /**
   * Proactively propose peace with every met faction whose alignment has
   * climbed high enough to likely accept. Prefers Open Borders (shared
   * vision + non-aggression) then Non-Combat Treaty (hard bilateral
   * attack ban). Soft peace (alignment ≥ friendly threshold) is NOT a
   * substitute for a treaty — alignment can drop mid-match, treaties are
   * permanent. So we propose even when `arePeaceful` currently returns
   * true; we just skip the specific treaty type if it's already signed.
   * One proposal per faction per tick; duplicate pending sends are
   * suppressed via `pendingProposals`.
   */
  private _proposeDiplomacy(engine: AIEngineInterface): void {
    const minAlignment = diplomacyConfig.aiAcceptThreshold;
    const pending = engine.getPendingProposals();

    for (const other of engine.getActiveFactions()) {
      if (other === this.faction) continue;
      const align = engine.getAlignment(this.faction, other);
      if (align < minAlignment) continue;

      // Open Borders first — tech AI wants shared vision for cross-species
      // unit scouting (fuels the Convert hunt target picker).
      const ownStats = engine.getFactionStats(this.faction);
      const obSigned = ownStats.openBorders[other] === true;
      const alreadyProposedOB = pending.some(
        (p) => p.from === this.faction && p.to === other && p.kind === "openBorders",
      );
      if (!obSigned && !alreadyProposedOB) {
        engine.issueProposeDiplomaticAction(this.faction, other, "openBorders");
        this._log(`propose openBorders → ${other} (align=${align.toFixed(0)})`);
        continue;
      }

      // Non-combat next — locks in peace even if alignment later drops.
      const ncSigned = engine.hasNonCombatTreaty(this.faction, other);
      const alreadyProposedNC = pending.some(
        (p) => p.from === this.faction && p.to === other && p.kind === "nonCombat",
      );
      if (!ncSigned && !alreadyProposedNC) {
        engine.issueProposeDiplomaticAction(this.faction, other, "nonCombat");
        this._log(`propose nonCombat → ${other} (align=${align.toFixed(0)})`);
        continue;
      }

      // Unit request — the diplomatic analogue to Convert. Any opposing
      // unit typeKey we haven't unlocked yet is a candidate. Accepting the
      // proposal transfers the unit AND checks its typeKey off our tech
      // victory list (engine mirrors this into `_unlockedItems`). Safer
      // than Convert for civilians — no adjacency, no combat exposure.
      const unlocked = new Set<string>(); // built lazily only if we'll use it
      const needed = technologicalVictory.requiredItems.filter((it) => !this._isResearchItem(it));
      let bestUnitId: string | null = null;
      for (const e of engine.entities.unitsByFaction(other)) {
        if (e.cannotBeConverted) continue; // leader — engine rejects the transfer
        if (e.state.kind === "platformShell" || e.state.kind === "inPlatform" ||
            e.state.kind === "garrisoned" || e.state.kind === "hidingInBuilding") continue;
        // Lazy-seed the unlocked set once we have a viable candidate.
        if (unlocked.size === 0) {
          for (const f of engine.getActiveFactions()) void f; // no-op, keeps TS linter
          // Faction stats snapshot doesn't include unlockedItems, so pull
          // them via a faction-stats side-channel: we use our own
          // `_hasUnlocked` helper below. Cheaper than reading the snapshot.
        }
        if (this._hasUnlocked(engine, e.typeKey)) continue;
        if (!(needed as readonly string[]).includes(e.typeKey)) continue;
        bestUnitId = e.id;
        break;
      }
      if (bestUnitId) {
        const alreadyProposedUnit = pending.some(
          (p) => p.from === this.faction && p.to === other
            && p.kind === "unitRequest" && p.unitId === bestUnitId,
        );
        if (!alreadyProposedUnit) {
          engine.issueProposeDiplomaticAction(this.faction, other, "unitRequest", { unitId: bestUnitId });
          this._log(`propose unitRequest → ${other} unit=${bestUnitId} (align=${align.toFixed(0)})`);
        }
      }
    }
  }

  /** True if the given typeKey is already on our tech-victory list. Reads
   *  through the engine's completed-research mirror for research items and
   *  falls back to a scan of our own entities for unit/building types —
   *  because `_unlockedItems` itself isn't part of `AIEngineInterface`
   *  (keeping that surface tight), but every unlocked item is either a
   *  research we've finished or an entity typeKey we've owned at some
   *  point. This is a serviceable approximation: we'll occasionally
   *  re-request a typeKey we ALREADY unlocked via a since-dead transfer,
   *  but the engine will still accept it and it's a no-op for tech
   *  progress (Set.add is idempotent). */
  private _hasUnlocked(engine: AIEngineInterface, typeKey: string): boolean {
    if (engine.hasCompletedResearch(this.faction, typeKey)) return true;
    // Scan own entities for an instance of this typeKey.
    for (const u of engine.entities.unitsByFaction(this.faction)) if (u.typeKey === typeKey) return true;
    for (const b of engine.entities.buildingsByFaction(this.faction)) if (b.typeKey === typeKey) return true;
    return false;
  }

  private _respondToProposals(engine: AIEngineInterface): void {
    // Tech AI accepts proposals at a lower alignment threshold than Military —
    // it wants peace to tech freely. Offset subtracted from the default.
    const threshold = diplomacyConfig.aiAcceptThreshold - TECH_AI_ACCEPT_BONUS;
    for (const p of engine.getPendingProposals()) {
      if (p.to !== this.faction) continue;
      const align = engine.getAlignment(this.faction, p.from);
      const accept = align >= threshold;
      engine.issueRespondToProposal(p.id, accept);
    }
  }
}

// TICKS_PER_SEC intentionally imported but not currently referenced — retained
// for future tuning (e.g., hunt-cooldowns, timed convert-retry). Suppress
// unused-variable warning via a no-op reference.
void TICKS_PER_SEC;
