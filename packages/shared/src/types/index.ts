/**
 * Faction = one player slot (human or AI). Up to 6 slots; match size scales with
 * map: 2 (small), 4 (medium), 6 (large). Each faction has a `species` — wizards
 * or robots — which determines its unit/building roster. Species is tracked
 * separately (see `Species`) because two factions can share a species (e.g., two
 * independent wizard players). All per-faction engine state uses `Record<Faction, X>`
 * with every slot pre-populated; inactive slots carry default values so the
 * iteration patterns in legacy 2-faction code continue to work unchanged.
 *
 * Naming: the first two slots keep their historical literals `"wizards"` and
 * `"robots"` so pre-N-faction tests/UI keep compiling. Slots 3-6 are `"f3"`..`"f6"`.
 */
export type Faction = "wizards" | "robots" | "f3" | "f4" | "f5" | "f6";

/** All possible faction slots, in declared order. Use `activeFactions` from the
 *  engine snapshot for the subset actually participating in a given match. */
export const FACTION_IDS: readonly Faction[] = ["wizards", "robots", "f3", "f4", "f5", "f6"] as const;

/** Race / unit-roster identity. One of two possible values; multiple factions
 *  can share a species (e.g., a 3-wizard free-for-all). */
export type Species = "wizards" | "robots";

export type TerrainType = "open" | "forest" | "water";

export type EntityKind = "unit" | "building";

export type Vec2 = { x: number; y: number };

/** Stat block — mirrors /game/entities/StatBlock */
export type StatBlock = {
  hp: number;
  maxHp: number;
  damage: number;
  attackRange: number;
  sightRange: number;
  speed: number;
  charisma: number;
  armor: number;
  capacity: number;
  xp: number;
  level: number;
};

export type DepositSnapshot = {
  id: string;
  kind: "wood" | "water";
  position: Vec2;
  /** Remaining quantity. Finite for both wood and water. */
  quantity: number;
};

export type EntitySnapshot = {
  id: string;
  kind: EntityKind;
  faction: Faction;
  typeKey: string;
  position: Vec2;
  stats: StatBlock;
  isNamed: boolean;
  name: string | null;
  /** Only set on buildings currently in production state. */
  productionProgress?: {
    unitTypeKey: string;
    progressTicks: number;
    totalTicks: number;
  } | null;
  /** Queued unit typeKeys waiting to be produced after the active item. */
  productionQueue?: string[];
  /** Only set on buildings. Explicit state for UI rendering. */
  buildingState?: "underConstruction" | "operational" | "producing" | "researching";
  /** Set on buildings under construction. */
  constructionProgress?: { progressTicks: number; totalTicks: number } | null;
  /** Set on buildings currently researching. */
  researchProgress?: { researchKey: string; progressTicks: number; totalTicks: number } | null;
  /** Only set on units currently carrying a gathered resource. */
  carrying?: { resource: "wood" | "water"; amount: number } | null;
  /** Only set on robot Core units — the typeKey of the platform it is riding inside. */
  attachedPlatformTypeKey?: string | null;
  /** Set on a robot platform entity when a Core is riding inside it. */
  attachedCoreId?: string | null;
  /** Only set on robot units — material the unit was constructed from. */
  materialType?: "wood" | "metal" | null;
  /** True while this unit is a hidden passenger (Core inside platform). */
  isShell?: boolean;
  /** True while this wizard unit has Mana Shield active. */
  manaShielded?: boolean;
  /** True for flying units (dragon, probePlatform) — renderer uses this for z-ordering. */
  flying?: boolean;
  /** True while unit is slowed by Ice Blast. */
  slowed?: boolean;
  /** True while unit has an active Enlarge damage bonus. */
  enlarged?: boolean;
  /** True while unit has an active Reduce damage penalty. */
  reduced?: boolean;
  /** Human-readable current action label for HUD display. */
  unitAction?: string;
  /** True while this unit is garrisoned inside a Wizard Tower. */
  garrisoned?: boolean;
  /** True while this unit (a Core) is occupying an Immobile Combat Platform. */
  inPlatform?: boolean;
  /** Set on a Wizard Tower building when a unit is garrisoned inside it. */
  garrisonedUnitId?: string | null;
  /** Number of Cores currently occupying an Immobile Combat Platform (robots-only). */
  occupantCount?: number;
  /** Number of units currently hiding inside this building (Cottage / Recharge Station). */
  hiddenOccupantCount?: number;
  /** True while unit has Illusionist invisibility active. */
  invisible?: boolean;
  /** True while unit is an Infiltration Platform with disguise active. */
  disguised?: boolean;
  /** Real faction of a disguised unit — always the unit's actual owner. Renderer uses this + displayFaction to decide the viewer-dependent sprite. */
  displayFaction?: Faction;
  /** Unit typeKey to render to opponents when disguise is active. */
  displayTypeKey?: string;
  /** True while unit is hiding inside a friendly Cottage / Recharge Station. */
  hidden?: boolean;
  /** True while an Infiltration Platform is occupying an enemy hiding-capable building. */
  inEnemyBuilding?: boolean;
  /** Set when unit is hidden or inEnemyBuilding — id of the containing building. Used by UI
   *  to list occupants (for infiltrator attack-from-inside) and link hide-exit commands. */
  containingBuildingId?: string;
  /** True while this unit is temporarily controlled by an opposing Illusionist.
   *  `faction` reads as the puppeteer's faction until the effect expires. */
  tempControlled?: boolean;
};

