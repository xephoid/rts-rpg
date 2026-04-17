export type Faction = "wizards" | "robots";
export type TerrainType = "open" | "forest" | "water";
export type EntityKind = "unit" | "building";
export type Vec2 = {
    x: number;
    y: number;
};
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
export type EntitySnapshot = {
    id: string;
    kind: EntityKind;
    faction: Faction;
    typeKey: string;
    position: Vec2;
    stats: StatBlock;
};
export type TileSnapshot = {
    x: number;
    y: number;
    terrain: TerrainType;
    woodRemaining?: number | undefined;
};
export type FogVisibility = 0 | 1 | 2;
export type FogSnapshot = {
    width: number;
    height: number;
    /** Flat Uint8Array [y * width + x]. Serialised as number[] for store transfer. */
    data: Uint8Array | number[];
};
export type GameStateSnapshot = {
    tick: number;
    elapsedMs: number;
    resources: Record<Faction, {
        wood: number;
        water: number;
        mana: number;
    }>;
    entities: EntitySnapshot[];
    tiles: TileSnapshot[];
    /** Per-faction fog — only the player's own faction fog is sent to each client. */
    fog: Record<Faction, FogSnapshot>;
};
//# sourceMappingURL=index.d.ts.map