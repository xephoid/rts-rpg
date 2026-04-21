// Unit stats for all unit types.
// Values marked "Initial guess" — update to "Confirmed" after playtesting sign-off.

export type UnitStatBlock = {
  hpWood: number;
  hpMetal: number;
  damage: number;
  attackRange: number; // tiles — how close unit must be to attack
  sightRange: number;  // tiles — fog-of-war vision radius
  speed: number; // tiles/sec
  charisma: number;
  armorWood: number;
  armorMetal: number;
  capacity: number; // resource carry capacity
  attackIntervalSec: number; // seconds between attacks
  /** Visual + selection footprint in tiles. Collision is still 1x1 — renderer scales
   *  the sprite and the hit-test box but the unit occupies a single tile for pathing. */
  footprintTiles?: number;
  flying?: boolean; // ignores terrain + building tiles; collides only with other flyers
  canAttackAir?: boolean; // can target flying units
  cannotBeConverted?: boolean; // immune to Talk/Convert actions
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
  attackIntervalSec: number; // seconds between attacks
  /** Visual + selection footprint in tiles. Collision is still 1x1. */
  footprintTiles?: number;
  flying?: boolean;
  canAttackAir?: boolean;
  cannotBeConverted?: boolean; // immune to Talk/Convert actions
};

// ── Robot units ──────────────────────────────────────────────────────────────

export const robotUnitStats: Record<string, UnitStatBlock> = {
  motherboard: {
    // Initial guess: robot hero unit — unique leader, powerful, high charisma. Cannot be converted.
    hpWood: 180,
    hpMetal: 280,
    damage: 30,
    attackRange: 3,
    sightRange: 10,
    speed: 2.5,
    charisma: 12,
    armorWood: 8,
    armorMetal: 15,
    capacity: 20,
    attackIntervalSec: 1.0,
    cannotBeConverted: true,
    canAttackAir: true,
  },
  core: {
    // Initial guess: unarmed civilian — low HP, minimal combat ability.
    hpWood: 60,
    hpMetal: 100,
    damage: 0,
    attackRange: 1,
    sightRange: 8, // Initial guess — adjust after playtesting
    speed: 2.5,
    charisma: 10,
    armorWood: 2,
    armorMetal: 6,
    capacity: 20,
    attackIntervalSec: 2.0, // Initial guess
  },
  waterCollectionPlatform: {
    // Initial guess: slow worker — high capacity, low combat.
    hpWood: 80,
    hpMetal: 130,
    damage: 0,
    attackRange: 1,
    sightRange: 5, // Initial guess
    speed: 3,
    charisma: 2,
    armorWood: 3,
    armorMetal: 8,
    capacity: 15,
    attackIntervalSec: 2.0, // Initial guess
  },
  woodChopperPlatform: {
    // Initial guess: melee worker — moderate HP, good close combat.
    hpWood: 90,
    hpMetal: 140,
    damage: 0,
    attackRange: 1,
    sightRange: 5, // Initial guess
    speed: 3,
    charisma: 2,
    armorWood: 4,
    armorMetal: 10,
    capacity: 18,
    attackIntervalSec: 1.5, // Initial guess
  },
  movableBuildKitPlatform: {
    // Initial guess: construction unit — slow, high HP, no real combat.
    hpWood: 100,
    hpMetal: 160,
    damage: 0,
    attackRange: 1,
    sightRange: 5, // Initial guess
    speed: 1.2,
    charisma: 3,
    armorWood: 5,
    armorMetal: 12,
    capacity: 50,
    attackIntervalSec: 2.5, // Initial guess
  },
  spinnerPlatform: {
    // Initial guess: light ranged — fast, moderate damage, dies quickly.
    hpWood: 70,
    hpMetal: 110,
    damage: 18,
    attackRange: 1,
    sightRange: 5, // Initial guess
    speed: 5.0,
    charisma: 1,
    armorWood: 2,
    armorMetal: 5,
    capacity: 0,
    attackIntervalSec: 0.8, // Initial guess: fast attacker
  },
  spitterPlatform: {
    // Initial guess: medium ranged — bread-and-butter combat unit.
    hpWood: 85,
    hpMetal: 130,
    damage: 24,
    attackRange: 5,
    sightRange: 8, // Initial guess
    speed: 2.2,
    charisma: 1,
    armorWood: 3,
    armorMetal: 8,
    capacity: 0,
    attackIntervalSec: 1.2, // Initial guess
    canAttackAir: true,
  },
  infiltrationPlatform: {
    // Initial guess: stealth/scout — lowest HP, highest speed, surprise damage.
    hpWood: 55,
    hpMetal: 85,
    damage: 28,
    attackRange: 1,
    sightRange: 8, // Initial guess
    speed: 4.0,
    charisma: 5,
    armorWood: 1,
    armorMetal: 3,
    capacity: 0,
    attackIntervalSec: 0.8, // Initial guess: burst attacker
  },
  largeCombatPlatform: {
    // Initial guess: heavy bruiser — 3x cost, very high HP and damage.
    hpWood: 200,
    hpMetal: 320,
    damage: 45,
    attackRange: 1,
    sightRange: 5, // Initial guess
    speed: 3.0,
    charisma: 0,
    armorWood: 10,
    armorMetal: 20,
    capacity: 0,
    attackIntervalSec: 2.0, // Initial guess: slow heavy hitter
    canAttackAir: true,
    footprintTiles: 4, // Initial guess: oversized chassis relative to basic platforms
  },
  probePlatform: {
    // Initial guess: fast scout — high sight, no attack.
    hpWood: 50,
    hpMetal: 80,
    damage: 0,
    attackRange: 1,
    sightRange: 10, // Initial guess
    flying: true,
    speed: 4.5,
    charisma: 4,
    armorWood: 1,
    armorMetal: 2,
    capacity: 10,
    attackIntervalSec: 2.0, // Initial guess
  },
  wallPlatform: {
    // Initial guess: defensive unit — stationary, high armor, no mobility.
    hpWood: 300,
    hpMetal: 500,
    damage: 0,
    attackRange: 1,
    sightRange: 5, // Initial guess
    speed: 1.0,
    charisma: 0,
    armorWood: 15,
    armorMetal: 30,
    capacity: 0,
    attackIntervalSec: 2.5, // Initial guess
  },
};

