// Asset path manifest — terrain, resource, effect, npc, and UI-chrome paths live
// here. Unit + building sprite manifests and the `unitSpritePath`/`buildingSpritePath`
// resolvers have moved to `@neither/shared/config/assets` so /ui can reach them
// without violating the import-boundary rules.

export { robotUnitAssets, robotBuildingAssets, wizardUnitAssets, wizardBuildingAssets, unitSpritePath, buildingSpritePath } from "@neither/shared";

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

// Robot unit icons (UI — used by React HUD components)
export const robotIconAssets: Record<string, string> = {
  core: "/robot/icons/core.png",
  motherboard: "/robot/icons/motherboard.png",
  probe: "/robot/icons/probe.png",
  spinner: "/robot/icons/spinner.png",
  spitter: "/robot/icons/spitter.png",
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

/** Resolve a unit icon path for UI panels (legacy — prefer `unitSpritePath` from
 *  shared now that UI shows full unit sprites, not icons). */
export function unitIconPath(faction: "wizards" | "robots", typeKey: string): string | undefined {
  const map = faction === "wizards" ? wizardIconAssets : robotIconAssets;
  return map[typeKey];
}
