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
  diplomacy: {
    panelHeader: "Diplomacy",
    alignmentLabel: "Alignment",
    activeAgreements: "Active Agreements",
    openBordersLabel: "Open Borders",
    nonCombatTreatyLabel: "Non-Combat Treaty",
    incomingProposals: "Incoming Proposals",
    outgoingActions: "Propose to",
    proposeOpenBorders: "Propose Open Borders",
    proposeNonCombat: "Propose Non-Combat Treaty",
    proposeResourceRequest: "Request Resources",
    proposeUnitRequest: "Request Unit",
    accept: "Accept",
    decline: "Decline",
    alertProposalReceived: (from: string, kind: string) => `${from} proposes ${kind}`,
    alertProposalAccepted: (other: string, kind: string) => `${other} accepted ${kind}`,
    alertProposalDeclined: (other: string, kind: string) => `${other} declined ${kind}`,
    alertOpenBorders: (other: string) => `Open Borders with ${other}`,
    alertNonCombat: (other: string) => `Non-Combat Treaty with ${other}`,
    alertResourceTransfer: (other: string, amt: number, kind: string) =>
      `Received ${amt} ${kind} from ${other}`,
    alertUnitTransfer: (other: string, unitName: string) =>
      `${other} gave us ${unitName}`,
    alertAlignmentHigh: (other: string) => `${other} is now friendly toward us`,
    alertAlignmentLow: (other: string) => `${other} is now hostile toward us`,
    alertFirstContact: (other: string) => `First contact: ${other}. Diplomatic relations are now open.`,
    unmetNotice: "You have not yet met this faction.",
  },
} as const;
