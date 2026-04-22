// Victory condition thresholds.
// Values marked "Initial guess" — update to "Confirmed" after playtesting sign-off.

export const culturalVictory = {
  // Initial guess: win by having 20 civilians each at level 10.
  maxCivilianCount: 20,
  maxXpPerCivilian: 1024, // level 10 at doubling threshold (2^10)
  // Initial guess: each completed LLM quest awards 5% cultural victory progress.
  questProgressPct: 5,
};

export const technologicalVictory = {
  // Initial guess: must research/build all 27 items across both factions.
  // Full item list (all units + buildings from both species, including cross-species):
  requiredItems: [
    // Robot units (11)
    "core",
    "waterCollectionPlatform",
    "woodChopperPlatform",
    "movableBuildKitPlatform",
    "spinnerPlatform",
    "spitterPlatform",
    "infiltrationPlatform",
    "largeCombatPlatform",
    "probePlatform",
    "wallPlatform",
    "stingerPlatform", // Added in the combat-frame refactor; must be produced for tech victory.
    // Wizard units (8)
    "archmage",
    "surf",
    "subject",
    "evoker",
    "illusionist",
    "dragon",
    "enchantress",
    "cleric",
    // Cross-species requirement: research all upgrades in both trees.
    // `wizardMissiles` was in this list but is actually the Evoker's base
    // attack — not a research item — so it was unreachable for tech victory.
    // Removed to match the actual research tree.
    "woodToMetal",
    "iceBlast",
    "fieryExplosion",
    "manaShield",
    "phantomDecoy",
    "invisibility",
    "strengthenAlly",
    "weakenFoe",
  ] as const,
};

export const victoryAlert = {
  // Initial guess: warn all players when any player reaches 75% of a win condition.
  proximityThresholdPct: 75,
};
