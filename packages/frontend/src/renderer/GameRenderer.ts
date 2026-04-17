// PixiJS renderer — game world only (map tiles, units, buildings, fog, effects).
// No UI elements drawn here. No React imports.

import { Application, Assets, Container, Sprite, Graphics, RenderTexture } from "pixi.js";
import type { Faction, GameStateSnapshot, TileSnapshot, FogSnapshot, EntitySnapshot } from "@neither/shared";
import { robotBuildingStats, wizardBuildingStats } from "@neither/shared";
import {
  terrainAssets,
  unitSpritePath,
  buildingSpritePath,
  robotUnitAssets,
  robotBuildingAssets,
  wizardUnitAssets,
  wizardBuildingAssets,
} from "./assets.js";

export const TILE_SIZE = 64; // pixels at zoom level 1.0

/** Four discrete zoom levels as per spec. */
export const ZOOM_LEVELS = [0.375, 0.75, 1.0, 1.5] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export type RendererConfig = {
  /** Called when the camera position changes (for UI sync). */
  onCameraChange?: (x: number, y: number, zoom: ZoomLevel) => void;
  onEntitySelect?: (id: string | null, kind: "unit" | "building" | null) => void;
  onMoveOrder?: (entityId: string, target: { x: number; y: number }) => void;
};

export class GameRenderer {
  private app: Application | null = null;
  private worldContainer: Container | null = null;
  private tileContainer: Container | null = null;
  private fogContainer: Container | null = null;
  private fogTexture: RenderTexture | null = null;
  private fogSprite: Sprite | null = null;
  private activeFaction: Faction = "wizards";

  private zoomIndex = 2; // default zoom 1.0
  private cameraX = 0;
  private cameraY = 0;

  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartCamX = 0;
  private dragStartCamY = 0;

  private entityContainer: Container | null = null;
  private entitySprites = new Map<string, Sprite>();
  private selectionGfx: Graphics | null = null;
  private lastEntities: EntitySnapshot[] = [];
  private selectedEntityId: string | null = null;
  private leftDownPos: { x: number; y: number } | null = null;

  private mapWidthTiles = 0;
  private mapHeightTiles = 0;
  private texturesLoaded = false;
  private initialized = false;
  private destroyed = false;

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
    if (this.destroyed) { this.app.destroy(true); return; }

    container.appendChild(this.app.canvas);

    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.tileContainer = new Container();
    this.worldContainer.addChild(this.tileContainer);

    this.entityContainer = new Container();
    this.worldContainer.addChild(this.entityContainer);

    this.fogContainer = new Container();
    this.worldContainer.addChild(this.fogContainer);

    this._attachInputHandlers();
    await this._preloadTerrainTextures();
    if (this.destroyed) return;

