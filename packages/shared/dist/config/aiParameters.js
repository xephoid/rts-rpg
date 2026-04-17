// AI tuning parameters.
// Values marked "Initial guess" — update to "Confirmed" after playtesting sign-off.
export const aiParameters = {
    // Initial guess: AI evaluates state every 60 ticks (1 second at 60fps).
    reactionIntervalTicks: 60,
    // Initial guess: aggression threshold — military AI attacks when army strength ratio > 1.3
    aggressionThreshold: 1.3,
    // Initial guess: gathering baseline — tech AI allocates 70% of units to resource tasks.
    gatheringBaseline: 0.7,
};
export const npcStartingAlignment = {
    // Initial guess: varied starting dispositions to create interesting diplomacy scenarios.
    forestSpirits: { towardWizards: 40, towardRobots: -30 },
    desertNomads: { towardWizards: -10, towardRobots: 10 },
    mountainClans: { towardWizards: 0, towardRobots: 0 },
    seaMerchants: { towardWizards: 20, towardRobots: 20 },
    ancientGuardians: { towardWizards: -20, towardRobots: -20 },
};
//# sourceMappingURL=aiParameters.js.map