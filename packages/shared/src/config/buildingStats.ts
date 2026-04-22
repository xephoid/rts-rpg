// Building stats for all building types.
// Values marked "Initial guess" — update to "Confirmed" after playtesting sign-off.
//
// NOTE: `unitSpritePath` / `buildingSpritePath` live in `./assets.ts`. Use those
// when you need an image URL for a typeKey — they consult the canonical asset
// manifest instead of string-templating (which would silently break for any
// multi-word robot typeKey whose actual file is snake_case).

import type { Species } from "../types/index.js";

/** Maps building typeKey → list of unit typeKeys it can produce. */
export const buildingProduction: Record<string, string[]> = {
  // Robot buildings — each research building IS the production building for its unit type
  home: ["core", "waterCollectionPlatform", "woodChopperPlatform", "movableBuildKitPlatform"],
  combatFrameProduction: ["spinnerPlatform", "spitterPlatform", "largeCombatPlatform"],
  aerialFrameProduction: ["probePlatform", "stingerPlatform"],
  diplomaticResearchStation: ["infiltrationPlatform"],
  defenseFrameProduction: ["wallPlatform"],
  // Wizard buildings — all units produced at castle; libraries/special buildings are existence-only unlocks
  castle: ["subject", "surf", "evoker", "illusionist", "enchantress", "dragon", "cleric"],
};

/** Unit types that can be ordered to construct a building. */
export const BUILDER_UNIT_TYPES = new Set(["surf", "movableBuildKitPlatform"]);

/** Builder is removed from map when construction completes (single-use). */
export const SINGLE_USE_BUILDERS = new Set(["movableBuildKitPlatform"]);

/** Buildings whose HP contributes to Defense faction stat. */
export const DEFENSIVE_BUILDING_TYPES = new Set([
  "wall", "wizardTower", "immobileCombatPlatform",
]);

/** Buildings a friendly hideable unit can enter to hide from opponents. */
export const HIDING_CAPABLE_BUILDINGS = new Set(["cottage", "rechargeStation"]);

/** Unit typeKeys that can hide inside HIDING_CAPABLE_BUILDINGS. */
export const HIDEABLE_UNIT_TYPES = new Set([
  "subject", "core",        // civilians
  "archmage", "motherboard", // named leaders
]);

/** Tuning for the hide-in-building system. */
export const hidingBuildingConfig = {
  // Initial guess: Cottage/RechargeStation can host up to 8 hidden units regardless
  // of their base `occupantCapacity` (which governs production/garrison semantics).
  hiddenCapacityOverride: 8,
};

/**
 * Which buildings can accept resources for each resource type.
 * Gatherers only drop off at buildings in this list for the relevant resource.
 */
export const resourceDropoffBuildings: Record<"wood" | "water", string[]> = {
  wood: ["castle", "home", "logCabin", "woodStorage"],
  water: ["castle", "home"],
};

/** Buildings that must be placed with at least one footprint tile adjacent to a water tile. */
export const buildingRequiresAdjacentWater = new Set(["watermill", "waterExtractor"]);

/**
 * Building typeKey that must be operational before this unit can be produced.
 * Units not listed are always available at their production building.
 */
/**
 * Building typeKey that must be operational before this unit can be produced.
 * Only wizard units need this — robot advanced units are produced AT their own research
 * buildings, so no separate unlock check is needed.
 */
export const unitBuildingRequirements: Record<string, string> = {
  illusionist: "libraryOfIllusion",
  enchantress: "libraryOfEnchantment",
  dragon: "dragonHoard",
  cleric: "temple",
};

/** Maps building typeKey → list of researchable item keys available at that building. */
export const buildingResearch: Record<string, string[]> = {
  home: ["woodToMetal"],
  libraryOfEvocation: ["iceBlast", "fieryExplosion", "manaShield"],
  libraryOfIllusion: ["phantomDecoy", "invisibility"],
  libraryOfEnchantment: ["strengthenAlly", "weakenFoe"],
};

/** Buildings a builder can construct. Includes additional main bases (spec: no limit on Castles/Homes). */
export const factionBuildableBuildings: Record<Species, string[]> = {
  wizards: [
    "castle",
    "cottage", "wall", "wizardTower", "watermill", "logCabin", "manaReservoir",
    "libraryOfEvocation", "libraryOfIllusion", "libraryOfEnchantment",
    "dragonHoard", "temple", "embassy", "amphitheatre",
  ],
  robots: [
    "home",
    "rechargeStation", "immobileCombatPlatform", "waterExtractor", "woodStorage",
    "combatFrameProduction", "aerialFrameProduction", "diplomaticResearchStation",
    "defenseFrameProduction", "thirdSpace",
  ],
};

export type BuildingStatBlock = {
  hp: number;
  occupantCapacity: number;
  visionRange: number; // tiles
  footprintTiles: number; // N×N tile footprint
  /** Population slots this building contributes toward the faction cap. */
  populationSupport: number;
};

// ── Robot buildings ───────────────────────────────────────────────────────────

