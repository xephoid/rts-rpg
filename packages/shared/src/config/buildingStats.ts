// Building stats for all building types.
// Values marked "Initial guess" — update to "Confirmed" after playtesting sign-off.

export type BuildingStatBlock = {
  hp: number;
  occupantCapacity: number;
  visionRange: number; // tiles
  footprintTiles: number; // N×N tile footprint
};

// ── Robot buildings ───────────────────────────────────────────────────────────

export const robotBuildingStats: Record<string, BuildingStatBlock> = {
  home: {
    // Initial guess: base structure — high HP, houses multiple units.
    hp: 500,
    occupantCapacity: 6,
    visionRange: 5,
    footprintTiles: 4,
  },
  rechargeStation: {
    // Initial guess: healing/recharge facility.
    hp: 200,
    occupantCapacity: 2,
    visionRange: 3,
    footprintTiles: 2,
  },
  immobileCombatPlatform: {
    // Initial guess: defensive tower — high HP, long vision.
    hp: 350,
    occupantCapacity: 1,
    visionRange: 8,
    footprintTiles: 1,
  },
  waterExtractor: {
    // Initial guess: resource building — moderate HP.
    hp: 180,
    occupantCapacity: 1,
    visionRange: 3,
    footprintTiles: 2,
  },
  woodStorage: {
    // Initial guess: storage — low HP, no vision bonus.
    hp: 150,
    occupantCapacity: 0,
    visionRange: 2,
    footprintTiles: 2,
  },
  combatFrameProduction: {
    // Initial guess: unit production building.
    hp: 280,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 3,
  },
  combatResearchStation: {
    // Initial guess: research building.
    hp: 220,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 2,
  },
  diplomaticResearchStation: {
    // Initial guess: diplomacy building.
    hp: 200,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 2,
  },
  defensiveResearchStation: {
    // Initial guess: defensive upgrades building.
    hp: 220,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 2,
  },
  thirdSpace: {
    // Initial guess: XP boost / cultural building.
    hp: 160,
    occupantCapacity: 4,
    visionRange: 3,
    footprintTiles: 3,
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
  },
  cottage: {
    // Initial guess: basic housing.
    hp: 120,
    occupantCapacity: 3,
    visionRange: 2,
    footprintTiles: 2,
  },
  wall: {
    // Initial guess: defensive structure — very high HP, no occupants.
    hp: 600,
    occupantCapacity: 0,
    visionRange: 1,
    footprintTiles: 1,
  },
  wizardTower: {
    // Initial guess: defensive tower — high HP, best wizard vision range.
    hp: 300,
    occupantCapacity: 1,
    visionRange: 10,
    footprintTiles: 1,
  },
  watermill: {
    // Initial guess: water resource building.
    hp: 160,
    occupantCapacity: 1,
    visionRange: 3,
    footprintTiles: 2,
  },
  logCabin: {
    // Initial guess: wood processing.
    hp: 140,
    occupantCapacity: 1,
    visionRange: 2,
    footprintTiles: 2,
  },
  manaReservoir: {
    // Initial guess: mana generation building.
    hp: 180,
    occupantCapacity: 0,
    visionRange: 3,
    footprintTiles: 2,
  },
  libraryOfEvocation: {
    // Initial guess: spell research — Evoker abilities.
    hp: 200,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 3,
  },
  libraryOfIllusion: {
    // Initial guess: spell research — Illusionist abilities.
    hp: 200,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 3,
  },
  libraryOfEnchantment: {
    // Initial guess: spell research — Enchantress abilities.
    hp: 200,
    occupantCapacity: 2,
    visionRange: 4,
    footprintTiles: 3,
  },
  dragonHoard: {
    // Initial guess: Dragon production/housing.
    hp: 400,
    occupantCapacity: 1,
    visionRange: 5,
    footprintTiles: 3,
  },
  temple: {
    // Initial guess: cultural/religious building — high occupants.
    hp: 250,
    occupantCapacity: 6,
    visionRange: 4,
    footprintTiles: 3,
  },
  embassy: {
    // Initial guess: diplomacy building.
    hp: 180,
    occupantCapacity: 3,
    visionRange: 4,
    footprintTiles: 2,
  },
  amphitheatre: {
    // Initial guess: XP boost cultural building — large capacity.
    hp: 200,
    occupantCapacity: 8,
    visionRange: 4,
    footprintTiles: 4,
  },
};
