export type UnitStatBlock = {
    hpWood: number;
    hpMetal: number;
    damage: number;
    range: number;
    speed: number;
    charisma: number;
    armorWood: number;
    armorMetal: number;
    capacity: number;
};
export type WizardStatBlock = {
    hp: number;
    damage: number;
    range: number;
    speed: number;
    charisma: number;
    armor: number;
    capacity: number;
};
export declare const robotUnitStats: Record<string, UnitStatBlock>;
export declare const wizardUnitStats: Record<string, WizardStatBlock>;
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
};
//# sourceMappingURL=unitStats.d.ts.map