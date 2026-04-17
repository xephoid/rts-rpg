// PixiJS renderer — game world only (map tiles, units, buildings, fog, effects).
// No UI elements drawn here. No React imports.

import { Application, Assets, Container, Sprite, Rectangle, Ticker } from "pixi.js";
import type { GameStateSnapshot, TileSnapshot } from "@neither/shared";
import { terrainAssets } from "./assets.js";

export const TILE_SIZE = 64; // pixels at zoom level 1.0

/** Four discrete zoom levels as per spec. */
export const ZOOM_LEVELS = [0.375, 0.75, 1.0, 1.5] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export type RendererConfig = {
  /** Called when the camera position changes (for UI sync). */
  onCameraChange?: (x: number, y: number, zoom: ZoomLevel) => void;
};

export class GameRenderer {
  private app: Application | null = null;
  private worldContainer: Container | null = null;
  private tileContainer: Container | null = null;

  private zoomIndex = 2; // default zoom 1.0
  private cameraX = 0;
  private cameraY = 0;

  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartCamX = 0;
  private dragStartCamY = 0;

  private mapWidthTiles = 0;
  private mapHeightTiles = 0;
  private texturesLoaded = false;
  private initialized = false;

  private readonly config: RendererConfig;

  constructor(config: RendererConfig = {}) {
    this.config = config;
  }

  async init(container: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      resizeTo: container,
      backgroundColor: 0x0e0a0f,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    container.appendChild(this.app.canvas);

    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.tileContainer = new Container();
    this.worldContainer.addChild(this.tileContainer);

    this._attachInputHandlers();
    await this._preloadTerrainTextures();
    this.initialized = true;
  }

  private async _preloadTerrainTextures(): Promise<void> {
    const entries = Object.entries(terrainAssets);
    await Promise.all(entries.map(([, path]) => Assets.load(path).catch(() => null)));
    this.texturesLoaded = true;
  }

  render(state: GameStateSnapshot): void {
    if (!this.tileContainer || !this.texturesLoaded) return;

    // Only rebuild tile sprites when the map changes (first render or map size change)
    const tileCount = state.tiles.length;
    if (this.tileContainer.children.length !== tileCount) {
      this._buildTileLayer(state.tiles);
    }

    this._applyCamera();
  }

  private _buildTileLayer(tiles: TileSnapshot[]): void {
    if (!this.tileContainer) return;
    this.tileContainer.removeChildren();

    for (const tile of tiles) {
      const texturePath = this._terrainTexturePath(tile);
      let sprite: Sprite;
      try {
        sprite = Sprite.from(texturePath);
      } catch {
        // Texture not loaded — use a fallback colored rect via tint on empty sprite
        sprite = new Sprite();
        sprite.tint = this._terrainFallbackColor(tile.terrain);
        sprite.width = TILE_SIZE;
        sprite.height = TILE_SIZE;
      }
      sprite.x = tile.x * TILE_SIZE;
      sprite.y = tile.y * TILE_SIZE;
      sprite.width = TILE_SIZE;
      sprite.height = TILE_SIZE;
      this.tileContainer.addChild(sprite);
    }

    // Track map bounds for camera clamping
    if (tiles.length > 0) {
      const maxX = Math.max(...tiles.map((t) => t.x));
      const maxY = Math.max(...tiles.map((t) => t.y));
      this.mapWidthTiles = maxX + 1;
      this.mapHeightTiles = maxY + 1;
    }
  }

  private _terrainTexturePath(tile: TileSnapshot): string {
    switch (tile.terrain) {
      case "forest":
        return terrainAssets["forestDeciduous"]!;
      case "water":
        return terrainAssets["waterDeep"]!;
      default:
        return terrainAssets["grass"]!;
    }
  }

  private _terrainFallbackColor(terrain: string): number {
    switch (terrain) {
      case "forest":
        return 0x2d5a1b;
      case "water":
        return 0x1a3a6e;
      default:
        return 0x4a7a3a;
    }
  }

  private _applyCamera(): void {
    if (!this.worldContainer || !this.app) return;
    const zoom = ZOOM_LEVELS[this.zoomIndex]!;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const worldW = this.mapWidthTiles * TILE_SIZE * zoom;
    const worldH = this.mapHeightTiles * TILE_SIZE * zoom;

    // Clamp camera so the world fills the screen when possible
    const maxCamX = Math.max(0, worldW - screenW);
    const maxCamY = Math.max(0, worldH - screenH);
    this.cameraX = Math.max(0, Math.min(this.cameraX, maxCamX));
    this.cameraY = Math.max(0, Math.min(this.cameraY, maxCamY));

    this.worldContainer.scale.set(zoom);
    this.worldContainer.x = -this.cameraX;
    this.worldContainer.y = -this.cameraY;

    this.config.onCameraChange?.(this.cameraX, this.cameraY, zoom);
  }

  // ── Input handlers ──────────────────────────────────────────────────────────

  private _attachInputHandlers(): void {
    const canvas = this.app!.canvas as HTMLCanvasElement;

    canvas.addEventListener("contextmenu", this._onContextMenu);
    canvas.addEventListener("wheel", this._onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerup", this._onPointerUp);
    canvas.addEventListener("pointerleave", this._onPointerUp);
  }

  private readonly _onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private readonly _onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    this.zoomIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, this.zoomIndex + delta));
    this._applyCamera();
  };

  private readonly _onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 2) return; // right-drag to pan
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartCamX = this.cameraX;
    this.dragStartCamY = this.cameraY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  private readonly _onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    this.cameraX = this.dragStartCamX - (e.clientX - this.dragStartX);
    this.cameraY = this.dragStartCamY - (e.clientY - this.dragStartY);
    this._applyCamera();
  };

  private readonly _onPointerUp = (e: PointerEvent): void => {
    if (this.isDragging) {
      this.isDragging = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  // ── Public controls ─────────────────────────────────────────────────────────

  setZoom(zoomLevel: ZoomLevel): void {
    const idx = ZOOM_LEVELS.indexOf(zoomLevel);
    if (idx !== -1) {
      this.zoomIndex = idx;
      this._applyCamera();
    }
  }

  setCameraPosition(x: number, y: number): void {
    this.cameraX = x;
    this.cameraY = y;
    this._applyCamera();
  }

  get currentZoom(): ZoomLevel {
    return ZOOM_LEVELS[this.zoomIndex]!;
  }

  destroy(): void {
    if (!this.initialized) {
      // init() never completed — PixiJS internals are not set up, nothing to tear down
      this.app = null;
      return;
    }
    const canvas = this.app?.canvas as HTMLCanvasElement | undefined;
    if (canvas) {
      canvas.removeEventListener("contextmenu", this._onContextMenu);
      canvas.removeEventListener("wheel", this._onWheel);
      canvas.removeEventListener("pointerdown", this._onPointerDown);
      canvas.removeEventListener("pointermove", this._onPointerMove);
      canvas.removeEventListener("pointerup", this._onPointerUp);
      canvas.removeEventListener("pointerleave", this._onPointerUp);
    }
    this.app?.destroy(true);
    this.app = null;
  }
}
