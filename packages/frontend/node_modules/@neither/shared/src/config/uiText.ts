// All user-facing strings: labels, messages, tooltips, victory/defeat copy.
// TODO: next step — expand with full tooltip strings and all ability descriptions.

export const uiText = {
  factions: {
    wizards: "Wizards",
    robots: "Robots",
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
    alertNearing: (faction: string, condition: string) =>
      `${faction} is nearing ${condition}!`,
  },
  fog: {
    unexplored: "Unexplored",
    explored: "Explored",
  },
} as const;
