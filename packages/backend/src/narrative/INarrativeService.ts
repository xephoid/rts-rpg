// Abstraction layer for all LLM calls.
// Provider selected via LLM_PROVIDER env var: "ollama" | "claude"

export type GameStateSnapshot = {
  tick: number;
  faction: "wizards" | "robots";
  playerResources: { wood: number; water: number; mana: number };
  unitCount: number;
  buildingCount: number;
  diplomacyStates: Record<string, number>; // npcFactionId → alignment score
  recentEvents: string[]; // last 5 significant events
  activeObjectives: string[];
};

export type NarrativeRequest = {
  type: "dialogue" | "quest" | "namedCharacter";
  snapshot: GameStateSnapshot;
  context?: string; // additional context for this specific request
};

export type NarrativeResponse = {
  text: string;
  questReward?: QuestReward;
};

export type QuestReward = {
  type: "culturalProgress" | "resources" | "alignment" | "xp";
  value: number;
  targetFaction?: string;
};

export interface INarrativeService {
  generate(request: NarrativeRequest): Promise<NarrativeResponse>;
}
