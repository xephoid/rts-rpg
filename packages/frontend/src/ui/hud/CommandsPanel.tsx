import { buildingProduction, robotUnitCosts, wizardUnitCosts } from "@neither/shared";
import { useGameStore } from "../../store/gameStore.js";
import { useUIStore } from "../../store/uiStore.js";
import styles from "./CommandsPanel.module.css";

const UNIT_COMMANDS = ["Move", "Stop", "Attack", "Patrol", "Hold", "Talk", "Convert", "Board"];
const BUILDING_COMMANDS = ["Cancel", "Research", "Demolish"];
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

  // Building production panel
  if (selection.mode === "single" && selection.kind === "building") {
    const buildingId = selection.id;
    const entity = gameState?.entities.find((e) => e.id === buildingId);
    const producible = entity ? (buildingProduction[entity.typeKey] ?? []) : [];

    if (producible.length > 0 && entity && gameState) {
      const costTable = activeFaction === "robots" ? robotUnitCosts : wizardUnitCosts;
      const resources = gameState.resources[activeFaction];
      const population = gameState.population[activeFaction];
      const isProducing = entity.productionProgress != null;
      const atPopCap = population.cap > 0 && population.count >= population.cap;

      return (
        <div className={styles.panel}>
          <div className={styles.header}>Commands</div>
          <div className={styles.grid}>
            {producible.map((typeKey) => {
              const cost = costTable[typeKey];
              const canAfford = cost
                ? resources.wood >= cost.wood && resources.water >= cost.water
                : false;
              const disabled = isProducing || !canAfford || atPopCap;
              return (
                <button
                  key={typeKey}
                  className={styles.cmdBtn}
                  disabled={disabled}
                  onClick={disabled ? undefined : () => issueProduction(buildingId, typeKey)}
                >
                  {formatTypeKey(typeKey)}
                  {cost && (
                    <span className={styles.cost}>
                      {cost.wood}w {cost.water}wr
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // Building with no producible units — fallback static commands
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Commands</div>
        <div className={styles.grid}>
          {BUILDING_COMMANDS.map((cmd) => (
            <button key={cmd} className={styles.cmdBtn} disabled>
              {cmd}
            </button>
          ))}
        </div>
      </div>
    );
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
      </div>
    </div>
  );
}
