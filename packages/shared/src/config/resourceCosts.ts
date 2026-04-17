// Resource costs and production/construction durations.
// Values marked "Initial guess" — update to "Confirmed" after playtesting sign-off.

export type UnitCost = {
  wood: number;
  water: number;
  productionTimeSec: number;
};

export type BuildingCost = {
  wood: number;
  water: number;
  constructionTimeSec: number;
};

export type ResearchCost = {
  wood: number;
  water: number;
  durationSec: number;
};

// ── Robot unit costs ──────────────────────────────────────────────────────────

export const robotUnitCosts: Record<string, UnitCost> = {
  // Initial guess: light units ~20-40w + 10-20w, 15-20s; heavy ~60-80w + 30-40w, 30-45s
  core: { wood: 30, water: 15, productionTimeSec: 18 },
  waterCollectionPlatform: { wood: 25, water: 12, productionTimeSec: 16 },
  woodChopperPlatform: { wood: 28, water: 14, productionTimeSec: 17 },
  movableBuildKitPlatform: { wood: 40, water: 20, productionTimeSec: 25 },
  spinnerPlatform: { wood: 35, water: 18, productionTimeSec: 20 },
  spitterPlatform: { wood: 50, water: 25, productionTimeSec: 28 },
  infiltrationPlatform: { wood: 45, water: 22, productionTimeSec: 24 },
  largeCombatPlatform: { wood: 75, water: 38, productionTimeSec: 42 },
  probePlatform: { wood: 20, water: 10, productionTimeSec: 14 },
  wallPlatform: { wood: 60, water: 0, productionTimeSec: 30 },
};

// ── Wizard unit costs ─────────────────────────────────────────────────────────

export const wizardUnitCosts: Record<string, UnitCost> = {
  archmage: { wood: 0, water: 80, productionTimeSec: 60 }, // Initial guess: unique hero
  surf: { wood: 20, water: 30, productionTimeSec: 20 },
  subject: { wood: 15, water: 20, productionTimeSec: 15 },
  evoker: { wood: 30, water: 45, productionTimeSec: 28 },
  illusionist: { wood: 28, water: 40, productionTimeSec: 26 },
  dragon: { wood: 0, water: 150, productionTimeSec: 90 }, // Initial guess: apex unit
  enchantress: { wood: 25, water: 38, productionTimeSec: 24 },
  cleric: { wood: 20, water: 30, productionTimeSec: 20 },
};

// ── Robot building costs ──────────────────────────────────────────────────────

export const robotBuildingCosts: Record<string, BuildingCost> = {
  home: { wood: 80, water: 0, constructionTimeSec: 45 },
  rechargeStation: { wood: 50, water: 20, constructionTimeSec: 30 },
  immobileCombatPlatform: { wood: 70, water: 10, constructionTimeSec: 40 },
  waterExtractor: { wood: 40, water: 0, constructionTimeSec: 25 },
  woodStorage: { wood: 30, water: 0, constructionTimeSec: 20 },
  combatFrameProduction: { wood: 60, water: 15, constructionTimeSec: 35 },
  combatResearchStation: { wood: 70, water: 20, constructionTimeSec: 40 },
  diplomaticResearchStation: { wood: 60, water: 20, constructionTimeSec: 35 },
  defensiveResearchStation: { wood: 65, water: 15, constructionTimeSec: 38 },
  thirdSpace: { wood: 50, water: 10, constructionTimeSec: 30 },
};

// ── Wizard building costs ─────────────────────────────────────────────────────

export const wizardBuildingCosts: Record<string, BuildingCost> = {
  castle: { wood: 120, water: 40, constructionTimeSec: 60 },
  cottage: { wood: 30, water: 10, constructionTimeSec: 20 },
  wall: { wood: 50, water: 0, constructionTimeSec: 25 },
  wizardTower: { wood: 60, water: 20, constructionTimeSec: 35 },
  watermill: { wood: 40, water: 0, constructionTimeSec: 25 },
  logCabin: { wood: 35, water: 5, constructionTimeSec: 22 },
  manaReservoir: { wood: 50, water: 30, constructionTimeSec: 32 },
  libraryOfEvocation: { wood: 70, water: 25, constructionTimeSec: 40 },
  libraryOfIllusion: { wood: 70, water: 25, constructionTimeSec: 40 },
  libraryOfEnchantment: { wood: 70, water: 25, constructionTimeSec: 40 },
  dragonHoard: { wood: 100, water: 50, constructionTimeSec: 55 },
  temple: { wood: 80, water: 30, constructionTimeSec: 45 },
  embassy: { wood: 60, water: 20, constructionTimeSec: 35 },
  amphitheatre: { wood: 75, water: 25, constructionTimeSec: 42 },
};

// ── Research costs ────────────────────────────────────────────────────────────

export const researchCosts = {
  // Initial guess: technology upgrades
  woodToMetal: { wood: 100, water: 0, durationSec: 60 } satisfies ResearchCost,

  // Wizard spells
  wizardMissiles: { wood: 0, water: 40, durationSec: 30 } satisfies ResearchCost,
  iceBlast: { wood: 0, water: 60, durationSec: 45 } satisfies ResearchCost,
  fieryExplosion: { wood: 20, water: 50, durationSec: 50 } satisfies ResearchCost,
  manaShield: { wood: 0, water: 80, durationSec: 55 } satisfies ResearchCost,

  // Illusionist abilities
  phantomDecoy: { wood: 0, water: 45, durationSec: 35 } satisfies ResearchCost,
  mindFog: { wood: 0, water: 55, durationSec: 40 } satisfies ResearchCost,

  // Enchantress abilities
  strengthenAlly: { wood: 0, water: 40, durationSec: 30 } satisfies ResearchCost,
  weakenFoe: { wood: 0, water: 50, durationSec: 38 } satisfies ResearchCost,
};

// ── Resource deposits ─────────────────────────────────────────────────────────

export const woodDeposit = {
  // Initial guess: deposits are finite. Each deposit has 400-800 wood.
  // Rationale: forces expansion and prevents turtling forever.
  quantityMin: 400,
  quantityMax: 800,
  regenerates: false, // Initial guess: finite — adjust if turtling is a problem
};

// ── Auto-collection rates (per tick) ─────────────────────────────────────────

export const autoCollectionRates = {
  // Initial guess: 1 tick = 1 second
  waterExtractorPerTick: 2, // Initial guess
  watermillPerTick: 2, // Initial guess
};

// ── Resource alert thresholds ─────────────────────────────────────────────────

export const resourceAlertThresholds = {
  // Initial guess: warn when stocks drop this low
  wood: 30,
  water: 20,
  mana: 15,
};
