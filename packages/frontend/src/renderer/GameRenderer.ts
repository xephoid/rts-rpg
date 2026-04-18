// PixiJS renderer — game world only (map tiles, units, buildings, fog, effects).
// No UI elements drawn here. No React imports.

import { Application, Assets, Container, Sprite, Graphics, RenderTexture } from "pixi.js";
import type { Faction, GameStateSnapshot, TileSnapshot, FogSnapshot, EntitySnapshot, DepositSnapshot } from "@neither/shared";
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
  /** ids.length===0 → deselect; length===1 → single; length>1 → multi (always "unit") */
  onEntitySelect?: (ids: string[], kind: "unit" | "building" | null) => void;
  onMoveOrder?: (entityIds: string[], target: { x: number; y: number }) => void;
  onGatherOrder?: (unitIds: string[], depositId: string) => void;
  /** Called when a friendly unit right-clicks an enemy entity. */
  onAttackOrder?: (unitIds: string[], targetId: string) => void;
  /**
   * Called when a friendly unit right-clicks an allied entity.
   * TODO(phase-diplomacy): filter to units with talk capability before calling.
   */
  onTalkOrder?: (unitIds: string[], targetId: string) => void;
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

  // Right-click pan state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartCamX = 0;
  private dragStartCamY = 0;

  // Deposit lookup for context-smart right-click (keyed "x,y" → deposit)
  private lastDeposits = new Map<string, DepositSnapshot>();

  // Entity rendering
  private entityContainer: Container | null = null;
  private entitySprites = new Map<string, Sprite>();
  private selectionGfx: Graphics | null = null;
  private lastEntities: EntitySnapshot[] = [];
  private lastFog: FogSnapshot | null = null;
  private selectedIds = new Set<string>();

  // Left-click / rubber band state
  private leftDownPos: { x: number; y: number } | null = null;
  private rubberBandContainer: Container | null = null;
  private rubberBandGfx: Graphics | null = null;
  private rubberBandStart: { x: number; y: number } | null = null;
  private isDragSelecting = false;

  // Double-click detection
  private lastClickTime = 0;
  private lastClickEntityId: string | null = null;

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

    // Rubber band lives in screen-space on top of everything
    this.rubberBandContainer = new Container();
    this.rubberBandGfx = new Graphics();
    this.rubberBandContainer.addChild(this.rubberBandGfx);
    this.app.stage.addChild(this.rubberBandContainer);

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
    this.lastFog = state.fog[this.activeFaction];

    const tileCount = state.tiles.length;
    if (this.tileContainer.children.length !== tileCount) {
      this._buildTileLayer(state.tiles);
    }

    this.lastDeposits.clear();
    for (const d of state.deposits ?? []) {
      this.lastDeposits.set(`${d.position.x},${d.position.y}`, d);
    }
    this._renderEntities(state.entities);
    this._renderFog(this.lastFog);
    this._applyCamera();
  }

  setActiveFaction(faction: Faction): void {
    this.activeFaction = faction;
  }

  setSelectedIds(ids: string[]): void {
    this.selectedIds = new Set(ids);
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

      const fogVal = this._fogValueAt(entity.position.x, entity.position.y);
      sprite.visible = fogVal === 2 || (fogVal === 1 && entity.kind === "building");
    }

    // Remove sprites for entities no longer in snapshot
    for (const [id, sprite] of this.entitySprites) {
      if (!currentIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
      }
    }

    // Redraw selection rings for all selected entities
    this.selectionGfx.clear();
    for (const entity of entities) {
      if (this.selectedIds.has(entity.id)) {
        this._drawSelectionRing(entity);
      }
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
    const oldZoom = ZOOM_LEVELS[this.zoomIndex]!;
    const delta = e.deltaY > 0 ? -1 : 1;
    this.zoomIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, this.zoomIndex + delta));
    const newZoom = ZOOM_LEVELS[this.zoomIndex]!;

    if (oldZoom !== newZoom && this.app) {
      // Keep the screen center fixed in world space when zooming
      const screenW = this.app.screen.width;
      const screenH = this.app.screen.height;
      const worldX = (screenW / 2 + this.cameraX) / oldZoom;
      const worldY = (screenH / 2 + this.cameraY) / oldZoom;
      this.cameraX = worldX * newZoom - screenW / 2;
      this.cameraY = worldY * newZoom - screenH / 2;
    }

    this._applyCamera();
  };

  private readonly _onPointerDown = (e: PointerEvent): void => {
    if (e.button === 0) {
      this.leftDownPos = { x: e.clientX, y: e.clientY };
      this.rubberBandStart = { x: e.clientX, y: e.clientY };
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
    // Right-click pan
    if (this.isDragging) {
      this.cameraX = this.dragStartCamX - (e.clientX - this.dragStartX);
      this.cameraY = this.dragStartCamY - (e.clientY - this.dragStartY);
      this._applyCamera();
      return;
    }
    // Left-click rubber band
    if (this.leftDownPos !== null) {
      const dx = e.clientX - this.leftDownPos.x;
      const dy = e.clientY - this.leftDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        this.isDragSelecting = true;
        this._drawRubberBand(this.rubberBandStart!.x, this.rubberBandStart!.y, e.clientX, e.clientY);
      }
    }
  };

  private readonly _onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0 && this.leftDownPos) {
      if (this.isDragSelecting) {
        const units = this._entitiesInBox(this.rubberBandStart!, { x: e.clientX, y: e.clientY });
        this.selectedIds = new Set(units.map((u) => u.id));
        this.config.onEntitySelect?.(units.map((u) => u.id), "unit");
        this._clearRubberBand();
        this.isDragSelecting = false;
      } else {
        const dx = e.clientX - this.leftDownPos.x;
        const dy = e.clientY - this.leftDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) {
          this._handleLeftClick(e.clientX, e.clientY);
        }
      }
      this.leftDownPos = null;
      this.rubberBandStart = null;
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
    if (this.isDragSelecting) {
      this._clearRubberBand();
      this.isDragSelecting = false;
    }
    this.leftDownPos = null;
    this.rubberBandStart = null;
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
      const now = Date.now();
      const isDouble = now - this.lastClickTime < 300 && hit.id === this.lastClickEntityId;
      if (isDouble && hit.kind === "unit" && hit.faction === this.activeFaction) {
        const sameType = this.lastEntities.filter(
          (e) => e.kind === "unit" && e.faction === this.activeFaction && e.typeKey === hit.typeKey && this._isInViewport(e)
        );
        this.selectedIds = new Set(sameType.map((e) => e.id));
        this.config.onEntitySelect?.(sameType.map((e) => e.id), "unit");
      } else {
        this.selectedIds = new Set([hit.id]);
        this.config.onEntitySelect?.([hit.id], hit.kind);
      }
      this.lastClickTime = now;
      this.lastClickEntityId = hit.id;
    } else {
      this.selectedIds.clear();
      this.config.onEntitySelect?.([], null);
      this.lastClickEntityId = null;
    }
  }

  private _handleRightClick(screenX: number, screenY: number): void {
    if (this.selectedIds.size === 0) return;
    // Only issue orders to friendly units
    const friendlyIds = [...this.selectedIds].filter((id) => {
      const e = this.lastEntities.find((ent) => ent.id === id);
      return e?.kind === "unit" && e.faction === this.activeFaction;
    });
    if (friendlyIds.length === 0) return;
    const world = this._screenToWorld(screenX, screenY);
    const tileX = world.x / TILE_SIZE;
    const tileY = world.y / TILE_SIZE;

    // Context-smart right-click order priority:
    //   1. Enemy entity  → attack
    //   2. Ally entity   → talk
    //   3. Resource deposit → gather
    //   4. Empty space   → move
    // TODO(capabilities): each branch should filter friendlyIds to only units
    // that support that action (e.g. only gatherers gather, only charisma units talk).
    // Until capability filtering exists, all friendly units receive every order type
    // and the engine silently ignores orders the unit can't act on.

    const hitEntity = this.lastEntities.find((e) => this._hitTest(e, tileX, tileY));
    if (hitEntity && this._fogValueAt(hitEntity.position.x, hitEntity.position.y) === 2) {
      if (hitEntity.faction !== this.activeFaction) {
        this.config.onAttackOrder?.(friendlyIds, hitEntity.id);
      } else if (hitEntity.id !== [...this.selectedIds][0]) {
        this.config.onTalkOrder?.(friendlyIds, hitEntity.id);
      }
      return;
    }

    const tx = Math.floor(tileX);
    const ty = Math.floor(tileY);
    const hitDeposit = this.lastDeposits.get(`${tx},${ty}`);
    const depositVisible = hitDeposit && this._fogValueAt(tx, ty) === 2 ? hitDeposit : null;
    if (depositVisible) {
      this.config.onGatherOrder?.(friendlyIds, depositVisible.id);
      return;
    }

    this.config.onMoveOrder?.(friendlyIds, { x: tileX, y: tileY });
  }

  private _drawRubberBand(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.rubberBandGfx) return;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    this.rubberBandGfx.clear();
    this.rubberBandGfx
      .rect(minX, minY, w, h)
      .fill({ color: 0xffffff, alpha: 0.07 })
      .stroke({ color: 0xffffff, width: 1, alpha: 0.65 });
  }

  private _clearRubberBand(): void {
    this.rubberBandGfx?.clear();
  }

  private _fogValueAt(tileX: number, tileY: number): number {
    if (!this.lastFog) return 2; // no data yet — treat as visible
    const x = Math.floor(tileX);
    const y = Math.floor(tileY);
    const { width, height, data } = this.lastFog;
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return data[y * width + x] as number;
  }

  private _entitiesInBox(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): EntitySnapshot[] {
    const zoom = ZOOM_LEVELS[this.zoomIndex]!;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return this.lastEntities.filter((e) => {
      if (e.kind !== "unit" || e.faction !== this.activeFaction) return false;
      const sx = (e.position.x + 0.5) * TILE_SIZE * zoom - this.cameraX;
      const sy = (e.position.y + 0.5) * TILE_SIZE * zoom - this.cameraY;
      return sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;
    });
  }

  private _isInViewport(e: EntitySnapshot): boolean {
    if (!this.app) return false;
    const zoom = ZOOM_LEVELS[this.zoomIndex]!;
    const sx = (e.position.x + 0.5) * TILE_SIZE * zoom - this.cameraX;
    const sy = (e.position.y + 0.5) * TILE_SIZE * zoom - this.cameraY;
    return sx >= 0 && sx <= this.app.screen.width && sy >= 0 && sy <= this.app.screen.height;
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
    this.rubberBandGfx = null;
    this.rubberBandContainer = null;
    this.app?.destroy(true);
    this.app = null;
  }
}
