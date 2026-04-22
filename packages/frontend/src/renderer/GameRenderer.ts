// PixiJS renderer — game world only (map tiles, units, buildings, fog, effects).
// No UI elements drawn here. No React imports.

import { Application, Assets, Container, Sprite, Graphics, RenderTexture } from "pixi.js";
import type { Faction, GameStateSnapshot, TileSnapshot, FogSnapshot, EntitySnapshot, DepositSnapshot, AttackEvent, SpellEvent } from "@neither/shared";
import { robotBuildingStats, wizardBuildingStats, robotUnitStats, wizardUnitStats, buildingRequiresAdjacentWater } from "@neither/shared";
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

const ROBOT_PLATFORM_TYPES = new Set([
  "waterCollectionPlatform", "woodChopperPlatform", "movableBuildKitPlatform",
  "spinnerPlatform", "spitterPlatform", "infiltrationPlatform",
  "largeCombatPlatform", "probePlatform", "wallPlatform",
]);
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
  onFollowOrder?: (unitIds: string[], targetId: string) => void;
  /** Called when user confirms a build placement (left-click in build mode). */
  onBuildOrder?: (tileX: number, tileY: number) => void;
  /** Called when a builder right-clicks a friendly under-construction building. */
  onResumeConstructionOrder?: (unitIds: string[], buildingId: string) => void;
  /** Called when an unattached Core right-clicks a friendly idle platform. */
  onAttachOrder?: (coreId: string, platformId: string) => void;
  /** Called when an evoker/archmage right-clicks a friendly unoccupied Wizard Tower. */
  onGarrisonOrder?: (unitId: string, towerId: string) => void;
  /** Called when a free Core right-clicks a friendly Immobile Combat Platform below capacity. */
  onEnterPlatformOrder?: (coreId: string, platformId: string) => void;
  /** Called when a hideable friendly unit right-clicks a friendly Cottage / Recharge Station. */
  onHideOrder?: (unitId: string, buildingId: string) => void;
  /** Called when a spy (Illusionist / Infiltration Platform) right-clicks an enemy Cottage / Recharge Station. */
  onInfiltrateOrder?: (spyId: string, buildingId: string) => void;
  /** Called when user clicks a unit while a unit-targeted spell is pending. */
  onSpellTargetUnit?: (casterId: string, spellKind: string, targetId: string) => void;
  /** Called when user clicks a ground tile while a ground-targeted spell is pending. */
  onSpellTargetGround?: (casterId: string, spellKind: string, tilePos: { x: number; y: number }) => void;
};

export class GameRenderer {
  private app: Application | null = null;
  private worldContainer: Container | null = null;
  private tileContainer: Container | null = null;
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
  /** Tracks "faction:typeKey" currently rendered per entity id. When disguise flips the
   *  rendered identity for opponents, mismatch triggers sprite rebuild so we don't
   *  leak the cached robot/wizard sprite across a viewer swap. */
  private spriteKeyCache = new Map<string, string>();
  private selectionGfx: Graphics | null = null;
  private lastEntities: EntitySnapshot[] = [];
  /** Per-viewer reveal set from the last tick — used by hit-tests to hide enemy
   *  invisibility/disguise from selection + right-click target routing. */
  private lastDetectedIds = new Set<string>();
  private lastFog: FogSnapshot | null = null;
  private selectedIds = new Set<string>();
  // Projectile + hit-flash effects
  private projectileContainer: Container | null = null;
  private liveProjectiles: Array<{
    gfx: Graphics;
    fromX: number; fromY: number;
    toX: number; toY: number;
    startTick: number;
    durationTicks: number;
    targetId: string;
  }> = [];
  private liveAreaEffects: Array<{
    gfx: Graphics;
    x: number; y: number;
    startTick: number;
    durationTicks: number;
    maxRadius: number;
    color: number;
  }> = [];
  /** endTick + color for temporary flash overrides (hit-flash, spell cast confirm). */
  private flashEndTick = new Map<string, { endTick: number; color: number }>();
  private renderTick = 0;

  // Territory boundary
  private territoryGfx: Graphics | null = null;
  private _territoryCacheKey = "";
  private _territorySegments = new Map<Faction, Array<{ x1: number; y1: number; x2: number; y2: number }>>();

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

  // Viewport-culled tile sprites
  private tileSprites = new Map<string, Sprite>(); // key: "x,y"
  private _allTiles: TileSnapshot[] = [];
  private _lastViewportBounds = { x0: -1, y0: -1, x1: -1, y1: -1 };

  // Build mode ghost state
  private ghostContainer: Container | null = null;
  private buildMode: { typeKey: string; footprintTiles: number; faction: "wizards" | "robots" } | null = null;

  // Spell targeting mode
  private spellMode: { kind: string; casterId: string } | null = null;
  private ghostTileX = 0;
  private ghostTileY = 0;
  private lastTiles = new Map<string, TileSnapshot>();

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

    this.territoryGfx = new Graphics();
    this.territoryGfx.zIndex = 1;
    this.worldContainer.addChild(this.territoryGfx);

    this.entityContainer = new Container();
    this.entityContainer.sortableChildren = true;
    this.worldContainer.addChild(this.entityContainer);

    this.projectileContainer = new Container();
    this.worldContainer.addChild(this.projectileContainer);

