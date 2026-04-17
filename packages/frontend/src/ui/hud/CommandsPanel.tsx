import { useUIStore } from "../../store/uiStore.js";
import styles from "./CommandsPanel.module.css";

const UNIT_COMMANDS = ["Move", "Stop", "Attack", "Patrol", "Hold", "Talk", "Convert", "Board"];
const BUILDING_COMMANDS = ["Produce", "Cancel", "Research", "Demolish"];

export function CommandsPanel() {
  const selectedEntity = useUIStore((s) => s.selectedEntity);

  if (!selectedEntity) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Commands</div>
        <div className={styles.empty}>—</div>
      </div>
    );
  }

  const cmds = selectedEntity.kind === "unit" ? UNIT_COMMANDS : BUILDING_COMMANDS;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Commands</div>
      <div className={styles.grid}>
        {cmds.map((cmd) => (
          <button key={cmd} className={styles.cmdBtn} disabled>
            {cmd}
          </button>
        ))}
      </div>
    </div>
  );
}
