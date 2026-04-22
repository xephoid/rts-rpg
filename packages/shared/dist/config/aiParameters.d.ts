export declare const aiParameters: {
    reactionIntervalTicks: number;
    aggressionThreshold: number;
    gatheringBaseline: number;
};
export type FactionAlignment = {
    towardWizards: number;
    towardRobots: number;
};
export declare const npcStartingAlignment: Record<string, FactionAlignment>;
/**
 * Phase 14 diplomacy tunables. Alignment is a −100 .. +100 float the AI consults
 * when deciding whether to accept incoming proposals; attacks push it down,
 * accepted proposals push it up. All values tagged "Initial guess" per CLAUDE.md —
 * adjust after playtest.
 */
export declare const diplomacy: {
    alignmentMin: number;
    alignmentMax: number;
    alignmentOnAttackDmgMult: number;
    alignmentOnOpenBordersAccept: number;
    alignmentOnNonCombatAccept: number;
    alignmentOnResourceAccept: number;
    alignmentOnUnitRequestAccept: number;
    alignmentOnDecline: number;
    aiAcceptThreshold: number;
    alertThreshold: number;
};
//# sourceMappingURL=aiParameters.d.ts.map