// ── Wizard units ─────────────────────────────────────────────────────────────

export const wizardUnitStats: Record<string, WizardStatBlock> = {
  archmage: {
    // Initial guess: hero unit — unique, powerful, high charisma. Cannot be converted.
    hp: 150,
    damage: 35,
    attackRange: 6,
    sightRange: 8, // Initial guess
    speed: 2.0,
    charisma: 15,
    armor: 8,
    capacity: 20,
    attackIntervalSec: 0.8, // Initial guess: hero — rapid fire
    cannotBeConverted: true,
    canAttackAir: true,
  },
  surf: {
    // Initial guess: mobile skirmisher — fast, moderate stats.
    hp: 80,
    damage: 0,
    attackRange: 1,
    sightRange: 8, // Initial guess
    speed: 1.8,
    charisma: 5,
    armor: 4,
    capacity: 25,
    attackIntervalSec: 1.0, // Initial guess
  },
  subject: {
    // Initial guess: basic civilian wizard — low combat, high charisma.
    hp: 70,
    damage: 0,
    attackRange: 1,
    sightRange: 8, // Initial guess
    speed: 2.0,
    charisma: 8,
    armor: 2,
    capacity: 20,
    attackIntervalSec: 2.5, // Initial guess: civilian, slow attacker
  },
  evoker: {
    // Initial guess: combat mage — high damage, fragile. Needs mana.
    hp: 75,
    damage: 38,
    attackRange: 5,
    sightRange: 8, // Initial guess
    speed: 1.8,
    charisma: 3,
    armor: 3,
    capacity: 10,
    attackIntervalSec: 1.5, // Initial guess: deliberate casting
  },
  illusionist: {
    // Initial guess: utility/support — low direct damage, abilities matter.
    hp: 72,
    damage: 14,
    attackRange: 1,
    sightRange: 8, // Initial guess
    speed: 2.2,
    charisma: 6,
    armor: 2,
    capacity: 10,
    attackIntervalSec: 2.0, // Initial guess
  },
  dragon: {
    // Initial guess: apex unit — extremely powerful, very expensive.
    hp: 400,
    damage: 60,
    attackRange: 5,
    sightRange: 8, // Initial guess
    flying: true,
    canAttackAir: true,
    speed: 1.5,
    charisma: 2,
    armor: 0,
    capacity: 0,
    attackIntervalSec: 2.0, // Initial guess: slow powerful breath
    footprintTiles: 4, // Initial guess: massive winged unit
  },
  enchantress: {
    // Initial guess: buff/debuff specialist — low direct damage.
    hp: 78,
    damage: 0,
    attackRange: 4,
    sightRange: 8, // Initial guess
    speed: 2.0,
    charisma: 8,
    armor: 3,
    capacity: 15,
    attackIntervalSec: 3.0, // Initial guess: support focus
  },
  cleric: {
    // Initial guess: healer/support — no damage, high charisma.
    hp: 90,
    damage: 0,
    attackRange: 3,
    sightRange: 8, // Initial guess
    speed: 1.8,
    charisma: 10,
    armor: 4,
    capacity: 20,
    attackIntervalSec: 3.0, // Initial guess: rarely attacks
  },
};

