// All user-facing strings: labels, messages, tooltips, victory/defeat copy.
// TODO: next step — expand with full tooltip strings and all ability descriptions.
export const uiText = {
    factions: {
        wizards: "Wizards",
        robots: "Robots",
    },
    factionTaglines: {
        wizards: "Masters of mana and ancient magic.",
        robots: "Built for efficiency. Engineered to last.",
    },
    resources: {
        wood: "Wood",
        water: "Water",
        mana: "Mana",
    },
    victory: {
        military: "Military Victory",
        cultural: "Cultural Victory",
        technological: "Technological Victory",
        youWin: "Victory!",
        youLose: "Defeat.",
        alertNearing: (faction, condition) => `${faction} is nearing ${condition}!`,
    },
    fog: {
        unexplored: "Unexplored",
        explored: "Explored",
    },
    spy: {
        invisibilityOn: "Invisibility",
        invisibilityOff: "Drop Invisibility",
        disguise: "Disguise",
        dropDisguise: "Drop Disguise",
        pickDisguise: "Pick a unit to disguise as",
        hide: "Hide",
        leaveHiding: "Leave Building",
        infiltrate: "Infiltrate",
        attackOccupant: "Attack Occupant",
        alertHide: (unitName, buildingName) => `${unitName} hid in ${buildingName}`,
        alertConverted: (unitName) => `${unitName} was captured and converted`,
        alertForcedOut: (unitName) => `${unitName} was forced out of cover`,
        alertTempControlled: (unitName) => `${unitName} is under temporary control`,
        alertTempControlExpired: (unitName) => `${unitName} is no longer under control`,
        alertDetected: (unitName) => `${unitName} detected a concealed enemy`,
    },
};
//# sourceMappingURL=uiText.js.map