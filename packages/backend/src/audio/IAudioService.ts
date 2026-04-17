// Abstraction layer for all audio.
// Start with HowlerProvider — interface designed to swap to FMOD if needed.

export type AudioEvent =
  | "unit_attack"
  | "unit_death"
  | "building_complete"
  | "resource_low"
  | "victory"
  | "defeat"
  | "diplomacy_positive"
  | "diplomacy_negative";

export type MusicState =
  | "menu"
  | "peaceful"
  | "tension"
  | "combat"
  | "victory"
  | "defeat";

export interface IAudioService {
  play(event: AudioEvent): void;
  stop(): void;
  setMusicState(state: MusicState): void;
}
