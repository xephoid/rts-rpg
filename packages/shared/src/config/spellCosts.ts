// Mana generation and spell costs.
// Values marked "Initial guess" — update to "Confirmed" after playtesting sign-off.

export const manaGen = {
  // Initial guess: 1.5 mana/tick per wizard unit in play.
  perWizardUnitPerTick: 1.5,

  // Initial guess: Mana Reservoir generates 8/tick base.
  reservoirBaseTick: 8,

  // Initial guess: wizards within 6 tiles of a Reservoir get +50% mana gen.
  reservoirProximityMultiplier: 1.5,
  reservoirProximityRadiusTiles: 6,
};

export const spellCosts = {
  // Initial guess: spells cost 20–60 mana per cast.
  wizardMissiles: 25,
  iceBlastMana: 40,
  fieryExplosionMana: 55,
  enlargeMana: 35,   // Initial guess
  reduceMana: 35,    // Initial guess
  manaShieldDrainPerSec: 8,        // Initial guess: drains continuously while active
  manaShieldDamageReduction: 0.5,  // Initial guess: 50% incoming damage reduction
  illusionistInvisibilityDrainPerSec: 5, // Initial guess: drains while invisibility is active
};

/** Research key that unlocks Illusionist invisibility (gate via Library of Illusion). */
export const illusionistInvisibilityResearchKey = "mindFog";

/**
 * Leader force-out by an Illusionist: `cannotBeConverted` leaders can't be
 * permanently taken over, but they CAN be temporarily puppeted for this many ticks.
 * When the timer expires the leader reverts to its original faction.
 */
export const illusionistTempControlDurationTicks = 900; // Initial guess: ~15s at 60 ticks/sec

export const manaConfig = {
  // Initial guess: 500 mana cap for the wizard faction.
  manaMax: 500,
};

export const spellEffects = {
  iceBlast: {
    // Initial guess: slows target to 40% speed for 3 seconds.
    slowDurationSec: 3,
    slowDurationTicks: 180, // 3 * 60 ticks/sec
    speedReductionPct: 60,
  },
  fieryExplosion: {
    damage: 60,       // Initial guess: high burst damage
    radiusTiles: 2,   // Initial guess: small AoE
  },
  enlarge: {
    damageBonusPct: 50,    // Initial guess: +50% damage output
    durationTicks: 480,    // Initial guess: 8 seconds
  },
  reduce: {
    damagePenaltyPct: 50,  // Initial guess: -50% damage output
    durationTicks: 480,    // Initial guess: 8 seconds
  },
};

export const clericConfig = {
  healPerInterval: 2,      // Initial guess: 2 HP per heal tick
  healRadiusTiles: 4,      // Initial guess
  healIntervalTicks: 5,    // Initial guess: heals every 5 ticks (~12x/sec)
  healXpPerHp: 0.5,        // Initial guess: XP awarded per HP restored
};
