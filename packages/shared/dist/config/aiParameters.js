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
/**
 * Phase 14 diplomacy tunables. Alignment is a −100 .. +100 float the AI consults
 * when deciding whether to accept incoming proposals; attacks push it down,
 * accepted proposals push it up. All values tagged "Initial guess" per CLAUDE.md —
 * adjust after playtest.
 */
export const diplomacy = {
    // Clamp bounds (display range for alignment bars + AI threshold math).
    alignmentMin: -100,
    alignmentMax: 100,
    // Combat impact: a faction that loses 100 HP worth of units to another faction
    // shifts -2 alignment toward them at 0.02 per damage dealt.
    alignmentOnAttackDmgMult: 0.02,
    // Accepted proposals both increase alignment — the spec notes this as a trust
    // feedback loop. Declines hit both sides' alignment because the receiver
    // rejected an overture and the sender sees the rejection.
    alignmentOnOpenBordersAccept: 10,
    alignmentOnNonCombatAccept: 10,
    alignmentOnResourceAccept: 5,
    alignmentOnUnitRequestAccept: 15,
    alignmentOnDecline: -5,
    // AI Military archetype: accept when alignment toward sender is at least this
    // high. Lower = more agreeable; +40 is intentionally conservative so the
    // player has to invest diplomatic capital before treaties go through.
    aiAcceptThreshold: 40,
    // Owner-facing alert fires on crossing ±threshold in either direction.
    alertThreshold: 40,
};
//# sourceMappingURL=aiParameters.js.map