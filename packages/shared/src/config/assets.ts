// Asset-path manifest — canonical source for unit + building sprite URLs.
// Kept in shared so /ui, /renderer, and tests all resolve the same strings.
// Paths are relative to the frontend's /public/ (Vite serves this at /).

import type { Species } from "../types/index.js";

export const robotUnitAssets: Record<string, string> = {
  core: "/robot/units/core.png",
  motherboard: "/robot/units/motherboard.png",
  waterCollectionPlatform: "/robot/units/water_collection_platform.png",
  woodChopperPlatform: "/robot/units/wood_chopper_platform.png",
  movableBuildKitPlatform: "/robot/units/movable_build_kit.png",
  spinnerPlatform: "/robot/units/spinner_platform.png",
  spitterPlatform: "/robot/units/spitter_platform.png",
  infiltrationPlatform: "/robot/units/infiltration_platform.png",
  largeCombatPlatform: "/robot/units/large_combat_platform.png",
  probePlatform: "/robot/units/probe_platform.png",
  wallPlatform: "/robot/units/wall_platform.png",
  stingerPlatform: "/robot/units/stinger_platform.png",
};

export const robotBuildingAssets: Record<string, string> = {
  home: "/robot/buildings/home.png",
  rechargeStation: "/robot/buildings/recharge_station.png",
  immobileCombatPlatform: "/robot/buildings/immobile_combat_platform.png",
  waterExtractor: "/robot/buildings/water_extractor.png",
  woodStorage: "/robot/buildings/wood_storage.png",
  combatFrameProduction: "/robot/buildings/combat_frame_production.png",
  // Asset files still carry their original filenames; rename the PNGs here if you
  // author replacements with the new names.
  aerialFrameProduction: "/robot/buildings/combat_research_station.png",
  diplomaticResearchStation: "/robot/buildings/diplomatic_research_station.png",
  defenseFrameProduction: "/robot/buildings/defensive_research_station.png",
  thirdSpace: "/robot/buildings/third_space.png",
};

export const wizardUnitAssets: Record<string, string> = {
  archmage: "/wizard/units/archmage.png",
  surf: "/wizard/units/surf.png",
  subject: "/wizard/units/subject.png",
  evoker: "/wizard/units/evoker.png",
  illusionist: "/wizard/units/illusionist.png",
  dragon: "/wizard/units/dragon.png",
  enchantress: "/wizard/units/enchantress.png",
  cleric: "/wizard/units/cleric.png",
};

export const wizardBuildingAssets: Record<string, string> = {
  castle: "/wizard/buildings/castle.png",
  cottage: "/wizard/buildings/cottage.png",
  wall: "/wizard/buildings/wall.png",
  wizardTower: "/wizard/buildings/wizard_tower.png",
  watermill: "/wizard/buildings/watermill.png",
  logCabin: "/wizard/buildings/log_cabin.png",
  manaReservoir: "/wizard/buildings/mana_reservoir.png",
  libraryOfEvocation: "/wizard/buildings/library_evocation.png",
  libraryOfIllusion: "/wizard/buildings/library_illusion.png",
  libraryOfEnchantment: "/wizard/buildings/library_enchantment.png",
  dragonHoard: "/wizard/buildings/dragon_hoard.png",
  temple: "/wizard/buildings/temple.png",
  embassy: "/wizard/buildings/embassy.png",
  amphitheatre: "/wizard/buildings/amphitheatre.png",
};

/**
 * Resolve a unit sprite path for a given faction + typeKey. Returns `undefined`
 * when the typeKey isn't in the manifest — callers should handle a missing image
 * (usually via an `onError` on the `<img>`).
 *
 * This is the one source of truth: UI panels, the PixiJS renderer, and any tests
 * all call this to avoid drift between camelCase typeKeys and the actual snake_case
 * file names on disk.
 */
export function unitSpritePath(species: Species, typeKey: string): string | undefined {
  const map = species === "wizards" ? wizardUnitAssets : robotUnitAssets;
  return map[typeKey];
}

/** Resolve a building sprite path for a given faction + typeKey. */
export function buildingSpritePath(species: Species, typeKey: string): string | undefined {
  const map = species === "wizards" ? wizardBuildingAssets : robotBuildingAssets;
  return map[typeKey];
}
