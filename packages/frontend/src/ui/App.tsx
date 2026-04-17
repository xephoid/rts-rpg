// TODO: next step — wire up PixiJS canvas + HUD components
import styles from "./App.module.css";

export function App() {
  return (
    <div className={styles.root}>
      <div className={styles.canvasContainer} id="pixi-canvas-container" />
      {/* TODO: HUD, resource bar, bottom panel, minimap, alert log */}
    </div>
  );
}
