export type Faction = "wizards" | "robots";

export type TerrainType = "open" | "forest" | "water";

export type EntityKind = "unit" | "building";

export type Vec2 = { x: number; y: number };

/** Stat block — mirrors /game/entities/StatBlock */
export type StatBlock = {
  hp: number;
  maxHp: number;
  damage: number;
  range: number;
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
};
