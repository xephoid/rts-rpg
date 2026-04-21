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
    alertNearing: (faction: string, condition: string) =>
      `${faction} is nearing ${condition}!`,
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
    alertHide: (unitName: string, buildingName: string) => `${unitName} hid in ${buildingName}`,
    alertConverted: (unitName: string) => `${unitName} was captured and converted`,
    alertForcedOut: (unitName: string) => `${unitName} was forced out of cover`,
    alertTempControlled: (unitName: string) => `${unitName} is under temporary control`,
    alertTempControlExpired: (unitName: string) => `${unitName} is no longer under control`,
    alertDetected: (unitName: string) => `${unitName} has been spotted by an enemy detector`,
  },
} as const;
