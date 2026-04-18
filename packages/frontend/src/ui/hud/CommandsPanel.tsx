import {
  buildingProduction,
  buildingResearch,
  researchCosts,
  robotUnitCosts,
  wizardUnitCosts,
  unitSpritePath,
  unitPortraitPath,
  BUILDER_UNIT_TYPES,
  factionBuildableBuildings,
  unitBuildingRequirements,
  buildingPortraitPath,
  robotBuildingCosts,
  wizardBuildingCosts,
  robotBuildingStats,
  wizardBuildingStats,
  wizardUnitStats,
} from "@neither/shared";
import { useGameStore } from "../../store/gameStore.js";
import { useUIStore } from "../../store/uiStore.js";
import styles from "./CommandsPanel.module.css";

const ROBOT_PLATFORM_TYPES_UI = new Set([
  "waterCollectionPlatform", "woodChopperPlatform", "movableBuildKitPlatform",
  "spinnerPlatform", "spitterPlatform", "infiltrationPlatform",
  "largeCombatPlatform", "probePlatform", "wallPlatform",
]);
const WIZARD_UNIT_TYPES_UI = new Set(Object.keys(wizardUnitStats));

const UNIT_COMMANDS = ["Move", "Stop", "Attack", "Patrol", "Hold", "Talk", "Convert", "Board"];
const BUILDING_COMMANDS = ["Cancel", "Demolish"];
const BASIC_COMMANDS = ["Move", "Stop", "Attack", "Patrol", "Hold"];

/** Commands wired to actual engine actions — all others render disabled. */
const ENABLED_COMMANDS = new Set(["Stop", "Patrol", "Hold"]);

function formatTypeKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

