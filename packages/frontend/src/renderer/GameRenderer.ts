// PixiJS renderer — game world only (map tiles, units, buildings, fog, effects).
// No UI elements drawn here. No React imports.
// TODO: next step — initialize Application, set up layers, implement fog of war 3-state render

import { Application } from "pixi.js";
import type { GameStateMirror } from "../store/gameStore.js";

export class GameRenderer {
  private app: Application | null = null;

  async init(container: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      resizeTo: container,
      backgroundColor: 0x0e0a0f,
      antialias: false,
    });
    container.appendChild(this.app.canvas);
  }

  render(_state: GameStateMirror): void {
    // TODO: next step — update sprites, fog polygons, unit positions from state
  }

  destroy(): void {
    this.app?.destroy(true);
    this.app = null;
  }
}
