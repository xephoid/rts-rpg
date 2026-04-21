/**
 * Resolve a unit portrait (icon) path for use in selection panels.
 * Lives here (not renderer/assets.ts) so /ui components can import it without
 * violating ESLint import boundary rules.
 * Robot icons are not fully populated yet — callers should handle missing images gracefully.
 */
export declare function unitPortraitPath(faction: "wizards" | "robots", typeKey: string): string;
/**
 * Resolve a unit sprite path for use in production buttons.
 * These are the in-game unit images (side/isometric view sprites).
 */
export declare function unitSpritePath(faction: "wizards" | "robots", typeKey: string): string;
/** Maps building typeKey → list of unit typeKeys it can produce. */
export declare const buildingProduction: Record<string, string[]>;
/** Unit types that can be ordered to construct a building. */
export declare const BUILDER_UNIT_TYPES: Set<string>;
/** Builder is removed from map when construction completes (single-use). */
export declare const SINGLE_USE_BUILDERS: Set<string>;
/** Buildings whose HP contributes to Defense faction stat. */
export declare const DEFENSIVE_BUILDING_TYPES: Set<string>;
/** Buildings a friendly hideable unit can enter to hide from opponents. */
export declare const HIDING_CAPABLE_BUILDINGS: Set<string>;
/** Unit typeKeys that can hide inside HIDING_CAPABLE_BUILDINGS. */
export declare const HIDEABLE_UNIT_TYPES: Set<string>;
/** Tuning for the hide-in-building system. */
export declare const hidingBuildingConfig: {
    hiddenCapacityOverride: number;
};
/**
 * Which buildings can accept resources for each resource type.
 * Gatherers only drop off at buildings in this list for the relevant resource.
 */
export declare const resourceDropoffBuildings: Record<"wood" | "water", string[]>;
/** Buildings that must be placed with at least one footprint tile adjacent to a water tile. */
export declare const buildingRequiresAdjacentWater: Set<string>;
/**
 * Building typeKey that must be operational before this unit can be produced.
 * Units not listed are always available at their production building.
 */
/**
 * Building typeKey that must be operational before this unit can be produced.
 * Only wizard units need this — robot advanced units are produced AT their own research
 * buildings, so no separate unlock check is needed.
 */
export declare const unitBuildingRequirements: Record<string, string>;
/** Maps building typeKey → list of researchable item keys available at that building. */
export declare const buildingResearch: Record<string, string[]>;
/** Buildings a builder can construct. Includes additional main bases (spec: no limit on Castles/Homes). */
export declare const factionBuildableBuildings: Record<"wizards" | "robots", string[]>;
/** Portrait path for buildings — for Build panel buttons and selection panel. */
export declare function buildingPortraitPath(faction: "wizards" | "robots", typeKey: string): string;
export type BuildingStatBlock = {
    hp: number;
    occupantCapacity: number;
    visionRange: number;
    footprintTiles: number;
    /** Population slots this building contributes toward the faction cap. */
    populationSupport: number;
};
export declare const robotBuildingStats: Record<string, BuildingStatBlock>;
export declare const wizardBuildingStats: Record<string, BuildingStatBlock>;
/** Bonuses applied to Evokers and Archmages while garrisoned inside a Wizard Tower. */
export declare const wizardTowerConfig: {
    rangeBonus: number;
    damageBonus: number;
};
/**
 * Immobile Combat Platform — Core-powered robot turret.
 *
 * Shell model: the platform has its own HP; Cores inside don't take damage. Zero
 * Cores → vision only, no attack. 1+ Cores → platform fires with fixed `baseDamage`
 * and `baseAttackRange`; each *additional* Core linearly scales the attack rate
 * (shorter cooldown) and each Core (including the first) adds `perCoreVision` to
 * sight range.
 *
 * Attack interval = `baseAttackIntervalSec / occupants` — so 1 Core fires once per
 * baseInterval, 2 Cores twice as fast, 3 Cores three times as fast.
 */
export declare const immobileCombatPlatformConfig: {
    baseDamage: number;
    baseAttackRange: number;
    baseAttackIntervalSec: number;
    perCoreVision: number;
};
//# sourceMappingURL=buildingStats.d.ts.map