    // Ghost placement overlay — in world space, above entities
    this.ghostContainer = new Container();
    this.worldContainer.addChild(this.ghostContainer);

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

    // Auto-switch selection: if selected entity became a shell (Core entered platform), select the platform
    for (const id of [...this.selectedIds]) {
      const entity = state.entities.find((e) => e.id === id);
      if (entity?.isShell) {
        const platform = state.entities.find((e) => e.attachedCoreId === id);
        if (platform) {
          this.selectedIds = new Set([platform.id]);
          this.config.onEntitySelect?.([platform.id], "unit");
        } else {
          this.selectedIds.delete(id);
          this.config.onEntitySelect?.([], null);
        }
      }
    }

    // Record map dimensions on first render; update lastTiles every tick so
    // terrain changes (e.g. forest→open when wood depleted) are reflected.
    if (this._allTiles.length === 0 && state.tiles.length > 0) {
      this._allTiles = state.tiles;
      let maxX = 0, maxY = 0;
      for (const t of state.tiles) {
        if (t.x > maxX) maxX = t.x;
        if (t.y > maxY) maxY = t.y;
      }
      this.mapWidthTiles = maxX + 1;
      this.mapHeightTiles = maxY + 1;
    }
    // Detect terrain changes and evict stale sprites so they get recreated
    for (const t of state.tiles) {
      const key = `${t.x},${t.y}`;
      const prev = this.lastTiles.get(key);
      if (prev && prev.terrain !== t.terrain) {
        const sprite = this.tileSprites.get(key);
        if (sprite) {
          if (sprite.parent) sprite.parent.removeChild(sprite);
          sprite.destroy();
          this.tileSprites.delete(key);
        }
        this._lastViewportBounds = { x0: -1, y0: -1, x1: -1, y1: -1 }; // force rebuild
      }
      this.lastTiles.set(key, t);
    }
    this._updateViewportTiles();

    this.lastDeposits.clear();
    for (const d of state.deposits ?? []) {
      this.lastDeposits.set(`${d.position.x},${d.position.y}`, d);
    }

