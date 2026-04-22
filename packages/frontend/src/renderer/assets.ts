// Asset path manifest — maps entity typeKeys and terrain types to public asset URLs.
// All paths are relative to /public/ (Vite serves this at /).
// Renderer loads textures through this manifest; never hardcodes paths elsewhere.

export const terrainAssets: Record<string, string> = {
  grass: "/terrain/grass.png",
  grassDense: "/terrain/grass_dense.png",
  dirtPath: "/terrain/dirt_path.png",
  forestDeciduous: "/terrain/forest_deciduous.png",
  forestPine: "/terrain/forest_pine.png",
  rocky: "/terrain/rocky.png",
  mountain: "/terrain/mountain.png",
  waterShallow: "/terrain/water_shallow.png",
  waterDeep: "/terrain/water_deep.png",
  // Decorations
  decorBush: "/terrain/decoration/bush.png",
  decorFallenLog: "/terrain/decoration/fallen_log.png",
  decorFlowers: "/terrain/decoration/flowers.png",
  decorRocks: "/terrain/decoration/rocks.png",
};

export const resourceAssets: Record<string, string> = {
  woodSmall: "/resources/wood_small.png",
  woodLarge: "/resources/wood_large.png",
  waterPool: "/resources/water_pool.png",
  waterRiver: "/resources/water_river.png",
  goldDeposit: "/resources/gold_deposit.png",
};

// Robot unit sprites (game world — used by PixiJS renderer)
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

// Robot unit icons (UI — used by React HUD components)
export const robotIconAssets: Record<string, string> = {
  core: "/robot/icons/core.png",
  motherboard: "/robot/icons/motherboard.png",
  probe: "/robot/icons/probe.png",
  spinner: "/robot/icons/spinner.png",
  spitter: "/robot/icons/spitter.png",
};

export const robotBuildingAssets: Record<string, string> = {
  home: "/robot/buildings/home.png",
  rechargeStation: "/robot/buildings/recharge_station.png",
  immobileCombatPlatform: "/robot/buildings/immobile_combat_platform.png",
  waterExtractor: "/robot/buildings/water_extractor.png",
  woodStorage: "/robot/buildings/wood_storage.png",
  combatFrameProduction: "/robot/buildings/combat_frame_production.png",
  combatResearchStation: "/robot/buildings/combat_research_station.png",
  diplomaticResearchStation: "/robot/buildings/diplomatic_research_station.png",
  defensiveResearchStation: "/robot/buildings/defensive_research_station.png",
  thirdSpace: "/robot/buildings/third_space.png",
};

// Wizard unit sprites (game world)
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

// Wizard unit icons (UI)
export const wizardIconAssets: Record<string, string> = {
  archmage: "/wizard/icons/archmage.png",
  surf: "/wizard/icons/surf.png",
  subject: "/wizard/icons/subject.png",
  evoker: "/wizard/icons/evoker.png",
  illusionist: "/wizard/icons/illusionist.png",
  dragon: "/wizard/icons/dragon.png",
  enchantress: "/wizard/icons/enchantress.png",
  cleric: "/wizard/icons/cleric.png",
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

export const npcAssets: Record<string, { identity: string; leader: string }> = {
  establishment: {
    identity: "/npc/establishment/identity.png",
    leader: "/npc/establishment/units/leader.png",
  },
  inventors: {
    identity: "/npc/inventors/identity.png",
    leader: "/npc/inventors/units/leader.png",
  },
  militantRobots: {
    identity: "/npc/militant_robots/identity.png",
    leader: "/npc/militant_robots/units/leader.png",
  },
  peacefulRobots: {
    identity: "/npc/peaceful_robots/identity.png",
    leader: "/npc/peaceful_robots/units/leader.png",
  },
  rebellion: {
    identity: "/npc/rebellion/identity.png",
    leader: "/npc/rebellion/units/leader.png",
  },
};

export const effectAssets: Record<string, string> = {
  dragonFire: "/effects/dragon_fire.png",
  fieryExplosion: "/effects/fiery_explosion.png",
};

export const uiAssets = {
  buttonNormal: "/ui/button_normal.png",
  cursors: {
    default: "/ui/cursors/default.png",
    attack: "/ui/cursors/attack.png",
    build: "/ui/cursors/build.png",
  },
};

/** Resolve a unit sprite path from faction + typeKey. Returns undefined if not mapped. */
export function unitSpritePath(faction: "wizards" | "robots", typeKey: string): string | undefined {
  const map = faction === "wizards" ? wizardUnitAssets : robotUnitAssets;
  return map[typeKey];
}

/** Resolve a building sprite path from faction + typeKey. */
export function buildingSpritePath(faction: "wizards" | "robots", typeKey: string): string | undefined {
  const map = faction === "wizards" ? wizardBuildingAssets : robotBuildingAssets;
  return map[typeKey];
}

/** Resolve a unit icon path for UI panels. */
export function unitIconPath(faction: "wizards" | "robots", typeKey: string): string | undefined {
  const map = faction === "wizards" ? wizardIconAssets : robotIconAssets;
  return map[typeKey];
}
