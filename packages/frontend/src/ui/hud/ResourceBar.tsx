import { useGameStore } from "../../store/gameStore.js";
import { useUIStore } from "../../store/uiStore.js";
import styles from "./ResourceBar.module.css";

export function ResourceBar() {
  const gameState = useGameStore((s) => s.gameState);
  const activeFaction = useUIStore((s) => s.activeFaction);

  const resources = gameState?.resources[activeFaction] ?? { wood: 0, water: 0, mana: 0 };
  const tick = gameState?.tick ?? 0;
  const isWizard = activeFaction === "wizards";

  return (
    <div className={styles.bar}>
      <div className={styles.resources}>
        <div className={styles.resource}>
          <span className={styles.resourceLabel}>Wood</span>
          <span className={`${styles.resourceValue} ${styles.woodValue}`}>
            {Math.floor(resources.wood)}
          </span>
        </div>
        <div className={styles.resource}>
          <span className={styles.resourceLabel}>Water</span>
          <span className={`${styles.resourceValue} ${styles.waterValue}`}>
            {Math.floor(resources.water)}
          </span>
        </div>
        <div className={styles.resource}>
          <span className={styles.resourceLabel}>Mana</span>
          <span
            className={`${styles.resourceValue} ${isWizard ? styles.manaValue : styles.manaValueRobot}`}
          >
            {Math.floor(resources.mana)}
          </span>
        </div>
      </div>

      <div className={styles.tick}>tick {tick}</div>
    </div>
  );
}