    this._processAttackEffects(state.attacks ?? []);
    this._processSpellEffects(state.spells ?? []);
    this.lastDetectedIds = new Set(state.detectedIds[this.activeFaction] ?? []);
    this._renderEntities(state.entities, this.lastDetectedIds);
    this._updateTerritoryBoundary(state.entities);
    this._renderFog(this.lastFog);
    this._applyCamera();
    this.renderTick++;
  }

  setActiveFaction(faction: Faction): void {
    this.activeFaction = faction;
  }

  setSelectedIds(ids: string[]): void {
    this.selectedIds = new Set(ids);
  }

  private _updateTerritoryBoundary(entities: EntitySnapshot[]): void {
    if (!this.territoryGfx) return;

    const buildings = entities.filter((e) => e.kind === "building" && e.buildingState !== "underConstruction");
    const cacheKey = buildings.map((b) => b.id).sort().join(",");
    if (cacheKey !== this._territoryCacheKey) {
      this._territoryCacheKey = cacheKey;
      this._territorySegments.clear();

      for (const faction of ["wizards", "robots"] as const) {
        const factionBuildings = buildings.filter((b) => b.faction === faction);
        const territory = new Set<string>();

        for (const b of factionBuildings) {
          const fp = this._getFootprint(b);
          for (let dy = 0; dy < fp; dy++) {
            for (let dx = 0; dx < fp; dx++) {
              const tx = b.position.x + dx;
              const ty = b.position.y + dy;
              // Expand 1 tile in all 8 directions
              for (let ey = -1; ey <= 1; ey++) {
                for (let ex = -1; ex <= 1; ex++) {
                  territory.add(`${tx + ex},${ty + ey}`);
                }
              }
            }
          }
        }

        const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
        const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
        // edge offsets for each direction: top, right, bottom, left
        const EDGES = [
          { x1: 0, y1: 0, x2: 1, y2: 0 },
          { x1: 1, y1: 0, x2: 1, y2: 1 },
          { x1: 0, y1: 1, x2: 1, y2: 1 },
          { x1: 0, y1: 0, x2: 0, y2: 1 },
        ] as const;

        for (const key of territory) {
          const [tx, ty] = key.split(",").map(Number) as [number, number];
          for (let i = 0; i < 4; i++) {
            const [nx, ny] = [tx + DIRS[i]![0], ty + DIRS[i]![1]];
            if (!territory.has(`${nx},${ny}`)) {
              const e = EDGES[i]!;
              segments.push({ x1: tx + e.x1, y1: ty + e.y1, x2: tx + e.x2, y2: ty + e.y2 });
            }
          }
        }
        this._territorySegments.set(faction, segments);
      }
    }

    // Redraw from cached segments every tick
    this.territoryGfx.clear();
    const fog = this.lastFog;
    for (const [faction, segments] of this._territorySegments) {
      const color = faction === "wizards" ? 0xa855f7 : 0xeab308;
      const isOwn = faction === this.activeFaction;
      for (const seg of segments) {
        // Opposing territory only visible where explored
        if (!isOwn && fog) {
          const midX = Math.floor((seg.x1 + seg.x2) / 2);
          const midY = Math.floor((seg.y1 + seg.y2) / 2);
          const idx = midY * (fog.width ?? this.mapWidthTiles) + midX;
          if (!fog.data[idx]) continue;
        }
        this.territoryGfx
          .moveTo(seg.x1 * TILE_SIZE, seg.y1 * TILE_SIZE)
          .lineTo(seg.x2 * TILE_SIZE, seg.y2 * TILE_SIZE)
          .stroke({ color, width: 2, alpha: 0.75 });
      }
    }
  }

  private _getFootprint(entity: EntitySnapshot): number {
    if (entity.kind === "building") {
      const stats =
        entity.faction === "wizards"
          ? wizardBuildingStats[entity.typeKey]
          : robotBuildingStats[entity.typeKey];
      return stats?.footprintTiles ?? 2;
    }
    const unitStats =
      entity.faction === "wizards"
        ? wizardUnitStats[entity.typeKey]
        : robotUnitStats[entity.typeKey];
    return unitStats?.footprintTiles ?? 1;
  }

  /** True while a unit is tucked inside a container (tower, platform, cottage, etc.)
   *  and must not appear in any selection, hit-test, or right-click routing. */
  private _isInsideContainer(e: EntitySnapshot): boolean {
    if (e.kind !== "unit") return false;
    return !!(e.isShell || e.garrisoned || e.inPlatform || e.hidden || e.inEnemyBuilding);
  }

  /** An enemy unit that is invisible and NOT in our detector-reveal set is unclickable
   *  — prevents the viewer from right-click-targeting a unit they can't legitimately
   *  see. Own-faction units are always clickable; enemy disguised units remain clickable
   *  as their displayed identity (attack order will route to the real entity). */
  private _isHitVisible(e: EntitySnapshot): boolean {
    if (e.kind !== "unit") return true;
    if (e.faction === this.activeFaction) return true;
    if (e.invisible && !this.lastDetectedIds.has(e.id)) return false;
    return true;
  }

  private _createEntitySprite(entity: EntitySnapshot): Sprite {
    return this._createEntitySpriteFor(entity.faction, entity.typeKey, entity);
  }

  /** Like `_createEntitySprite` but lets the caller override the displayed faction /
   *  typeKey (used for Infiltration Platform disguise, where opponents see the spy
   *  as one of their own units). Fallback tint uses the *displayed* faction so a
   *  missing sprite still shows the right team colour. */
  private _createEntitySpriteFor(displayFaction: Faction, displayTypeKey: string, entity: EntitySnapshot): Sprite {
    const path =
      entity.kind === "building"
        ? buildingSpritePath(displayFaction, displayTypeKey)
        : unitSpritePath(displayFaction, displayTypeKey);
    let sprite: Sprite;
    try {
      sprite = path ? Sprite.from(path) : new Sprite();
    } catch {
      sprite = new Sprite();
      sprite.tint = displayFaction === "wizards" ? 0xa855f7 : 0xeab308;
    }
    return sprite;
  }

  private _entityCenter(entityId: string, fallbackPos: { x: number; y: number }): { x: number; y: number } {
    const entity = this.lastEntities.find((e) => e.id === entityId);
    const pos = entity ? entity.position : fallbackPos;
    // Buildings anchor at top-left of their fp×fp footprint, so center = pos + fp/2.
    // Units occupy a 1×1 collision tile regardless of rendered footprint (the sprite
    // is centered on tile-centre for fp > 1), so center = pos + 0.5 always.
    if (entity && entity.kind === "unit") {
      return { x: (pos.x + 0.5) * TILE_SIZE, y: (pos.y + 0.5) * TILE_SIZE };
    }
    const fp = entity ? this._getFootprint(entity) : 1;
    return { x: (pos.x + fp / 2) * TILE_SIZE, y: (pos.y + fp / 2) * TILE_SIZE };
  }

  private _processAttackEffects(attacks: AttackEvent[]): void {
    if (!this.projectileContainer) return;

    // Spawn new effects for this tick's attacks
    for (const atk of attacks) {
      if (!atk.ranged) {
        this.flashEndTick.set(atk.targetId, { endTick: this.renderTick + 4, color: 0xff4444 });
      } else {
        const from = this._entityCenter(atk.attackerId, atk.attackerPos);
        const to = this._entityCenter(atk.targetId, atk.targetPos);
        const gfx = new Graphics();
        gfx.circle(0, 0, 5).fill({ color: 0xffffff });
        this.projectileContainer.addChild(gfx);
        this.liveProjectiles.push({
          gfx,
          fromX: from.x,
          fromY: from.y,
          toX: to.x,
          toY: to.y,
          startTick: this.renderTick,
          durationTicks: 18,
          targetId: atk.targetId,
        });
      }
    }

    // Advance live projectiles
    this.liveProjectiles = this.liveProjectiles.filter((p) => {
      const elapsed = this.renderTick - p.startTick;
      const t = Math.min(elapsed / p.durationTicks, 1);
      p.gfx.x = p.fromX + (p.toX - p.fromX) * t;
      p.gfx.y = p.fromY + (p.toY - p.fromY) * t;
      if (t >= 1) {
        this.flashEndTick.set(p.targetId, { endTick: this.renderTick + 4, color: 0xff4444 });
        p.gfx.destroy();
        return false;
      }
      return true;
    });
  }

  private _processSpellEffects(spells: SpellEvent[]): void {
    if (!this.projectileContainer) return;

    for (const spell of spells) {
      if (spell.kind === "iceBlast") {
        // Cyan travelling projectile
        const from = this._entityCenter(spell.casterId, spell.casterPos);
        const to = this._entityCenter(spell.targetId ?? "", spell.targetPos);
        const gfx = new Graphics();
        gfx.circle(0, 0, 6).fill({ color: 0x60a5fa });
        this.projectileContainer.addChild(gfx);
        this.liveProjectiles.push({ gfx, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, startTick: this.renderTick, durationTicks: 20, targetId: spell.targetId ?? "" });
        // Override arrival flash to blue for ice hit
        // (handled below when projectile lands)
      } else if (spell.kind === "fieryExplosion") {
        // Orange expanding ring at target tile
        const cx = (spell.targetPos.x + 0.5) * TILE_SIZE;
        const cy = (spell.targetPos.y + 0.5) * TILE_SIZE;
        const gfx = new Graphics();
        this.projectileContainer.addChild(gfx);
        this.liveAreaEffects.push({ gfx, x: cx, y: cy, startTick: this.renderTick, durationTicks: 20, maxRadius: TILE_SIZE * 2.5, color: 0xf97316 });
      } else if (spell.kind === "enlarge") {
        // Brief gold flash on target
        if (spell.targetId) this.flashEndTick.set(spell.targetId, { endTick: this.renderTick + 6, color: 0xfbbf24 });
      } else if (spell.kind === "reduce") {
        // Brief grey flash on target
        if (spell.targetId) this.flashEndTick.set(spell.targetId, { endTick: this.renderTick + 6, color: 0x9ca3af });
      }
    }

    // Advance area effects (expanding + fading ring)
    this.liveAreaEffects = this.liveAreaEffects.filter((ae) => {
      const elapsed = this.renderTick - ae.startTick;
      const t = Math.min(elapsed / ae.durationTicks, 1);
      const radius = ae.maxRadius * t;
      const alpha = 1 - t;
      ae.gfx.clear();
      ae.gfx.x = ae.x;
      ae.gfx.y = ae.y;
      ae.gfx.circle(0, 0, radius).stroke({ color: ae.color, width: 3, alpha });
      if (t >= 1) { ae.gfx.destroy(); return false; }
      return true;
    });
  }

  /** Persistent tint for a unit based on active status effects. Priority: slowed > enlarged > reduced > mana shield > none. */
  private _baseTint(entity: EntitySnapshot): number {
    if (entity.kind !== "unit") return 0xffffff;
    if (entity.slowed) return 0x60a5fa;       // ice blue
    if (entity.enlarged) return 0xfbbf24;     // gold
    if (entity.reduced) return 0x9ca3af;      // grey
    if (entity.manaShielded) return 0xa78bfa; // purple
    return 0xffffff;
  }

  private _renderEntities(entities: EntitySnapshot[], detectedIds: Set<string>): void {
    if (!this.entityContainer) return;

    if (!this.selectionGfx) {
      this.selectionGfx = new Graphics();
      this.selectionGfx.zIndex = 10;
      this.entityContainer.addChild(this.selectionGfx);
    }

    // Add / update entity sprites
    const currentIds = new Set<string>();
    for (const entity of entities) {
      // Skip units tucked inside a container (tower garrison, mobile-platform Core,
      // ICP occupancy, Cottage/Recharge Station hiders, Infiltration Platform inside
      // an enemy building). They're unselectable, unhittable, and have no sprite.
      if (this._isInsideContainer(entity)) continue;

      // Spy visibility filter — opposing faction:
      //   invisible illusionist not in detector reveal set → skip rendering entirely.
      //   disguised infiltrator not in detector reveal set → render enemy sprite via displayTypeKey.
      // Own faction spies render normally; invisibility applies an alpha dim, disguise a small marker.
      const isEnemy = entity.kind === "unit" && entity.faction !== this.activeFaction;
      const invisibleToViewer = isEnemy && entity.invisible && !detectedIds.has(entity.id);
      if (invisibleToViewer) continue;

      const disguisedToViewer = isEnemy && entity.disguised && !detectedIds.has(entity.id);
      // Temp-controlled units (Illusionist-puppeted leaders) always render as their
      // ORIGINAL faction regardless of who is looking — the deception works on both
      // sides so Wizards can lure the leader out without the robots noticing.
      const tempControlled = entity.kind === "unit" && entity.tempControlled;

      currentIds.add(entity.id);
      const fp = this._getFootprint(entity);

      const useDisplayOverride = disguisedToViewer || tempControlled;
      const displayTypeKey = useDisplayOverride ? (entity.displayTypeKey ?? entity.typeKey) : entity.typeKey;
      const displayFaction = useDisplayOverride ? (entity.displayFaction ?? entity.faction) : entity.faction;

      let sprite = this.entitySprites.get(entity.id);
      const cachedKey = this.spriteKeyCache.get(entity.id);
      const currentKey = `${displayFaction}:${displayTypeKey}`;
      if (sprite && cachedKey !== currentKey) {
        // Disguise flipped the rendered identity — rebuild the sprite.
        sprite.destroy();
        sprite = undefined;
        this.entitySprites.delete(entity.id);
      }
      if (!sprite) {
        sprite = this._createEntitySpriteFor(displayFaction, displayTypeKey, entity);
        sprite.zIndex = entity.flying ? 2 : 0;
        this.entityContainer.addChild(sprite);
        this.entitySprites.set(entity.id, sprite);
        this.spriteKeyCache.set(entity.id, currentKey);
      }

      // Buildings render top-left-anchored at their position. Units occupy a single
      // collision tile (position = tile origin); for fp > 1 we centre the sprite on
      // the unit's tile centre so the expanded visual straddles the surrounding tiles.
      if (entity.kind === "unit" && fp > 1) {
        sprite.x = (entity.position.x + 0.5 - fp / 2) * TILE_SIZE;
        sprite.y = (entity.position.y + 0.5 - fp / 2) * TILE_SIZE;
      } else {
        sprite.x = entity.position.x * TILE_SIZE;
        sprite.y = entity.position.y * TILE_SIZE;
      }
      sprite.width = fp * TILE_SIZE;
      sprite.height = fp * TILE_SIZE;

      const baseTint = this._baseTint(entity);
      const flash = this.flashEndTick.get(entity.id);
      if (flash !== undefined && this.renderTick <= flash.endTick) {
        sprite.tint = flash.color;
      } else {
        if (flash !== undefined) this.flashEndTick.delete(entity.id);
        sprite.tint = baseTint;
      }
      // Own invisible illusionist: semi-transparent to signal the toggle is on.
      // Own invisible → translucent. Own disguised → 0.8 alpha so the player gets an
      // unmistakable visual cue that the spy ability is currently active (prevents
      // the "I thought I disguised it" playtest foot-gun).
      if (entity.kind === "unit" && entity.faction === this.activeFaction) {
        if (entity.invisible) sprite.alpha = 0.5;
        else if (entity.disguised) sprite.alpha = 0.8;
        else sprite.alpha = 1.0;
      } else {
        sprite.alpha = 1.0;
      }

      const fogVal = this._fogValueAt(entity.position.x, entity.position.y);
      sprite.visible = fogVal === 2 || (fogVal === 1 && entity.kind === "building");
    }

    // Remove sprites for entities no longer in snapshot
    for (const [id, sprite] of this.entitySprites) {
      if (!currentIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
        this.spriteKeyCache.delete(id);
      }
    }

    // Redraw selection rings and Core-attached indicators
    this.selectionGfx.clear();
    for (const entity of entities) {
      const fogVal = this._fogValueAt(entity.position.x, entity.position.y);
      const visible = fogVal === 2 || (fogVal === 1 && entity.kind === "building");
      if (this.selectedIds.has(entity.id)) {
        this._drawSelectionRing(entity);
      }
      if (visible && entity.kind === "unit" && entity.attachedCoreId) {
        const pilot = this.lastEntities.find((e) => e.id === entity.attachedCoreId);
        this._drawCoreIndicator(entity, pilot?.typeKey === "motherboard" ? 0xfacc15 : 0x4ade80);
      }
      if (visible && entity.kind === "building" && entity.garrisonedUnitId) {
        this._drawCoreIndicator(entity, 0xffffff);
      }
    }
  }

  private _drawCoreIndicator(entity: EntitySnapshot, color: number): void {
    if (!this.selectionGfx) return;
    const cx = (entity.position.x + 0.85) * TILE_SIZE;
    const cy = (entity.position.y + 0.15) * TILE_SIZE;
    this.selectionGfx
      .circle(cx, cy, 4)
      .fill({ color, alpha: 0.95 });
  }

  private _drawSelectionRing(entity: EntitySnapshot): void {
    if (!this.selectionGfx) return;
    const fp = this._getFootprint(entity);
    if (entity.kind === "unit") {
      // Ring always hugs the unit's tile centre; radius scales with footprint so
      // 4x4 units (dragon / large combat platform) get a correspondingly bigger halo.
      const cx = (entity.position.x + 0.5) * TILE_SIZE;
      const cy = (entity.position.y + 0.5) * TILE_SIZE;
      this.selectionGfx
        .circle(cx, cy, TILE_SIZE * 0.44 * fp)
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
    if (!this.app) return;

    const { width, height, data } = fog;
    const zoom = ZOOM_LEVELS[this.zoomIndex]!;
    const tilePx = TILE_SIZE * zoom;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;

    // Screen-sized RenderTexture — avoids allocating a 16K×16K texture for a 256×256 map
    if (!this.fogTexture ||
        Math.abs(this.fogTexture.width - screenW) > 1 ||
        Math.abs(this.fogTexture.height - screenH) > 1) {
      this.fogTexture?.destroy(true);
      this.fogSprite?.destroy();
      this.fogTexture = RenderTexture.create({ width: screenW, height: screenH });
      this.fogSprite = new Sprite(this.fogTexture);
      this.fogSprite.x = 0;
      this.fogSprite.y = 0;
      this.fogSprite.eventMode = "none";
      // Insert between worldContainer and rubberBandContainer
      const worldIdx = this.app.stage.children.indexOf(this.worldContainer!);
      this.app.stage.addChildAt(this.fogSprite, worldIdx + 1);
      // Bring rubber band back to top
      if (this.rubberBandContainer) this.app.stage.addChild(this.rubberBandContainer);
    }

    // Viewport culling keeps this to ~400 rects/frame — cheap enough to redraw every tick.
    // Only draw fog rects for tiles in current viewport (+1 tile buffer for smooth panning)
    const BUFFER = 1;
    const tx0 = Math.max(0, Math.floor(this.cameraX / tilePx) - BUFFER);
    const ty0 = Math.max(0, Math.floor(this.cameraY / tilePx) - BUFFER);
    const tx1 = Math.min(width - 1, Math.ceil((this.cameraX + screenW) / tilePx) + BUFFER);
    const ty1 = Math.min(height - 1, Math.ceil((this.cameraY + screenH) / tilePx) + BUFFER);

    const g = new Graphics();
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const v = data[ty * width + tx];
        if (v === 2) continue; // VISIBLE — no overlay

        // Screen-space position of this tile
        const sx = tx * tilePx - this.cameraX;
        const sy = ty * tilePx - this.cameraY;

        if (v === 0) {
          g.rect(sx, sy, tilePx, tilePx).fill({ color: 0x000000, alpha: 1 });
        } else {
          g.rect(sx, sy, tilePx, tilePx).fill({ color: 0x050512, alpha: 0.65 });
        }
      }
    }

    this.app.renderer.render({ container: g, target: this.fogTexture, clear: true });
    g.destroy();
  }

  private _viewportTileBounds(buffer = 2): { x0: number; y0: number; x1: number; y1: number } {
    if (!this.app || this.mapWidthTiles === 0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    const zoom = ZOOM_LEVELS[this.zoomIndex]!;
    const tilePx = TILE_SIZE * zoom;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    return {
      x0: Math.max(0, Math.floor(this.cameraX / tilePx) - buffer),
      y0: Math.max(0, Math.floor(this.cameraY / tilePx) - buffer),
      x1: Math.min(this.mapWidthTiles - 1, Math.ceil((this.cameraX + screenW) / tilePx) + buffer),
      y1: Math.min(this.mapHeightTiles - 1, Math.ceil((this.cameraY + screenH) / tilePx) + buffer),
    };
  }

  private _createTileSprite(tile: TileSnapshot): Sprite {
    const texturePath = this._terrainTexturePath(tile);
    let sprite: Sprite;
    try {
      sprite = Sprite.from(texturePath);
    } catch {
      sprite = new Sprite();
      sprite.tint = this._terrainFallbackColor(tile.terrain);
    }
    sprite.x = tile.x * TILE_SIZE;
    sprite.y = tile.y * TILE_SIZE;
    sprite.width = TILE_SIZE;
    sprite.height = TILE_SIZE;
    return sprite;
  }

  private _updateViewportTiles(): void {
    if (!this.tileContainer || this._allTiles.length === 0) return;
    const b = this._viewportTileBounds(2);

    // Skip update if viewport tile bounds haven't changed
    if (b.x0 === this._lastViewportBounds.x0 && b.y0 === this._lastViewportBounds.y0 &&
        b.x1 === this._lastViewportBounds.x1 && b.y1 === this._lastViewportBounds.y1) return;
    this._lastViewportBounds = b;

    // Remove sprites that scrolled out of bounds
    for (const [key, sprite] of this.tileSprites) {
      const i = key.indexOf(",");
      const x = +key.slice(0, i);
      const y = +key.slice(i + 1);
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) {
        if (sprite.parent) sprite.parent.removeChild(sprite);
        sprite.destroy();
        this.tileSprites.delete(key);
      }
    }

    // Add sprites for tiles now in bounds
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const key = `${x},${y}`;
        if (this.tileSprites.has(key)) continue;
        const tile = this.lastTiles.get(key);
        if (!tile) continue;
        const sprite = this._createTileSprite(tile);
        this.tileSprites.set(key, sprite);
        this.tileContainer.addChild(sprite);
      }
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

    // Clamp camera so the world fills the screen when possible.
    // Skip clamping until map dimensions are known (first state push sets mapWidthTiles).
    if (this.mapWidthTiles > 0) {
      const maxCamX = Math.max(0, worldW - screenW);
      const maxCamY = Math.max(0, worldH - screenH);
      this.cameraX = Math.max(0, Math.min(this.cameraX, maxCamX));
      this.cameraY = Math.max(0, Math.min(this.cameraY, maxCamY));
    }

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
    window.addEventListener("keydown", this._onKeyDownBuild);
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
    // Ghost placement tracking
    if (this.buildMode) {
      const world = this._screenToWorld(e.clientX, e.clientY);
      this.ghostTileX = Math.floor(world.x / TILE_SIZE);
      this.ghostTileY = Math.floor(world.y / TILE_SIZE);
      this._renderGhost();
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
    // Buildings anchor at top-left (position is footprint origin). Units anchor at
    // their collision tile centre and render with a sprite centred on it — so the
    // hit box for an fp>1 unit straddles the neighbouring tiles.
    if (entity.kind === "unit") {
      const half = fp / 2;
      const cx = entity.position.x + 0.5;
      const cy = entity.position.y + 0.5;
      return (
        tileX >= cx - half &&
        tileX < cx + half &&
        tileY >= cy - half &&
        tileY < cy + half
      );
    }
    return (
      tileX >= entity.position.x &&
      tileX < entity.position.x + fp &&
      tileY >= entity.position.y &&
      tileY < entity.position.y + fp
    );
  }

  private _handleLeftClick(screenX: number, screenY: number): void {
    if (this.buildMode) {
      this.config.onBuildOrder?.(this.ghostTileX, this.ghostTileY);
      this.buildMode = null;
      this._clearGhost();
      return;
    }

    const world = this._screenToWorld(screenX, screenY);
    const tileX = world.x / TILE_SIZE;
    const tileY = world.y / TILE_SIZE;

    if (this.spellMode) {
      const { kind, casterId } = this.spellMode;
      this.setSpellMode(null);
      if (kind === "fieryExplosion") {
        this.config.onSpellTargetGround?.(casterId, kind, { x: tileX, y: tileY });
      } else {
        const hit = this.lastEntities.find((e) => !this._isInsideContainer(e) && this._isHitVisible(e) && this._hitTest(e, tileX, tileY)) ?? null;
        if (hit) this.config.onSpellTargetUnit?.(casterId, kind, hit.id);
      }
      return;
    }

    const hit = this.lastEntities.find((e) => !this._isInsideContainer(e) && this._isHitVisible(e) && this._hitTest(e, tileX, tileY)) ?? null;

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
    if (this.buildMode) {
      this.buildMode = null;
      this._clearGhost();
      return;
    }
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

    const hitEntity = this.lastEntities.find(
      (e) => !this._isInsideContainer(e) && this._isHitVisible(e) && this._hitTest(e, tileX, tileY),
    );
    if (hitEntity && this._fogValueAt(hitEntity.position.x, hitEntity.position.y) === 2) {
      // Builder right-clicking own under-construction building → resume construction
      if (
        hitEntity.faction === this.activeFaction &&
        hitEntity.kind === "building" &&
        hitEntity.buildingState === "underConstruction"
      ) {
        const builderIds = friendlyIds.filter((id) => {
          const e = this.lastEntities.find((ent) => ent.id === id);
          return e && (e.typeKey === "surf" || e.typeKey === "movableBuildKitPlatform");
        });
        if (builderIds.length > 0) {
          this.config.onResumeConstructionOrder?.(builderIds, hitEntity.id);
          return;
        }
      }
      // Core(s) right-clicking idle friendly platform → attach each to nearest available platform of same type
      if (
        hitEntity.faction === this.activeFaction &&
        hitEntity.kind === "unit" &&
        ROBOT_PLATFORM_TYPES.has(hitEntity.typeKey) &&
        !hitEntity.isShell
      ) {
        const cores = friendlyIds
          .map((id) => this.lastEntities.find((e) => e.id === id))
          .filter((e): e is NonNullable<typeof e> => !!e && (e.typeKey === "core" || e.typeKey === "motherboard") && !e.isShell);
        if (cores.length > 0) {
          // Available platforms: same type, same faction, no Core attached, not a shell
          const available = this.lastEntities.filter(
            (e) => e.kind === "unit" && e.faction === this.activeFaction &&
              e.typeKey === hitEntity.typeKey && !e.attachedCoreId && !e.isShell
          );
          const claimed = new Set<string>();
          for (const core of cores) {
            let nearest: typeof available[0] | null = null;
            let nearestDist = Infinity;
            for (const plat of available) {
              if (claimed.has(plat.id)) continue;
              const d = Math.hypot(core.position.x - plat.position.x, core.position.y - plat.position.y);
              if (d < nearestDist) { nearestDist = d; nearest = plat; }
            }
            if (nearest) {
              claimed.add(nearest.id);
              this.config.onAttachOrder?.(core.id, nearest.id);
            }
          }
          return;
        }
      }
      if (hitEntity.faction !== this.activeFaction) {
        // Infiltrate: spy right-clicks an enemy Cottage / Recharge Station.
        if (
          hitEntity.kind === "building" &&
          (hitEntity.typeKey === "cottage" || hitEntity.typeKey === "rechargeStation") &&
          hitEntity.buildingState === "operational"
        ) {
          const spy = this.lastEntities
            .filter((e) => friendlyIds.includes(e.id) && (e.typeKey === "illusionist" || e.typeKey === "infiltrationPlatform"))
            .shift();
          if (spy) {
            this.config.onInfiltrateOrder?.(spy.id, hitEntity.id);
            return;
          }
        }
        this.config.onAttackOrder?.(friendlyIds, hitEntity.id);
      } else if (hitEntity.kind === "unit") {
        this.config.onFollowOrder?.(friendlyIds, hitEntity.id);
      } else if (hitEntity.kind === "building") {
        // Hide: civilian/leader right-clicks a friendly Cottage / Recharge Station.
        if (
          (hitEntity.typeKey === "cottage" || hitEntity.typeKey === "rechargeStation") &&
          hitEntity.buildingState === "operational"
        ) {
          const hideable = this.lastEntities
            .filter((e) =>
              friendlyIds.includes(e.id) &&
              (e.typeKey === "subject" || e.typeKey === "core" ||
                e.typeKey === "archmage" || e.typeKey === "motherboard") &&
              !e.hidden && !e.isShell)
            .shift();
          if (hideable) {
            this.config.onHideOrder?.(hideable.id, hitEntity.id);
            return;
          }
        }
        // Garrison order: evoker/archmage → operational wizard tower
        if (
          hitEntity.typeKey === "wizardTower" &&
          hitEntity.buildingState === "operational" &&
          !hitEntity.garrisonedUnitId
        ) {
          const eligible = this.lastEntities
            .filter(e => friendlyIds.includes(e.id) && (e.typeKey === "evoker" || e.typeKey === "archmage") && !e.garrisoned)
            .shift();
          if (eligible) {
            this.config.onGarrisonOrder?.(eligible.id, hitEntity.id);
            return;
          }
        }
        // Immobile Combat Platform entry: selected free Core(s) → platform with capacity.
        if (
          hitEntity.typeKey === "immobileCombatPlatform" &&
          hitEntity.buildingState === "operational"
        ) {
          const capacity = robotBuildingStats["immobileCombatPlatform"]?.occupantCapacity ?? 1;
          let remaining = capacity - (hitEntity.occupantCount ?? 0);
          if (remaining > 0) {
            const eligibleCores = this.lastEntities.filter(
              (e) =>
                friendlyIds.includes(e.id) &&
                e.typeKey === "core" &&
                !e.isShell &&
                !e.inPlatform,
            );
            let issued = 0;
            for (const core of eligibleCores) {
              if (remaining <= 0) break;
              this.config.onEnterPlatformOrder?.(core.id, hitEntity.id);
              remaining--;
              issued++;
            }
            if (issued > 0) return;
          }
        }
        // Move toward / surround friendly building
        const fp = hitEntity.faction === "wizards"
          ? (wizardBuildingStats[hitEntity.typeKey]?.footprintTiles ?? 1)
          : (robotBuildingStats[hitEntity.typeKey]?.footprintTiles ?? 1);
        const cx = hitEntity.position.x + fp / 2;
        const cy = hitEntity.position.y + fp / 2;
        this.config.onMoveOrder?.(friendlyIds, { x: cx, y: cy });
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

  private readonly _onKeyDownBuild = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      if (this.buildMode) { this.buildMode = null; this._clearGhost(); }
      if (this.spellMode) this.setSpellMode(null);
    }
  };

  private _renderGhost(): void {
    if (!this.ghostContainer || !this.buildMode) return;
    const g = this.ghostContainer.children[0] as Graphics | undefined;
    const gfx: Graphics = g ?? (() => {
      const newGfx = new Graphics();
      this.ghostContainer!.addChild(newGfx);
      return newGfx;
    })();
    gfx.clear();

    const { footprintTiles, typeKey } = this.buildMode;

    // Check water-adjacency requirement
    const needsWater = buildingRequiresAdjacentWater.has(typeKey);
    let hasAdjacentWater = false;
    if (needsWater) {
      outer: for (let dy = 0; dy < footprintTiles; dy++) {
        for (let dx = 0; dx < footprintTiles; dx++) {
          const tx = this.ghostTileX + dx;
          const ty = this.ghostTileY + dy;
          for (const [ddx, ddy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            if (this.lastTiles.get(`${tx + ddx},${ty + ddy}`)?.terrain === "water") {
              hasAdjacentWater = true;
              break outer;
            }
          }
        }
      }
    }
    const waterCheckFails = needsWater && !hasAdjacentWater;

    // Check if any building occupies a footprint tile
    const occupiedTiles = new Set<string>();
    for (const e of this.lastEntities) {
      if (e.kind !== "building") continue;
      const fp = this._getFootprint(e);
      const bx = Math.floor(e.position.x);
      const by = Math.floor(e.position.y);
      for (let dy = 0; dy < fp; dy++) {
        for (let dx = 0; dx < fp; dx++) {
          occupiedTiles.add(`${bx + dx},${by + dy}`);
        }
      }
    }

    for (let dy = 0; dy < footprintTiles; dy++) {
      for (let dx = 0; dx < footprintTiles; dx++) {
        const tx = this.ghostTileX + dx;
        const ty = this.ghostTileY + dy;
        const tile = this.lastTiles.get(`${tx},${ty}`);
        const hasDeposit = this.lastDeposits.has(`${tx},${ty}`);
        const tileValid =
          tile !== undefined &&
          tile.terrain !== "water" &&
          !hasDeposit &&
          !occupiedTiles.has(`${tx},${ty}`) &&
          !waterCheckFails;
        gfx
          .rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
          .fill({ color: tileValid ? 0x00ff00 : 0xff0000, alpha: 0.25 });
      }
    }
  }

  private _clearGhost(): void {
    if (!this.ghostContainer) return;
    for (const child of this.ghostContainer.children) {
      (child as Graphics).clear();
    }
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
      if (e.attachedPlatformTypeKey) return false; // Core riding a platform — platform is the selection target
      if (this._isInsideContainer(e)) return false;
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

  setBuildMode(mode: { typeKey: string; footprintTiles: number; faction: "wizards" | "robots" } | null): void {
    this.buildMode = mode;
    if (!mode) this._clearGhost();
  }

  setSpellMode(mode: { kind: string; casterId: string } | null): void {
    this.spellMode = mode;
    if (this.app) {
      (this.app.canvas as HTMLCanvasElement).style.cursor = mode ? "crosshair" : "";
    }
  }

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
    window.removeEventListener("keydown", this._onKeyDownBuild);
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
    for (const p of this.liveProjectiles) p.gfx.destroy();
    this.liveProjectiles = [];
    for (const ae of this.liveAreaEffects) ae.gfx.destroy();
    this.liveAreaEffects = [];
    for (const sprite of this.tileSprites.values()) sprite.destroy();
    this.tileSprites.clear();
    for (const sprite of this.entitySprites.values()) sprite.destroy();
    this.entitySprites.clear();
    this.selectionGfx = null;
    this.rubberBandGfx = null;
    this.rubberBandContainer = null;
    this.app?.destroy(true);
    this.app = null;
  }
}