export type TileSnapshot = {
  x: number;
  y: number;
  terrain: TerrainType;
  woodRemaining?: number | undefined;
};

export type FogVisibility = 0 | 1 | 2; // UNEXPLORED | EXPLORED | VISIBLE

export type FogSnapshot = {
  width: number;
  height: number;
  /** Flat Uint8Array [y * width + x]. Serialised as number[] for store transfer. */
  data: Uint8Array | number[];
};

export type AttackEvent = {
  attackerId: string;
  targetId: string;
  /** World-space tile-centre position of attacker at fire time. */
  attackerPos: Vec2;
  /** World-space tile-centre position of target at fire time. */
  targetPos: Vec2;
  /** True for ranged attacks (range > 1) — spawn a travelling projectile. */
  ranged: boolean;
};

export type SpellEvent = {
  kind: "iceBlast" | "fieryExplosion" | "enlarge" | "reduce";
  casterId: string;
  casterPos: Vec2;
  /** Set for unit-targeted spells (iceBlast, enlarge, reduce). */
  targetId?: string;
  /** World-space tile position of target (unit centre or clicked tile). */
  targetPos: Vec2;
};

export type FactionStats = {
  militaryStrength: number;
  culture: number;
  defense: number;
  intelligence: number;
  footprint: number;
  /** −100 .. +100 per opposing faction. Higher = friendlier. AI uses this to decide
   *  whether to accept treaty proposals. */
  alignment: Record<Faction, number>;
  /** Bilateral — both directions flip together when a proposal is accepted. */
  openBorders: Record<Faction, boolean>;
  /** Bilateral — blocks attack orders between signatories. */
  nonCombatTreaties: Record<Faction, boolean>;
};

/** Diplomatic proposal in flight between two factions. Accepted = applied +
 *  removed from pending. Declined = removed + alignment hit both sides. */
export type DiplomaticProposalKind =
  | "openBorders"
  | "nonCombat"
  | "resourceRequest"
  | "unitRequest";

export type DiplomaticProposal = {
  id: string;
  kind: DiplomaticProposalKind;
  from: Faction;
  to: Faction;
  /** Only set for `resourceRequest`. */
  resource?: { kind: "wood" | "water" | "mana"; amount: number };
  /** Only set for `unitRequest` — id of the unit the sender wants transferred. */
  unitId?: string;
  createdTick: number;
};

export type GameStateSnapshot = {
  tick: number;
  elapsedMs: number;
  resources: Record<Faction, { wood: number; water: number; mana: number }>;
  entities: EntitySnapshot[];
  tiles: TileSnapshot[];
  /** Per-faction fog — only the player's own faction fog is sent to each client. */
  fog: Record<Faction, FogSnapshot>;
  /** Live unit count vs. population cap per faction. */
  population: Record<Faction, { count: number; cap: number }>;
  /** All non-exhausted resource deposits (fog-filtered by renderer). */
  deposits: DepositSnapshot[];
  /** Research items permanently unlocked per faction. */
  completedResearch: Record<Faction, string[]>;
  /** Attacks that fired this tick — used by renderer for projectile + hit-flash effects. */
  attacks?: AttackEvent[];
  /** Spells cast this tick — used by renderer for spell visual effects. */
  spells?: SpellEvent[];
  factionStats: Record<Faction, FactionStats>;
  /**
   * Per-faction set of enemy unit IDs currently revealed by a detector.
   * Renderer uses `detectedIds[activeFaction]` to override invisibility/disguise
   * when presenting enemy units to the viewer.
   */
  detectedIds: Record<Faction, string[]>;
  /** Phase 14 diplomacy state the UI reads. Active agreements are in
   *  `factionStats[*].openBorders` / `nonCombatTreaties`. */
  diplomacy: {
    pendingProposals: DiplomaticProposal[];
    /** Per-faction list of factions this one has "met" (mutual sight contact).
     *  Bilateral: if X ∈ metFactions[Y] then Y ∈ metFactions[X]. Diplomacy UI
     *  gates proposal rows on this. A faction is always counted as having met
     *  itself (self entry is always present). */
    metFactions: Record<Faction, Faction[]>;
  };
  /** Which species each faction is playing. Inactive slots default to `"wizards"`
   *  but should be filtered by `activeFactions` before display. */
  factionSpecies: Record<Faction, Species>;
  /** The factions actually participating in this match (2, 4, or 6 depending on
   *  map size). Renderer + UI iterate this instead of every possible slot. */
  activeFactions: Faction[];
};
