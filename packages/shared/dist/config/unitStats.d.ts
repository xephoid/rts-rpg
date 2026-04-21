export type UnitStatBlock = {
    hpWood: number;
    hpMetal: number;
    damage: number;
    attackRange: number;
    sightRange: number;
    speed: number;
    charisma: number;
    armorWood: number;
    armorMetal: number;
    capacity: number;
    attackIntervalSec: number;
    flying?: boolean;
    canAttackAir?: boolean;
    cannotBeConverted?: boolean;
};
export type WizardStatBlock = {
    hp: number;
    damage: number;
    attackRange: number;
    sightRange: number;
    speed: number;
    charisma: number;
    armor: number;
    capacity: number;
    attackIntervalSec: number;
    flying?: boolean;
    canAttackAir?: boolean;
    cannotBeConverted?: boolean;
};
export declare const robotUnitStats: Record<string, UnitStatBlock>;
export declare const wizardUnitStats: Record<string, WizardStatBlock>;
export type UnitRole = "combat" | "worker" | "support" | "spy" | "hero" | "tank" | "core";
export declare const MILITARY_ROLES: Set<UnitRole>;
/** Unit typeKeys whose XP counts toward the Culture faction stat. */
export declare const CIVILIAN_UNIT_TYPES: Set<string>;
export type LevelUpBonus = {
    hpPct: number;
    damagePct: number;
    armorPct: number;
    speedPct: number;
    charismaPct: number;
    attackRangePct: number;
    capacityPct: number;
};
export declare const levelUpBonuses: Record<UnitRole, LevelUpBonus>;
export declare const unitRoles: Record<string, UnitRole>;
/** Named leaders spawned at game start — one per faction. */
export declare const namedLeaders: {
    readonly wizards: {
        readonly typeKey: "archmage";
        readonly name: "Archmage Elara";
    };
    readonly robots: {
        readonly typeKey: "motherboard";
        readonly name: "Motherboard";
    };
};
/**
 * Extra population cap contributed by a unit being alive on the map.
 * Only named leaders or special units need entries here.
 */
export declare const unitPopulationBonus: Record<string, number>;
export declare const xpRates: {
    killEnemy: number;
    assistKill: number;
    gatherResource: number;
    constructBuilding: number;
    completeMission: number;
    diplomaticAction: number;
    convertEnemy: number;
};
export declare const xpLevelBase = 2;
export declare const thirdSpaceXpBoost: {
    multiplier: number;
    radiusTiles: number;
};
export declare const amphitheatreXpBoost: {
    perBuilding: number;
    stackingFormula: "additive";
    cap: number;
    xpPerSec: number;
    radiusTiles: number;
};
//# sourceMappingURL=unitStats.d.ts.map