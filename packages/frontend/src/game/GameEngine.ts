// Pure TypeScript game simulation engine.
// No imports from /renderer, /ui, or /store — push state out via callback.
// TODO: next step — implement tick loop, unit/building registries, event queues

import type { GameStateMirror } from "../store/gameStore.js";

export type GameEngineConfig = {
  onTick: (state: GameStateMirror) => void;
};

export class GameEngine {
  private running = false;
  private tick = 0;
  private readonly onTick: (state: GameStateMirror) => void;

  constructor({ onTick }: GameEngineConfig) {
    this.onTick = onTick;
  }

  start(): void {
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private loop(): void {
    if (!this.running) return;
    this.tick++;

    // TODO: next step — run simulation step (movement, combat, resource collection, events)

    this.onTick({
      tick: this.tick,
      resources: { wood: 150, water: 100, mana: 0 },
    });

    requestAnimationFrame(() => this.loop());
  }
}
