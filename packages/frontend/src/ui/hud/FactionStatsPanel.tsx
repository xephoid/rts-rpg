import { useGameStore } from "../../store/gameStore.js";
import { useUIStore } from "../../store/uiStore.js";
import styles from "./FactionStatsPanel.module.css";

const FACTIONS = ["wizards", "robots"] as const;

export function FactionStatsPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const activeFaction = useUIStore((s) => s.activeFaction);

  if (!gameState) return null;

  const own = gameState.factionStats[activeFaction];
  const opponent = FACTIONS.find((f) => f !== activeFaction)!;
  const opponentLabel = opponent === "wizards" ? "Wizards" : "Robots";

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Faction Stats</div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.statLabel}></th>
            <th className={styles.statValue}>Own</th>
            <th className={styles.statValue}>{opponentLabel}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={styles.statLabel}>Military</td>
            <td className={styles.statValue}>{own.militaryStrength}</td>
            <td className={styles.statValue}>—</td>
          </tr>
          <tr>
            <td className={styles.statLabel}>Culture</td>
            <td className={styles.statValue}>{own.culture}</td>
            <td className={styles.statValue}>—</td>
          </tr>
          <tr>
            <td className={styles.statLabel}>Defense</td>
            <td className={styles.statValue}>{own.defense}</td>
            <td className={styles.statValue}>—</td>
          </tr>
          <tr>
            <td className={styles.statLabel}>Intelligence</td>
            <td className={styles.statValue}>{own.intelligence}</td>
            <td className={styles.statValue}>—</td>
          </tr>
          <tr>
            <td className={styles.statLabel}>Footprint</td>
            <td className={styles.statValue}>{own.footprint}</td>
            <td className={styles.statValue}>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
