import { useGameStore } from "../../store/gameStore.js";
import { useUIStore } from "../../store/uiStore.js";
import styles from "./AbilitiesPanel.module.css";

export function AbilitiesPanel() {
  const selection = useUIStore((s) => s.selection);
  const activeFaction = useUIStore((s) => s.activeFaction);
  const gameState = useGameStore((s) => s.gameState);

  if (selection.mode !== "single") {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Abilities</div>
        <div className={styles.empty}>—</div>
      </div>
    );
  }

  const entity = gameState?.entities.find((e) => e.id === selection.id);
  if (entity && entity.faction !== activeFaction) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Abilities</div>
        <div className={styles.empty}>—</div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Abilities</div>
      <div className={styles.grid}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={styles.abilitySlot}>
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
