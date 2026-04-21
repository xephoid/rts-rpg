export declare const manaGen: {
    perWizardUnitPerTick: number;
    reservoirBaseTick: number;
    reservoirProximityMultiplier: number;
    reservoirProximityRadiusTiles: number;
};
export declare const spellCosts: {
    wizardMissiles: number;
    iceBlastMana: number;
    fieryExplosionMana: number;
    enlargeMana: number;
    reduceMana: number;
    manaShieldDrainPerSec: number;
    manaShieldDamageReduction: number;
    illusionistInvisibilityDrainPerSec: number;
};
/** Research key that unlocks Illusionist invisibility (gate via Library of Illusion). */
export declare const illusionistInvisibilityResearchKey = "invisibility";
/**
 * Leader force-out by an Illusionist: `cannotBeConverted` leaders can't be
 * permanently taken over, but they CAN be temporarily puppeted for this many ticks.
 * When the timer expires the leader reverts to its original faction.
 */
export declare const illusionistTempControlDurationTicks = 900;
export declare const manaConfig: {
    manaMax: number;
};
export declare const spellEffects: {
    iceBlast: {
        slowDurationSec: number;
        slowDurationTicks: number;
        speedReductionPct: number;
    };
    fieryExplosion: {
        damage: number;
        radiusTiles: number;
    };
    enlarge: {
        damageBonusPct: number;
        durationTicks: number;
    };
    reduce: {
        damagePenaltyPct: number;
        durationTicks: number;
    };
};
export declare const clericConfig: {
    healPerInterval: number;
    healRadiusTiles: number;
    healIntervalTicks: number;
    healXpPerHp: number;
};
//# sourceMappingURL=spellCosts.d.ts.map