/** Game loop target — used to convert seconds → ticks for production durations. */
export declare const TICKS_PER_SEC = 60;
export declare const gatherRates: {
    woodPerTick: number;
    waterPerTick: number;
};
/** Ticks between each harvest action. Higher = slower gathering. 4 = 1/4 of single-tick speed. */
export declare const GATHER_INTERVAL_TICKS = 4;
/** XP awarded to a gatherer on each successful resource delivery. Initial guess. */
export declare const gatherXpPerTrip = 5;
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
export declare const robotUnitCosts: Record<string, UnitCost>;
export declare const wizardUnitCosts: Record<string, UnitCost>;
export declare const robotBuildingCosts: Record<string, BuildingCost>;
export declare const wizardBuildingCosts: Record<string, BuildingCost>;
export declare const researchCosts: {
    woodToMetal: {
        wood: number;
        water: number;
        durationSec: number;
    };
    wizardMissiles: {
        wood: number;
        water: number;
        durationSec: number;
    };
    iceBlast: {
        wood: number;
        water: number;
        durationSec: number;
    };
    fieryExplosion: {
        wood: number;
        water: number;
        durationSec: number;
    };
    manaShield: {
        wood: number;
        water: number;
        durationSec: number;
    };
    phantomDecoy: {
        wood: number;
        water: number;
        durationSec: number;
    };
    mindFog: {
        wood: number;
        water: number;
        durationSec: number;
    };
    strengthenAlly: {
        wood: number;
        water: number;
        durationSec: number;
    };
    weakenFoe: {
        wood: number;
        water: number;
        durationSec: number;
    };
};
export declare const woodDeposit: {
    quantity: number;
    regenerates: boolean;
};
export declare const waterDeposit: {
    quantity: number;
    regenerates: boolean;
};
/**
 * Auto-collection fires once every this many ticks (= once per second at TICKS_PER_SEC=60).
 * Values below are per-collection-event, not per-tick.
 */
export declare const AUTO_COLLECTION_INTERVAL_TICKS = 60;
export declare const autoCollectionRates: {
    waterExtractorPerInterval: number;
    watermillPerInterval: number;
};
export declare const resourceAlertThresholds: {
    wood: number;
    water: number;
    mana: number;
};
//# sourceMappingURL=resourceCosts.d.ts.map