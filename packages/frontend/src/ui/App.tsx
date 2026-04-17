import { useEffect, useRef } from "react";
import { GameEngine } from "../game/GameEngine.js";
import { GameRenderer } from "../renderer/GameRenderer.js";
import { useGameStore } from "../store/gameStore.js";
import { useUIStore } from "../store/uiStore.js";
import { AlertLog } from "./hud/AlertLog.js";
import { BottomPanel } from "./hud/BottomPanel.js";
import { ResourceBar } from "./hud/ResourceBar.js";
import styles from "./App.module.css";

const PAN_STEP = 192; // pixels per WASD keydown

export function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const pushGameState = useGameStore((s) => s.pushGameState);
  const activeFaction = useUIStore((s) => s.activeFaction);
  const cameraTarget = useUIStore((s) => s.cameraTarget);
  const setCameraTarget = useUIStore((s) => s.setCameraTarget);

  // Init renderer + engine
  useEffect(() => {
    if (!canvasRef.current) return;

    let cancelled = false;
    const container = canvasRef.current;
    const renderer = new GameRenderer({
      onCameraChange: (x, y, zoom) =>
        useUIStore.getState().setCameraPosition(x, y, zoom),
    });
    rendererRef.current = renderer;

    const engine = new GameEngine({
      mapSize: "small",
      seed: 42,
      onTick: (state) => {
        pushGameState(state);
        renderer.render(state);
      },
    });

    renderer.init(container).then(() => {
      if (cancelled) {
        renderer.destroy();
        return;
      }
      engine.start();
    });

    return () => {
      cancelled = true;
      rendererRef.current = null;
      engine.stop();
      renderer.destroy();
    };
  }, [pushGameState]);

  // Sync active faction to renderer
  useEffect(() => {
    rendererRef.current?.setActiveFaction(activeFaction);
  }, [activeFaction]);

  // Forward minimap camera requests to renderer
  useEffect(() => {
    if (!cameraTarget) return;
    rendererRef.current?.setCameraPosition(cameraTarget.x, cameraTarget.y);
    setCameraTarget(null);
  }, [cameraTarget, setCameraTarget]);

  // WASD panning
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const renderer = rendererRef.current;
      if (!renderer) return;
      // Don't steal keys when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const { cameraX, cameraY } = useUIStore.getState();
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case "w":
        case "W":
          dy = -PAN_STEP;
          break;
        case "s":
        case "S":
          dy = PAN_STEP;
          break;
        case "a":
        case "A":
          dx = -PAN_STEP;
          break;
        case "d":
        case "D":
          dx = PAN_STEP;
          break;
        default:
          return;
      }
      e.preventDefault();
      renderer.setCameraPosition(cameraX + dx, cameraY + dy);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={styles.root}>
      <div className={styles.canvasContainer} ref={canvasRef} />
      <div className={styles.hud}>
        <ResourceBar />
        <AlertLog />
        <BottomPanel />
      </div>
    </div>
  );
}
