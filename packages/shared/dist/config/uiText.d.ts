export declare const uiText: {
    readonly factions: {
        readonly wizards: "Wizards";
        readonly robots: "Robots";
    };
    readonly factionTaglines: {
        readonly wizards: "Masters of mana and ancient magic.";
        readonly robots: "Built for efficiency. Engineered to last.";
    };
    readonly resources: {
        readonly wood: "Wood";
        readonly water: "Water";
        readonly mana: "Mana";
    };
    readonly victory: {
        readonly military: "Military Victory";
        readonly cultural: "Cultural Victory";
        readonly technological: "Technological Victory";
        readonly youWin: "Victory!";
        readonly youLose: "Defeat.";
        readonly alertNearing: (faction: string, condition: string) => string;
    };
    readonly fog: {
        readonly unexplored: "Unexplored";
        readonly explored: "Explored";
    };
    readonly spy: {
        readonly invisibilityOn: "Invisibility";
        readonly invisibilityOff: "Drop Invisibility";
        readonly disguise: "Disguise";
        readonly dropDisguise: "Drop Disguise";
        readonly pickDisguise: "Pick a unit to disguise as";
        readonly hide: "Hide";
        readonly leaveHiding: "Leave Building";
        readonly infiltrate: "Infiltrate";
        readonly attackOccupant: "Attack Occupant";
        readonly alertHide: (unitName: string, buildingName: string) => string;
        readonly alertConverted: (unitName: string) => string;
        readonly alertForcedOut: (unitName: string) => string;
        readonly alertTempControlled: (unitName: string) => string;
        readonly alertTempControlExpired: (unitName: string) => string;
        readonly alertDetected: (unitName: string) => string;
    };
};
//# sourceMappingURL=uiText.d.ts.map