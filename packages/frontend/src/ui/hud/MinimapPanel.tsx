import { useEffect, useRef } from "react";
import { useGameStore } from "../../store/gameStore.js";
import { useUIStore } from "../../store/uiStore.js";
import styles from "./MinimapPanel.module.css";

const CANVAS_SIZE = 188;
// Matches GameRenderer.TILE_SIZE — rendering constant, not a game balance value.
const TILE_SIZE = 64;

const TERRAIN_COLORS: Record<string, string> = {
  open: "#4a7a3a",
  forest: "#2d5a1b",
  water: "#1a3a6e",
};

export function MinimapPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameState = useGameStore((s) => s.gameState);
  const activeFaction = useUIStore((s) => s.activeFaction);
  const cameraX = useUIStore((s) => s.cameraX);
  const cameraY = useUIStore((s) => s.cameraY);
  const zoom = useUIStore((s) => s.zoom);
  const setCameraTarget = useUIStore((s) => s.setCameraTarget);

  // Map dimensions derived from tiles — memoised via a ref to avoid recomputing
  const mapDimRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState || gameState.tiles.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tiles = gameState.tiles;
    const mapW = Math.max(...tiles.map((t) => t.x)) + 1;
    const mapH = Math.max(...tiles.map((t) => t.y)) + 1;
    mapDimRef.current = { w: mapW, h: mapH };

    const scale = CANVAS_SIZE / Math.max(mapW, mapH);

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = "#050309";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const fog = gameState.fog[activeFaction];

    // Terrain tiles
    for (const tile of tiles) {
      const visibility = fog.data[tile.y * fog.width + tile.x] ?? 0;
      if (visibility === 0) continue;

      const color = TERRAIN_COLORS[tile.terrain] ?? "#4a7a3a";
      ctx.fillStyle = visibility === 1 ? darken(color) : color;
      ctx.fillRect(
        Math.floor(tile.x * scale),
        Math.floor(tile.y * scale),
        Math.max(1, Math.ceil(scale)),
        Math.max(1, Math.ceil(scale)),
      );
    }

    // Territory wash — semi-transparent color over building footprint tiles
    for (const entity of gameState.entities) {
      if (entity.kind !== "building" || entity.buildingState === "underConstruction") continue;
      const visibility = fog.data[Math.floor(entity.position.y) * fog.width + Math.floor(entity.position.x)] ?? 0;
      if (visibility === 0) continue;
      ctx.fillStyle = entity.faction === "wizards"
        ? "rgba(168, 85, 247, 0.25)"
        : "rgba(234, 179, 8, 0.25)";
      ctx.fillRect(
        Math.floor(entity.position.x * scale),
        Math.floor(entity.position.y * scale),
        Math.max(2, Math.ceil(2 * scale)),
        Math.max(2, Math.ceil(2 * scale)),
      );
    }

    // Entity dots (only VISIBLE)
    for (const entity of gameState.entities) {
      // Occupants tucked inside carriers/buildings shouldn't show as separate dots.
      if (entity.kind === "unit" && (entity.isShell || entity.garrisoned || entity.inPlatform)) continue;
      const tileX = Math.floor(entity.position.x);
      const tileY = Math.floor(entity.position.y);
      const visibility = fog.data[tileY * fog.width + tileX] ?? 0;
      if (visibility !== 2) continue;

      ctx.fillStyle = entity.faction === "wizards" ? "#a855f7" : "#eab308";
      ctx.fillRect(
        Math.floor(entity.position.x * scale),
        Math.floor(entity.position.y * scale),
        Math.max(2, Math.ceil(scale)),
        Math.max(2, Math.ceil(scale)),
      );
    }

    // Viewport box
    const tileZoom = TILE_SIZE * zoom;
    const viewTilesW = window.innerWidth / tileZoom;
    const viewTilesH = window.innerHeight / tileZoom;
    const camTileX = cameraX / tileZoom;
    const camTileY = cameraY / tileZoom;

    const bx = Math.floor(camTileX * scale);
    const by = Math.floor(camTileY * scale);
    const bw = Math.max(4, Math.floor(viewTilesW * scale));
    const bh = Math.max(4, Math.floor(viewTilesH * scale));

    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
  }, [gameState, activeFaction, cameraX, cameraY, zoom]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w: mapW, h: mapH } = mapDimRef.current;
    if (mapW === 0 || mapH === 0) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Click → tile → center viewport on that tile
    const scale = CANVAS_SIZE / Math.max(mapW, mapH);
    const tileX = clickX / scale;
    const tileY = clickY / scale;

    const tileZoom = TILE_SIZE * zoom;
    const camX = tileX * tileZoom - window.innerWidth / 2;
    const camY = tileY * tileZoom - window.innerHeight / 2;

    setCameraTarget({ x: camX, y: camY });
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Minimap</div>
      <div className={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onClick={handleClick}
        />
      </div>
    </div>
  );
}

function darken(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 0xff) * 0.45);
  const g = Math.floor(((n >> 8) & 0xff) * 0.45);
  const b = Math.floor((n & 0xff) * 0.45);
  return `rgb(${r},${g},${b})`;
}