export const robotBuildingStats: Record<string, BuildingStatBlock> = {
  home: {
    // Initial guess: base structure — high HP, houses multiple units.
    hp: 500,
    occupantCapacity: 6,
    visionRange: 5,
    footprintTiles: 4,
    populationSupport: 8, // Initial guess: main base supports 8 units.
  },
  rechargeStation: {
    // Initial guess: healing/recharge facility.
    hp: 200,
    occupantCapacity: 8,
    visionRange: 3,
    footprintTiles: 2,
    populationSupport: 8, // Confirmed: spec says +8 per Recharge Station.
  },
  immobileCombatPlatform: {
    // Initial guess: defensive tower — high HP, long vision. visionRange is the base
    // (zero Cores); each occupying Core adds immobileCombatPlatformConfig.perCoreVision.
    hp: 350,
    occupantCapacity: 3, // Initial guess: up to 3 Cores may enter to boost effectiveness.
    visionRange: 4, // Initial guess: base sight. Less than a dedicated Watch Tower.
    footprintTiles: 1,
    populationSupport: 0,
  },
  waterExtractor: {
    // Initial guess: resource building — moderate HP.
    hp: 180,
    occupantCapacity: 1,
    visionRange: 3,
    footprintTiles: 2,
    populationSupport: 0,
  },
  woodStorage: {
    // Initial guess: storage — low HP, no vision bonus.
    hp: 150,
    occupantCapacity: 0,
    visionRange: 2,
    footprintTiles: 2,
    populationSupport: 0,
  },
  combatFrameProduction: {
    // Initial guess: unit production building.
    hp: 280,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 3,
    populationSupport: 0, // Pop cap comes exclusively from Home + Recharge Station.
  },
  aerialFrameProduction: {
    // Initial guess: aerial-unit production building (Probe + Stinger).
    hp: 220,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 2,
    populationSupport: 0,
  },
  diplomaticResearchStation: {
    // Initial guess: diplomacy building.
    hp: 200,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 2,
    populationSupport: 0,
  },
  defenseFrameProduction: {
    // Initial guess: defensive-unit production building (Wall Platform).
    hp: 220,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 2,
    populationSupport: 0,
  },
  thirdSpace: {
    // Initial guess: XP boost / cultural building.
    hp: 160,
    occupantCapacity: 4,
    visionRange: 3,
    footprintTiles: 3,
    populationSupport: 0, // Pop cap comes exclusively from Home + Recharge Station.
  },
};

// ── Wizard buildings ──────────────────────────────────────────────────────────

export const wizardBuildingStats: Record<string, BuildingStatBlock> = {
  castle: {
    // Initial guess: main base — very high HP, large vision.
    hp: 800,
    occupantCapacity: 8,
    visionRange: 7,
    footprintTiles: 4,
    populationSupport: 8, // Confirmed: capital supports 8 units.
  },
  cottage: {
    // Initial guess: basic housing.
    hp: 120,
    occupantCapacity: 5,
    visionRange: 2,
    footprintTiles: 2,
    populationSupport: 5, // Confirmed: spec says +5 per Cottage.
  },
  wall: {
    // Initial guess: defensive structure — very high HP, no occupants.
    hp: 600,
    occupantCapacity: 0,
    visionRange: 1,
    footprintTiles: 1,
    populationSupport: 0,
  },
  wizardTower: {
    // Initial guess: defensive tower — high HP, best wizard vision range.
    hp: 75,
    occupantCapacity: 1,
    visionRange: 8,
    footprintTiles: 1,
    populationSupport: 0,
  },
  watermill: {
    // Initial guess: water resource building.
    hp: 160,
    occupantCapacity: 1,
    visionRange: 3,
    footprintTiles: 2,
    populationSupport: 0,
  },
  logCabin: {
    // Initial guess: wood processing.
    hp: 140,
    occupantCapacity: 1,
    visionRange: 2,
    footprintTiles: 2,
    populationSupport: 0,
  },
  manaReservoir: {
    // Initial guess: mana generation building.
    hp: 180,
    occupantCapacity: 0,
    visionRange: 3,
    footprintTiles: 2,
    populationSupport: 0,
  },
  libraryOfEvocation: {
    // Initial guess: spell research — Evoker abilities.
    hp: 200,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 3,
    populationSupport: 0,
  },
  libraryOfIllusion: {
    // Initial guess: spell research — Illusionist abilities.
    hp: 200,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 3,
    populationSupport: 0,
  },
  libraryOfEnchantment: {
    // Initial guess: spell research — Enchantress abilities.
    hp: 200,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 3,
    populationSupport: 0,
  },
  dragonHoard: {
    // Initial guess: Dragon production/housing.
    hp: 400,
    occupantCapacity: 1,
    visionRange: 5,
    footprintTiles: 3,
    populationSupport: 0, // Pop cap comes exclusively from Castle + Cottage.
  },
  temple: {
    // Initial guess: cultural/religious building — high occupants.
    hp: 250,
    occupantCapacity: 6,
    visionRange: 4,
    footprintTiles: 3,
    populationSupport: 0, // Pop cap comes exclusively from Castle + Cottage.
  },
  embassy: {
    // Initial guess: diplomacy building.
    hp: 180,
    occupantCapacity: 3,
    visionRange: 4,
    footprintTiles: 2,
    populationSupport: 0,
  },
  amphitheatre: {
    // Initial guess: XP boost cultural building — large capacity.
    hp: 200,
    occupantCapacity: 8,
    visionRange: 4,
    footprintTiles: 4,
    populationSupport: 0,
  },
};

/** Bonuses applied to Evokers and Archmages while garrisoned inside a Wizard Tower. */
export const wizardTowerConfig = {
  rangeBonus: 2,   // Initial guess: +2 tiles attack range
  damageBonus: 10, // Initial guess: +10 damage
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
export const immobileCombatPlatformConfig = {
  // Initial guess — damage per shot (constant regardless of occupant count).
  baseDamage: 25,
  // Initial guess — attack range in tiles (constant regardless of occupant count).
  baseAttackRange: 5,
  // Initial guess — base time between shots when exactly 1 Core occupies the platform.
  baseAttackIntervalSec: 1.5,
  // Vision each Core adds on top of `visionRange` in `robotBuildingStats`.
  perCoreVision: 2,
};
