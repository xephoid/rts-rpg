import { useEffect, useRef } from "react";
import { GameEngine } from "../game/GameEngine.js";
import { GameRenderer } from "../renderer/GameRenderer.js";
import { useGameStore } from "../store/gameStore.js";
import styles from "./App.module.css";

export function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const pushGameState = useGameStore((s) => s.pushGameState);

  useEffect(() => {
    if (!canvasRef.current) return;

    let cancelled = false;
    const container = canvasRef.current;
    const renderer = new GameRenderer();
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
      engine.stop();
      renderer.destroy();
    };
  }, [pushGameState]);

  return (
    <div className={styles.root}>
      <div className={styles.canvasContainer} ref={canvasRef} />
      {/* TODO: HUD, resource bar, bottom panel, minimap, alert log */}
    </div>
  );
}
