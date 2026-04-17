// Unit stats for all unit types.
// Values marked "Initial guess" — update to "Confirmed" after playtesting sign-off.
// ── Robot units ──────────────────────────────────────────────────────────────
export const robotUnitStats = {
    core: {
        // Initial guess: unarmed civilian — low HP, minimal combat ability.
        hpWood: 60,
        hpMetal: 100,
        damage: 5,
        range: 1,
        speed: 2.5,
        charisma: 10,
        armorWood: 2,
        armorMetal: 6,
        capacity: 20,
    },
    waterCollectionPlatform: {
        // Initial guess: slow worker — high capacity, low combat.
        hpWood: 80,
        hpMetal: 130,
        damage: 8,
        range: 1,
        speed: 1.5,
        charisma: 2,
        armorWood: 3,
        armorMetal: 8,
        capacity: 40,
    },
    woodChopperPlatform: {
        // Initial guess: melee worker — moderate HP, good close combat.
        hpWood: 90,
        hpMetal: 140,
        damage: 22,
        range: 1,
        speed: 1.8,
        charisma: 2,
        armorWood: 4,
        armorMetal: 10,
        capacity: 30,
    },
    movableBuildKitPlatform: {
        // Initial guess: construction unit — slow, high HP, no real combat.
        hpWood: 100,
        hpMetal: 160,
        damage: 6,
        range: 1,
        speed: 1.2,
        charisma: 3,
        armorWood: 5,
        armorMetal: 12,
        capacity: 50,
    },
    spinnerPlatform: {
        // Initial guess: light ranged — fast, moderate damage, dies quickly.
        hpWood: 70,
        hpMetal: 110,
        damage: 18,
        range: 4,
        speed: 3.0,
        charisma: 1,
        armorWood: 2,
        armorMetal: 5,
        capacity: 10,
    },
    spitterPlatform: {
        // Initial guess: medium ranged — bread-and-butter combat unit.
        hpWood: 85,
        hpMetal: 130,
        damage: 24,
        range: 5,
        speed: 2.2,
        charisma: 1,
        armorWood: 3,
        armorMetal: 8,
        capacity: 10,
    },
    infiltrationPlatform: {
        // Initial guess: stealth/scout — lowest HP, highest speed, surprise damage.
        hpWood: 55,
        hpMetal: 85,
        damage: 28,
        range: 1,
        speed: 4.0,
        charisma: 5,
        armorWood: 1,
        armorMetal: 3,
        capacity: 15,
    },
    largeCombatPlatform: {
        // Initial guess: heavy bruiser — 3x cost, very high HP and damage.
        hpWood: 200,
        hpMetal: 320,
        damage: 45,
        range: 2,
        speed: 1.0,
        charisma: 0,
        armorWood: 10,
        armorMetal: 20,
        capacity: 5,
    },
    probePlatform: {
        // Initial guess: fast scout — vision range bonus applied in game logic.
        hpWood: 50,
        hpMetal: 80,
        damage: 8,
        range: 1,
        speed: 4.5,
        charisma: 4,
        armorWood: 1,
        armorMetal: 2,
        capacity: 10,
    },
    wallPlatform: {
        // Initial guess: defensive unit — stationary, high armor, no mobility.
        hpWood: 300,
        hpMetal: 500,
        damage: 12,
        range: 1,
        speed: 0.0,
        charisma: 0,
        armorWood: 15,
        armorMetal: 30,
        capacity: 0,
    },
};
// ── Wizard units ─────────────────────────────────────────────────────────────
export const wizardUnitStats = {
    archmage: {
        // Initial guess: hero unit — unique, powerful, high charisma.
        hp: 150,
        damage: 35,
        range: 6,
        speed: 2.0,
        charisma: 15,
        armor: 8,
        capacity: 20,
    },
    surf: {
        // Initial guess: mobile skirmisher — fast, moderate stats.
        hp: 80,
        damage: 20,
        range: 4,
        speed: 3.5,
        charisma: 5,
        armor: 4,
        capacity: 15,
    },
    subject: {
        // Initial guess: basic civilian wizard — low combat, high charisma.
        hp: 70,
        damage: 8,
        range: 3,
        speed: 2.0,
        charisma: 8,
        armor: 2,
        capacity: 20,
    },
    evoker: {
        // Initial guess: combat mage — high damage, fragile. Needs mana.
        hp: 75,
        damage: 38,
        range: 5,
        speed: 1.8,
        charisma: 3,
        armor: 3,
        capacity: 10,
    },
    illusionist: {
        // Initial guess: utility/support — low direct damage, abilities matter.
        hp: 72,
        damage: 14,
        range: 4,
        speed: 2.2,
        charisma: 6,
        armor: 2,
        capacity: 10,
    },
    dragon: {
        // Initial guess: apex unit — extremely powerful, very expensive.
        hp: 400,
        damage: 60,
        range: 5,
        speed: 3.0,
        charisma: 2,
        armor: 20,
        capacity: 0,
    },
    enchantress: {
        // Initial guess: buff/debuff specialist — low direct damage.
        hp: 78,
        damage: 12,
        range: 4,
        speed: 2.0,
        charisma: 8,
        armor: 3,
        capacity: 15,
    },
    cleric: {
        // Initial guess: healer/support — no damage, high charisma.
        hp: 90,
        damage: 5,
        range: 3,
        speed: 1.8,
        charisma: 10,
        armor: 4,
        capacity: 20,
    },
};
// ── XP rates ─────────────────────────────────────────────────────────────────
export const xpRates = {
    // Initial guess: per action XP gains.
    killEnemy: 20,
    assistKill: 8,
    gatherResource: 1, // per unit gathered
    constructBuilding: 15,
    completeMission: 50,
    diplomaticAction: 10,
    convertEnemy: 30,
};
// XP thresholds double: level N requires 2^N * base XP
export const xpLevelBase = 2; // Initial guess: level 1 = 2 XP, level 2 = 4, level 3 = 8…
export const thirdSpaceXpBoost = {
    // Initial guess: nearby Third Space boosts XP gain by 50% within 8 tiles.
    multiplier: 1.5,
    radiusTiles: 8,
};
export const amphitheatreXpBoost = {
    // Initial guess: each Amphitheatre contributes +10% XP; stacks additively, cap 3x.
    perBuilding: 0.1,
    stackingFormula: "additive",
    cap: 3.0,
};
//# sourceMappingURL=unitStats.js.map