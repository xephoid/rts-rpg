import { AbilitiesPanel } from "./AbilitiesPanel.js";
import { CommandsPanel } from "./CommandsPanel.js";
import { MinimapPanel } from "./MinimapPanel.js";
import { UnitStatsPanel } from "./UnitStatsPanel.js";
import styles from "./BottomPanel.module.css";

export function BottomPanel() {
  return (
    <div className={styles.panel}>
      <MinimapPanel />
      <UnitStatsPanel />
      <AbilitiesPanel />
      <CommandsPanel />
    </div>
  );
}
