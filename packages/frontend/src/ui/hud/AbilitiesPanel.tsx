import { useUIStore } from "../../store/uiStore.js";
import styles from "./AbilitiesPanel.module.css";

export function AbilitiesPanel() {
  const selectedEntity = useUIStore((s) => s.selectedEntity);

  if (!selectedEntity) {
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
