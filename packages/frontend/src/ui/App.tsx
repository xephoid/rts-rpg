import { useEffect, useRef } from "react";
import { GameEngine } from "../game/GameEngine.js";
import { GameRenderer } from "../renderer/GameRenderer.js";
import { useGameStore } from "../store/gameStore.js";
import { useUIStore } from "../store/uiStore.js";
import { AlertLog } from "./hud/AlertLog.js";
import { BottomPanel } from "./hud/BottomPanel.js";
import { ResourceBar } from "./hud/ResourceBar.js";
import styles from "./App.module.css";

export function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const pushGameState = useGameStore((s) => s.pushGameState);
  const activeFaction = useUIStore((s) => s.activeFaction);

  useEffect(() => {
    if (!canvasRef.current) return;

    let cancelled = false;
    const container = canvasRef.current;
    const renderer = new GameRenderer({
      onCameraChange: (x, y) => useUIStore.getState().setCameraPosition(x, y),
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

  // Sync active faction to renderer whenever it changes
  useEffect(() => {
    rendererRef.current?.setActiveFaction(activeFaction);
  }, [activeFaction]);

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
