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
    quantityMin: number;
    quantityMax: number;
    regenerates: boolean;
};
export declare const autoCollectionRates: {
    waterExtractorPerTick: number;
    watermillPerTick: number;
};
export declare const resourceAlertThresholds: {
    wood: number;
    water: number;
    mana: number;
};
//# sourceMappingURL=resourceCosts.d.ts.map