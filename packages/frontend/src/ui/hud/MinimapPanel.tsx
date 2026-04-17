import { useEffect, useRef } from "react";
import { useGameStore } from "../../store/gameStore.js";
import { useUIStore } from "../../store/uiStore.js";
import styles from "./MinimapPanel.module.css";

const CANVAS_SIZE = 188;

const TERRAIN_COLORS: Record<string, string> = {
  open: "#4a7a3a",
  forest: "#2d5a1b",
  water: "#1a3a6e",
};

export function MinimapPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameState = useGameStore((s) => s.gameState);
  const activeFaction = useUIStore((s) => s.activeFaction);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState || gameState.tiles.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tiles = gameState.tiles;
    const mapW = Math.max(...tiles.map((t) => t.x)) + 1;
    const mapH = Math.max(...tiles.map((t) => t.y)) + 1;
    const scale = CANVAS_SIZE / Math.max(mapW, mapH);

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = "#050309";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const fog = gameState.fog[activeFaction];

    for (const tile of tiles) {
      const visibility = fog.data[tile.y * fog.width + tile.x] ?? 0;
      if (visibility === 0) continue; // UNEXPLORED — don't reveal

      const color = TERRAIN_COLORS[tile.terrain] ?? "#4a7a3a";
      ctx.fillStyle = visibility === 1 ? darken(color) : color;
      ctx.fillRect(
        Math.floor(tile.x * scale),
        Math.floor(tile.y * scale),
        Math.max(1, Math.ceil(scale)),
        Math.max(1, Math.ceil(scale)),
      );
    }

    // Entity dots
    for (const entity of gameState.entities) {
      const tileX = Math.floor(entity.position.x);
      const tileY = Math.floor(entity.position.y);
      const visibility = fog.data[tileY * fog.width + tileX] ?? 0;
      if (visibility !== 2) continue; // only VISIBLE entities

      ctx.fillStyle = entity.faction === "wizards" ? "#a855f7" : "#eab308";
      const px = Math.floor(entity.position.x * scale);
      const py = Math.floor(entity.position.y * scale);
      ctx.fillRect(px, py, Math.max(2, Math.ceil(scale)), Math.max(2, Math.ceil(scale)));
    }
  }, [gameState, activeFaction]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Minimap</div>
      <div className={styles.canvasWrapper}>
        <canvas ref={canvasRef} className={styles.canvas} width={CANVAS_SIZE} height={CANVAS_SIZE} />
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
