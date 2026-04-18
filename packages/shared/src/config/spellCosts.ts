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
  iceBlast: 40,
  fieryExplosion: 55,
  manaShieldDrainPerSec: 8, // Initial guess: drains continuously while active
};

export const manaConfig = {
  // Initial guess: 500 mana cap for the wizard faction.
  manaMax: 500,
};

export const spellEffects = {
  iceBlast: {
    // Initial guess: slows target to 40% speed for 3 seconds.
    slowDurationSec: 3,
    speedReductionPct: 60,
  },
};
