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
};
//# sourceMappingURL=uiText.js.map