// ── Spy + detector typeKey sets ───────────────────────────────────────────────

/** Unit typeKeys that can conceal themselves from opponent rendering (via spy abilities). */
export const CONCEALED_TYPES = new Set(["infiltrationPlatform", "illusionist"]);
/** Unit typeKeys that reveal concealed/disguised/invisible enemies within their sightRange. */
export const DETECTOR_TYPES = new Set(["probePlatform", "enchantress"]);

// ── Unit roles + level-up bonuses ─────────────────────────────────────────────

export type UnitRole = "combat" | "worker" | "support" | "spy" | "hero" | "tank" | "core";

export const MILITARY_ROLES = new Set<UnitRole>(["combat", "tank", "hero", "spy"]);
/** Unit typeKeys whose XP counts toward the Culture faction stat. */
export const CIVILIAN_UNIT_TYPES = new Set(["core", "subject"]);

export type LevelUpBonus = {
  hpPct: number;
  damagePct: number;
  armorPct: number;
  speedPct: number;
  charismaPct: number;
  attackRangePct: number;
  capacityPct: number;
};

// Initial guess: +5% to role-relevant stats per level. Adjust after playtesting.
export const levelUpBonuses: Record<UnitRole, LevelUpBonus> = {
  combat: { hpPct: 0, damagePct: 5, armorPct: 5, speedPct: 0, charismaPct: 0, attackRangePct: 0, capacityPct: 0 },
  worker: { hpPct: 0, damagePct: 0, armorPct: 0, speedPct: 5, charismaPct: 0, attackRangePct: 0, capacityPct: 5 },
  support: { hpPct: 0, damagePct: 0, armorPct: 0, speedPct: 0, charismaPct: 5, attackRangePct: 5, capacityPct: 0 },
  spy: { hpPct: 0, damagePct: 5, armorPct: 0, speedPct: 5, charismaPct: 0, attackRangePct: 0, capacityPct: 0 },
  hero: { hpPct: 5, damagePct: 5, armorPct: 0, speedPct: 0, charismaPct: 5, attackRangePct: 0, capacityPct: 0 },
  tank: { hpPct: 5, damagePct: 0, armorPct: 10, speedPct: 0, charismaPct: 0, attackRangePct: 0, capacityPct: 0 },
  core: { hpPct: 5, damagePct: 0, armorPct: 0, speedPct: 0, charismaPct: 5, attackRangePct: 0, capacityPct: 0 },
};

export const unitRoles: Record<string, UnitRole> = {
  // Robot units
  motherboard: "hero",
  core: "core",
  waterCollectionPlatform: "worker",
  woodChopperPlatform: "worker",
  movableBuildKitPlatform: "worker",
  spinnerPlatform: "combat",
  spitterPlatform: "combat",
  infiltrationPlatform: "spy",
  largeCombatPlatform: "tank",
  probePlatform: "support",
  wallPlatform: "tank",
  // Wizard units
  archmage: "hero",
  surf: "spy",
  subject: "worker",
  evoker: "combat",
  illusionist: "support",
  dragon: "tank",
  enchantress: "support",
  cleric: "worker",
};

/** Named leaders spawned at game start — one per faction. */
export const namedLeaders = {
  wizards: { typeKey: "archmage" as const, name: "Archmage Elara" },
  robots: { typeKey: "motherboard" as const, name: "Motherboard" },
} as const;

/**
 * Extra population cap contributed by a unit being alive on the map.
 * Only named leaders or special units need entries here.
 */
export const unitPopulationBonus: Record<string, number> = {
  archmage: 2, // Confirmed: wizard leader adds 2 population slots
  motherboard: 2, // Initial guess: robot leader adds 2 population slots (mirrors archmage)
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
  // Initial guess: each Amphitheatre contributes +10% XP; stacks additively, cap 3x. (Phase 12)
  perBuilding: 0.1,
  stackingFormula: "additive" as const,
  cap: 3.0,
  // Initial guess: 0.2 XP/sec passively for wizard units within radius.
  xpPerSec: 0.2,
  radiusTiles: 8,
};
