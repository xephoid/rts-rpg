import { useGameStore } from "../../store/gameStore.js";
import { useUIStore } from "../../store/uiStore.js";
import styles from "./UnitStatsPanel.module.css";

function hpColor(ratio: number): string {
  if (ratio > 0.6) return "var(--color-hp-high)";
  if (ratio > 0.3) return "var(--color-hp-mid)";
  return "var(--color-hp-low)";
}

function xpThreshold(level: number): number {
  return Math.pow(2, level) * 2;
}

function formatTypeKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

export function UnitStatsPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const selectedEntity = useUIStore((s) => s.selectedEntity);

  const entity =
    selectedEntity && gameState
      ? gameState.entities.find((e) => e.id === selectedEntity.id) ?? null
      : null;

  if (!entity) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Selection</div>
        <div className={styles.empty}>No selection</div>
      </div>
    );
  }

  const { stats } = entity;
  const hpRatio = stats.maxHp > 0 ? stats.hp / stats.maxHp : 0;
  const xpNeeded = xpThreshold(stats.level);
  const xpRatio = xpNeeded > 0 ? Math.min(1, stats.xp / xpNeeded) : 0;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Selection</div>
      <div className={styles.content}>
        <div className={styles.entityName}>{formatTypeKey(entity.typeKey)}</div>
        <div className={styles.entityMeta}>
          {entity.faction} · {entity.kind} · Lv {stats.level}
        </div>

        <div className={styles.hpBarWrapper}>
          <div className={styles.hpLabel}>
            <span>HP</span>
            <span>
              {stats.hp} / {stats.maxHp}
            </span>
          </div>
          <div className={styles.hpTrack}>
            <div
              className={styles.hpFill}
              style={{ width: `${hpRatio * 100}%`, background: hpColor(hpRatio) }}
            />
          </div>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.statCell}>
            <span className={styles.statVal}>{stats.damage}</span>
            <span className={styles.statKey}>Dmg</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statVal}>{stats.range}</span>
            <span className={styles.statKey}>Range</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statVal}>{stats.speed}</span>
            <span className={styles.statKey}>Spd</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statVal}>{stats.armor}</span>
            <span className={styles.statKey}>Armor</span>
          </div>
        </div>

        <div className={styles.xpRow}>
          <div className={styles.xpLabel}>
            <span>XP</span>
            <span>
              {stats.xp} / {xpNeeded}
            </span>
          </div>
          <div className={styles.xpTrack}>
            <div className={styles.xpFill} style={{ width: `${xpRatio * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