    this.initialized = true;
  }

  private async _preloadTerrainTextures(): Promise<void> {
    const allPaths = [
      ...Object.values(terrainAssets),
      ...Object.values(robotUnitAssets),
      ...Object.values(robotBuildingAssets),
      ...Object.values(wizardUnitAssets),
      ...Object.values(wizardBuildingAssets),
    ];
    await Promise.all(allPaths.map((path) => Assets.load(path).catch(() => null)));
    this.texturesLoaded = true;
  }

  render(state: GameStateSnapshot): void {
    if (!this.tileContainer || !this.texturesLoaded) return;
    this.lastEntities = state.entities;

    const tileCount = state.tiles.length;
    if (this.tileContainer.children.length !== tileCount) {
      this._buildTileLayer(state.tiles);
    }

    this._renderEntities(state.entities);
    this._renderFog(state.fog[this.activeFaction]);
    this._applyCamera();
  }

  setActiveFaction(faction: Faction): void {
    this.activeFaction = faction;
  }

  setSelectedEntity(id: string | null): void {
    this.selectedEntityId = id;
  }

  private _getFootprint(entity: EntitySnapshot): number {
    if (entity.kind !== "building") return 1;
    const stats =
      entity.faction === "wizards"
        ? wizardBuildingStats[entity.typeKey]
        : robotBuildingStats[entity.typeKey];
    return stats?.footprintTiles ?? 2;
  }

  private _createEntitySprite(entity: EntitySnapshot): Sprite {
    const path =
      entity.kind === "building"
        ? buildingSpritePath(entity.faction, entity.typeKey)
        : unitSpritePath(entity.faction, entity.typeKey);
    let sprite: Sprite;
    try {
      sprite = path ? Sprite.from(path) : new Sprite();
    } catch {
      sprite = new Sprite();
      sprite.tint = entity.faction === "wizards" ? 0xa855f7 : 0xeab308;
    }
    return sprite;
  }

  private _renderEntities(entities: EntitySnapshot[]): void {
    if (!this.entityContainer) return;

    if (!this.selectionGfx) {
      this.selectionGfx = new Graphics();
      this.entityContainer.addChild(this.selectionGfx);
    }

    // Add / update entity sprites
    const currentIds = new Set<string>();
    for (const entity of entities) {
      currentIds.add(entity.id);
      const fp = this._getFootprint(entity);

      let sprite = this.entitySprites.get(entity.id);
      if (!sprite) {
        sprite = this._createEntitySprite(entity);
        // Insert before selection gfx so the ring renders on top
        const ringIdx = this.entityContainer.children.indexOf(this.selectionGfx);
        this.entityContainer.addChildAt(sprite, ringIdx);
        this.entitySprites.set(entity.id, sprite);
      }

      sprite.x = entity.position.x * TILE_SIZE;
      sprite.y = entity.position.y * TILE_SIZE;
      sprite.width = fp * TILE_SIZE;
      sprite.height = fp * TILE_SIZE;
    }

    // Remove sprites for entities no longer in snapshot
    for (const [id, sprite] of this.entitySprites) {
      if (!currentIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
      }
    }

    // Redraw selection ring
    this.selectionGfx.clear();
    if (this.selectedEntityId) {
      const sel = entities.find((e) => e.id === this.selectedEntityId);
      if (sel) this._drawSelectionRing(sel);
    }
  }

  private _drawSelectionRing(entity: EntitySnapshot): void {
    if (!this.selectionGfx) return;
    const fp = this._getFootprint(entity);
    if (entity.kind === "unit") {
      const cx = (entity.position.x + 0.5) * TILE_SIZE;
      const cy = (entity.position.y + 0.5) * TILE_SIZE;
      this.selectionGfx
        .circle(cx, cy, TILE_SIZE * 0.44)
        .stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
    } else {
      const px = entity.position.x * TILE_SIZE - 2;
      const py = entity.position.y * TILE_SIZE - 2;
      const sz = fp * TILE_SIZE + 4;
      this.selectionGfx
        .rect(px, py, sz, sz)
        .stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
    }
  }

  private _renderFog(fog: FogSnapshot): void {
    if (!this.fogContainer || !this.app) return;

    const { width, height, data } = fog;
    const pixelW = width * TILE_SIZE;
    const pixelH = height * TILE_SIZE;

    // Create or recreate RenderTexture when map size changes
    if (!this.fogTexture || this.fogTexture.width !== pixelW || this.fogTexture.height !== pixelH) {
      this.fogTexture?.destroy(true);
      this.fogSprite?.destroy();
      this.fogTexture = RenderTexture.create({ width: pixelW, height: pixelH });
      this.fogSprite = new Sprite(this.fogTexture);
      this.fogContainer.removeChildren();
      this.fogContainer.addChild(this.fogSprite);
    }

    // Draw fog tiles onto RenderTexture
    const g = new Graphics();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = data[y * width + x];
        if (v === 2) continue; // VISIBLE — no overlay

        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (v === 0) {
          // UNEXPLORED — solid black
          g.rect(px, py, TILE_SIZE, TILE_SIZE).fill({ color: 0x000000, alpha: 1 });
        } else {
          // EXPLORED — semi-transparent dark overlay, desaturating the tile beneath
          g.rect(px, py, TILE_SIZE, TILE_SIZE).fill({ color: 0x050512, alpha: 0.65 });
        }
      }
    }

    this.app.renderer.render({ container: g, target: this.fogTexture, clear: true });
    g.destroy();
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
    canvas.addEventListener("pointerleave", this._onPointerLeave);
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
    if (e.button === 0) {
      this.leftDownPos = { x: e.clientX, y: e.clientY };
    } else if (e.button === 2) {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartCamX = this.cameraX;
      this.dragStartCamY = this.cameraY;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  private readonly _onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    this.cameraX = this.dragStartCamX - (e.clientX - this.dragStartX);
    this.cameraY = this.dragStartCamY - (e.clientY - this.dragStartY);
    this._applyCamera();
  };

  private readonly _onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0 && this.leftDownPos) {
      const dx = e.clientX - this.leftDownPos.x;
      const dy = e.clientY - this.leftDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < 5) {
        this._handleLeftClick(e.clientX, e.clientY);
      }
      this.leftDownPos = null;
    } else if (e.button === 2) {
      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (Math.sqrt(dx * dx + dy * dy) < 5) {
          // right-click (not drag) — move order
          this._handleRightClick(e.clientX, e.clientY);
        }
        this.isDragging = false;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }
    }
  };

  private readonly _onPointerLeave = (_e: PointerEvent): void => {
    if (this.isDragging) {
      this.isDragging = false;
    }
    this.leftDownPos = null;
  };

  private _screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const zoom = ZOOM_LEVELS[this.zoomIndex]!;
    return {
      x: (screenX + this.cameraX) / zoom,
      y: (screenY + this.cameraY) / zoom,
    };
  }

  private _hitTest(entity: EntitySnapshot, tileX: number, tileY: number): boolean {
    const fp = this._getFootprint(entity);
    if (fp === 1) {
      const cx = entity.position.x + 0.5;
      const cy = entity.position.y + 0.5;
      return (cx - tileX) ** 2 + (cy - tileY) ** 2 < 0.6 ** 2;
    }
    return (
      tileX >= entity.position.x &&
      tileX < entity.position.x + fp &&
      tileY >= entity.position.y &&
      tileY < entity.position.y + fp
    );
  }

  private _handleLeftClick(screenX: number, screenY: number): void {
    const world = this._screenToWorld(screenX, screenY);
    const tileX = world.x / TILE_SIZE;
    const tileY = world.y / TILE_SIZE;

    const hit = this.lastEntities.find((e) => this._hitTest(e, tileX, tileY)) ?? null;

    if (hit) {
      this.selectedEntityId = hit.id;
      this.config.onEntitySelect?.(hit.id, hit.kind);
    } else {
      this.selectedEntityId = null;
      this.config.onEntitySelect?.(null, null);
    }
  }

  private _handleRightClick(screenX: number, screenY: number): void {
    if (!this.selectedEntityId) return;
    const world = this._screenToWorld(screenX, screenY);
    const tileX = world.x / TILE_SIZE;
    const tileY = world.y / TILE_SIZE;
    this.config.onMoveOrder?.(this.selectedEntityId, { x: tileX, y: tileY });
  }

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
    this.destroyed = true;
    if (!this.initialized) {
      // init() is still in flight or never started — it will see destroyed=true and clean up
      return;
    }
    const canvas = this.app?.canvas as HTMLCanvasElement | undefined;
    if (canvas) {
      canvas.removeEventListener("contextmenu", this._onContextMenu);
      canvas.removeEventListener("wheel", this._onWheel);
      canvas.removeEventListener("pointerdown", this._onPointerDown);
      canvas.removeEventListener("pointermove", this._onPointerMove);
      canvas.removeEventListener("pointerup", this._onPointerUp);
      canvas.removeEventListener("pointerleave", this._onPointerLeave);
    }
    this.fogTexture?.destroy(true);
    this.fogTexture = null;
    for (const sprite of this.entitySprites.values()) sprite.destroy();
    this.entitySprites.clear();
    this.selectionGfx = null;
    this.app?.destroy(true);
    this.app = null;
  }
}
