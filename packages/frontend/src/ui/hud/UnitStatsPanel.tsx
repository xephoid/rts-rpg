import { unitSpritePath } from "@neither/shared";
import { useGameStore } from "../../store/gameStore.js";
import { useUIStore } from "../../store/uiStore.js";
import styles from "./UnitStatsPanel.module.css";

function hpColor(ratio: number): string {
  if (ratio > 0.6) return "var(--color-hp-high)";
  if (ratio > 0.3) return "var(--color-hp-mid)";
  return "var(--color-hp-low)";
}

/** XP needed to reach the NEXT level from current level. Cumulative threshold. */
function xpThreshold(level: number): number {
  return Math.pow(2, level) * 2;
}

/** XP threshold at which the CURRENT level was entered (0 for level 1). */
function prevXpThreshold(level: number): number {
  return level <= 1 ? 0 : Math.pow(2, level - 1) * 2;
}

function formatTypeKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

export function UnitStatsPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const selection = useUIStore((s) => s.selection);

  if (selection.mode === "none" || !gameState) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Selection</div>
        <div className={styles.empty}>No selection</div>
      </div>
    );
  }

  if (selection.mode === "multi") {
    const selected = gameState.entities.filter((e) => selection.ids.includes(e.id));
    // Use the species of the first selected entity's faction for portrait paths
    const firstFaction = selected[0]?.faction;
    const species = firstFaction ? gameState.factionSpecies[firstFaction] : "wizards";
    const groups = new Map<string, number>();
    for (const e of selected) groups.set(e.typeKey, (groups.get(e.typeKey) ?? 0) + 1);

    return (
      <div className={styles.panel}>
        <div className={styles.header}>Selection</div>
        <div className={styles.content}>
          <div className={styles.multiList}>
            {[...groups].map(([typeKey, count]) => (
              <div key={typeKey} className={styles.groupRow}>
                <img
                  src={unitSpritePath(species, typeKey)}
                  className={styles.groupPortrait}
                  alt={formatTypeKey(typeKey)}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <span className={styles.groupName}>{formatTypeKey(typeKey)}</span>
                <span className={styles.groupCount}>× {count}</span>
              </div>
            ))}
            <div className={styles.groupTotal}>{selected.length} units</div>
          </div>
        </div>
      </div>
    );
  }

  // mode: "single"
  const entity = gameState.entities.find((e) => e.id === selection.id) ?? null;

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
  const xpFloor = prevXpThreshold(stats.level);
  const xpCeil = xpThreshold(stats.level);
  const xpInLevel = stats.xp - xpFloor;
  const xpNeededInLevel = xpCeil - xpFloor;
  const xpRatio = xpNeededInLevel > 0 ? Math.min(1, xpInLevel / xpNeededInLevel) : 0;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Selection</div>
      <div className={styles.content}>
        <div className={styles.entityHeader}>
          <img
            src={unitSpritePath(gameState.factionSpecies[entity.faction], entity.typeKey)}
            className={styles.entityPortrait}
            alt={formatTypeKey(entity.typeKey)}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <div className={styles.entityTitleBlock}>
            <div className={styles.entityName}>
              {entity.isNamed && entity.name ? entity.name : formatTypeKey(entity.typeKey)}
            </div>
            <div className={styles.entityMeta}>
              {entity.isNamed ? formatTypeKey(entity.typeKey) + " · " : ""}{entity.faction} · {entity.kind} · Lv {stats.level}
            </div>
            {entity.kind === "unit" && entity.unitAction && (
              <div className={styles.entityAction}>{entity.unitAction}</div>
            )}
          </div>
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
            <span className={styles.statVal}>{stats.attackRange}</span>
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

        {entity.kind === "unit" && entity.carrying && (
          <div className={styles.carryRow}>
            <span className={styles.carryLabel}>Carrying</span>
            <span className={styles.carryValue}>
              {entity.carrying.amount} {entity.carrying.resource}
            </span>
          </div>
        )}

        {entity.kind === "unit" && entity.materialType && (
          <div className={styles.carryRow}>
            <span className={styles.carryLabel}>Material</span>
            <span className={styles.carryValue}>{entity.materialType}</span>
          </div>
        )}

        {entity.kind === "unit" && entity.attachedPlatformTypeKey && (
          <div className={styles.carryRow}>
            <span className={styles.carryLabel}>Platform</span>
            <span className={styles.carryValue}>{formatTypeKey(entity.attachedPlatformTypeKey)}</span>
          </div>
        )}

        {entity.kind === "unit" && entity.manaShielded && (
          <div className={styles.carryRow}>
            <span className={styles.carryLabel}>Ability</span>
            <span className={`${styles.carryValue} ${styles.shieldActive}`}>Mana Shield</span>
          </div>
        )}

        {entity.kind === "unit" && (
          <div className={styles.xpRow}>
            <div className={styles.xpLabel}>
              <span>XP (Lv {stats.level})</span>
              <span>
                {xpInLevel} / {xpNeededInLevel}
              </span>
            </div>
            <div className={styles.xpTrack}>
              <div className={styles.xpFill} style={{ width: `${xpRatio * 100}%` }} />
            </div>
          </div>
        )}

        {entity.kind === "building" && entity.buildingState === "underConstruction" && entity.constructionProgress && (
          <div className={styles.productionRow}>
            <div className={styles.prodLabelBlock}>
              <div className={styles.prodLabel}>
                <span>Under Construction</span>
                <span>{entity.constructionProgress.progressTicks}/{entity.constructionProgress.totalTicks}</span>
              </div>
              <div className={styles.prodTrack}>
                <div
                  className={styles.prodFill}
                  style={{ width: `${(entity.constructionProgress.progressTicks / entity.constructionProgress.totalTicks) * 100}%`, background: "#60a5fa" }}
                />
              </div>
            </div>
          </div>
        )}

        {entity.kind === "building" && entity.buildingState === "researching" && entity.researchProgress && (
          <div className={styles.productionRow}>
            <div className={styles.prodLabelBlock}>
              <div className={styles.prodLabel}>
                <span>Researching: {formatTypeKey(entity.researchProgress.researchKey)}</span>
                <span>{entity.researchProgress.progressTicks}/{entity.researchProgress.totalTicks}</span>
              </div>
              <div className={styles.prodTrack}>
                <div
                  className={styles.prodFill}
                  style={{ width: `${(entity.researchProgress.progressTicks / entity.researchProgress.totalTicks) * 100}%`, background: "#a78bfa" }}
                />
              </div>
            </div>
          </div>
        )}

        {entity.kind === "building" && entity.typeKey === "immobileCombatPlatform" && entity.buildingState !== "underConstruction" && (
          <div className={styles.buildingIdle}>
            Occupants: {entity.occupantCount ?? 0} / 3
            {(entity.occupantCount ?? 0) > 0 && ` — ${entity.occupantCount} Core${(entity.occupantCount ?? 0) > 1 ? "s" : ""}`}
          </div>
        )}

        {entity.kind === "building" && entity.typeKey === "wizardTower" && entity.buildingState !== "underConstruction" && (
          (() => {
            const garId = entity.garrisonedUnitId;
            const occ = garId ? gameState.entities.find((e) => e.id === garId) : null;
            return (
              <div className={styles.buildingIdle}>
                {occ ? `Occupied by ${formatTypeKey(occ.typeKey)}` : "Empty"}
              </div>
            );
          })()
        )}

        {entity.kind === "building" && (entity.typeKey === "cottage" || entity.typeKey === "rechargeStation") && entity.buildingState !== "underConstruction" && (
          (() => {
            const hidden = gameState.entities.filter(
              (e) => e.kind === "unit" && e.hidden && e.containingBuildingId === entity.id,
            );
            if (hidden.length === 0) {
              return <div className={styles.buildingIdle}>Empty</div>;
            }
            return (
              <div className={styles.buildingIdle}>
                Hiding: {hidden.map((h) => h.name ?? formatTypeKey(h.typeKey)).join(", ")}
              </div>
            );
          })()
        )}

        {entity.kind === "building" && entity.buildingState !== "underConstruction" && entity.buildingState !== "researching" && (
          entity.productionProgress ? (
            <>
              <div className={styles.productionRow}>
                <div className={styles.prodHeader}>
                  <img
                    src={unitSpritePath(gameState.factionSpecies[entity.faction], entity.productionProgress.unitTypeKey)}
                    className={styles.prodActiveIcon}
                    alt={formatTypeKey(entity.productionProgress.unitTypeKey)}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <div className={styles.prodLabelBlock}>
                    <div className={styles.prodLabel}>
                      <span>Producing: {formatTypeKey(entity.productionProgress.unitTypeKey)}</span>
                      <span>{entity.productionProgress.progressTicks}/{entity.productionProgress.totalTicks}</span>
                    </div>
                    <div className={styles.prodTrack}>
                      <div
                        className={styles.prodFill}
                        style={{ width: `${(entity.productionProgress.progressTicks / entity.productionProgress.totalTicks) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              {entity.productionQueue && entity.productionQueue.length > 0 && (
                <div className={styles.queueRow}>
                  <span className={styles.queueLabel}>Queue:</span>
                  {entity.productionQueue.map((typeKey, i) => (
                    <img
                      key={i}
                      src={unitSpritePath(gameState.factionSpecies[entity.faction], typeKey)}
                      className={styles.queueIcon}
                      alt={formatTypeKey(typeKey)}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                      title={formatTypeKey(typeKey)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className={styles.buildingIdle}>Idle</div>
          )
        )}
      </div>
    </div>
  );
}
