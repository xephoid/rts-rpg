// Resource costs and production/construction durations.
// Values marked "Initial guess" — update to "Confirmed" after playtesting sign-off.
/** Game loop target — used to convert seconds → ticks for production durations. */
export const TICKS_PER_SEC = 60;
export const gatherRates = {
    // Initial guess: fills a 20-capacity unit in ~40 ticks (GATHER_INTERVAL_TICKS=4 means
    // one harvest per 4 ticks, so 20 capacity / 2 per-harvest = 10 harvests * 4 ticks = 40 ticks).
    woodPerTick: 2,
    waterPerTick: 2,
};
/** Ticks between each harvest action. Higher = slower gathering. 4 = 1/4 of single-tick speed. */
export const GATHER_INTERVAL_TICKS = 20;
/** XP awarded to a gatherer on each successful resource delivery. Initial guess. */
export const gatherXpPerTrip = 2;
// ── Robot unit costs ──────────────────────────────────────────────────────────
export const robotUnitCosts = {
    // Initial guess: light units ~20-40w + 10-20w, 15-20s; heavy ~60-80w + 30-40w, 30-45s
    core: { wood: 30, water: 15, productionTimeSec: 5 },
    waterCollectionPlatform: { wood: 25, water: 12, productionTimeSec: 5 },
    woodChopperPlatform: { wood: 28, water: 14, productionTimeSec: 5 },
    movableBuildKitPlatform: { wood: 40, water: 20, productionTimeSec: 6 },
    spinnerPlatform: { wood: 35, water: 18, productionTimeSec: 5 },
    spitterPlatform: { wood: 50, water: 25, productionTimeSec: 10 },
    infiltrationPlatform: { wood: 45, water: 22, productionTimeSec: 20 },
    largeCombatPlatform: { wood: 75, water: 38, productionTimeSec: 30 },
    probePlatform: { wood: 20, water: 10, productionTimeSec: 14 },
    wallPlatform: { wood: 60, water: 0, productionTimeSec: 20 },
    stingerPlatform: { wood: 35, water: 18, productionTimeSec: 10 }, // Initial guess: Spinner parity
};
// ── Wizard unit costs ─────────────────────────────────────────────────────────
export const wizardUnitCosts = {
    archmage: { wood: 0, water: 80, productionTimeSec: 60 }, // Initial guess: unique hero
    surf: { wood: 20, water: 30, productionTimeSec: 20 },
    subject: { wood: 15, water: 20, productionTimeSec: 15 },
    evoker: { wood: 30, water: 45, productionTimeSec: 30 },
    illusionist: { wood: 28, water: 40, productionTimeSec: 40 },
    dragon: { wood: 0, water: 150, productionTimeSec: 120 }, // Initial guess: apex unit
    enchantress: { wood: 25, water: 38, productionTimeSec: 25 },
    cleric: { wood: 20, water: 30, productionTimeSec: 45 },
};
// ── Robot building costs ──────────────────────────────────────────────────────
export const robotBuildingCosts = {
    home: { wood: 80, water: 0, constructionTimeSec: 45 },
    rechargeStation: { wood: 50, water: 20, constructionTimeSec: 30 },
    immobileCombatPlatform: { wood: 70, water: 10, constructionTimeSec: 20 },
    waterExtractor: { wood: 40, water: 0, constructionTimeSec: 25 },
    woodStorage: { wood: 30, water: 0, constructionTimeSec: 20 },
    combatFrameProduction: { wood: 60, water: 15, constructionTimeSec: 20 },
    aerialFrameProduction: { wood: 100, water: 20, constructionTimeSec: 60 },
    diplomaticResearchStation: { wood: 60, water: 20, constructionTimeSec: 35 },
    defenseFrameProduction: { wood: 65, water: 15, constructionTimeSec: 25 },
    thirdSpace: { wood: 50, water: 10, constructionTimeSec: 40 },
};
// ── Wizard building costs ─────────────────────────────────────────────────────
export const wizardBuildingCosts = {
    castle: { wood: 120, water: 40, constructionTimeSec: 60 },
    cottage: { wood: 30, water: 10, constructionTimeSec: 20 },
    wall: { wood: 50, water: 0, constructionTimeSec: 25 },
    wizardTower: { wood: 60, water: 20, constructionTimeSec: 40 },
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
    woodToMetal: { wood: 100, water: 0, durationSec: 60 },
    // Wizard spells
    wizardMissiles: { wood: 0, water: 40, durationSec: 30 },
    iceBlast: { wood: 0, water: 60, durationSec: 45 },
    fieryExplosion: { wood: 20, water: 50, durationSec: 50 },
    manaShield: { wood: 0, water: 80, durationSec: 55 },
    // Illusionist abilities
    phantomDecoy: { wood: 0, water: 45, durationSec: 35 },
    invisibility: { wood: 0, water: 55, durationSec: 40 },
    // Enchantress abilities
    strengthenAlly: { wood: 0, water: 40, durationSec: 30 },
    weakenFoe: { wood: 0, water: 50, durationSec: 38 },
};
// ── Resource deposits ─────────────────────────────────────────────────────────
export const woodDeposit = {
    // Initial guess: every forest tile has 250 wood. Adjust after playtesting.
    quantity: 250,
    regenerates: false,
};
export const waterDeposit = {
    // Initial guess: every water tile has 1000 water — water is harder to exhaust than wood.
    // Adjust after playtesting.
    quantity: 1000,
    regenerates: false,
};
// ── Auto-collection rates ─────────────────────────────────────────────────────
/**
 * Auto-collection fires once every this many ticks (= once per second at TICKS_PER_SEC=60).
 * Values below are per-collection-event, not per-tick.
 */
export const AUTO_COLLECTION_INTERVAL_TICKS = 60; // Initial guess: 1 collection per second
export const autoCollectionRates = {
    waterExtractorPerInterval: 1, // Initial guess: 1 water per second
    watermillPerInterval: 1, // Initial guess: 1 water per second
};
// ── Resource alert thresholds ─────────────────────────────────────────────────
export const resourceAlertThresholds = {
    // Initial guess: warn when stocks drop this low
    wood: 30,
    water: 20,
    mana: 15,
};
//# sourceMappingURL=resourceCosts.js.map