export function CommandsPanel() {
  const selection = useUIStore((s) => s.selection);
  const activeFaction = useUIStore((s) => s.activeFaction);
  const gameState = useGameStore((s) => s.gameState);
  const issueStop = useUIStore((s) => s.issueStop);
  const setPendingPatrolIds = useUIStore((s) => s.setPendingPatrolIds);
  const pendingPatrolIds = useUIStore((s) => s.pendingPatrolIds);
  const issueProduction = useUIStore((s) => s.issueProduction);
  const cancelProduction = useUIStore((s) => s.cancelProduction);
  const issueDemolish = useUIStore((s) => s.issueDemolish);
  const issueResearch = useUIStore((s) => s.issueResearch);
  const issueCancelResearch = useUIStore((s) => s.issueCancelResearch);
  const issueDetach = useUIStore((s) => s.issueDetach);
  const issueManaShieldToggle = useUIStore((s) => s.issueManaShieldToggle);
  const buildMenuOpen = useUIStore((s) => s.buildMenuOpen);
  const setBuildMenuOpen = useUIStore((s) => s.setBuildMenuOpen);
  const setBuildMode = useUIStore((s) => s.setBuildMode);

  if (selection.mode === "none") {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Commands</div>
        <div className={styles.empty}>—</div>
      </div>
    );
  }

  // Opposing single entity — no commands
  if (selection.mode === "single") {
    const entity = gameState?.entities.find((e) => e.id === selection.id);
    if (entity && entity.faction !== activeFaction) {
      return (
        <div className={styles.panel}>
          <div className={styles.header}>Commands</div>
          <div className={styles.empty}>—</div>
        </div>
      );
    }
  }

  const selectedIds =
    selection.mode === "multi"
      ? selection.ids
      : selection.mode === "single"
        ? [selection.id]
        : [];

  // Building panel (production + research) — only for own faction buildings
  if (selection.mode === "single" && selection.kind === "building") {
    const buildingId = selection.id;
    const entity = gameState?.entities.find((e) => e.id === buildingId);
    const producible = entity && entity.faction === activeFaction ? (buildingProduction[entity.typeKey] ?? []) : [];
    const researchable = entity && entity.faction === activeFaction ? (buildingResearch[entity.typeKey] ?? []) : [];
    const hasContent = producible.length > 0 || researchable.length > 0;

    if (hasContent && entity && gameState) {
      const costTable = activeFaction === "robots" ? robotUnitCosts : wizardUnitCosts;
      const resources = gameState.resources[activeFaction];
      const population = gameState.population[activeFaction];
      const totalQueued =
        (entity.productionProgress ? 1 : 0) + (entity.productionQueue?.length ?? 0);
      const queueFull = totalQueued >= 5;
      const atPopCap = population.cap > 0 && population.count >= population.cap;
      const isResearching = entity.buildingState === "researching";
      const isProducing = activeFaction === "robots" && totalQueued > 0;
      const completed = gameState.completedResearch?.[activeFaction] ?? [];

      return (
        <div className={styles.panel}>
          <div className={styles.header}>Commands</div>
          <div className={styles.grid}>
            {producible.map((typeKey) => {
              const cost = costTable[typeKey];
              const canAfford = cost
                ? resources.wood >= cost.wood && resources.water >= cost.water
                : false;
              const reqBuilding = unitBuildingRequirements[typeKey];
              const isLocked = reqBuilding
                ? !gameState.entities.some(
                    (e) => e.faction === activeFaction &&
                           e.kind === "building" &&
                           e.typeKey === reqBuilding &&
                           e.buildingState !== "underConstruction"
                  )
                : false;
              const disabled = queueFull || !canAfford || atPopCap || isLocked || isResearching;
              const queueCount =
                (entity.productionProgress?.unitTypeKey === typeKey ? 1 : 0) +
                (entity.productionQueue?.filter((k) => k === typeKey).length ?? 0);
              return (
                <button
                  key={typeKey}
                  className={`${styles.cmdBtn}${isLocked ? ` ${styles.cmdBtnLocked}` : ""}`}
                  disabled={disabled}
                  onClick={disabled ? undefined : () => issueProduction(buildingId, typeKey)}
                  title={isLocked && reqBuilding ? `Requires ${formatTypeKey(reqBuilding)}` : undefined}
                >
                  <img
                    src={unitPortraitPath(entity.faction, typeKey)}
                    className={styles.prodIcon}
                    alt={formatTypeKey(typeKey)}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <span className={styles.prodLabel}>{formatTypeKey(typeKey)}</span>
                  {cost && (
                    <span className={styles.cost}>
                      {cost.wood}w {cost.water}wr
                    </span>
                  )}
                  {isLocked && <span className={styles.lockBadge}>🔒</span>}
                  {!isLocked && queueCount > 0 && (
                    <span className={styles.queueBadge}>{queueCount}</span>
                  )}
                </button>
              );
            })}
            {producible.length > 0 && (
              <button
                className={styles.cmdBtn}
                disabled={totalQueued === 0}
                onClick={totalQueued > 0 ? () => cancelProduction(buildingId) : undefined}
                title="Cancel active production and refund resources"
              >
                Cancel
              </button>
            )}
            {researchable.map((researchKey) => {
              const cost = researchCosts[researchKey as keyof typeof researchCosts];
              const isDone = completed.includes(researchKey);
              const isActive = isResearching && entity.researchProgress?.researchKey === researchKey;
              const isBusy = isResearching && !isActive;
              const canAfford = cost
                ? resources.wood >= cost.wood && resources.water >= cost.water
                : false;
              const disabled = isDone || isActive || isBusy || !canAfford || isProducing;
              return (
                <button
                  key={researchKey}
                  className={`${styles.cmdBtn}${isDone ? ` ${styles.cmdBtnDone}` : ""}`}
                  disabled={disabled}
                  onClick={disabled ? undefined : () => issueResearch(buildingId, researchKey)}
                  title={isDone ? "Already researched" : cost ? `${cost.wood}w ${cost.water}wr · ${cost.durationSec}s` : undefined}
                >
                  <span className={styles.prodLabel}>{formatTypeKey(researchKey)}</span>
                  {cost && !isDone && !isActive && (
                    <span className={styles.cost}>{cost.wood}w {cost.water}wr</span>
                  )}
                  {isDone && <span className={styles.doneBadge}>✓</span>}
                  {isActive && entity.researchProgress && (
                    <span className={styles.queueBadge}>
                      {Math.floor((entity.researchProgress.progressTicks / entity.researchProgress.totalTicks) * 100)}%
                    </span>
                  )}
                </button>
              );
            })}
            {isResearching && (
              <button
                className={styles.cmdBtn}
                onClick={() => issueCancelResearch(buildingId)}
                title="Cancel research and refund resources"
              >
                Cancel Research
              </button>
            )}
            <button
              className={styles.cmdBtn}
              onClick={() => issueDemolish(buildingId)}
              title="Remove building (no resource refund)"
            >
              Demolish
            </button>
          </div>
        </div>
      );
    }

    // Building with no producible units or research — fallback static commands
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Commands</div>
        <div className={styles.grid}>
          {BUILDING_COMMANDS.map((cmd) => {
            const enabled = cmd === "Demolish" && !!entity && entity.faction === activeFaction;
            return (
              <button
                key={cmd}
                className={styles.cmdBtn}
                disabled={!enabled}
                onClick={enabled && cmd === "Demolish" ? () => issueDemolish(buildingId) : undefined}
              >
                {cmd}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Builder unit: show either commands+Build or build list
  if (
    selection.mode === "single" &&
    selection.kind === "unit" &&
    gameState
  ) {
    const entity = gameState.entities.find((e) => e.id === selection.id);
    if (entity && entity.faction === activeFaction && BUILDER_UNIT_TYPES.has(entity.typeKey)) {
      if (buildMenuOpen) {
        // Build list sub-view
        const buildable = factionBuildableBuildings[activeFaction as "wizards" | "robots"];
        const costTable = activeFaction === "robots" ? robotBuildingCosts : wizardBuildingCosts;
        const statsTable = activeFaction === "robots" ? robotBuildingStats : wizardBuildingStats;
        const resources = gameState.resources[activeFaction];

        return (
          <div className={styles.panel}>
            <div className={styles.header}>Build</div>
            <div className={styles.grid}>
              <button
                className={styles.cmdBtn}
                onClick={() => setBuildMenuOpen(false)}
              >
                ← Back
              </button>
              {buildable.map((typeKey) => {
                const cost = costTable[typeKey];
                const stats = statsTable[typeKey];
                const canAfford = cost
                  ? resources.wood >= cost.wood && resources.water >= cost.water
                  : false;
                return (
                  <button
                    key={typeKey}
                    className={styles.cmdBtn}
                    disabled={!canAfford}
                    onClick={canAfford ? () => {
                      setBuildMode({
                        unitId: entity.id,
                        buildingTypeKey: typeKey,
                        footprintTiles: stats?.footprintTiles ?? 1,
                        faction: activeFaction as "wizards" | "robots",
                      });
                      setBuildMenuOpen(false);
                    } : undefined}
                  >
                    <img
                      src={buildingPortraitPath(activeFaction as "wizards" | "robots", typeKey)}
                      className={styles.prodIcon}
                      alt={formatTypeKey(typeKey)}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                    <span className={styles.prodLabel}>{formatTypeKey(typeKey)}</span>
                    {cost && (
                      <span className={styles.cost}>{cost.wood}w {cost.water}wr</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      // Normal commands view + Build button
      const selectedIds = [selection.id];
      function handleCommand(cmd: string) {
        if (cmd === "Stop" || cmd === "Hold") {
          issueStop(selectedIds);
        } else if (cmd === "Patrol") {
          setPendingPatrolIds(pendingPatrolIds ? null : selectedIds);
        } else if (cmd === "Build") {
          setBuildMenuOpen(true);
        }
      }
      const isPatrolActive = pendingPatrolIds !== null && pendingPatrolIds.length > 0;
      const builderCmds = [...UNIT_COMMANDS, "Build"];
      const builderEnabled = new Set([...ENABLED_COMMANDS, "Build"]);

      return (
        <div className={styles.panel}>
          <div className={styles.header}>Commands</div>
          <div className={styles.grid}>
            {builderCmds.map((cmd) => {
              const enabled = builderEnabled.has(cmd) && selectedIds.length > 0;
              const active = cmd === "Patrol" && isPatrolActive;
              return (
                <button
                  key={cmd}
                  className={`${styles.cmdBtn}${active ? ` ${styles.cmdBtnActive}` : ""}${cmd === "Build" ? ` ${styles.cmdBtnBuild}` : ""}`}
                  disabled={!enabled}
                  onClick={enabled ? () => handleCommand(cmd) : undefined}
                >
                  {cmd}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
  }

  let cmds: string[];
  if (selection.mode === "multi") {
    cmds = BASIC_COMMANDS;
  } else {
    cmds = UNIT_COMMANDS;
  }

  function handleCommand(cmd: string) {
    if (cmd === "Stop" || cmd === "Hold") {
      issueStop(selectedIds);
    } else if (cmd === "Patrol") {
      // Toggle patrol mode — next right-click sets destination
      setPendingPatrolIds(pendingPatrolIds ? null : selectedIds);
    }
  }

  const isPatrolActive = pendingPatrolIds !== null && pendingPatrolIds.length > 0;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Commands</div>
      <div className={styles.grid}>
        {cmds.map((cmd) => {
          const enabled = ENABLED_COMMANDS.has(cmd) && selectedIds.length > 0;
          const active = cmd === "Patrol" && isPatrolActive;
          return (
            <button
              key={cmd}
              className={`${styles.cmdBtn}${active ? ` ${styles.cmdBtnActive}` : ""}`}
              disabled={!enabled}
              onClick={enabled ? () => handleCommand(cmd) : undefined}
            >
              {cmd}
            </button>
          );
        })}
        {selection.mode === "single" && selection.kind === "unit" && (() => {
          const entity = gameState?.entities.find((e) => e.id === selection.id);
          if (entity && ROBOT_PLATFORM_TYPES_UI.has(entity.typeKey) && entity.attachedCoreId) {
            return (
              <button
                key="Detach"
                className={styles.cmdBtn}
                onClick={() => issueDetach(entity.id)}
              >
                Detach
              </button>
            );
          }
          return null;
        })()}
        {selection.mode === "single" && selection.kind === "unit" && (() => {
          const entity = gameState?.entities.find((e) => e.id === selection.id);
          const completed = gameState?.completedResearch?.wizards ?? [];
          if (
            entity?.faction === "wizards" &&
            WIZARD_UNIT_TYPES_UI.has(entity.typeKey) &&
            completed.includes("manaShield")
          ) {
            return (
              <button
                key="ManaShield"
                className={`${styles.cmdBtn}${entity.manaShielded ? ` ${styles.cmdBtnActive}` : ""}`}
                onClick={() => issueManaShieldToggle(entity.id)}
                title={entity.manaShielded ? "Deactivate Mana Shield" : "Activate Mana Shield"}
              >
                Shield
              </button>
            );
          }
          return null;
        })()}
      </div>
    </div>
  );
}
