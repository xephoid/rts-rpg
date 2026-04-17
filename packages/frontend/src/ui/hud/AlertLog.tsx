import { useUIStore } from "../../store/uiStore.js";
import styles from "./AlertLog.module.css";

export function AlertLog() {
  const alerts = useUIStore((s) => s.alerts);
  const clearAlerts = useUIStore((s) => s.clearAlerts);

  if (alerts.length === 0) return null;

  return (
    <div className={styles.log}>
      {alerts
        .slice()
        .reverse()
        .slice(0, 8)
        .map((msg, i) => (
          <div key={i} className={styles.entry}>
            {msg}
          </div>
        ))}
      <button className={styles.clearBtn} onClick={clearAlerts}>
        clear
      </button>
    </div>
  );
}
